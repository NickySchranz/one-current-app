import { create } from "zustand";
import { AccessibilityInfo, Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SHOW_TESTING } from "@/config/flags";
import type { ForkPeriodChoice, PsychologicalBranch, Loudness } from "@/domain/branches/types";
import type { BranchMerge, MergeDraft } from "@/domain/merges/types";
import type { Lesson } from "@/domain/lessons/types";
import type { IntegratedAction } from "@/domain/actions/types";
import type { BranchCommit } from "@/domain/moments/types";
import {
  createBranch,
  easeLoudness,
  trackLoudness,
  type CreateBranchInput, effectiveLoudness, isClosed } from "@/domain/branches/logic";
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
import { NEXT_AFTER, type TutorialEvent, type WalkthroughStepId } from "@/features/tutorial/steps";
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
  | { kind: "quick-touch"; branchId: string; expanded?: boolean; dialOnly?: boolean }
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

/**
 * How much of the screen an operation may take.
 *
 * "stage" is a screen of its own, like creating a thread: the whole shell steps
 * away so the one thread being answered is visible above the keyboard. Every
 * flow that asks the user to type belongs here — writing about a line you can
 * no longer see is the thing this avoids.
 */
export function operationDepth(
  op: TimelineOperation,
): "none" | "quick" | "focused" | "stage" {
  switch (op.kind) {
    case "idle":
      return "none";
    case "quick-act":
    case "quick-merge":
    case "quick-note":
    case "confirming-merge":
      return "stage";
    case "understanding":
    case "seeking-support":
      return "focused";
    default:
      return "quick";
  }
}

