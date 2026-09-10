import { newId } from "../ids";
import type { PsychologicalBranch, BranchType } from "../branches/types";
import type { ActionBranchRepresentation, IntegratedAction } from "./types";

/** How a branch is typically represented inside one coherent present action. */
export function suggestRepresentation(branch: PsychologicalBranch): string {
  const byType: Record<BranchType, string> = {
    // An unnamed thread gets the most general honest suggestion there is.
    unknown: "one small step that belongs to it",
    event: "one act of acknowledgement or repair",
    waiting: "living one committed hour without checking",
    projection: "one grounded step inside what is actually controllable",
    identity: "expressing the stored quality in today's conditions",
    relationship: "focused connection without suspending life",
    body: "moderate movement, food, or rest",
    project: "one defined work action",
  };
  return byType[branch.type];
}

export type ComposeActionInput = {
  branches: PsychologicalBranch[];
  representations?: Partial<Record<string, string>>;
  title: string;
  instruction: string;
  durationMinutes: number;
  minimumVersion: string;
  qualitiesCarried: string[];
  completionDefinition: string;
  startTime?: string;
  mergeId?: string;
};

/**
 * Compose one integrated action from several branches.
 * The action may contain connected steps but is one coherent movement, not a task list.
 */
export function composeIntegratedAction(
  input: ComposeActionInput,
  now: Date = new Date(),
): IntegratedAction {
  const branchesIntegrated: ActionBranchRepresentation[] = input.branches.map((b) => ({
    branchId: b.id,
    branchTitle: b.title,
    representedAs: input.representations?.[b.id] ?? suggestRepresentation(b),
  }));
  return {
    id: newId("ac"),
    mergeId: input.mergeId,
    title: input.title.trim(),
    instruction: input.instruction.trim(),
    durationMinutes: input.durationMinutes,
    minimumVersion: input.minimumVersion.trim(),
    qualitiesCarried: input.qualitiesCarried,
    branchesIntegrated,
    completionDefinition: input.completionDefinition.trim(),
    startTime: input.startTime,
    createdAt: now.toISOString(),
  };
}

export function completeAction(action: IntegratedAction, now: Date = new Date()): IntegratedAction {
  return { ...action, completedAt: now.toISOString() };
}

/** The person had a go. Records the attempt without claiming it finished. */
export function attemptAction(action: IntegratedAction, now: Date = new Date()): IntegratedAction {
  return { ...action, attemptedAt: now.toISOString() };
}

/**
 * The step moved to wherever the real work lives. This is deliberately NOT
 * completion: no one has done it, so nothing may count it as done.
 */
export function handOffAction(action: IntegratedAction, now: Date = new Date()): IntegratedAction {
  return { ...action, handedOffAt: now.toISOString() };
}

/** Still expecting something from the person: not finished, not handed away. */
export function isActionOpen(action: IntegratedAction): boolean {
  return !action.completedAt && !action.handedOffAt;
}
