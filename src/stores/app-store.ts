import { create } from "zustand";
import { AccessibilityInfo, Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ForkPeriodChoice, PsychologicalBranch, Loudness } from "@/domain/branches/types";
import type { BranchMerge, MergeDraft } from "@/domain/merges/types";
import type { Lesson } from "@/domain/lessons/types";
import type { IntegratedAction } from "@/domain/actions/types";
import type { BranchCommit } from "@/domain/moments/types";
import {
  createBranch,
  easeLoudness,
  trackLoudness,
  type CreateBranchInput, effectiveLoudness } from "@/domain/branches/logic";
import { advanceSkew, appNow, getSkewMs, setRate, setSkewMs } from "@/domain/time/clock";
import { addMomentToBranch, createMoment, type CreateMomentInput } from "@/domain/moments/logic";
import { detectRecurrence, recordRecurrence } from "@/domain/branches/recurrence";
import { applyMergeToBranch, createMerge, type CreateMergeInput } from "@/domain/merges/logic";
import { completeAction, composeIntegratedAction } from "@/domain/actions/logic";
import { heldFeelings } from "@/domain/feelings/logic";
import { newId } from "@/domain/ids";
import { repo } from "@/db/repository";
import { api, loadTokens, ApiAuthError, type ApiUser } from "@/api/client";
import { canCreateThread, isProTheme } from "@/domain/entitlements/logic";
import { panWindow, weekWindow, type TimeWindow } from "@/visualization/zoom/time-scale";
import { isThemeId, type ThemeId } from "@/visualization/theme";
import type { MascotType } from "@/features/life-timeline/mascot-frames";

/**
 * Three destinations. Now is where I work — it IS the timeline. History is
 * where I review. More holds everything else.
 */
export type View =
  | { kind: "now" }
  | { kind: "history" }
  | { kind: "merge-review"; mergeId: string }
  | { kind: "more" };

/**
 * What is currently happening in Now. The timeline stays mounted and visible;
 * quick operations render in a light tray beside it, focused ones over it.
 */
export type TimelineOperation =
  | { kind: "idle" }
  | { kind: "creating-branch" }
  | { kind: "checking-recurrence"; matchedBranchId: string; pending: CreateBranchInput }
  /** "What does this branch need from you now?" — the small menu at an endpoint.
   *  `expanded` opens straight onto the choices (Back from a sub-panel). */
  | { kind: "quick-touch"; branchId: string; expanded?: boolean }
  | { kind: "quick-act"; branchId: string }
  | { kind: "quick-merge"; branchId: string }
  | { kind: "quick-note"; branchId: string }
  /** Every decided, still-open action read together in one panel. */
  | { kind: "viewing-actions" }
  /** Browse past integrated threads; selecting one focuses it on the timeline. */
  | { kind: "viewing-integrated"; branchId?: string }
  /** Looking deeper into one branch. Focused: the timeline waits behind it. */
  | { kind: "understanding"; branchId: string }
  /** The final, explicit merge confirmation. Focused. */
  | { kind: "confirming-merge"; branchIds: string[] }
  /** A branch that needs more support than an app should carry alone. Focused. */
  | { kind: "seeking-support"; branchId: string };

/** How much of the screen an operation may take. */
export function operationDepth(op: TimelineOperation): "none" | "quick" | "focused" {
  switch (op.kind) {
    case "idle":
      return "none";
    case "understanding":
    case "confirming-merge":
    case "seeking-support":
      return "focused";
    default:
      return "quick";
  }
}

export type StatusFilter = "all" | "active" | "merged" | "recurring";

/** The signed-in account. Dummy for now: held locally, no server behind it. */
export type AuthUser = { name?: string; email: string };

/** A decision just released these feelings back to the main line (drives the timeline animation). */
export type ReclaimEvent = { key: number; branchId: string; feelings: string[] };

