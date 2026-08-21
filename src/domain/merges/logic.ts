import { newId } from "../ids";
import { isoDate, reduceLoudnessAfterMerge, statusAfterMerge, trackLoudness } from "../branches/logic";
import type { PsychologicalBranch } from "../branches/types";
import type { PreserveRelease } from "../branches/diff";
import type { MergeConflict } from "../conflicts/types";
import { unresolvedConflicts } from "../conflicts/logic";
import type { IntegratedAction } from "../actions/types";
import type { BranchMerge, MergeContributionKind, MergeResultStatus } from "./types";

export type CreateMergeInput = {
  branches: PsychologicalBranch[];
  preserveRelease: PreserveRelease;
  conflicts: MergeConflict[];
  resolution: string;
  contributionKind?: MergeContributionKind;
  contribution?: string;
  released: string[];
  burned?: string[];
  action?: IntegratedAction;
  waitingContainerId?: string;
  resultStatus: MergeResultStatus;
};

export class UnresolvedConflictError extends Error {
  constructor(count: number) {
    super(`Cannot complete the merge: ${count} conflict(s) still need a resolution.`);
  }
}

export function createMerge(input: CreateMergeInput, now: Date = new Date()): BranchMerge {
  const open = unresolvedConflicts(input.conflicts);
  if (open.length > 0) throw new UnresolvedConflictError(open.length);
  return {
    id: newId("mg"),
    branchIds: input.branches.map((b) => b.id),
    createdAt: now.toISOString(),
    stillValid: input.preserveRelease.stillValid,
    outdatedBeliefs: input.preserveRelease.outdated,
    outsideControl: input.preserveRelease.outsideControl,
    reclaimedQualities: input.preserveRelease.reclaimable,
    conflicts: input.conflicts,
    resolution: input.resolution,
    contributionKind: input.contributionKind,
    contribution: input.contribution,
    released: input.released,
    burned: input.burned,
    action: input.action,
    waitingContainerId: input.waitingContainerId,
    resultStatus: input.resultStatus,
  };
}

/** Apply a completed merge to a branch: it ends at the merge point but stays in history. */
export function applyMergeToBranch(
  branch: PsychologicalBranch,
  merge: BranchMerge,
  now: Date = new Date(),
): PsychologicalBranch {
  const status = statusAfterMerge(merge.resultStatus);
  // A hand-off to real work also ends the line here — the work lives elsewhere.
  const closes = status === "merged" || status === "converted-to-project";
  return trackLoudness(
    branch,
    {
      ...branch,
      status,
      loudness: reduceLoudnessAfterMerge(branch.loudness, merge.resultStatus),
      lastDecisionOn: isoDate(now),
      mergeIds: [...branch.mergeIds, merge.id],
      mergeDate: closes ? isoDate(now) : branch.mergeDate,
      storedQualities: dedupe([...branch.storedQualities, ...merge.reclaimedQualities]),
      waitingContainerId: merge.waitingContainerId ?? branch.waitingContainerId,
    },
    now,
  );
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}
