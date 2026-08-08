import { newId } from "../ids";
import type { PsychologicalBranch, BranchType, BranchOrientation } from "../branches/types";
import type { MergeConflict, MergeConflictType } from "./types";

export type ConflictRule = {
  type: MergeConflictType;
  /** Human description of the two demands, phrased from the branches' point of view. */
  demandA: (b: PsychologicalBranch) => string;
  demandB: (b: PsychologicalBranch) => string;
  matches: (a: PsychologicalBranch, b: PsychologicalBranch) => boolean;
};

const isBody = (b: PsychologicalBranch) => b.type === "body" || b.orientation === "body";
const isWork = (b: PsychologicalBranch) =>
  b.type === "project" || b.orientation === "project" || b.orientation === "future";
const isRelationship = (b: PsychologicalBranch) =>
  b.type === "relationship" || b.orientation === "relationship";
const isOutside = (b: PsychologicalBranch) =>
  b.controllability === "outside-control" || b.orientation === "outside-control";
const isPastIdentity = (b: PsychologicalBranch) =>
  b.type === "identity" && b.orientation === "past";

const RULES: ConflictRule[] = [
  {
    type: "effort-vs-recovery",
    matches: (a, b) => isWork(a) && isBody(b),
    demandA: (b) => `${b.title}: push harder now.`,
    demandB: (b) => `${b.title}: stop and recover.`,
  },
  {
    type: "ambition-vs-capacity",
    matches: (a, b) => isPastIdentity(b) && (isWork(a) || isBody(a)),
    demandA: (b) => `${b.title}: keep moving at today's real capacity.`,
    demandB: (b) => `${b.title}: prove you are still who you were.`,
  },
  {
    type: "connection-vs-independence",
    matches: (a, b) => isRelationship(a) && (isWork(b) || b.orientation === "identity"),
    demandA: (b) => `${b.title}: seek closeness and reassurance.`,
    demandB: (b) => `${b.title}: hold your own direction.`,
  },
  {
    type: "action-vs-acceptance",
    matches: (a, b) => isOutside(a) && !isOutside(b),
    demandA: (b) => `${b.title}: accept that the next step is not yours.`,
    demandB: (b) => `${b.title}: act now.`,
  },
  {
    type: "urgency-vs-reality",
    matches: (a, b) => a.loudness >= 4 && b.loudness >= 4 && isBody(b),
    demandA: (b) => `${b.title}: treat this as an emergency.`,
    demandB: (b) => `${b.title}: the body says slow down.`,
  },
];

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/**
 * Detect conflicts between branches selected for a multi-branch merge.
 * Two valid branches conflict when their demands cannot be satisfied by the same present action.
 */
export function detectConflicts(branches: PsychologicalBranch[]): MergeConflict[] {
  const conflicts: MergeConflict[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < branches.length; i++) {
    for (let j = 0; j < branches.length; j++) {
      if (i === j) continue;
      const a = branches[i];
      const b = branches[j];
      for (const rule of RULES) {
        if (!rule.matches(a, b)) continue;
        const key = pairKey(a.id, b.id) + rule.type;
        if (seen.has(key)) continue;
        seen.add(key);
        conflicts.push({
          id: newId("cf"),
          type: rule.type,
          branchIds: [a.id, b.id],
          demandA: rule.demandA(a),
          demandB: rule.demandB(b),
          preservedTruths: [],
          rejectedExcesses: [],
        });
      }
    }
  }
  return conflicts;
}

export function createCustomConflict(
  branchA: PsychologicalBranch,
  branchB: PsychologicalBranch,
  demandA: string,
  demandB: string,
): MergeConflict {
  return {
    id: newId("cf"),
    type: "custom",
    branchIds: [branchA.id, branchB.id],
    demandA,
    demandB,
    preservedTruths: [],
    rejectedExcesses: [],
  };
}

export function resolveConflict(
  conflict: MergeConflict,
  resolution: string,
  preservedTruths: string[],
  rejectedExcesses: string[],
): MergeConflict {
  return { ...conflict, resolution, preservedTruths, rejectedExcesses };
}

export function unresolvedConflicts(conflicts: MergeConflict[]): MergeConflict[] {
  return conflicts.filter((c) => !c.resolution);
}

export const CONFLICT_TYPE_LABELS: Record<MergeConflictType, string> = {
  "effort-vs-recovery": "Effort vs recovery",
  "connection-vs-independence": "Connection vs independence",
  "action-vs-acceptance": "Action vs acceptance",
  "certainty-vs-movement": "Certainty vs movement",
  "ambition-vs-capacity": "Ambition vs capacity",
  "expression-vs-boundary": "Expression vs boundary",
  "urgency-vs-reality": "Urgency vs reality",
  custom: "Two truths in tension",
};

/** Fallback demand text for a branch entering the present, by what it tends to ask for. */
export function defaultDemand(branch: PsychologicalBranch): string {
  const byType: Record<BranchType, string> = {
    event: "Resolve what happened before living continues.",
    waiting: "Keep checking until the outcome arrives.",
    projection: "Stay alert so the feared outcome cannot surprise you.",
    identity: "Close the gap between who you are and who you should be.",
    relationship: "Keep the connection safe before anything else.",
    body: "Attend to the body before demands continue.",
    project: "Make visible progress now.",
  };
  const byOrientation: Partial<Record<BranchOrientation, string>> = {
    past: "Keep re-examining what already happened.",
    "outside-control": "Watch something that is not yours to move.",
  };
  return byOrientation[branch.orientation] ?? byType[branch.type];
}