type AppState = {
  ready: boolean;
  branches: PsychologicalBranch[];
  merges: BranchMerge[];
  actions: IntegratedAction[];
  /** What the fires taught you — each survives its burned thread. */
  lessons: Lesson[];
  mergeDraft?: MergeDraft;
  view: View;
  operation: TimelineOperation;
  window?: TimeWindow;
  typeFilter: Set<PsychologicalBranch["type"]>;
  statusFilter: StatusFilter;
  reducedMotion: boolean;
  theme: ThemeId;
  mascotType: MascotType;
  /** Pro entitlement. A local flag for now; a payment provider sets it later. */
  isPro: boolean;
  /** Pro according to the server, or null when the server has not answered. */
  serverPro: boolean | null;
  /** Whether the API answered on the last contact; null before any attempt. */
  apiOnline: boolean | null;
  /** Who is signed in, or null for the login gate. Dummy data for now. */
  authUser: AuthUser | null;
  /** UI language: every app term, never the user's own words. */
  language: "en" | "es" | "es-CO";
  reclaim?: ReclaimEvent;
  /** A branch was just created: its line draws itself onto the timeline. */
  born?: { key: number; branchId: string };
  /** A worry is being burned: fire consumes its line, then finalizeBurn removes it. */
  burn?: { key: number; branchId: string; items: string[]; lesson: string };
  /** Pip just struck a thread (drives the attack animation). */
  hit?: { key: number; branchId: string; calm: boolean };
  /** An optimistic, unsaved line shown while the create form is open. */
  draftBranchId: string | null;
  /**
   * Lines created this session keep the lane they were drawn on: the draft
   * stays pinned after commit so the quick menu that follows (loudness dial)
   * never sees the line hop to a packed lane. Resets naturally on reload.
   */
  pinnedBranchIds: string[];
  /** The app's current moment (epoch ms). Refreshed on a slow tick so Now moves without reloading. */
  nowTick: number;
  /** How far ahead of real time the app is living (Testing only; resets on reload). */
  timeSkewMs: number;
  /** App-milliseconds per real millisecond (Testing only; 1 = real time). */
  timeRate: number;

  init(): Promise<void>;
  /** Re-read the clock so everything derived from "now" follows it. */
  refreshNow(): void;
  /** Move the app's clock forward (Testing only). */
  fastForward(ms: number): void;
  /** Let the app's clock run faster than real time (Testing only). */
  setTimeRate(rate: number): void;
  resetTimeSkew(): void;
  setView(view: View): void;
  /** Begin (or end, with idle) an operation over the timeline. Jumps to the timeline shell. */
  setOperation(operation: TimelineOperation): void;
  returnToNow(): void;

  requestBranch(
    input: CreateBranchInput,
  ): Promise<{ recurrenceOf?: string; branch?: PsychologicalBranch }>;
  createBranchNow(input: CreateBranchInput): Promise<PsychologicalBranch>;
  /** Draw the line the moment the create form opens; commit or cancel decides its fate. */
  beginDraftBranch(): void;
  /** Keep the optimistic line in step with the form (title, period, …). Never persisted. */
  updateDraftBranch(patch: Partial<PsychologicalBranch>): void;
  /** The form closed without saving: the optimistic line vanishes. */
  cancelDraftBranch(): void;
  updateBranch(id: string, patch: Partial<PsychologicalBranch>): Promise<void>;
  /** Set the loudness dial by hand: re-anchors the daily drift, so what you set is what is felt today. */
  dialLoudness(id: string, level: Loudness): Promise<void>;
  deleteBranch(id: string): Promise<void>;
  addMoment(input: CreateMomentInput): Promise<BranchCommit>;
  /** Any decision about a branch loosens its loudness; optionally applies a patch alongside. */
  easeBranch(id: string, patch?: Partial<PsychologicalBranch>): Promise<void>;
  /** One small step today for a single branch; eases its loudness. */
  createTodayAction(branchId: string, step: string): Promise<void>;
  /** An action was done: it settles into the past instead of waiting ahead. */
  markActionDone(actionId: string): Promise<void>;
  /** A folded line came back to mind: it continues as an open line again. */
  reopenBranch(branchId: string): Promise<void>;
  clearReclaim(): void;
  /** Pip attacks a thread: loudness eases one notch (a touch, not a decision). */
  attackBranch(branchId: string): Promise<void>;
  clearHit(): void;
  /** Phase 1 of a burn: light the fire. Nothing is written or deleted yet. */
  burnBranch(branchId: string, items: string[], lesson: string): void;
  /** Phase 2: the fire is done — keep the lesson, remove the thread entirely. */
  finalizeBurn(): Promise<void>;
  clearBorn(): void;
  updateMoment(branchId: string, moment: BranchCommit): Promise<void>;

  startMerge(branchIds: string[]): Promise<void>;
  saveMergeDraft(draft: MergeDraft): Promise<void>;
  cancelMerge(): Promise<void>;
  completeMerge(input: CreateMergeInput): Promise<BranchMerge>;

  /** This line is real work now: it leaves your head and lives where your tasks live. */
  handOffBranch(branchId: string): Promise<void>;
  recordRecurrenceOn(branchId: string): Promise<void>;

  setWindow(window: TimeWindow): void;
  panBy(fraction: number): void;
  setTypeFilter(types: Set<PsychologicalBranch["type"]>): void;
  setStatusFilter(f: StatusFilter): void;
  setReducedMotion(v: boolean): void;
  setTheme(t: ThemeId): void;
  setMascotType(t: MascotType): void;
  /** Flip the Pro entitlement (testing unlock for now). Turning it off steps an active Pro theme back to the default. */
  setPro(v: boolean): void;
  /** Store the session (login or register both land here). Dummy: no server is asked. */
  signIn(user: AuthUser): void;
  /** Sign in against the API; throws ApiOfflineError / ApiAuthError / ApiHttpError. */
  signInApi(email: string, password: string): Promise<void>;
  /**
   * Register against the API; no session yet — verifyEmailApi finishes it.
   * Returns the verification code when the server has no email provider.
   * Throws like signInApi.
   */
  registerApi(email: string, password: string, name?: string): Promise<string | undefined>;
  /** Trade the emailed code for a real session; throws like signInApi. */
  verifyEmailApi(email: string, code: string): Promise<void>;
  /** Refresh plan/account facts from the server when tokens exist. Never throws. */
  syncMe(): Promise<void>;
  signOut(): void;
  setLanguage(l: "en" | "es" | "es-CO"): void;

  exportData(): Promise<string>;
  importData(json: string): Promise<void>;
  deleteEverything(): Promise<void>;
  /** Fills the timeline with believable example branches to explore the app. */
  loadExampleData(): Promise<void>;
};

