/**
 * Development-only counters for the renderer architecture work.
 *
 * The question this answers is not "is it fast" — `PerformanceMonitor`
 * already reports JS and UI frame rates. It is "what is React doing while
 * the finger moves", which frame rates cannot distinguish: a drag that holds
 * 60fps by doing a full geometry rebuild every frame looks identical to one
 * that does none, right up until the device is a year older or the scene has
 * forty branches instead of ten.
 *
 * So these count events, not milliseconds:
 *
 *   render        a LifeTimeline React render
 *   geometry      a buildTimelineLayout / buildSummitLayout execution
 *   commit        a canonical window write to the store
 *   path          a dynamic path-string (or SkPath) rebuild
 *   cross         a UI-runtime → RN-runtime hop during a gesture
 *
 * The target during a continuous drag is render/geometry/commit ≈ 0 with
 * transform updates at display rate. A rebase should show exactly one commit
 * and one geometry build.
 *
 * Cost when the flag is false: every function below is a no-op that V8 and
 * Hermes inline away, and `snapshot()` returns a frozen empty reading. No
 * production bundle carries a counter.
 */

import { makeMutable, type SharedValue } from "react-native-reanimated";
import { PERF_COUNTERS } from "@/config/flags";

export type PerfEvent =
  | "render"
  | "geometry"
  | "commit"
  | "path"
  | "cross"
  /** SkPicture recordings. The number that says whether a canvas is redrawing
   *  because something moved, or because nothing stopped it. */
  | "picture";

/**
 * Path builds happen inside worklets, on the UI runtime. A plain JS counter
 * cannot see them there: native gives the UI runtime its own copy of this
 * module, so the increment would land in a number JS never reads. A shared
 * value is visible from both, and sampling it once a second costs one read
 * rather than one bridge crossing per rebuild — which would otherwise be the
 * measurement changing the thing it measures.
 */
export const pathBuildsSV: SharedValue<number> | null = PERF_COUNTERS ? makeMutable(0) : null;
/**
 * Recordings, counted separately from path builds.
 *
 * The two answer different questions and the difference is the whole
 * diagnosis: paths-per-second says how much geometry a frame costs, and
 * pictures-per-second says how often a frame happens at all. A canvas quantized
 * to 30Hz that is in fact re-recording at display rate reads as a perfectly
 * ordinary path count divided by a rope count nobody checks.
 */
export const picturesSV: SharedValue<number> | null = PERF_COUNTERS ? makeMutable(0) : null;

/** Call from inside a worklet, right where a `d` string or SkPath is built. */
export function countPathBuildUI(): void {
  "worklet";
  if (pathBuildsSV) pathBuildsSV.value += 1;
}

/** Call from inside a worklet, right where a picture is recorded. */
export function countPictureUI(): void {
  "worklet";
  if (picturesSV) picturesSV.value += 1;
}

export type PerfReading = {
  /** Events in the last full second, by kind. */
  perSecond: Record<PerfEvent, number>;
  /** Everything since the last `reset()`, by kind. */
  total: Record<PerfEvent, number>;
  /** Seconds since the last reset, for rate maths by the reader. */
  elapsedS: number;
  /** What is drawing the world right now. */
  renderer: "svg" | "skia";
};

const KINDS: PerfEvent[] = ["render", "geometry", "commit", "path", "cross", "picture"];

const zero = (): Record<PerfEvent, number> =>
  ({ render: 0, geometry: 0, commit: 0, path: 0, cross: 0, picture: 0 });

const EMPTY: PerfReading = Object.freeze({
  perSecond: Object.freeze(zero()) as Record<PerfEvent, number>,
  total: Object.freeze(zero()) as Record<PerfEvent, number>,
  elapsedS: 0,
  renderer: "svg" as const,
});

let total = zero();
let window_ = zero();
let lastRoll = 0;
let perSecond = zero();
let startedAt = 0;
let renderer: "svg" | "skia" = "svg";
const listeners = new Set<(r: PerfReading) => void>();

/**
 * Roll the one-second window on read rather than on a timer: an interval
 * would itself be work on the thread being measured, and would keep the app
 * awake at idle — which is one of the things being measured.
 */
function roll(now: number): void {
  if (startedAt === 0) startedAt = now;
  if (now - lastRoll < 1000) return;
  perSecond = window_;
  window_ = zero();
  lastRoll = now;
  if (listeners.size > 0) {
    const reading = snapshot();
    for (const fn of listeners) fn(reading);
  }
}

export function count(kind: PerfEvent, n = 1): void {
  if (!PERF_COUNTERS) return;
  total[kind] += n;
  window_[kind] += n;
  roll(Date.now());
}

/** Named helpers, so call sites read as prose at the point of the event. */
export const countRender = (): void => count("render");
export const countGeometryBuild = (): void => count("geometry");
export const countWindowCommit = (): void => count("commit");
export const countPathBuild = (n = 1): void => count("path", n);
export const countBridgeCross = (): void => count("cross");

export function setRenderer(next: "svg" | "skia"): void {
  if (!PERF_COUNTERS) return;
  renderer = next;
}

/** Fold the UI-side counters into the JS-side totals. Called on read. */
function drainUI(): void {
  drainOne(pathBuildsSV, "path");
  drainOne(picturesSV, "picture");
}
const drained: Partial<Record<PerfEvent, number>> = {};
function drainOne(sv: SharedValue<number> | null, kind: PerfEvent): void {
  if (!sv) return;
  const seen = sv.value;
  const was = drained[kind] ?? 0;
  if (seen === was) return;
  drained[kind] = seen;
  total[kind] += seen - was;
  window_[kind] += seen - was;
}

export function snapshot(): PerfReading {
  if (!PERF_COUNTERS) return EMPTY;
  drainUI();
  const now = Date.now();
  return {
    perSecond: { ...perSecond },
    total: { ...total },
    elapsedS: startedAt === 0 ? 0 : (now - startedAt) / 1000,
    renderer,
  };
}

export function reset(): void {
  if (!PERF_COUNTERS) return;
  if (pathBuildsSV) pathBuildsSV.value = 0;
  if (picturesSV) picturesSV.value = 0;
  drained.path = 0;
  drained.picture = 0;
  total = zero();
  window_ = zero();
  perSecond = zero();
  startedAt = Date.now();
  lastRoll = startedAt;
}

export function subscribe(fn: (r: PerfReading) => void): () => void {
  if (!PERF_COUNTERS) return () => {};
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * The harness in scripts/perf-probe.mjs reads these off `window`. Attached
 * only under the perf flag and only where a DOM exists, so a production web bundle
 * exposes nothing and native is untouched.
 */
if (PERF_COUNTERS && typeof globalThis !== "undefined") {
  (globalThis as Record<string, unknown>).__ocPerf = { snapshot, reset, KINDS };
}

/**
 * The harness needs to put the heavy scene on screen without clicking through
 * Settings. Registered by the store so this module stays free of app imports.
 */
export function exposeStressLoader(load: (count: number) => Promise<void>): void {
  if (!PERF_COUNTERS || typeof globalThis === "undefined") return;
  (globalThis as Record<string, unknown>).__ocLoadStress = load;
}
