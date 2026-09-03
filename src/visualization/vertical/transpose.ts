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
 * How far a rope hangs from the ring's CENTRE, with the face turned by `rot`.
 * One radius, both sides: the ring is centred on the room the screen actually
 * has (see `ringCx`) rather than on the route, so it does not need a longer
 * reach one way to use the width. Two different reaches made a degree of turn
 * move a rope further on one side than the other, which read as ropes
 * sweeping in wide on the left and crowding together on the right.
 * Both JS and the UI thread compute a rope's place through this one function,
 * so they cannot disagree.
 */
export function ringOffset(angle: number, rot: number, radius: number): number {
  "worklet";
  return Math.sin(angle + rot) * radius;
}

/**
 * How wide the rock reaches on the RIGHT — the side whose edge is in frame.
 * The margin it leaves is real sky, because the distant ranges live out there
 * (see DistantCliffs) and they are what make the near rock read as one mountain
 * among others rather than a wall with an edge.
 */
export function faceHalfFor(stageWidth: number, routeX: number): number {
  const room = stageWidth - SUMMIT_RAIL_W - routeX;
  // A share of the stage alone is too little sky on a phone: 0.09 of 390px is
  // 35, the drawn flank overshoots its nominal width by ~15 (jitter and the
  // surface bulge), and the 28px date rail sits over the rest — which left
  // about 20px between the mountain's edge and the rail. Not enough to read
  // as a mountainSIDE, and nowhere for the distant ranges to show at all.
  // Hence a floor in real pixels, with the same share once there is room.
  // When the route sits far right (the lane band's centre drifts that way on
  // a busy day) the room runs out. Then the RIGHT flank gives way rather
  // than the sky: a narrower shoulder still reads as a mountainside, an edge
  // hidden under the date rail does not. The left flank is unaffected — it
  // measures itself against `faceLeftFor`, and still fills the screen.
  return Math.max(40, Math.round(room - Math.max(64, 0.13 * stageWidth)));
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
  /** The yardstick the rock's own shape is measured in — the window, not the
   * canvas, so chrome cannot reshape the mountain (see `rockLen`). */
  rockLen: number;
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
export function transposePath(d: string, timeLen: number, dx = 0): string {
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
      out += ` ${round1(y + dx)} ${round1(timeLen - x)}`;
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

/**
 * Where a waiting rope's name sits below the Now ledge, and how far apart two
 * rows are when the stage decides to use a second one.
 *
 * There used to be five rows here, picked by `ordinal % 5`, and a docstring
 * claiming that kept neighbours apart "by COLUMN order (see `labelRow`)".
 * There is no `labelRow` anywhere, and ordinal is ring ORDER, not ring
 * POSITION: `sin` is symmetric about 90°, so two ordinals whose angles sum to
 * 180° share a column exactly. At twelve threads that printed ordinals 0 and 5
 * pixel-on-pixel, and 6 and 11 likewise. Rows cannot be decided here at all —
 * only the stage knows where a rope currently IS, because it holds the turn.
 * So every waiting name gets the base row and `LifeTimeline` moves the ones it
 * has to (see `nameRows`).
 */
const LADDER_BASE = 12;
export const LADDER_STEP = 17;

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

  /**
   * Where the route stands. A FIXED share of the stage — never `base.mainY`,
   * which is the lane band's centre and therefore grows with the number of
   * lanes. On this map that dragged the whole mountain rightwards as threads
   * accumulated, and once `faceHalfFor` hit its floor the rock's right edge
   * went with it: at eighteen threads on a phone the route had moved 200 →
   * 328 and the rock had widened 427 → 491, hiding the flank under the date
   * rail again. The mountain is the mountain; more threads mean more of the
   * ring to turn through, not a bigger rock.
   */
  const routeX = Math.round(0.5 * opts.stageWidth);
  /** Everything transposed carries the same shift, so the lanes, the merge
   * points and the route keep their places relative to each other. */
  const dx = routeX - base.mainY;
  const bandX = base.bandY + dx;
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
  /**
   * The yardstick the ROCK is measured in. Deliberately the window's height
   * (bucketed, like the ladder's) and not the canvas's `timeLen`: chrome —
   * a thread's pinned chip appearing, a tray's inset easing — nudges timeLen,
   * and anything shaped by it then shifts with them. That is how focusing a
   * rope came to slide the mountain sideways against the timeline.
   */
  const rockLen = Math.max(240, opts.ladderHeight ?? timeLen);
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
  /**
   * The ring the ropes hang on, sized and placed by the room the SCREEN has
   * rather than by where the route happens to sit.
   *
   * The two sides of this map are not alike: the right flank must stay in
   * frame with sky beyond it (and the date rail past that), while the left
   * runs off the screen on purpose — so a rope out to the left is on rock
   * however far it goes, and only the screen's edge stops it. The route is
   * nowhere near the middle of what that leaves, so a ring centred on the
   * route could only use the width by reaching further one way than the
   * other, which made ropes crowd on the short side.
   *
   * Centring the ring on the available band instead lets one radius serve
   * both sides — the widest that fits, evenly. The rock's left flank hides
   * the offset: there is no visible edge over there to measure it against.
   */
  const rightBound = routeX + Math.max(46, mountainHalfWidth(nowScreenY - peakYRest, faceHalf, rockLen) - 34);
  const leftBound = 26;
  const ringCx = Math.round((leftBound + rightBound) / 2);
  const faceRadius = Math.max(46, Math.round((rightBound - leftBound) / 2));
  /**
   * Degrees between neighbouring ropes: the ring, shared out. One full turn
   * divided by the ropes on it is the widest they can be without two landing
   * in the same place, so it is what they get — the whole mountain is theirs.
   * This used to be capped at 42° (64° on a phone), which only ever made
   * them CLOSER than they had to be: three ropes sat inside an 84° wedge on
   * one side of the route with the rest of the rock empty, and a busy day
   * crowded them further still. A wider step means fewer face you at once —
   * that is what turning is for, and the mountain turns to the next rope by
   * itself once the ones in view are answered.
   */
  const spacing = openOrder.length > 0 ? Math.min(90, 360 / openOrder.length) : 90;
  /** A ledge must stay on the rock at its own depth; the ring is sized at the
   * route's, where the rock is widest. Deep rungs never bind, but a shallow
   * one would hang its ledge in the sky. */
  const reachAt = (depth: number) =>
    Math.min(faceRadius, Math.max(46, mountainHalfWidth(depth, faceHalf, rockLen) - 30));
  const angleOf = (id: string) => {
    const i = columnOrder.indexOf(id);
    if (i < 0) return 0;
    // Centred on the front (a quiet day needs no turning at all), nudged by
    // half a step so no rope hangs exactly on the route — it would sit on the
    // main line, the Now marker and the climber all at once. The nudge is
    // needed only for an ODD count: an even one already straddles the front.
    // Adding it unconditionally did the opposite of its job, putting a rope
    // dead on the route for every even number of threads.
    const n = columnOrder.length;
    const k = i - (n - 1) / 2 + (n % 2 === 1 ? 0.5 : 0);
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
      // A coiled rope's ledge keeps the reach the rope had. Giving the ledge
      // a radius of its own moved it in toward the route the instant the rope
      // was answered, so the climb started from a column he had never stood
      // on. The rungs are deep enough that `reachAt` returns the same number.
      const radius = coiled ? reachAt(ay - peakYRest) : faceRadius;
      const ax = Math.round(ringCx + ringOffset(angle, 0, radius));
      // the free end runs off below the screen: a rope passes right by him at
      // the Now line (which is where he takes hold of it) and keeps going, so
      // no rope end is ever seen swinging about mid-climb
      const dangleY = Math.round(nowScreenY + 620 + seeded(seedBase, 62) * 120);
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
        ringCx,
        // The rope's own column, unclamped. Holding the name inside the stage
        // has to happen where the TURN is known — clamping here and adding the
        // turn afterwards is what sent 520 label instances off the stage over
        // a full revolution.
        labelX: ax,
        // A conquered rope names itself under its own cliff edge; a waiting one
        // in the band just below the climber. One row: the stage staggers.
        labelY: coiled ? Math.round(ay) + 24 : openLabelY + LADDER_BASE,
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
      path: transposePath(g.path, timeLen, dx),
      forkX: fork.x + dx,
      forkY: fork.y,
      endX: end.x + dx,
      endY: end.y,
      laneX: g.laneY + dx,
      labelX: p.x + dx,
      labelY: p.y,
      labelAnchor: "middle",
      momentPoints: g.momentPoints.map((m) => {
        const q = tp(m.x, m.y, timeLen);
        return { ...m, x: q.x + dx, y: q.y };
      }),
    };
  });

  return {
    ...base,
    geometries,
    orientation: "vertical",
    routeX,
    rockLen,
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
