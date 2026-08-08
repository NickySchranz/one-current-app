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
  createdAt: string;
  completedAt?: string;
};