/** The thread a stage is about, if any. */
export function stageBranchId(op: TimelineOperation): string | null {
  if ("branchId" in op && op.branchId) return op.branchId;
  if (op.kind === "confirming-merge") return op.branchIds[0] ?? null;
  return null;
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
  /** Super bonk meter, 0..100 — grows with every real answer. */
  bonkCharge: number;
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
  /** The email whose threads live on this device; null until someone signs in. */
  ownerEmail: string | null;
  /** Where the guided walkthrough stands; null = not running (done, skipped, or signed out). */
  tutorialStep: WalkthroughStepId | null;
  /** The first thread — the walkthrough's pointer follows it after birth. */
  tutorialBranchId: string | null;
  /** UI language: every app term, never the user's own words. */
  language: "en" | "es" | "es-CO";
  reclaim?: ReclaimEvent;
  /** A branch was just created: its line draws itself onto the timeline. */
  born?: { key: number; branchId: string };
  /** A thread was just committed from the create flow: a small confirmation pops by its line. */
  added?: { key: number; branchId: string };
  /**
   * A reflect flow just finished on its own stage. The map is unmounted while
   * a stage is up, so the reaction cannot be read from an operation change —
   * it has to wait here until the timeline comes back and picks it up.
   */
  answered?: { key: number; branchId: string; kind: "act" | "note" };
  /**
   * A thread just came home to the main line. Like `born`, this waits for the
   * map: the line draws itself along its merged path so the fold-in is seen,
   * instead of the thread simply being there already merged.
   */
  integrated?: { key: number; branchId: string };
  /** A worry is being burned: fire consumes its line, then finalizeBurn removes it. */
  burn?: { key: number; branchId: string; items: string[]; lesson: string };
  /** Pip just struck a thread (drives the attack animation). */
  hit?: { key: number; branchId: string; calm: boolean };
  /** Tokens that popped out of threads and wait to be collected (fly to the meter). */
  coins: { key: number; branchId: string }[];
  /** Testing: every qualifying drop yields a token (no chance roll). */
  coinAlways: boolean;
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
  /** Dealing with threads charges the super bonk meter (clamped at 100). */
  addBonkCharge(amount: number): void;
  /** Fire the super bonk: the meter empties and starts growing again. */
  consumeSuperBonk(): void;
  clearHit(): void;
  /**
   * A loudness dial just moved down: maybe a token jumps out. Call BEFORE the
   * change is committed, so the thread's loudness log still ends at the old
   * value — the log is the anti-farm memory (see loudnessFloorToday).
   */
  maybeDropCoin(branchId: string, prevLevel: number, newLevel: number): void;
  /** A token landed in the meter: it becomes charge. */
  collectCoin(key: number): void;
  clearCoins(): void;
  /** Testing: force every qualifying drop to yield a token. */
  setCoinAlways(v: boolean): void;
  /** Phase 1 of a burn: light the fire. Nothing is written or deleted yet. */
  burnBranch(branchId: string, items: string[], lesson: string): void;
  /** Phase 2: the fire is done — keep the lesson, remove the thread entirely. */
  finalizeBurn(): Promise<void>;
  clearBorn(): void;
  clearAdded(): void;
  /**
   * A reflect stage is done: close it and leave the reaction for the map to
   * play as it comes back. The write itself has already happened.
   */
  finishReflection(branchId: string, kind: "act" | "note"): void;
  clearAnswered(): void;
  clearIntegrated(): void;
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
  /**
   * Store the session (login or register both land here). The owner gate lives
   * here too: a different account taking over this device wipes the previous
   * account's threads before anything can render them.
   */
  signIn(user: AuthUser): Promise<void>;
  /** Remove every piece of account data on this device (threads, merges, lessons, meter). Device preferences stay. */
  wipeLocalData(): Promise<void>;
  /** Manual advance for the walkthrough's Next-button steps; finishes on the last one. */
  tutorialNext(): void;
  tutorialSkip(): void;
  tutorialRestart(): void;
  /** The single funnel for the user actions the walkthrough advances on. */
  noteTutorialEvent(e: TutorialEvent, branchId?: string): void;
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
const BONK_CHARGE_KEY = "one-current-bonk-charge";
/** "done" = the guided walkthrough never shows again. Known to the capture scripts. */
const TUTORIAL_KEY = "one-current-tutorial-v1";
/** Which account's threads live on this device. Survives sign-out on purpose. */
const OWNER_KEY = "one-current-owner";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Super bonk: dealing with threads charges the meter; at 100 Pip can sweep
// every open timeline in one glorious run. Values are easy to tune.
const CHARGE_ACT = 20;
const CHARGE_REST = 15;
const CHARGE_INTEGRATE = 25;
const CHARGE_BURN = 25;
const CHARGE_HANDOFF = 20;
const CHARGE_BONK = 3;
/** A collected token is a real bite of the meter. */
const CHARGE_COIN = 10;
/** Chance a genuine loudness drop shakes a token loose. */
const COIN_CHANCE_DIAL = 0.5;
/** Chance a charging bonk also drops a token. */
const COIN_CHANCE_BONK = 0.35;
const COIN_ALWAYS_KEY = "one-current-coin-always";
/** At most this many tokens in the air at once (a super bonk can rain them). */
const MAX_COINS = 6;
let coinKeyCounter = 0;
/** Unique per-token key even inside a same-millisecond sweep. */
function nextCoinKey(): number {
  coinKeyCounter += 1;
  return Date.now() * 100 + (coinKeyCounter % 100);
}
/** A thread yields bonk-charge at most once per this window (ms). */
const BONK_CHARGE_COOLDOWN_MS = 60 * 60 * 1000;
/** Session-only: when each thread last yielded bonk-charge. */
const bonkChargeStamps = new Map<string, number>();

/**
 * The lowest loudness this thread has already stood at today, per its own
 * log. Tokens only fall on the way past this mark — dialing up and back
 * down revisits old ground and shakes nothing loose. The log survives
 * reloads, so the mark does too.
 */
function loudnessFloorToday(branch: PsychologicalBranch, day: string): number {
  let floor = Infinity;
  for (const entry of branch.loudnessLog ?? []) {
    if (entry.at.slice(0, 10) === day) floor = Math.min(floor, Math.round(entry.loudness));
  }
  return floor;
}
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
  bonkCharge: number;
  coinAlways: boolean;
  ownerEmail: string | null;
  tutorialDone: boolean;
}> {
  let theme = defaultTheme();
  let language: "en" | "es" | "es-CO" = "en";
  let reducedMotion = false;
  let isPro = false;
  let authUser: AuthUser | null = null;
  let mascotType: MascotType = MASCOT_TYPES[Math.floor(Math.random() * MASCOT_TYPES.length)];
  let bonkCharge = 0;
  let coinAlways = false;
  let ownerEmail: string | null = null;
  let tutorialDone = false;
  try {
    const [savedTheme, savedLanguage, savedPro, savedAuth, reduceMotion, savedMascot, savedCharge, savedCoinAlways, savedOwner, savedTutorial] = await Promise.all([
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(LANGUAGE_KEY),
      AsyncStorage.getItem(PRO_KEY),
      AsyncStorage.getItem(AUTH_KEY),
      AccessibilityInfo.isReduceMotionEnabled(),
      AsyncStorage.getItem(MASCOT_KEY),
      AsyncStorage.getItem(BONK_CHARGE_KEY),
      AsyncStorage.getItem(COIN_ALWAYS_KEY),
      AsyncStorage.getItem(OWNER_KEY),
      AsyncStorage.getItem(TUTORIAL_KEY),
    ]);
    const parsedCharge = Number(savedCharge);
    if (Number.isFinite(parsedCharge)) bonkCharge = Math.max(0, Math.min(100, parsedCharge));
    coinAlways = savedCoinAlways === "1";
    isPro = savedPro === "1";
    authUser = parseAuthUser(savedAuth);
    ownerEmail = savedOwner ? normalizeEmail(savedOwner) : null;
    tutorialDone = savedTutorial === "done";
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
  return { theme, language, reducedMotion, isPro, authUser, mascotType, bonkCharge, coinAlways, ownerEmail, tutorialDone };
}

/** Disk-level account wipe, shared by init()'s backstop and the store action.
 * The tutorial key is NOT touched here: only an account switch resets it. */
async function wipeLocalStorageData(): Promise<void> {
  bonkChargeStamps.clear();
  await repo.deleteEverything();
  await AsyncStorage.setItem(BONK_CHARGE_KEY, "0").catch(() => {});
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
  const pro = serverPro ?? (SHOW_TESTING && s.isPro);
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
  bonkCharge: 0,
  coins: [],
  coinAlways: false,
  theme: defaultTheme(),
  mascotType: "chronicler" as MascotType,
  isPro: false,
  serverPro: null,
  apiOnline: null,
  authUser: null,
  ownerEmail: null,
  tutorialStep: null,
  tutorialBranchId: null,
  language: "en" as const,
  nowTick: appNow().getTime(),
  timeSkewMs: 0,
  timeRate: 1,

  async init() {
    let [data, settings] = await Promise.all([repo.loadAll(), loadSettings()]);
    const { tutorialDone, ...restored } = settings;
    let { ownerEmail } = settings;
    let startWalkthrough = !tutorialDone && settings.authUser !== null;
    if (settings.authUser) {
      const email = normalizeEmail(settings.authUser.email);
      if (!ownerEmail) {
        // Pre-stamp device (or a capture script's seeded session): the
        // signed-in account adopts whatever is here.
        ownerEmail = email;
        AsyncStorage.setItem(OWNER_KEY, email).catch(() => {});
      } else if (ownerEmail !== email) {
        // The session changed hands outside the sign-in flow (storage edited):
        // the old owner's threads must never render. Wipe before ready.
        await wipeLocalStorageData();
        await AsyncStorage.removeItem(TUTORIAL_KEY).catch(() => {});
        data = await repo.loadAll();
        ownerEmail = email;
        AsyncStorage.setItem(OWNER_KEY, email).catch(() => {});
        startWalkthrough = true;
      }
    }
    const draft = data.drafts[0];
    set({
      ready: true,
      ...restored,
      ownerEmail,
      tutorialStep: startWalkthrough ? "welcome" : null,
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
  setOperation: (operation) => {
    // The walkthrough advances on the real actions these operations represent.
    if (get().tutorialStep !== null) {
      if (operation.kind === "creating-branch") get().noteTutorialEvent("create-opened");
      else if (operation.kind === "quick-touch") get().noteTutorialEvent("menu-opened");
      else if (operation.kind === "idle") {
        get().noteTutorialEvent("create-cancelled");
        get().noteTutorialEvent("menu-closed");
      }
    }
    set((s) => ({
      operation,
      view: operation.kind === "idle" ? s.view : nowView(s.view),
    }));
  },
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
    // The draft lives only on the creation screen: the map neither shows it
    // nor moves for it. Its window/view reset and born draw-in happen at
    // commit, when the finished line joins the real timeline.
    set((s) => ({
      branches: [...s.branches, branch],
      draftBranchId: branch.id,
      pinnedBranchIds: [...s.pinnedBranchIds, branch.id],
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
      // Always born: a committed draft replays its draw-in on the full map
      // (during creation it stood alone; this is its arrival among the rest).
      born: { key: Date.now(), branchId: branch.id },
      // The small "thread added" pop belongs to the create flow only — the
      // recurrence path (no draft) lands in an existing thread's menu instead.
      added: draftId ? { key: Date.now(), branchId: branch.id } : s.added,
    }));
    get().noteTutorialEvent("thread-born", branch.id);
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
      get().addBonkCharge(CHARGE_REST);
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
    // A real hit charges the meter — but each thread only once an hour, so
    // bonking stays a treat, not a farm.
    const last = bonkChargeStamps.get(branchId) ?? 0;
    if (Date.now() - last >= BONK_CHARGE_COOLDOWN_MS) {
      bonkChargeStamps.set(branchId, Date.now());
      get().addBonkCharge(CHARGE_BONK);
      // A charging hit can shake a token loose too — same hourly gate, so
      // it inherits the anti-farm for free. A super bonk sweep can rain
      // several (one per charging hop), each flying to the meter on its own.
      const coins = get().coins;
      if (
        coins.length < MAX_COINS &&
        !coins.some((c) => c.branchId === branchId) &&
        (get().coinAlways || Math.random() < COIN_CHANCE_BONK)
      ) {
        set({ coins: [...coins, { key: nextCoinKey(), branchId }] });
      }
    }
  },

  maybeDropCoin(branchId, prevLevel, newLevel) {
    const prev = Math.round(prevLevel);
    const next = Math.round(newLevel);
    if (next >= prev) return;
    const branch = get().branches.find((b) => b.id === branchId);
    if (!branch || isClosed(branch)) return;
    // Only ground this thread has not stood on today counts. The floor is
    // read before the dial commits, so it still ends at the old value.
    const floor = Math.min(loudnessFloorToday(branch, todayIso()), prev);
    if (next >= floor) return;
    const coins = get().coins;
    if (coins.length >= MAX_COINS || coins.some((c) => c.branchId === branchId)) return;
    if (!get().coinAlways && Math.random() >= COIN_CHANCE_DIAL) return;
    set({ coins: [...coins, { key: nextCoinKey(), branchId }] });
  },

  collectCoin(key) {
    const coins = get().coins;
    if (!coins.some((c) => c.key === key)) return;
    get().addBonkCharge(CHARGE_COIN);
    set({ coins: coins.filter((c) => c.key !== key) });
  },

  clearCoins: () => set({ coins: [] }),

  setCoinAlways(v) {
    set({ coinAlways: v });
    AsyncStorage.setItem(COIN_ALWAYS_KEY, v ? "1" : "0").catch(() => {});
  },

  addBonkCharge(amount) {
    const next = Math.max(0, Math.min(100, get().bonkCharge + amount));
    set({ bonkCharge: next });
    AsyncStorage.setItem(BONK_CHARGE_KEY, String(next)).catch(() => {});
  },

  consumeSuperBonk() {
    set({ bonkCharge: 0 });
    AsyncStorage.setItem(BONK_CHARGE_KEY, "0").catch(() => {});
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
    get().addBonkCharge(CHARGE_BURN);
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
  clearAdded: () => set({ added: undefined }),

  finishReflection: (branchId, kind) =>
    set((s) => ({
      answered: { key: Date.now(), branchId, kind },
      operation: { kind: "idle" as const },
      view: nowView(s.view),
    })),
  clearAnswered: () => set({ answered: undefined }),
  clearIntegrated: () => set({ integrated: undefined }),

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
    get().addBonkCharge(CHARGE_ACT);
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
      // Whichever line actually closed is the one that folds in.
      integrated: (() => {
        const closed = updated.find((b) => !!b.mergeDate);
        return closed ? { key: Date.now(), branchId: closed.id } : s.integrated;
      })(),
    }));
    get().addBonkCharge(CHARGE_INTEGRATE);
    return merge;
  },

  async handOffBranch(branchId) {
    const branch = get().branches.find((b) => b.id === branchId);
    if (!branch) return;
    get().addBonkCharge(CHARGE_HANDOFF);
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
      integrated: { key: Date.now(), branchId },
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
  async signIn(user) {
    const email = normalizeEmail(user.email);
    const s = get();
    const hasData =
      s.branches.length + s.merges.length + s.actions.length + s.lessons.length > 0;
    if (s.ownerEmail && s.ownerEmail !== email && hasData) {
      // A different account is taking this device over: the previous account's
      // threads go before anything can render them. AuthGate asked first.
      await get().wipeLocalData();
      await AsyncStorage.removeItem(TUTORIAL_KEY).catch(() => {});
    }
    if (s.ownerEmail !== email) {
      AsyncStorage.setItem(OWNER_KEY, email).catch(() => {});
      set({ ownerEmail: email });
    }
    AsyncStorage.setItem(AUTH_KEY, JSON.stringify(user)).catch(() => {
      // storage may be unavailable; the session still applies now
    });
    set({ authUser: user });
    // A first session on this device (or after a takeover) gets the walkthrough.
    const done = await AsyncStorage.getItem(TUTORIAL_KEY).catch(() => null);
    if (done !== "done" && get().tutorialStep === null) set({ tutorialStep: "welcome" });
  },
  async signInApi(email, password) {
    const user = await api.login(email, password);
    await get().signIn({ name: user.name, email: user.email });
    set(await planPatch(user.plan === "pro", get()));
  },
  async registerApi(email, password, name) {
    // The account exists now but stays locked until the emailed code is entered.
    const res = await api.register(email, password, name);
    return res.devCode;
  },
  async verifyEmailApi(email, code) {
    const user = await api.verifyEmail(email, code);
    await get().signIn({ name: user.name, email: user.email });
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
      // Imported lessons reach the disk through repo.importAll; without this
      // they stayed invisible until the next launch.
      lessons: data.lessons,
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
  async wipeLocalData() {
    // Quiesce first: no animation, timer, or pending write may act on old ids.
    // burn goes with the rest — a stray finalizeBurn finds nothing to write.
    set({
      operation: { kind: "idle" },
      view: { kind: "now" },
      mergeDraft: undefined,
      draftBranchId: null,
      pinnedBranchIds: [],
      tutorialBranchId: null,
      burn: undefined,
      born: undefined,
      added: undefined,
      answered: undefined,
      integrated: undefined,
      hit: undefined,
      reclaim: undefined,
      coins: [],
      bonkCharge: 0,
      window: weekWindow(appNow()),
    });
    // Table writes chain on their own queue, so anything in flight lands
    // before the clear — nothing stale can re-persist afterwards.
    await wipeLocalStorageData();
    set({ branches: [], merges: [], actions: [], lessons: [] });
  },
  async deleteEverything() {
    await get().wipeLocalData();
    // The device holds nothing now, so it belongs to no account.
    await AsyncStorage.removeItem(OWNER_KEY).catch(() => {});
    set({ ownerEmail: null });
  },

  tutorialNext() {
    const step = get().tutorialStep;
    if (step === null) return;
    if (step === "done") {
      AsyncStorage.setItem(TUTORIAL_KEY, "done").catch(() => {});
      set({ tutorialStep: null, tutorialBranchId: null });
      return;
    }
    const next = NEXT_AFTER[step];
    if (!next) return;
    if (next === "point-plus" && !canCreateThread(get().branches, selectEffectivePro(get()), get().draftBranchId)) {
      // Full timeline (a restart on a lived-in account): meet an existing
      // thread instead of pointing at a + that would open the paywall.
      const open = get().branches.filter((b) => !isClosed(b));
      const newest = open[open.length - 1];
      set(
        newest
          ? { tutorialStep: "meet-thread", tutorialBranchId: newest.id }
          : { tutorialStep: next },
      );
      return;
    }
    set({ tutorialStep: next });
  },
  tutorialSkip() {
    AsyncStorage.setItem(TUTORIAL_KEY, "done").catch(() => {});
    set({ tutorialStep: null, tutorialBranchId: null });
  },
  tutorialRestart() {
    AsyncStorage.removeItem(TUTORIAL_KEY).catch(() => {});
    set({
      tutorialStep: "welcome",
      tutorialBranchId: null,
      view: { kind: "now" },
      operation: { kind: "idle" },
      window: weekWindow(appNow()),
    });
  },
  noteTutorialEvent(e, branchId) {
    const step = get().tutorialStep;
    if (step === null) return;
    if (e === "create-opened" && step === "point-plus") {
      set({ tutorialStep: "creating" });
    } else if (e === "create-cancelled" && step === "creating") {
      set({ tutorialStep: "point-plus" });
    } else if (e === "thread-born" && (step === "creating" || step === "point-plus")) {
      set({ tutorialStep: "meet-thread", tutorialBranchId: branchId ?? null });
    } else if (e === "thread-armed" && step === "meet-thread") {
      set({ tutorialStep: "pip-arrives" });
    } else if (
      e === "menu-opened" &&
      (step === "pip-arrives" || step === "meet-thread" || step === "creating")
    ) {
      set({ tutorialStep: "menu" });
    } else if (e === "menu-closed" && step === "menu") {
      // The user answered (or stepped back) — either way they've seen the menu.
      set({ tutorialStep: "bonk" });
    }
  },
}));

/** Pro as enforced: the server's word when it has spoken. The local flag only
 * counts in testing builds — production Pro comes from a real subscription. */
export const selectEffectivePro = (s: { isPro: boolean; serverPro: boolean | null }): boolean =>
  s.serverPro ?? (SHOW_TESTING && s.isPro);

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
