import type { PsychologicalBranch } from "./types";
import { sortMoments } from "../moments/logic";

/** Structured options for "What has changed since this branch separated from the main life?" */
export const DIFF_CHANGE_OPTIONS = [
  { id: "circumstances-changed", label: "My circumstances changed." },
  { id: "understanding-changed", label: "My understanding changed." },
  { id: "more-capable", label: "I became more capable." },
  { id: "feared-event-absent", label: "The feared event did not happen." },
  { id: "less-controllable", label: "The issue remains real but is less controllable than I thought." },
  { id: "action-already-taken", label: "I have already taken the available action." },
  { id: "repeating-conclusion", label: "I am repeating an old conclusion." },
  { id: "body-urgency", label: "My body is making the issue feel more urgent." },
  { id: "other-person-controls", label: "Another person controls the next step." },
  { id: "issue-transformed", label: "The original issue has become a different issue." },
  { id: "nothing-changed", label: "Nothing important has changed." },
  { id: "unsure", label: "I am not sure." },
] as const;

export type DiffChangeId = (typeof DIFF_CHANGE_OPTIONS)[number]["id"];

export type ForkSideSnapshot = {
  whatHappened: string;
  believed: string[];
  needed: string[];
  feared: string[];
  unknown: string[];
};

export type NowSideSnapshot = {
  currentlyTrue: string[];
  changed: string[];
  learned: string[];
  unresolved: string[];
  noLongerApplies: string[];
  actionTaken: string[];
};

export type BranchDiff = {
  branchId: string;
  fork: ForkSideSnapshot;
  now: NowSideSnapshot;
  selectedChanges: DiffChangeId[];
};

/** Assemble both sides of the psychological diff from what the branch already knows. */
export function buildBranchDiff(branch: PsychologicalBranch): BranchDiff {
  const moments = sortMoments(branch.commits);
  const forkMoment = moments[0];
  const beliefsAlong = moments.map((m) => m.beliefAdded).filter((b): b is string => !!b);
  const insights = moments
    .filter((m) => m.type === "insight" || m.type === "relief")
    .map((m) => m.title);
  const actions = moments
    .filter((m) => m.type === "action" || m.type === "decision")
    .map((m) => m.title);
  const setbacks = moments
    .filter((m) => m.type === "setback" || m.type === "intensification")
    .map((m) => m.title);

  return {
    branchId: branch.id,
    fork: {
      whatHappened: forkMoment?.title ?? branch.description ?? branch.title,
      believed: branch.originalBelief ? [branch.originalBelief] : [],
      needed: branch.unmetNeeds,
      feared: [],
      unknown: [],
    },
    now: {
      currentlyTrue: branch.currentBelief ? [branch.currentBelief] : [],
      changed: beliefsAlong,
      learned: insights,
      unresolved: setbacks,
      noLongerApplies: [],
      actionTaken: actions,
    },
    selectedChanges: (branch.diffSelections ?? []) as DiffChangeId[],
  };
}

/** Four-category sort produced by Stage 4: preserve and release. */
export type PreserveRelease = {
  stillValid: string[];
  outdated: string[];
  outsideControl: string[];
  reclaimable: string[];
};

export const RECLAIMABLE_QUALITIES = [
  "confidence",
  "love",
  "connection",
  "direction",
  "freedom",
  "self-respect",
  "rest",
  "vitality",
  "purpose",
  "expression",
  "safety",
  "acceptance",
  "closure",
  "play",
  "competence",
] as const;

/** The merge may carry forward only what is still valid and reclaimable. */
export function mergeableContent(pr: PreserveRelease): { carried: string[]; released: string[] } {
  return {
    carried: [...pr.stillValid, ...pr.reclaimable],
    released: [...pr.outdated, ...pr.outsideControl],
  };
}
