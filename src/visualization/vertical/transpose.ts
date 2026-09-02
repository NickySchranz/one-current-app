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
 * Width of the summit's date rail. The rock is sized to clear it (see
 * `faceHalf`), and the rail's own view, the fast-scrub hit zones beside it and
 * the "Return to Now" chip all measure from this one number.
 */
export const SUMMIT_RAIL_W = 28;

/**
 * The mountain's half-width at a given depth below the peak — one profile
 * shared by the drawn face and the rope-anchor placement, so every rope and
 * every cliff ledge lands ON the rock.
 *
 * Measured in SCREENS below the peak, and in fractions of `faceHalf` — the
 * half-width the rock is allowed (see `faceHalf` on the layout). Sizing it
 * against the room available rather than against the stage width is what keeps
 * BOTH flanks inside the frame on any screen: the route does not sit at the
 * centre of the canvas, and the date rail owns the right edge, so the two
 * sides have different amounts of room.
 *
 *   at the peak ...... a blunt summit block, wide enough for the ledge on it
 *   0.10 screens ..... 0.24 — the snow cap's shoulders
 *   0.25 screens ..... 0.52 — a broad summit
 *   0.55 screens ..... 0.83
 *   0.85 screens ..... 1.00 — the full face, its flanks just inside the frame
 */
export function mountainHalfWidth(
  depth: number,
  /** The rock's maximum half-width — `faceHalf` from the layout. */
  faceHalf: number,
  /** The stage's own height: the yardstick depth is measured in. */
  screen: number,
): number {
  const d = depth / Math.max(240, screen);
  const w0 = Math.max(20, 0.06 * faceHalf);
  const w1 = 0.24 * faceHalf;
  const w2 = 0.52 * faceHalf;
  const w3 = 0.83 * faceHalf;
  const w4 = faceHalf;
  if (d <= 0) return w0;
  if (d <= 0.1) return w0 + (w1 - w0) * (d / 0.1);
  if (d <= 0.25) return w1 + (w2 - w1) * ((d - 0.1) / 0.15);
  if (d <= 0.55) return w2 + (w3 - w2) * ((d - 0.25) / 0.3);
  if (d <= 0.85) return w3 + (w4 - w3) * ((d - 0.55) / 0.3);
  return w4;
}

/**
 * How far a rope hangs from the route, with the face turned by `rot`. The
 * ring is not a circle but a half-and-half ellipse: the right flank has to
 * stay in frame with sky beyond it, while the left runs off the screen, so
 * the two sides get different reaches. Position stays continuous — the two
 * only ever differ where sin is 0 — and both JS and the UI thread compute a
 * rope's place through this one function, so they cannot disagree.
 */
export function ringOffset(
  angle: number,
  rot: number,
  radius: number,
  radiusLeft: number,
): number {
  "worklet";
  const s = Math.sin(angle + rot);
  return s * (s >= 0 ? radius : radiusLeft);
}

/**
 * How wide the rock reaches on the RIGHT — the side whose edge is in frame.
 * The margin it leaves is real sky, because the distant ranges live out there
 * (see DistantCliffs) and they are what make the near rock read as one mountain
 * among others rather than a wall with an edge.
 */
export function faceHalfFor(stageWidth: number, routeX: number): number {
  const room = stageWidth - SUMMIT_RAIL_W - routeX;
  // The sky it leaves used to be 0.13 of the stage. That put the rock's right
  // flank — and so the ring's right LIMB, where ropes bunch as they come
  // round — well inside the frame, where the bunching is the thing you look
  // at. A narrower margin still leaves the distant ranges room and pushes
  // that limb toward the edge, which is where the left one already is.
  return Math.max(60, Math.round(room - Math.max(26, 0.09 * stageWidth)));
}

/**
 * How wide it reaches on the LEFT — off the edge of the screen. Only ONE side
 * shows its edge: two edges plus two skies leaves nothing but a strip of rock
 * on a phone, and reads as a pillar rather than a mountainside.
 */
export function faceLeftFor(routeX: number): number {
  return Math.max(80, Math.round(routeX + 90));
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

  /** World px the mountain rises above the top rung to reach the summit. */
  ladderHeadroom: number;
  /** How far the rock reaches to the RIGHT, where its edge is in frame — the
   * yardstick for every drawn part of the mountain and every rope anchor. */
  faceHalf: number;
  /** How far it reaches to the LEFT, which is off the screen. */
  faceLeft: number;
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
   * The height the LADDER is measured in — the window, normally. It is
   * deliberately not the canvas: the canvas height is a measurement that
   * settles in after the first render (and eases with an opening sheet), and
   * the ladder decides where the mountain rests, so anything that drifts would
   * move the mountain in front of the climber.
   */
  ladderHeight?: number;
  /**
   * Ropes the climber has already topped out on: theirs are off the face,
   * coiled on their ledge. An answered rope missing from this set is still
   * hanging — he is on his way up it.
   */
  retiredIds?: readonly string[];
};

/** Vertical rhythm of the label ladder below the Now ledge. Five rows, so a
 * busy day's names step past each other instead of printing on top of each
 * other — and the row is chosen by COLUMN order (see `labelRow`), not by the
 * order threads happen to be stored in, so neighbours never share a row. */
