/**
 * The summit map is the same timeline turned on end: time flows UP, Now near
 * the top, the past below. Nothing here re-derives layout — the horizontal
 * builders stay the single source of geometry, and this module transposes
 * their output with one pure mapping:
 *
 *     tp(x, y) = { x: y,  y: timeLen − x }
 *
 * so lanes become columns beside the vertical route and every open thread's
 * fork→Now run becomes a rope hanging from the ledge down to its fork point.
 * The stroke machinery (samplePath + normals) is axis-agnostic, so the
 * transposed path strings feed it unchanged.
 */

import type { PsychologicalBranch } from "@/domain/branches/types";
import { handledToday } from "@/domain/feelings/logic";
import { buildTimelineLayout, type TimelineLayout } from "../main-line/layout";
import type { BranchGeometry } from "../branch-lines/paths";
import { dateToX, dateToXRaw, defaultWindow, type TimeWindow } from "../zoom/time-scale";

/**
 * The day's climb is a LADDER of cliff edges above the Now ledge. Three
 * things have to hold at once, and they set every number here:
 *
 *   • The FIRST rung starts out of view. He stands mid-screen on an
 *     unclimbed day, so rung 0 sits half a screen (plus margin) above Now:
 *     the first rope is climbed up out of the frame, and the camera pans
 *     down after him to set him on his new ledge.
 *   • The PEAK stays out of view until the last rope. The camera rides him
 *     HIGHER on the screen the further he climbs (0.5·L of sky above him at
 *     Now, 0.2·L on the top rung), so a headroom of ~0.24·L keeps the summit
 *     past the top edge on every rung — the last climb brings it in, and he
 *     lands on it back at 0.3·L with the whole day below him.
 *   • Every conquered ledge fits ONE screen at top-out: headroom plus the
 *     ladder span must clear the screen below him, so the rung step shrinks
 *     as the day's rope count grows. Seven ropes cannot each be a
 *     screen-height climb AND all be in frame at the end; the FIRST climb is
 *     the long one (half a screen, straight up out of view), the rest are
 *     rungs.
 *
 * Ropes still waiting hang from above the peak, so their anchors are never
 * in frame; each re-anchors at its rung the moment it is answered.
 */
export function summitLadder(
  timeLen: number,
  ropeCount: number,
): {
  first: number;
  step: number;
  headroom: number;
  /** World px from Now up to the TOP rung (where the camera rides highest). */
  topDist: number;
  peakAbove: number;
} {
  const n = Math.max(1, ropeCount);
  const first = Math.round(0.5 * timeLen) + 60;
  const headroom = Math.round(0.24 * timeLen) + 45;
  // Room left on screen below him at top-out (he stands on the peak at
  // 0.3·L, and the lowest rung must clear the bottom edge by 30px).
  const room = Math.max(0, 0.7 * timeLen - 30 - headroom);
  const step =
    n > 1 ? Math.round(Math.max(40, Math.min(0.22 * timeLen, room / (n - 1)))) : 0;
  const topDist = first + (n - 1) * step;
  return { first, step, headroom, topDist, peakAbove: topDist + headroom };
}

/** Deterministic jitter, stable within a day (same as timeline-fx's). */
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 9973;
}

/** The day-seeded rope order — shared by the builder's rung fallback and the
 * caller's climb-order bookkeeping, so both tell the same story of the day. */
export function daySeedOrder(ids: readonly string[], now: Date): string[] {
  const dayNo = Math.floor(now.getTime() / 86400000);
  return [...ids].sort(
    (a, b) =>
      seeded(idHash(a), dayNo) - seeded(idHash(b), dayNo) || (a < b ? -1 : 1),
  );
}

/**
 * The mountain's half-width at a given depth below the peak — one profile
 * shared by the drawn face and the anchor placement, so every cliff ledge
 * lands ON the rock: a narrow cap, quickly broadening shoulders, then the
 * massif running near-vertical to the valley.
 */
export function mountainHalfWidth(depth: number, width: number): number {
  const capW = 70;
  const shW = 0.3 * width;
  const brW = 0.47 * width;
  if (depth <= 0) return 8;
  if (depth <= 90) return 8 + (capW - 8) * (depth / 90);
  if (depth <= 260) return capW + (shW - capW) * ((depth - 90) / 170);
  if (depth <= 480) return shW + (brW - shW) * ((depth - 260) / 220);
  return Math.min(0.54 * width, brW + (depth - 480) * 0.08);
}

