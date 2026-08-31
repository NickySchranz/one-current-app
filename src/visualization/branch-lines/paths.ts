import type { PsychologicalBranch } from "@/domain/branches/types";
import type { BranchCommit } from "@/domain/moments/types";
import { effectiveLoudness, isClosed, isOpen } from "@/domain/branches/logic";
import { decidedToday } from "@/domain/feelings/logic";
import { dateToX, dateToXRaw, type TimeWindow } from "../zoom/time-scale";
import type { LaneAssignment } from "./lanes";
import { applyResting, loudnessToThickness, restingToday, statusToLineStyle, type LineStyle } from "./style";

export type MomentPoint = {
  moment: BranchCommit;
  x: number;
  y: number;
};

export type BranchGeometry = {
  branchId: string;
  /** Full SVG path: fork curve, run along the lane, optional merge curve back. */
  path: string;
  forkX: number;
  forkY: number;
  laneY: number;
  endX: number;
  endY: number;
  /** True when the branch line terminates on the main line (merged). */
  endsOnMain: boolean;
  /** True when the fork point is inside the window; otherwise the line enters as a parallel. */
  forkVisible: boolean;
  reachesNow: boolean;
  thickness: number;
  /** How loud this line is today (1–5, drift included) — same metric as its loudness. */
  loudness: number;
  style: LineStyle;
  momentPoints: MomentPoint[];
  labelX: number;
  labelY: number;
  /** False when a closed line's whole span lies outside the window: it is not drawn. */
  inWindow: boolean;
  /** Closed lines keep their label inside their own time frame; hidden when cramped. */
  labelVisible: boolean;
  /** Summit only: the rope column's screen x (set by the transpose layer). */
  laneX?: number;
  /** Summit only: how the label text anchors at (labelX, labelY). */
  labelAnchor?: "start" | "middle" | "end";
};

export type TimelineMetrics = {
  width: number;
  /** X of the current moment; open branches end here. Defaults to the right edge. */
  nowX?: number;
  mainY: number;
  /** Anchor of the lane band. The main line may lean away from it toward a
   * focused thread while the lanes stay put. Defaults to mainY. */
  bandY?: number;
  laneGap: number;
  /** Horizontal length of fork / merge curves. */
  curveLength: number;
};

export function laneToY(lane: number, metrics: TimelineMetrics): number {
  return (metrics.bandY ?? metrics.mainY) + lane * metrics.laneGap;
}

/**
 * Build the drawable geometry for one branch.
 * Fork: cubic curve leaving the main line. Run: straight along its lane.
 * Merge: cubic curve rejoining the main line at the merge date (closed branches only).
 */
export function buildBranchGeometry(
  branch: PsychologicalBranch,
  assignment: LaneAssignment,
  window: TimeWindow,
  metrics: TimelineMetrics,
  now: Date = new Date(),
): BranchGeometry {
  const { width, mainY, curveLength } = metrics;
  // Stronger felt loudness pushes the line further from Now; decisions bring it back closer.
  const loudness = effectiveLoudness(branch, now);
  // The pull never closes the gap to the next lane below what its label,
  // thickness and slither need: on crowded timelines the pull fades before
  // any two threads can touch. Only the focused main-line lean may overlap.
  const LANE_CLEARANCE = 26;
  const maxPull = Math.min(0.45 * metrics.laneGap, Math.max(0, metrics.laneGap - LANE_CLEARANCE));
  const pullOffset = ((loudness - 1) / 4) * maxPull;
  const laneY = laneToY(assignment.lane, metrics) + Math.sign(assignment.lane) * pullOffset;
  // The fork curve is only drawn while the fork moment is actually in view;
  // otherwise the branch enters from the left as a parallel line.
  const rawForkX = dateToXRaw(branch.forkDate, window, width);
  const forkVisible = rawForkX >= 0;
  const forkX = dateToX(branch.forkDate, window, width);
  const closed = isClosed(branch);
  const nowX = Math.min(metrics.nowX ?? width, width);
  const endDateX = dateToX(assignment.endDate, window, width);
  const endX = closed ? Math.min(endDateX, nowX) : nowX; // open branches always reach Now
  // A closed line lives entirely in its own time frame: when that frame has
  // scrolled out of the window, neither the line nor its label is drawn.
  const rawEndX = closed ? dateToXRaw(assignment.endDate, window, width) : nowX;
  const inWindow = !closed || (rawEndX > 0 && rawForkX < width);

  const curve = Math.min(curveLength, Math.max(24, (endX - forkX) * 0.25));
  const forkEndX = forkVisible ? Math.min(forkX + curve, endX) : 0;

  let d: string;
  if (forkVisible) {
    d = `M ${forkX} ${mainY}`;
    d += ` C ${forkX + curve * 0.5} ${mainY}, ${forkX + curve * 0.4} ${laneY}, ${forkEndX} ${laneY}`;
  } else {
    d = `M 0 ${laneY}`;
  }

  let endY = laneY;
  let endsOnMain = false;
  if (closed) {
    const mergeStartX = Math.max(forkEndX, endX - curve);
    d += ` L ${mergeStartX} ${laneY}`;
    d += ` C ${endX - curve * 0.4} ${laneY}, ${endX - curve * 0.5} ${mainY}, ${endX} ${mainY}`;
    endY = mainY;
    endsOnMain = true;
  } else {
    d += ` L ${endX} ${laneY}`;
  }

  const runStart = forkEndX;
  const runEnd = closed ? Math.max(forkEndX, endX - curve) : endX;
  const momentPoints: MomentPoint[] = branch.commits.map((m) => ({
    moment: m,
    x: clamp(dateToX(m.date, window, width), runStart, runEnd),
    y: laneY,
  }));

  return {
    branchId: branch.id,
    path: d,
    forkX,
    forkY: mainY,
    laneY,
    endX,
    endY,
    endsOnMain,
    forkVisible,
    reachesNow: isOpen(branch),
    thickness: loudnessToThickness(loudness),
    loudness: loudness,
    // Any decision today lets the line rest: fainter and still until tomorrow.
    style:
      restingToday(branch, now) || (!closed && decidedToday(branch, now))
        ? applyResting(statusToLineStyle(branch.status))
        : statusToLineStyle(branch.status),
    momentPoints,
    // Open lines keep their label readable near Now; closed lines keep it
    // inside their own span, so it only appears when you scroll back there.
    labelX: closed
      ? Math.max(forkEndX + 8, runStart + (runEnd - runStart) * 0.35)
      : Math.max(forkEndX + 8, Math.min(runStart + (runEnd - runStart) * 0.35, nowX - 140)),
    labelY: laneY - 7,
    inWindow,
    labelVisible: inWindow && (!closed || runEnd - runStart > 48),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Path preview used while animating a merge: the branch curving back into Now. */
export function mergePreviewPath(
  geometry: BranchGeometry,
  metrics: TimelineMetrics,
): string {
  const { mainY } = metrics;
  const startX = Math.max(geometry.forkX + 24, geometry.endX - metrics.curveLength * 1.4);
  return (
    `M ${startX} ${geometry.laneY}` +
    ` C ${geometry.endX - metrics.curveLength * 0.5} ${geometry.laneY},` +
    ` ${geometry.endX - metrics.curveLength * 0.55} ${mainY},` +
    ` ${geometry.endX} ${mainY}`
  );
}
