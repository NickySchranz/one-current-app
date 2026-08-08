export type MergeConflictType =
  | "effort-vs-recovery"
  | "connection-vs-independence"
  | "action-vs-acceptance"
  | "certainty-vs-movement"
  | "ambition-vs-capacity"
  | "expression-vs-boundary"
  | "urgency-vs-reality"
  | "custom";

export type MergeConflict = {
  id: string;
  type: MergeConflictType;
  branchIds: string[];
  demandA: string;
  demandB: string;
  preservedTruths: string[];
  rejectedExcesses: string[];
  resolution?: string;
};