const LADDER_BASE = 12;
const LADDER_STEP = 17;
const LADDER_ROWS = 5;

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
  /** How far the rock reaches to the right (its edge is in frame) and to the
   * left (off the screen — only one side shows an edge). */
  const faceHalf = faceHalfFor(opts.stageWidth, routeX);
  const faceLeft = faceLeftFor(routeX);
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
  /** Ropes left-to-right across the face: the order the label ladder uses, so
   * that adjacent columns always land on different rows. */
  const columnOrder = base.geometries
    .filter((g) => g.reachesNow && g.inWindow)
    .slice()
    .sort((a, b) => a.laneY - b.laneY)
    .map((g) => g.branchId);
  const seedOrder = daySeedOrder(openOrder, now);
  const ladder = summitLadder(opts.ladderHeight ?? timeLen, openOrder.length);
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
  // He stands at Now, always — so the band where a waiting rope is named and
  // its moments show is a fixed strip just below it. The stage does NOT
  // translate that strip; only the mountain and the ropes themselves move.
  const openLabelY = Math.round(nowScreenY + 44);

  // The ropes hang AROUND the mountain, not across a flat face: each takes an
  // angle on it, and the face can be turned (see `rotate` on the stage) to
  // bring the ones round the back into view. A flat spread had to squash them
  // together as soon as there were more than a handful; an angle never does —
  // the turn is what makes room.
  const peakYRest = nowScreenY - ladder.peakAbove;
  const faceRadius = Math.max(46, mountainHalfWidth(nowScreenY - peakYRest, faceHalf, timeLen) - 34);
  /**
   * How far a rope may swing LEFT of the route. The two sides are not
   * symmetric on this map: the right flank has to stay in frame with sky
   * beyond it, so the reach there is the rock's own half-width, while the
   * left flank deliberately runs off the screen — so a rope over there is on
   * rock however far out it goes, and the only real limit is the screen's
   * own edge. Keeping both sides at the right's reach wasted the whole left
   * of a phone: five ropes crowded into the middle third with 170px of empty
   * sky beside them.
   */
  // ...but not so much further than the right that the two sides read
  // differently: dx per degree of turn is proportional to the reach, so a
  // left reach far greater than the right makes ropes sweep in wide on one
  // side and crowd together on the other.
  const leftReach = Math.max(faceRadius, Math.min(Math.round(routeX - 26), Math.round(faceRadius * 1.25)));
  /**
   * Degrees between neighbouring ropes, wrapped into one full turn. A narrow
   * stage takes a wider step: the ring's reach cannot grow (the rock is only
   * so wide on the side whose flank is in frame), so the only way for the two
   * ropes facing you to use a phone's width is to sit further round from each
   * other. It costs nothing — a phone could not show a third clearly anyway.
   */
  const maxStep = opts.stageWidth < 520 ? 64 : 42;
  const spacing =
    openOrder.length > 0 ? Math.min(maxStep, 360 / openOrder.length) : maxStep;
  const angleOf = (id: string) => {
    const i = columnOrder.indexOf(id);
    if (i < 0) return 0;
    // Centred on the front (a quiet day needs no turning at all) but offset by
    // half a step, so no rope ever hangs exactly on the route — it would sit
    // on the main line, the Now marker and the climber all at once.
    const k = i - (columnOrder.length - 1) / 2 + 0.5;
    return ((k * spacing) / 180) * Math.PI;
  };

  const geometries: BranchGeometry[] = base.geometries.map((g) => {
    if (g.reachesNow) {
      const b = byBranch.get(g.branchId);
      const seedBase = idHash(g.branchId) + dayNo;
      const coiled = !!b && handledToday(b, now);
      const rung = rungOf.get(g.branchId) ?? 0;
      // Geometry is the mountain AT REST: the stage's one transform carries
      // how far it has travelled today, so nothing here changes as he climbs
      // (a baked offset made the rebuild and the transform race each other).
      const ay = coiled
        ? nowScreenY -
          ladder.step * (rung + 1) +
          Math.round((seeded(seedBase, 61) - 0.5) * 26)
        : // still waiting: hung from far above the summit, so its anchor is
          // never in frame and the rope crosses his level at any climb offset
          nowScreenY - ladder.peakAbove - 120 - Math.round(seeded(seedBase, 61) * 90);
      // Its place on the ring, un-turned. The stage adds the turn on the UI
      // thread (x = routeX + sin(angle + rot) · radius), so this is where it
      // sits when the face is square-on to the viewer.
      const angle = angleOf(g.branchId);
      const radius = coiled
        ? Math.max(30, mountainHalfWidth(ay - peakYRest, faceHalf, timeLen) - 30)
        : faceRadius;
      // The ledge keeps the rope's OWN reach. Collapsing it to the round
      // right-hand radius moved a coiled rope's ledge ~75px in toward the
      // route the instant it was answered, so he climbed from a column he
      // had never been on. The rungs sit deep enough that the rock is at its
      // full width there (`faceLeft` reaches further still), so a ledge out
      // at the hanging reach is on rock.
      const radiusLeft = Math.max(radius, leftReach);
      const ax = Math.round(base.mainY + ringOffset(angle, 0, radius, radiusLeft));
      // the free end runs off below the screen: a rope passes right by him at
      // the Now line (which is where he takes hold of it) and keeps going, so
      // no rope end is ever seen swinging about mid-climb
      const dangleY = Math.round(nowScreenY + 620 + seeded(seedBase, 62) * 120);
      const ordinal = columnOrder.indexOf(g.branchId);
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
        angle,
        radius,
        radiusLeft,
        // Names are centred on their column and ~140px wide, so a column near
        // an edge would push its name off the screen: hold it inside the stage.
        labelX: Math.max(74, Math.min(opts.stageWidth - 74, ax)),
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
    ladderHeadroom: ladder.headroom,
    faceHalf,
    faceLeft,
  };
}
