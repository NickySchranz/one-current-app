import type { MergeConflict } from "../conflicts/types";
import type { IntegratedAction } from "../actions/types";

export type MergeResultStatus =
  | "merged"
  | "partly-merged"
  | "waiting"
  | "converted-to-project"
  | "needs-support";

export type MergeContributionKind =
  | "quality"
  | "lesson"
  | "boundary"
  | "acceptance"
  | "decision"
  | "action"
  | "waiting-condition"
  | "project"
  | "support";

export type BranchMerge = {
  id: string;
  branchIds: string[];
  createdAt: string;
  stillValid: string[];
  outdatedBeliefs: string[];
  outsideControl: string[];
  reclaimedQualities: string[];
  conflicts: MergeConflict[];
  resolution: string;
  /** What this branch contributes to life now. */
  contributionKind?: MergeContributionKind;
  contribution?: string;
  /** What stops continuing as a separate process. */
  released: string[];
  /** What burned with it — written down to be let go of, never stored anywhere else. */
  burned?: string[];
  action?: IntegratedAction;
  waitingContainerId?: string;
  resultStatus: MergeResultStatus;
};

/** A merge that was started but not completed; restored on next launch. */
export type MergeDraft = {
  id: string;
  branchIds: string[];
  startedAt: string;
  /** Wizard step; stored drafts may hold names from older wizard versions. */
  stage: string;
  partial: Partial<BranchMerge>;
};