/**
 * The highest the day's ledge (Now) ever hangs below the top edge. The
 * summit view trims the window's future projection so Now maps wherever the
 * camera wants it: near the top on an unanswered day (ropes dangling from
 * the top of the screen), easing down toward screen center as the climber
 * gains ledges — the world moves down, the climber stays centered.
 */
export const LEDGE_Y = 28;

export type SummitLayout = TimelineLayout & {
  orientation: "vertical";
  /** Screen x of the vertical route (the transposed main line). */
  routeX: number;
  /** Screen x anchor of the lane band (routeX equals it unless the route leans). */
  bandX: number;
  /** Screen y of Now — near the top; the ledge sits here. */
  nowScreenY: number;
  /** Length of the time axis in px (the stage height less the tray inset). */
  timeLen: number;
  /** The built axis including the pan-back headroom above the canvas —
   * date→y mapping must use THIS length: y = timeLen − dateToX(d, w, axisLen). */
  axisLen: number;
  /** Canvas width needed to hold every rope column; may exceed the stage. */
  laneSpan: number;
  /**
   * The untrimmed store window. `window` on the layout is the DISPLAY window
   * (future projection cut so Now sits at LEDGE_Y); navigation state like
   * "away from Now" must judge against this one.
   */
  baseWindow: TimeWindow;
  /** displaySpan / storeSpan — pan gestures scale by this so a px of finger
   * moves a px of mountain, not a px of the (longer) store window. */
  panScale: number;
  /** World px from the Now ledge up to the summit tip (see summitLadder). */
  peakAbove: number;
  /** World px between consecutive conquered cliff ledges. */
  ladderStep: number;
  /** World px from Now up to the day's TOP rung (peak = this + headroom). */
  ladderTop: number;
};

export function tp(x: number, y: number, timeLen: number): { x: number; y: number } {
  return { x: y, y: timeLen - x };
}

/**
 * Transpose an M/L/C path string (all buildBranchGeometry emits): every
 * coordinate pair (x, y) becomes (y, timeLen − x). Same token grammar as
 * path-sample's parser.
 */
