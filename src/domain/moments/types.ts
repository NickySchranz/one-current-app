export type MomentType =
  | "event"
  | "belief"
  | "decision"
  | "action"
  | "setback"
  | "insight"
  | "intensification"
  | "relief";

/** Internally a branch commit; shown to users as a "moment". */
export type BranchCommit = {
  id: string;
  branchId: string;
  date: string;
  title: string;
  description?: string;
  type: MomentType;
  beliefAdded?: string;
  emotionalImpact?: 1 | 2 | 3 | 4 | 5;
  /** Did this make the branch stronger, lighter, or simply different? */
  effect?: "stronger" | "lighter" | "different";
};
