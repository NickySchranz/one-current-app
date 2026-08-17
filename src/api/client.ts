import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The One Current API client. The app works fully offline; this client is
 * touched only during explicit login/register/forgot actions, API features
 * (backup, share codes, checkout), and on init when tokens already exist.
 */

const TOKENS_KEY = "one-current-tokens";
const API_URL_KEY = "one-current-api-url";
const DEFAULT_URL = __DEV__
  ? "http://localhost:4000"
  : "https://one-current-api.nikischranz.workers.dev";
const TIMEOUT_MS = 6000;

export type Session = { access: string; refresh: string };

export type ApiUser = {
  id: string;
  email: string;
  name?: string;
  roles: string[];
  plan: "free" | "pro";
  createdAt: string;
};

/** The API could not be reached at all (offline, server down, timeout). */
export class ApiOfflineError extends Error {
  constructor() {
    super("The server could not be reached.");
  }
}

/** The API answered 401 and a refresh could not fix it — sign in again. */
export class ApiAuthError extends Error {
  constructor(message = "Please sign in again.") {
    super(message);
  }
}

/** Any other non-2xx answer, with the server's error code when present. */
export class ApiHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let baseUrlOverride: string | null | undefined;
let tokens: Session | null | undefined;

export async function getApiUrl(): Promise<string> {
  if (baseUrlOverride === undefined) {
    baseUrlOverride = (await AsyncStorage.getItem(API_URL_KEY).catch(() => null)) || null;
  }
  return baseUrlOverride || process.env.EXPO_PUBLIC_API_URL || DEFAULT_URL;
}

export async function setApiUrl(url: string): Promise<void> {
  const cleaned = url.trim().replace(/\/+$/, "");
  baseUrlOverride = cleaned || null;
  if (cleaned) await AsyncStorage.setItem(API_URL_KEY, cleaned).catch(() => undefined);
  else await AsyncStorage.removeItem(API_URL_KEY).catch(() => undefined);
}

export async function loadTokens(): Promise<Session | null> {
  if (tokens === undefined) {
    try {
      const raw = await AsyncStorage.getItem(TOKENS_KEY);
      tokens = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      tokens = null;
    }
  }
  return tokens;
}

export async function saveTokens(next: Session | null): Promise<void> {
  tokens = next;
  try {
    if (next) await AsyncStorage.setItem(TOKENS_KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(TOKENS_KEY);
  } catch {
    // storage unavailable; the session still applies in memory
  }
}

export function hasTokens(): boolean {
  return Boolean(tokens);
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  const base = await getApiUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${base}/v1${path}`, { ...init, signal: controller.signal });
  } catch {
    throw new ApiOfflineError();
  } finally {
    clearTimeout(timer);
  }
}

/** Only one refresh runs at a time; concurrent 401s share it. */
let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const current = await loadTokens();
    if (!current) return false;
    try {
      const res = await rawFetch("/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: current.refresh }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      await saveTokens({ access: data.accessToken, refresh: data.refreshToken });
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function parseError(res: Response): Promise<ApiHttpError> {
  let code = "unknown";
  let message = `Request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    if (body.error?.code) code = body.error.code;
    if (body.error?.message) message = body.error.message;
  } catch {
    // non-JSON error body
  }
  return new ApiHttpError(res.status, code, message);
}

type CallOptions = { auth?: boolean; raw?: string };

async function call<T>(method: string, path: string, body?: unknown, opts: CallOptions = {}): Promise<T> {
  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined || opts.raw !== undefined) headers["content-type"] = "application/json";
    if (opts.auth) {
      const session = await loadTokens();
      if (!session) throw new ApiAuthError();
      headers.authorization = `Bearer ${session.access}`;
    }
    return rawFetch(path, {
      method,
      headers,
      body: opts.raw !== undefined ? opts.raw : body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch();
  if (res.status === 401 && opts.auth) {
    if (await tryRefresh()) res = await doFetch();
    if (res.status === 401) {
      await saveTokens(null);
      throw new ApiAuthError();
    }
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

/** Metadata about an uploaded share — the raw code is never returned again. */
export type ShareMeta = {
  id: string;
  fromEmail: string;
  fromName?: string;
  threadCount: number;
  from: string;
  to: string;
  createdAt: string;
  expiresAt: string;
  redeemed: boolean;
};

type AuthResponse = { user: ApiUser; accessToken: string; refreshToken: string };

async function storeSession(res: AuthResponse): Promise<ApiUser> {
  await saveTokens({ access: res.accessToken, refresh: res.refreshToken });
  return res.user;
}

export const api = {
  login: async (email: string, password: string) =>
    storeSession(await call<AuthResponse>("POST", "/auth/login", { email, password })),

  register: async (email: string, password: string, name?: string) =>
    storeSession(await call<AuthResponse>("POST", "/auth/register", { email, password, name })),

  forgotPassword: (email: string) => call<{ ok: true }>("POST", "/auth/forgot", { email }),

  /** Fire-and-forget server logout; local tokens are cleared regardless. */
  logout: async () => {
    const session = await loadTokens();
    if (!session) return;
    await saveTokens(null);
    try {
      await rawFetch("/auth/logout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access}`,
        },
        body: JSON.stringify({ refreshToken: session.refresh }),
      });
    } catch {
      // the server being unreachable must not block signing out
    }
  },

  me: () => call<ApiUser>("GET", "/me", undefined, { auth: true }),

  checkout: () =>
    call<{ url: string; sessionId: string; mode: "stub" | "stripe" }>(
      "POST",
      "/billing/checkout",
      { app: "one-current" },
      { auth: true },
    ),

  completeStubCheckout: (sessionId: string) =>
    call<{ ok: true; plan: "pro" }>("POST", "/billing/dev/complete", { sessionId }, { auth: true }),

  uploadBackup: (json: string) =>
    call<{ ok: true; savedAt: string }>("PUT", "/backup", undefined, { auth: true, raw: json }),

  downloadBackup: () => call<Record<string, unknown>>("GET", "/backup", undefined, { auth: true }),

  backupMeta: () =>
    call<{ exists: boolean; savedAt?: string; bytes?: number }>("GET", "/backup/meta", undefined, {
      auth: true,
    }),

  createShare: (document: unknown, practitionerEmail?: string) =>
    call<{ id: string; code: string; expiresAt: string }>(
      "POST",
      "/shares",
      { document, practitionerEmail: practitionerEmail || undefined },
      { auth: true },
    ),

  listMyShares: () =>
    call<{ shares: ShareMeta[] }>("GET", "/shares/mine", undefined, { auth: true }),

  deleteShare: (id: string) =>
    call<{ ok: true }>("DELETE", `/shares/${id}`, undefined, { auth: true }),
};