export function transposePath(d: string, timeLen: number): string {
  const tokens = d.match(/[MLC]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let out = "";
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    const pairs = cmd === "C" ? 3 : 1;
    out += (out ? " " : "") + cmd;
    for (let p = 0; p < pairs; p++) {
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      out += ` ${y} ${round1(timeLen - x)}`;
    }
  }
  return out;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Map an ISO date to its world y on the summit map (top = future).
 * `timeLen` is the canvas span, `axisLen` the built axis (with pan-back
 * headroom); they are equal unless the user has panned past Now. */
export function dateToScreenY(
  date: string,
  window: TimeWindow,
  timeLen: number,
  axisLen: number = timeLen,
): number {
  return timeLen - dateToX(date, window, axisLen);
}

export type SummitLayoutOptions = {
  stageWidth: number;
  stageHeight: number;
  /** Height claimed by a bottom sheet: the time axis compresses above it. */
  trayInset: number;
  window?: TimeWindow;
  compact?: boolean;
  now?: Date;
  /** Horizontal lean of the route toward a focused rope (base mainShift). */
  mainShift?: number;
  pinnedBranchIds?: readonly string[];
  /**
   * Where the ledge (Now) should sit on screen. The climbing camera drives
   * this: high on an unanswered day, easing to screen center as answers
   * land. Defaults to LEDGE_Y.
   */
  ledgeY?: number;
  /**
   * Climb order of the ropes answered today (branchId → rung index, 0 =
   * first climbed = lowest ledge). Ropes missing from the map fall back to
   * a day-seeded order, so a reload mid-day still builds a stable ladder.
   */
  climbRanks?: Record<string, number>;
  /**
   * Ropes the climber has already topped out on: theirs are off the face,
   * coiled on their ledge. An answered rope missing from this set is still
   * hanging — he is on his way up it.
   */
  retiredIds?: readonly string[];
};

/** How many chars of a rope's title fit its ladder slot. */
export const SUMMIT_LABEL_CHARS = 22;
/** Vertical rhythm of the label ladder above the anchors. */
const LADDER_BASE = 12;
const LADDER_STEP = 14;
const LADDER_ROWS = 3;

/**
 * Pure composition of the summit scene: the untouched horizontal builder runs
 * with swapped stage dims (time axis = vertical extent, lane band = stage
 * width), then every geometry is transposed into screen coordinates.
 */
export function buildSummitLayout(
  branches: PsychologicalBranch[],
  opts: SummitLayoutOptions,
): SummitLayout {
  const timeLen = Math.max(240, opts.stageHeight - Math.round(opts.trayInset));
  const now = opts.now ?? new Date();
  const ledgeY = Math.max(LEDGE_Y, Math.min(timeLen * 0.5, opts.ledgeY ?? LEDGE_Y));
  // Trim the window's future projection so Now maps at the camera's ledge
  // height: the ropes dangle from up there, the climbed past falls away
  // below. When the user pans back past Now, the canvas keeps the STORE
  // window in view but the geometry is built on an EXTENDED axis reaching
  // up to Now (capped headroom) — so the whole scene above the canvas top
  // (ledge, ropes, merge points, Now) has real unclamped positions and
  // rides up off the screen with the dates instead of pinning at the edge.
  const storeWindow =
    opts.window ?? defaultWindow(branches.map((b) => b.forkDate), now);
  const startMs = Date.parse(storeWindow.start);
  const endMs = Date.parse(storeWindow.end);
  const nowMs = now.getTime();
  const frac = (timeLen - ledgeY) / timeLen;
  const idealEndMs =
    nowMs > startMs && frac > 0 ? startMs + (nowMs - startMs) / frac : endMs;
  const visEndMs = Math.min(endMs, idealEndMs);
  const visSpanMs = Math.max(1, visEndMs - startMs);
  const pxPerMs = timeLen / visSpanMs;
  const extraPx = Math.min(1200, Math.max(0, (idealEndMs - visEndMs) * pxPerMs));
  const axisLen = timeLen + extraPx;
  const window: TimeWindow = {
    start: storeWindow.start,
    end: new Date(startMs + axisLen / pxPerMs).toISOString(),
  };
  const panScale = visSpanMs / Math.max(1, endMs - startMs);
  const base = buildTimelineLayout(branches, {
    width: axisLen,
    height: opts.stageWidth,
    window,
    compact: opts.compact,
    now,
    mainShift: opts.mainShift,
    // In base coords "top" is the lane side that transposes to the left
    // edge; keep the outermost rope clear of it.
    topPad: 48,
    pinnedBranchIds: opts.pinnedBranchIds,
  });

  const routeX = base.mainY;
  const bandX = base.bandY;
  // While the trim is active this equals ledgeY exactly; panned back it goes
  // negative (up to the headroom cap) and the scene rides up off-screen.
  const nowScreenY = Math.max(
    -extraPx - 40,
    timeLen - dateToXRaw(now.toISOString(), window, axisLen),
  );

  // ── Open ropes become CLIFF ROPES ────────────────────────────────────
  // A rope answered today anchors at its rung of the day's ladder: a little
  // cliff ledge just above the previous one, day-seeded jitter keeping the
  // rock honest, the lane offset squeezed by the mountain's own profile so
  // every ledge lands ON the face. A rope still waiting hangs from ABOVE
  // the peak — its anchor never in view until it is climbed — down past the
  // Now ledge where the climber can grab it. Closed (integrated) ropes keep
  // their true time-anchored geometry — they are history on the mountain.
  const byBranch = new Map(branches.map((b) => [b.id, b]));
  const dayNo = Math.floor(nowMs / 86400000);
  const openOrder = base.geometries
    .filter((g) => g.reachesNow && g.inWindow)
    .map((g) => g.branchId);
  const seedOrder = daySeedOrder(openOrder, now);
  const ladder = summitLadder(timeLen, openOrder.length);
  const peakY = nowScreenY - ladder.peakAbove;
  // Fallback rung order for climbed ropes the caller has no record of
  // (mid-day reload): the day-seeded order, offset past the known ranks.
  const known = Object.values(opts.climbRanks ?? {});
  let nextRank = known.length ? Math.max(...known) + 1 : 0;
  const rungOf = new Map<string, number>();
  for (const id of seedOrder) {
    const b = byBranch.get(id);
    if (!b || !handledToday(b, now)) continue;
    const r = opts.climbRanks?.[id];
    rungOf.set(id, r ?? nextRank++);
  }
  // His altitude at rest: the highest rung he has earned (Now on a fresh
  // day). A waiting rope's own span runs from above the peak to below Now,
  // so it always crosses the screen wherever he is — but its LABEL has to
  // follow him up, or the ropes he can still grab go nameless once the Now
  // ledge has slid off the bottom of the screen.
  const retired = new Set(opts.retiredIds ?? []);
  const climbed = rungOf.size;
  const perchY =
    climbed > 0 ? nowScreenY - (ladder.first + ladder.step * (climbed - 1)) : nowScreenY;
  const openLabelY = Math.round(perchY + 0.2 * timeLen);

  const geometries: BranchGeometry[] = base.geometries.map((g) => {
    if (g.reachesNow) {
      const b = byBranch.get(g.branchId);
      const seedBase = idHash(g.branchId) + dayNo;
      const coiled = !!b && handledToday(b, now);
      const rung = rungOf.get(g.branchId) ?? 0;
      const ay = coiled
        ? nowScreenY -
          (ladder.first + ladder.step * rung) +
          Math.round((seeded(seedBase, 61) - 0.5) * Math.min(20, ladder.step * 0.24))
        : nowScreenY - ladder.peakAbove - 70 - Math.round(seeded(seedBase, 61) * 90);
      const laneOffset = g.laneY - base.bandY;
      // A conquered ledge must sit on rock; a waiting rope's anchor is out
      // of view, so its column keeps the full lane spread for grabbing.
      const hw = coiled
        ? mountainHalfWidth(ay - peakY, opts.stageWidth) - 30
        : Number.POSITIVE_INFINITY;
      const ax = Math.round(
        base.mainY + Math.sign(laneOffset || 1) * Math.min(Math.abs(laneOffset), Math.max(24, hw)),
      );
      const dangleY = Math.round(nowScreenY + 26 + seeded(seedBase, 62) * 64);
      const ordinal = openOrder.indexOf(g.branchId);
      const runSpan = Math.max(1, base.nowX - g.forkX);
      return {
        ...g,
        path: `M ${ax} ${dangleY} L ${ax} ${Math.round(ay)}`,
        forkX: ax,
        forkY: dangleY, // the free, dangling end
        endX: ax,
        endY: Math.round(ay), // the anchor: a cliff ledge on the face
        forkVisible: false,
        laneX: ax,
        labelX: ax,
        // A conquered rope names itself under its own cliff edge; a waiting
        // one names itself in the band just below the climber, laddered so
        // neighbouring columns never collide.
        labelY: coiled
          ? Math.round(ay) + 24
          : openLabelY + LADDER_BASE + (Math.max(0, ordinal) % LADDER_ROWS) * LADDER_STEP,
        labelAnchor: "middle",
        coiled,
        ropeGone: coiled && retired.has(g.branchId),
        // A waiting rope's anchor is out of view: its moments stay in the
        // band he can actually reach. A coiled rope keeps them on the stub
        // between its ledge and the coil.
        momentPoints: g.momentPoints.map((m) => {
          const t = Math.max(0, Math.min(1, (m.x - g.forkX) / runSpan));
          const lo = coiled ? dangleY : openLabelY + 40;
          const top = coiled ? ay : openLabelY - 200;
          return { ...m, x: ax, y: Math.round(lo + t * (top - lo)) };
        }),
      };
    }
    const fork = tp(g.forkX, g.forkY, timeLen);
    const end = tp(g.endX, g.endY, timeLen);
    const p = tp(g.labelX, g.labelY, timeLen);
    return {
      ...g,
      path: transposePath(g.path, timeLen),
      forkX: fork.x,
      forkY: fork.y,
      endX: end.x,
      endY: end.y,
      laneX: g.laneY,
      labelX: p.x,
      labelY: p.y,
      labelAnchor: "middle",
      momentPoints: g.momentPoints.map((m) => {
        const q = tp(m.x, m.y, timeLen);
        return { ...m, x: q.x, y: q.y };
      }),
    };
  });

  return {
    ...base,
    geometries,
    orientation: "vertical",
    routeX,
    bandX,
    nowScreenY,
    timeLen,
    axisLen,
    laneSpan: base.height,
    baseWindow: storeWindow,
    panScale,
    peakAbove: ladder.peakAbove,
    ladderStep: ladder.step,
    ladderTop: ladder.topDist,
  };
}
