import type { PsychologicalBranch } from "@/domain/branches/types";
import { assignLanes, laneExtents, type LaneAssignment } from "../branch-lines/lanes";
import { buildBranchGeometry, type BranchGeometry, type TimelineMetrics } from "../branch-lines/paths";
import { dateToXRaw, defaultWindow, type TimeWindow } from "../zoom/time-scale";

export type TimelineLayout = {
  window: TimeWindow;
  metrics: TimelineMetrics;
  assignments: LaneAssignment[];
  geometries: BranchGeometry[];
  /** Total height needed to contain the main line and all lanes. */
  height: number;
  /** Where the current moment falls in the window; anything right of it is projection. */
  nowX: number;
  mainY: number;
  /** Anchor of the lane band; mainY equals it unless the main line leans. */
  bandY: number;
  /** Full drawable width. */
  fullWidth: number;
};

export type LayoutOptions = {
  width: number;
  /**
   * Available vertical space. When provided, the main line and lanes are
   * distributed to fill it; otherwise a content-sized height is computed.
   */
  height?: number;
  window?: TimeWindow;
  /** Compact metrics stack lanes closer together on small screens. */
  compact?: boolean;
  now?: Date;
  /**
   * Minimum room above the top lane, in px — the stage may pin an indicator
   * over its top corner, and the lanes must be able to scroll clear of it.
   */
  topPad?: number;
  /**
   * Vertical lean of the main line away from the lane band, in px. Used while
   * a thread is in focus: the main line moves toward it, the lanes stay put.
   */
  mainShift?: number;
  /**
   * Lines created this session (draft first, kept after commit): each keeps
   * a pinned outermost lane so neither changing "since when?" nor saving the
   * form ever reshuffles lines.
   */
  pinnedBranchIds?: readonly string[];
};

// Every thread keeps its room: lanes squeeze only down to a readable gap.
// When even that does not fit the stage, the canvas grows taller instead and
// the stage scrolls — more threads, never a cramped band. Lanes never spread
// to fill space either: the band stays compact around the main line.
const MIN_LANE_GAP = 34;
const MIN_LANE_GAP_COMPACT = 28;
const MAX_LANE_GAP = 56;
const TOP_PAD = 58; // clear of the wholeness chip, with room for the Now label
const BOTTOM_PAD = 48; // room for the axis labels
// When a sheet squeezes the stage, padding gives way before any thread does —
// but never so far that the outer lanes look glued to the borders: the top
// lane keeps room for its label, the bottom one stays clear of the axis.
const MIN_TOP_PAD = 40;
const MIN_BOTTOM_PAD = 36;

/** Pure composition of the whole timeline scene: lanes, geometry, heights. */
export function buildTimelineLayout(
  branches: PsychologicalBranch[],
  options: LayoutOptions,
): TimelineLayout {
  const now = options.now ?? new Date();
  const window =
    options.window ?? defaultWindow(branches.map((b) => b.forkDate), now);

  // Now sits wherever the current moment falls in the window. The window may
  // extend a little past today; that band is the projection, and it pans and
  // zooms with the rest of time instead of being pinned to the right edge.
  const width = options.width;
  const nowX = Math.max(0, Math.min(width, dateToXRaw(now.toISOString(), window, width)));

  const assignments = assignLanes(branches, now, options.pinnedBranchIds);
  // Lanes alternate below and above so the main line stays in the middle.
  const { above, below } = laneExtents(assignments);
  const total = above + below;

  let laneGap = options.compact ? 40 : 52;
  let height: number;
  // A pinned indicator may claim the top corner: the top lane keeps clear of
  // it, and this padding never shaves away — scrolling to the top must always
  // bring the highest thread out from underneath.
  const minTopPad = Math.max(MIN_TOP_PAD, options.topPad ?? 0);
  let topPad = Math.max(TOP_PAD, options.topPad ?? 0);
  let bottomPad = BOTTOM_PAD;

  if (options.height && options.height > 0) {
    // Fit the available space: lanes squeeze first (never below a readable
    // gap), then the padding gives way — and if the threads still do not fit,
    // the canvas grows past the stage and the stage scrolls.
    height = options.height;
    const minGap = options.compact ? MIN_LANE_GAP_COMPACT : MIN_LANE_GAP;
    laneGap = Math.min(
      MAX_LANE_GAP,
      Math.max(minGap, Math.floor((height - topPad - bottomPad) / Math.max(total, 2))),
    );
    const overflow = topPad + total * laneGap + bottomPad - height;
    if (overflow > 0) {
      const shaveTop = Math.min(Math.max(0, topPad - minTopPad), Math.ceil(overflow / 2));
      topPad -= shaveTop;
      bottomPad -= Math.min(BOTTOM_PAD - MIN_BOTTOM_PAD, overflow - shaveTop);
      height = Math.max(height, topPad + total * laneGap + bottomPad);
    }
  } else {
    height = Math.max(topPad + total * laneGap + bottomPad, options.compact ? 200 : 260);
  }

  // Center the whole band of lanes; with no branches the main line sits mid-stage.
  const spare = Math.max(0, height - topPad - bottomPad - total * laneGap);
  const bandY = Math.round(topPad + above * laneGap + spare / 2);
  // The main line may lean toward a focused thread — but stays on the canvas.
  const shift = options.mainShift ?? 0;
  const mainY = Math.round(
    Math.max(minTopPad, Math.min(height - MIN_BOTTOM_PAD, bandY + shift)),
  );

  const metrics: TimelineMetrics = {
    width,
    nowX,
    mainY,
    bandY,
    laneGap,
    curveLength: options.compact ? 40 : 64,
  };

  const byId = new Map(assignments.map((a) => [a.branchId, a]));
  const geometries = branches
    .map((b) => {
      const a = byId.get(b.id);
      return a ? buildBranchGeometry(b, a, window, metrics, now) : undefined;
    })
    .filter((g): g is BranchGeometry => !!g);

  return {
    window,
    metrics,
    assignments,
    geometries,
    height,
    nowX,
    mainY,
    bandY,
    fullWidth: width,
  };
}
