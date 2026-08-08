export type WaitingContainer = {
  id: string;
  branchId: string;
  createdAt: string;
  /** What is being awaited. */
  awaiting: string;
  /** What action has already been taken. */
  actionTaken: string;
  /** What remains outside control. */
  outsideControl: string[];
  /** ISO date of the next review. */
  reviewDate: string;
  /** What new information would justify reopening earlier. */
  reopenConditions: string[];
  /** What the user will continue living in the meantime. */
  continueMeanwhile: string[];
  /** Qualities no longer stored entirely inside the outcome. */
  reclaimedNow: string[];
  closedAt?: string;
};
