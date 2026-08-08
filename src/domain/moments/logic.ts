import { newId } from "../ids";
import type { PsychologicalBranch } from "../branches/types";
import type { BranchCommit, MomentType } from "./types";

export type CreateMomentInput = {
  branchId: string;
  date: string;
  title: string;
  type: MomentType;
  description?: string;
  beliefAdded?: string;
  emotionalImpact?: 1 | 2 | 3 | 4 | 5;
  effect?: "stronger" | "lighter" | "different";
};

export function createMoment(input: CreateMomentInput): BranchCommit {
  return { id: newId("mo"), ...input, title: input.title.trim() };
}

export function sortMoments(moments: BranchCommit[]): BranchCommit[] {
  return [...moments].sort((a, b) => a.date.localeCompare(b.date));
}

export function addMomentToBranch(
  branch: PsychologicalBranch,
  moment: BranchCommit,
  now: Date = new Date(),
): PsychologicalBranch {
  return {
    ...branch,
    commits: sortMoments([...branch.commits, moment]),
    lastActivatedAt: now.toISOString(),
  };
}

/** Beliefs accumulated along the branch, newest last. */
export function beliefsFormed(branch: PsychologicalBranch): string[] {
  const beliefs = sortMoments(branch.commits)
    .map((m) => m.beliefAdded)
    .filter((b): b is string => !!b);
  return branch.originalBelief ? [branch.originalBelief, ...beliefs] : beliefs;
}
