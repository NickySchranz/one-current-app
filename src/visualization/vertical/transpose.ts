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
 * The day's climb, in mountain coordinates. NOTHING here moves with the
 * climber, because the climber never moves: he and the Now point hold their
 * place on screen and the whole mountain slides DOWN past them (the stage
 * translates this geometry by `climbOffset`). So:
 *
 *   • Rung k — the cliff edge earned by the (k+1)th rope answered today —
 *     sits (k+1) steps above Now. Once k+1 ropes are climbed the offset is
 *     (k+1) steps, which puts that ledge exactly at Now: under his feet.
 *   • A step is a screen-jump (0.56·L), so the ledge he is about to earn is
 *     always past the top edge — cliff edges are never seen appearing, they
 *     slide down into frame as he climbs.
 *   • The summit is one headroom (0.55·L) above the top rung, so it too
 *     stays out of frame until the last rope, then arrives under his feet.
 *   • A rope still waiting hangs from far above the peak down past Now, so
 *     it crosses his level at every offset and can always be grabbed.
 *
 * The consequence, stated plainly: rungs a screen tall mean the day's climb
 * is many screens long, so the summit frame holds the peak and the sky, not
 * a view of every ledge conquered on the way. Short rungs would fit them all
 * in frame, but then a cliff edge would appear out of nowhere on screen.
 */
export function summitLadder(
  timeLen: number,
  ropeCount: number,
): { step: number; headroom: number; topDist: number; peakAbove: number } {
  const n = Math.max(1, ropeCount);
  const step = Math.round(Math.max(0.56 * timeLen, 380));
  const headroom = Math.round(0.55 * timeLen);
  const topDist = n * step;
  return { step, headroom, topDist, peakAbove: topDist + headroom };
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
export function mountainHalfWidth(
  depth: number,
  width: number,
  /** How tall the mountain is compared with the profile's reference height
   * (PROFILE_REF). A day with many ropes builds a much taller mountain, and
   * the silhouette has to stretch with it — otherwise the flanks are miles
   * off either side of the screen for the whole climb and the shape can
   * never be seen. */
  scale = 1,
): number {
  const d = depth / Math.max(0.35, scale);
  const capW = 60;
  const shW = 0.22 * width;
  const brW = 0.34 * width;
  // The flanks stay inside the stage: a day's mountain is many screens tall,
  // and a face that runs past both edges reads as a wall, not a mountain.
  if (d <= 0) return 8;
  if (d <= 90) return 8 + (capW - 8) * (d / 90);
  if (d <= 260) return capW + (shW - capW) * ((d - 90) / 170);
  if (d <= 480) return shW + (brW - shW) * ((d - 260) / 220);
  return Math.min(0.4 * width, brW + (d - 480) * 0.06);
}

/** Mountain height the half-width profile above is drawn for. */
export const PROFILE_REF = 560;

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
  /** World px the mountain rises above the top rung to reach the summit. */
  ladderHeadroom: number;
  /** Stretch factor for the half-width profile (peakAbove / PROFILE_REF). */
  faceScale: number;
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
  /**
   * How far the mountain has already travelled down today (world px). It is
   * BAKED into the rock's geometry, not applied as a transform, so arriving
   * on a half-climbed day draws the mountain where it already is — nothing
   * animates on load. Only the change from one answer to the next is
   * animated, by the stage.
   */
  climbDist?: number;
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
  // The silhouette stretches with the day's mountain (see mountainHalfWidth).
  const faceScale = ladder.peakAbove / PROFILE_REF;
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
  const retired = new Set(opts.retiredIds ?? []);
  const climbDist = Math.round(opts.climbDist ?? 0);
  // He stands at Now, always — so the band where a waiting rope is named and
  // its moments show is a fixed strip just below it. The stage does NOT
  // translate that strip; only the mountain and the ropes themselves move.
  const openLabelY = Math.round(nowScreenY + 44);

  // Every rope must hang ON the rock — at any stage width, phone included.
  // The lane spread is squeezed to the mountain's half-width at the height he
  // works them (Now), which keeps the columns distinct instead of clamping
  // several of them onto the same line.
  const peakYBaked = nowScreenY - ladder.peakAbove + climbDist;
  const hwNow = Math.max(
    46,
    mountainHalfWidth(nowScreenY - peakYBaked, opts.stageWidth, faceScale) - 34,
  );
  const widestLane = Math.max(
    1,
    ...base.geometries
      .filter((g) => g.reachesNow)
      .map((g) => Math.abs(g.laneY - base.bandY)),
  );
  const squeeze = Math.min(1, hwNow / widestLane);

  const geometries: BranchGeometry[] = base.geometries.map((g) => {
    if (g.reachesNow) {
      const b = byBranch.get(g.branchId);
      const seedBase = idHash(g.branchId) + dayNo;
      const coiled = !!b && handledToday(b, now);
      const rung = rungOf.get(g.branchId) ?? 0;
      const ay = coiled
        ? nowScreenY -
          ladder.step * (rung + 1) +
          climbDist +
          Math.round((seeded(seedBase, 61) - 0.5) * 26)
        : // still waiting: hung from far above the summit, so its anchor is
          // never in frame and the rope crosses his level at any climb offset
          nowScreenY -
          ladder.peakAbove -
          120 -
          Math.round(seeded(seedBase, 61) * 90) +
          climbDist;
      const laneOffset = (g.laneY - base.bandY) * squeeze;
      // A conquered ledge sits higher, where the face is narrower — hold it
      // inside the rock there too.
      const hw = coiled
        ? mountainHalfWidth(ay - peakYBaked, opts.stageWidth, faceScale) - 30
        : hwNow;
      const ax = Math.round(
        base.mainY + Math.sign(laneOffset || 1) * Math.min(Math.abs(laneOffset), Math.max(24, hw)),
      );
      // the free end runs off below the screen: a rope passes right by him at
      // the Now line (which is where he takes hold of it) and keeps going, so
      // no rope end is ever seen swinging about mid-climb
      const dangleY = Math.round(nowScreenY + 620 + seeded(seedBase, 62) * 120);
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
          // coiled: on the stub under its own ledge (rides the mountain).
          // waiting: in the fixed band around Now, where he works the rope.
          const lo = coiled ? Math.round(ay) + 60 : nowScreenY + 40;
          const top = coiled ? Math.round(ay) + 8 : nowScreenY - 170;
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
    ladderHeadroom: ladder.headroom,
    faceScale,
  };
}