function todayIso(): string {
  return appNow().toISOString().slice(0, 10);
}

/** Operations happen in Now. */
function nowView(current: View): View {
  return current.kind === "now" ? current : { kind: "now" };
}

const LANGUAGE_KEY = "one-current-language";
const THEME_KEY = "one-current-theme";
const PRO_KEY = "one-current-pro";
const AUTH_KEY = "one-current-auth";
const MASCOT_KEY = "one-current-mascot";
const MASCOT_TYPES: MascotType[] = ["chronicler", "wisp", "wanderer"];

function parseAuthUser(raw: string | null): AuthUser | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && typeof (v as AuthUser).email === "string")
      return v as AuthUser;
  } catch {
    // a broken session simply signs out
  }
  return null;
}

function defaultTheme(): ThemeId {
  return Appearance.getColorScheme() === "dark" ? "duskwood" : "riverbed";
}

/** Read persisted UI settings (theme, language) and system preferences.
 * AsyncStorage is async on every platform, so these load during init(). */
async function loadSettings(): Promise<{
  theme: ThemeId;
  language: "en" | "es" | "es-CO";
  reducedMotion: boolean;
  isPro: boolean;
  authUser: AuthUser | null;
  mascotType: MascotType;
}> {
  let theme = defaultTheme();
  let language: "en" | "es" | "es-CO" = "en";
  let reducedMotion = false;
  let isPro = false;
  let authUser: AuthUser | null = null;
  let mascotType: MascotType = MASCOT_TYPES[Math.floor(Math.random() * MASCOT_TYPES.length)];
  try {
    const [savedTheme, savedLanguage, savedPro, savedAuth, reduceMotion, savedMascot] = await Promise.all([
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(LANGUAGE_KEY),
      AsyncStorage.getItem(PRO_KEY),
      AsyncStorage.getItem(AUTH_KEY),
      AccessibilityInfo.isReduceMotionEnabled(),
      AsyncStorage.getItem(MASCOT_KEY),
    ]);
    isPro = savedPro === "1";
    authUser = parseAuthUser(savedAuth);
    if (savedTheme && isThemeId(savedTheme) && (isPro || !isProTheme(savedTheme)))
      theme = savedTheme;
    if (savedLanguage === "es" || savedLanguage === "es-CO" || savedLanguage === "en")
      language = savedLanguage;
    reducedMotion = reduceMotion;
    if (savedMascot && MASCOT_TYPES.includes(savedMascot as MascotType))
      mascotType = savedMascot as MascotType;
    else
      // Persist the random default so it stays consistent until changed
      AsyncStorage.setItem(MASCOT_KEY, mascotType).catch(() => {});
  } catch {
    // storage unavailable; defaults apply
  }
  return { theme, language, reducedMotion, isPro, authUser, mascotType };
}

