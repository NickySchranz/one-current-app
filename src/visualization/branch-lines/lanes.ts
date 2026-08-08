import type { PsychologicalBranch } from "@/domain/branches/types";
import { branchEndDate, isOpen } from "@/domain/branches/logic";

export type LaneAssignment = {
  branchId: string;
  /** Signed lane index: positive lanes sit below the main line, negative above. */
  lane: number;
  startDate: string;
  endDate: string;
};

/** Alternate packed lanes around the main line: 0 → +1, 1 → −1, 2 → +2, 3 → −2 … */
function signedLane(packed: number): number {
  return packed % 2 === 0 ? packed / 2 + 1 : -((packed + 1) / 2);
}

/**
 * Assign each branch a lane around the main line so that lines never overlap.
 * Lanes alternate below and above so the main line stays in the middle.
 * Open branches all reach Now, so they can never share a lane with another open branch.
 * Merged branches may reuse a lane once the previous occupant has ended.
 */
export function assignLanes(
  branches: PsychologicalBranch[],
  now: Date = new Date(),
  /**
   * Branches that must keep their lane no matter what their fork date says —
   * lines created this session (the optimistic draft, then the committed
   * thread). They are left out of the normal packing (so nobody else
   * reshuffles) and pinned, in creation order, to fresh outermost lanes that
   * stay put while "since when?" changes and after the form commits.
   */
  pinnedIds?: readonly string[],
): LaneAssignment[] {
  const pinnedSet = new Set(pinnedIds);
  const pinned = pinnedIds
    ? pinnedIds
        .map((id) => branches.find((b) => b.id === id))
        .filter((b): b is PsychologicalBranch => !!b)
    : [];
  const items = branches
    .filter((b) => !pinnedSet.has(b.id))
    .map((b) => ({
      branch: b,
      start: b.forkDate,
      end: isOpen(b) ? "9999-12-31" : branchEndDate(b, now),
    }))
    // Earlier forks take the closer lanes so long-lived branches sit nearer the main line.
    .sort((a, b) => a.start.localeCompare(b.start) || a.branch.id.localeCompare(b.branch.id));

  const laneEnds: string[] = []; // last occupied end date per lane
  const result: LaneAssignment[] = [];

  for (const item of items) {
    let lane = laneEnds.findIndex((end) => end < item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    result.push({
      branchId: item.branch.id,
      lane: signedLane(lane),
      startDate: item.start,
      endDate: item.end === "9999-12-31" ? branchEndDate(item.branch, now) : item.end,
    });
  }

  // Brand-new lanes past everyone else, one per pinned line in creation
  // order: their index depends only on the other branches, never on the
  // pinned lines' own (changing) fork dates.
  for (let i = 0; i < pinned.length; i++) {
    result.push({
      branchId: pinned[i].id,
      lane: signedLane(laneEnds.length + i),
      startDate: pinned[i].forkDate,
      endDate: branchEndDate(pinned[i], now),
    });
  }
  return result;
}

/** Number of distinct lanes in use, on both sides of the main line. */
export function laneCount(assignments: LaneAssignment[]): number {
  return new Set(assignments.map((a) => a.lane)).size;
}

/** How many lanes sit above and below the main line. */
export function laneExtents(assignments: LaneAssignment[]): { above: number; below: number } {
  let above = 0;
  let below = 0;
  for (const a of assignments) {
    if (a.lane > 0) below = Math.max(below, a.lane);
    else above = Math.max(above, -a.lane);
  }
  return { above, below };
}
