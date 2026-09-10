export type ActionBranchRepresentation = {
  branchId: string;
  branchTitle: string;
  /** How the branch is represented inside the action, e.g. "physical movement". */
  representedAs: string;
};

export type IntegratedAction = {
  id: string;
  mergeId?: string;
  title: string;
  /** One coherent movement; may contain two or three connected steps. */
  instruction: string;
  durationMinutes: number;
  /** The smallest version that still counts. */
  minimumVersion: string;
  qualitiesCarried: string[];
  branchesIntegrated: ActionBranchRepresentation[];
  completionDefinition: string;
  startTime?: string;
  /** Intended: the step was decided on. Every action has this. */
  createdAt: string;
  /** Attempted: the person had a go and it did not finish. Optional, and it
   * does not close the action — an attempt can be followed by completion. */
  attemptedAt?: string;
  /** Completed: the person says they did it. Only ever set by the person. */
  completedAt?: string;
  /**
   * Handed off: the step left this app for wherever the person's real work
   * lives. NOT completion — nobody has done it, it just is not tracked here
   * any more. Stamping `completedAt` for a hand-off would count work that was
   * never performed.
   */
  handedOffAt?: string;
};