/**
 * Server plan facts arrived: derive the state patch, re-applying the stored
 * theme choice when Pro turns on and stepping a Pro theme back when it turns
 * off — the same rules loadSettings() and setPro() follow.
 */
async function planPatch(
  serverPro: boolean | null,
  s: { isPro: boolean; theme: ThemeId },
): Promise<{ apiOnline: true; serverPro: boolean | null; theme: ThemeId }> {
  const pro = serverPro ?? s.isPro;
  let theme = s.theme;
  if (pro) {
    const saved = await AsyncStorage.getItem(THEME_KEY).catch(() => null);
    if (saved && isThemeId(saved)) theme = saved;
  } else if (isProTheme(s.theme)) {
    theme = defaultTheme();
  }
  return { apiOnline: true, serverPro, theme };
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  branches: [],
  merges: [],
  actions: [],
  lessons: [],
  view: { kind: "now" },
  operation: { kind: "idle" },
  typeFilter: new Set(),
  statusFilter: "all",
  reducedMotion: false,
  theme: defaultTheme(),
  mascotType: "chronicler" as MascotType,
  isPro: false,
  serverPro: null,
  apiOnline: null,
  authUser: null,
  language: "en" as const,
  nowTick: appNow().getTime(),
  timeSkewMs: 0,
  timeRate: 1,

  async init() {
    const [data, settings] = await Promise.all([repo.loadAll(), loadSettings()]);
    const draft = data.drafts[0];
    set({
      ready: true,
      ...settings,
      branches: data.branches,
      merges: data.merges,
      lessons: data.lessons,
      actions: data.actions,
      mergeDraft: draft,
      nowTick: appNow().getTime(),
      window: weekWindow(appNow()),
      view: { kind: "now" },
      // An interrupted merge is restored where it stopped — at the confirmation.
      operation: draft
        ? { kind: "confirming-merge", branchIds: draft.branchIds }
        : { kind: "idle" },
    });
    // Only sessions that came through the API have tokens; refresh their
    // server facts in the background. Local-only sessions stay offline.
    void loadTokens().then((tokens) => {
      if (tokens) void get().syncMe();
    });
  },

  // Leaving Now sets any open operation down.
  setView: (view) => set({ view, operation: { kind: "idle" } }),
  // Operations live in Now, so starting one returns there.
  setOperation: (operation) =>
    set((s) => ({
      operation,
      view: operation.kind === "idle" ? s.view : nowView(s.view),
    })),
  returnToNow: () => {
    set({ view: { kind: "now" }, window: weekWindow(appNow()) });
  },

  refreshNow: () => {
    const nowMs = appNow().getTime();
    set((s) => {
      // While time runs fast, the camera drifts with it: the window slides by
      // the same amount the clock moved, so Now stays in view as days stream by.
      const delta = nowMs - s.nowTick;
      const window =
        s.timeRate > 1 && s.window && delta > 0
          ? {
              start: new Date(Date.parse(s.window.start) + delta).toISOString(),
              end: new Date(Date.parse(s.window.end) + delta).toISOString(),
            }
          : s.window;
      return { nowTick: nowMs, timeSkewMs: getSkewMs(), window };
    });
  },
  fastForward: (ms) => {
    advanceSkew(ms);
    set({
      timeSkewMs: getSkewMs(),
      nowTick: appNow().getTime(),
      window: weekWindow(appNow()),
    });
  },
  setTimeRate: (rate) => {
    setRate(rate);
    set({
      timeRate: rate,
      timeSkewMs: getSkewMs(),
      nowTick: appNow().getTime(),
      // Entering fast time recenters on Now so the movement is visible.
      window: rate > 1 ? weekWindow(appNow()) : get().window,
    });
  },
  resetTimeSkew: () => {
    setSkewMs(0);
    set({
      timeRate: 1,
      timeSkewMs: 0,
      nowTick: appNow().getTime(),
      window: weekWindow(appNow()),
    });
  },

  draftBranchId: null,
  pinnedBranchIds: [],

  beginDraftBranch() {
    const branch = createBranch(
      { title: "", kindChoiceId: "unnamed", period: { kind: "today" } },
      appNow(),
    );
    set((s) => ({
      branches: [...s.branches, branch],
      draftBranchId: branch.id,
      pinnedBranchIds: [...s.pinnedBranchIds, branch.id],
      window: weekWindow(appNow()),
      view: nowView(s.view),
      born: { key: Date.now(), branchId: branch.id },
    }));
  },

  updateDraftBranch(patch) {
    const id = get().draftBranchId;
    if (!id) return;
    set((s) => ({
      branches: s.branches.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  },

  cancelDraftBranch() {
    const id = get().draftBranchId;
    if (!id) return;
    set((s) => ({
      branches: s.branches.filter((b) => b.id !== id),
      draftBranchId: null,
      pinnedBranchIds: s.pinnedBranchIds.filter((p) => p !== id),
    }));
  },

  async requestBranch(input) {
    const match = detectRecurrence(input.title, get().branches);
    if (match) {
      set((s) => ({
        operation: {
          kind: "checking-recurrence" as const,
          matchedBranchId: match.id,
          pending: input,
        },
        view: nowView(s.view),
      }));
      return { recurrenceOf: match.id };
    }
    const branch = await get().createBranchNow(input);
    return { branch };
  },

  async createBranchNow(input) {
    const draftId = get().draftBranchId;
    // Backstop only: every entry point checks this before opening the form.
    if (!canCreateThread(get().branches, get().isPro, draftId))
      throw new Error("Free plan holds ten open threads at a time.");
    const branch = createBranch(input, appNow());
    // The optimistic line becomes the real one: same id, so the line the user
    // has been watching (and its colour) simply stays — and its id remains in
    // pinnedBranchIds, keeping the lane it was drawn on for the session.
    if (draftId) branch.id = draftId;
    await repo.saveBranch(branch);
    set((s) => ({
      branches: draftId
        ? s.branches.map((b) => (b.id === draftId ? branch : b))
        : [...s.branches, branch],
      draftBranchId: null,
      window: weekWindow(appNow()),
      view: nowView(s.view),
      // A committed draft already drew itself; only a fresh line is born here.
      born: draftId ? s.born : { key: Date.now(), branchId: branch.id },
    }));
    return branch;
  },

  async updateBranch(id, patch) {
    // Apply to the freshest state synchronously so quick successive edits
    // (e.g. tapping kind then feelings) don't overwrite each other.
    let next: PsychologicalBranch | undefined;
    set((s) => ({
      branches: s.branches.map((b) => {
        if (b.id !== id) return b;
        next = trackLoudness(b, { ...b, ...patch }, appNow());
        return next;
      }),
    }));
    if (next) await repo.saveBranch(next);
  },

  async dialLoudness(id, level) {
    // A touch, not a decision: the day counter is untouched, but the drift
    // re-anchors here — the level under your thumb is the level that is felt.
    await get().updateBranch(id, { loudness: level, loudnessSetOn: todayIso() });
  },

  async deleteBranch(id) {
    await repo.deleteBranch(id);
    set((s) => ({
      branches: s.branches.filter((b) => b.id !== id),
      view: nowView(s.view),
      operation: { kind: "idle" },
    }));
  },

  async addMoment(input) {
    const branch = get().branches.find((b) => b.id === input.branchId);
    if (!branch) throw new Error("Branch not found");
    const moment = createMoment(input);
    const next = addMomentToBranch(branch, moment, appNow());
    await repo.saveBranch(next);
    set((s) => ({ branches: s.branches.map((b) => (b.id === next.id ? next : b)) }));
    return moment;
  },

  async easeBranch(id, patch) {
    const branch = get().branches.find((b) => b.id === id);
    if (!branch) return;
    // What the line was holding until this decision — it returns for today.
    const freed = heldFeelings(branch);
    const next: PsychologicalBranch = trackLoudness(
      branch,
      {
        ...branch,
        ...patch,
        loudness: easeLoudness(branch.loudness),
        lastDecisionOn: todayIso(),
        lastActivatedAt: appNow().toISOString(),
      },
      appNow(),
    );
    await repo.saveBranch(next);
    // "Nothing can be done" and a planned action are mutually exclusive:
    // leaving the line for today withdraws its open actions.
    let removedActionIds: string[] = [];
    if (patch?.leftOn) {
      const stale = get().actions.filter(
        (a) => !a.completedAt && a.branchesIntegrated.some((x) => x.branchId === id),
      );
      removedActionIds = stale.map((a) => a.id);
      await Promise.all(removedActionIds.map((actionId) => repo.deleteAction(actionId)));
    }
    set((s) => ({
      branches: s.branches.map((b) => (b.id === id ? next : b)),
      actions:
        removedActionIds.length > 0
          ? s.actions.filter((a) => !removedActionIds.includes(a.id))
          : s.actions,
      reclaim: freed.length > 0 ? { key: Date.now(), branchId: id, feelings: freed } : s.reclaim,
    }));
  },

  async reopenBranch(branchId) {
    const branch = get().branches.find((b) => b.id === branchId);
    if (!branch) return;
    const yesterday = new Date(appNow().getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const next: PsychologicalBranch = trackLoudness(
      branch,
      {
        ...recordRecurrence(branch),
        status: "active",
        mergeDate: undefined,
        loudness: Math.max(2, branch.loudness) as Loudness,
        // Reopening is a reactivation, not a decision: dated yesterday so the
        // line holds its feelings again today without instantly drifting.
        lastDecisionOn: yesterday,
        leftOn: undefined,
      },
      appNow(),
    );
    await repo.saveBranch(next);
    set((s) => ({ branches: s.branches.map((b) => (b.id === branchId ? next : b)) }));
  },

  clearReclaim: () => set({ reclaim: undefined }),

  async attackBranch(branchId) {
    const branch = get().branches.find((b) => b.id === branchId);
    if (!branch) return;
    const felt = Math.round(effectiveLoudness(branch, appNow()));
    if (felt <= 1) {
      // already as quiet as it goes: Pip shrugs instead of striking
      set({ hit: { key: Date.now(), branchId, calm: true } });
      return;
    }
    await get().dialLoudness(branchId, Math.max(1, felt - 1) as Loudness);
    set({ hit: { key: Date.now(), branchId, calm: false } });
  },

  clearHit: () => set({ hit: undefined }),

  burnBranch(branchId, items, lesson) {
    if (!get().branches.some((b) => b.id === branchId)) return;
    set({ burn: { key: Date.now(), branchId, items, lesson }, operation: { kind: "idle" } });
  },

  async finalizeBurn() {
    const burn = get().burn;
    if (!burn) return;
    const { branchId, lesson } = burn;
    const record: Lesson = { id: newId("ls"), text: lesson, on: todayIso() };
    // actions tied only to this thread go with it; shared ones just drop it
    const touching = get().actions.filter((a) =>
      a.branchesIntegrated.some((r) => r.branchId === branchId),
    );
    const deadActions = touching.filter((a) =>
      a.branchesIntegrated.every((r) => r.branchId === branchId),
    );
    const trimmedActions = touching
      .filter((a) => !deadActions.includes(a))
      .map((a) => ({
        ...a,
        branchesIntegrated: a.branchesIntegrated.filter((r) => r.branchId !== branchId),
      }));
    await repo.saveLesson(record);
    await repo.deleteBranch(branchId);
    for (const a of deadActions) await repo.deleteAction(a.id);
    // its waiting container, if any, goes with it
    const waitingRows = (await repo.loadAll()).waiting.filter((w) => w.branchId === branchId);
    for (const w of waitingRows) await repo.deleteWaiting(w.id);
    for (const a of trimmedActions) await repo.saveAction(a);
    set((s) => ({
      lessons: [...s.lessons, record],
      branches: s.branches.filter((b) => b.id !== branchId),
      actions: s.actions
        .filter((a) => !deadActions.some((d) => d.id === a.id))
        .map((a) => trimmedActions.find((tr) => tr.id === a.id) ?? a),
      burn: undefined,
      operation: s.operation.kind !== "idle" ? { kind: "idle" } : s.operation,
    }));
  },
  clearBorn: () => set({ born: undefined }),

  async createTodayAction(branchId, step) {
    const branch = get().branches.find((b) => b.id === branchId);
    if (!branch) return;
    const action = composeIntegratedAction({
      branches: [branch],
      title: step,
      instruction: step,
      durationMinutes: 10,
      minimumVersion: "A few honest minutes of it",
      qualitiesCarried: branch.storedQualities,
      completionDefinition: "When it has been done once today",
    });
    await repo.saveAction(action);
    set((s) => ({ actions: [...s.actions, action] }));
    // Deciding an action lifts "nothing can be done" — they cannot coexist.
    await get().easeBranch(branchId, { leftOn: undefined });
  },

  async markActionDone(actionId) {
    const action = get().actions.find((a) => a.id === actionId);
    if (!action || action.completedAt) return;
    const done = completeAction(action);
    await repo.saveAction(done);
    set((s) => ({ actions: s.actions.map((a) => (a.id === actionId ? done : a)) }));
  },

  async updateMoment(branchId, moment) {
    const branch = get().branches.find((b) => b.id === branchId);
    if (!branch) return;
    const next = {
      ...branch,
      commits: branch.commits.map((m) => (m.id === moment.id ? moment : m)),
    };
    await repo.saveBranch(next);
    set((s) => ({ branches: s.branches.map((b) => (b.id === next.id ? next : b)) }));
  },

  async startMerge(branchIds) {
    const draft: MergeDraft = {
      id: newId("dr"),
      branchIds,
      startedAt: appNow().toISOString(),
      stage: "carrying",
      partial: {},
    };
    await repo.saveDraft(draft);
    set((s) => ({
      mergeDraft: draft,
      operation: { kind: "confirming-merge" as const, branchIds },
      view: nowView(s.view),
    }));
  },

  async saveMergeDraft(draft) {
    await repo.saveDraft(draft);
    set({ mergeDraft: draft });
  },

  async cancelMerge() {
    const draft = get().mergeDraft;
    if (draft) await repo.deleteDraft(draft.id);
    set((s) => ({
      mergeDraft: undefined,
      view: nowView(s.view),
      operation: { kind: "idle" as const },
    }));
  },

  async completeMerge(input) {
    const merge = createMerge(input, appNow());
    const updated = input.branches.map((b) => applyMergeToBranch(b, merge, appNow()));
    await repo.saveMerge(merge);
    await repo.saveBranches(updated);
    if (merge.action) await repo.saveAction(merge.action);
    const draft = get().mergeDraft;
    if (draft) await repo.deleteDraft(draft.id);
    set((s) => ({
      merges: [...s.merges, merge],
      actions: merge.action ? [...s.actions, merge.action] : s.actions,
      branches: s.branches.map((b) => updated.find((u) => u.id === b.id) ?? b),
      mergeDraft: undefined,
      view: nowView(s.view),
      operation: { kind: "idle" },
    }));
    return merge;
  },

  async handOffBranch(branchId) {
    const branch = get().branches.find((b) => b.id === branchId);
    if (!branch) return;
    const today = todayIso();
    const freed = heldFeelings(branch);
    const next: PsychologicalBranch = trackLoudness(
      branch,
      {
        ...branch,
        status: "converted-to-project",
        mergeDate: today,
        loudness: 1,
        lastDecisionOn: today,
        leftOn: undefined,
      },
      appNow(),
    );
    // The work lives where your tasks live now: nothing left to do on it here.
    const openActions = get()
      .actions.filter(
        (a) => !a.completedAt && a.branchesIntegrated.some((x) => x.branchId === branchId),
      )
      .map((a) => completeAction(a));
    await repo.saveBranch(next);
    for (const a of openActions) await repo.saveAction(a);
    set((s) => ({
      branches: s.branches.map((b) => (b.id === branchId ? next : b)),
      actions: s.actions.map((a) => openActions.find((c) => c.id === a.id) ?? a),
      reclaim: freed.length > 0 ? { key: Date.now(), branchId, feelings: freed } : s.reclaim,
      view: nowView(s.view),
      operation: { kind: "idle" },
    }));
  },

  async recordRecurrenceOn(branchId) {
    const branch = get().branches.find((b) => b.id === branchId);
    if (!branch) return;
    const next = recordRecurrence(branch);
    await repo.saveBranch(next);
    set((s) => ({ branches: s.branches.map((b) => (b.id === branchId ? next : b)) }));
  },

  setWindow: (window) => set({ window }),
  panBy(fraction) {
    const w = get().window;
    if (!w) return;
    set({ window: panWindow(w, fraction, todayIso()) });
  },
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setTheme: (theme) => {
    AsyncStorage.setItem(THEME_KEY, theme).catch(() => {});
    set({ theme });
  },
  setMascotType: (mascotType) => {
    AsyncStorage.setItem(MASCOT_KEY, mascotType).catch(() => {});
    set({ mascotType });
  },
  setLanguage: (language) => {
    AsyncStorage.setItem(LANGUAGE_KEY, language).catch(() => {
      // storage may be unavailable; the choice still applies now
    });
    set({ language });
  },
  signIn: (user) => {
    AsyncStorage.setItem(AUTH_KEY, JSON.stringify(user)).catch(() => {
      // storage may be unavailable; the session still applies now
    });
    set({ authUser: user });
  },
  async signInApi(email, password) {
    const user = await api.login(email, password);
    get().signIn({ name: user.name, email: user.email });
    set(await planPatch(user.plan === "pro", get()));
  },
  async registerApi(email, password, name) {
    // The account exists now but stays locked until the emailed code is entered.
    const res = await api.register(email, password, name);
    return res.devCode;
  },
  async verifyEmailApi(email, code) {
    const user = await api.verifyEmail(email, code);
    get().signIn({ name: user.name, email: user.email });
    set(await planPatch(user.plan === "pro", get()));
  },
  async syncMe() {
    try {
      const user: ApiUser = await api.me();
      set(await planPatch(user.plan === "pro", get()));
    } catch (e) {
      if (e instanceof ApiAuthError) {
        // The server answered but the session is dead: forget its facts.
        set(await planPatch(null, get()));
      } else {
        // Offline keeps the last known facts until the server can speak again.
        set({ apiOnline: false });
      }
    }
  },
  signOut: () => {
    AsyncStorage.removeItem(AUTH_KEY).catch(() => {
      // storage may be unavailable; the session still ends now
    });
    void api.logout();
    set({ authUser: null, serverPro: null });
  },
  setPro: (isPro) => {
    AsyncStorage.setItem(PRO_KEY, isPro ? "1" : "0").catch(() => {
      // storage may be unavailable; the choice still applies now
    });
    set((s) => ({
      isPro,
      // Losing Pro steps an active Pro theme back to the default — in memory
      // only, so the stored choice returns when Pro does.
      theme: !isPro && isProTheme(s.theme) ? defaultTheme() : s.theme,
    }));
  },

  exportData: () => repo.exportAll(),
  async importData(json) {
    await repo.importAll(json);
    const data = await repo.loadAll();
    set({
      branches: data.branches,
      merges: data.merges,
      actions: data.actions,
      window: weekWindow(appNow()),
    });
  },
  async loadExampleData() {
    const { buildExampleData } = await import("@/db/example-data");
    const data = buildExampleData();
    await repo.saveBranches(data.branches);
    for (const m of data.merges) await repo.saveMerge(m);
    for (const a of data.actions) await repo.saveAction(a);
    for (const w of data.waiting) await repo.saveWaiting(w);
    set((s) => ({
      branches: [...s.branches, ...data.branches],
      merges: [...s.merges, ...data.merges],
      actions: [...s.actions, ...data.actions],
      view: nowView(s.view),
      operation: { kind: "idle" },
      window: weekWindow(appNow()),
    }));
  },
  async deleteEverything() {
    await repo.deleteEverything();
    set({
      branches: [],
      merges: [],
      actions: [],
      pinnedBranchIds: [],
      draftBranchId: null,
      mergeDraft: undefined,
      view: { kind: "now" },
      operation: { kind: "idle" },
      window: weekWindow(appNow()),
    });
  },
}));

/** Pro as enforced: the server's word when it has spoken, else the local testing flag. */
export const selectEffectivePro = (s: { isPro: boolean; serverPro: boolean | null }): boolean =>
  s.serverPro ?? s.isPro;

export function matchesStatusFilter(
  b: PsychologicalBranch,
  statusFilter: StatusFilter,
): boolean {
  switch (statusFilter) {
    case "all":
      return true;
    case "active":
      return !["merged", "archived"].includes(b.status);
    case "merged":
      return ["merged", "partly-integrated", "archived"].includes(b.status);
    case "recurring":
      return b.recurrenceCount > 0;
  }
}

/** Branches visible under the current filters and optional title search. */
export function filterBranches(
  branches: PsychologicalBranch[],
  typeFilter: Set<PsychologicalBranch["type"]>,
  statusFilter: StatusFilter,
  query = "",
): PsychologicalBranch[] {
  const q = query.trim().toLowerCase();
  return branches.filter((b) => {
    if (typeFilter.size > 0 && !typeFilter.has(b.type)) return false;
    if (q && !`${b.title} ${b.description ?? ""}`.toLowerCase().includes(q)) return false;
    return matchesStatusFilter(b, statusFilter);
  });
}

export type { CreateBranchInput, Loudness, ForkPeriodChoice };
