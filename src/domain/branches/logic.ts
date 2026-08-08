import { newId } from "../ids";
import {
  BRANCH_KIND_CHOICES,
  CLOSED_STATUSES,
  OPEN_STATUSES,
  type BranchStatus,
  type ForkPeriodChoice,
  type PsychologicalBranch,
  type Loudness,
} from "./types";

const DAY = 24 * 60 * 60 * 1000;

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Resolve a coarse "when did this begin?" answer into a concrete fork date + label. */
export function resolveForkDate(
  choice: ForkPeriodChoice,
  now: Date = new Date(),
): { forkDate: string; forkLabel?: string } {
  switch (choice.kind) {
    case "today":
      return { forkDate: isoDate(now) };
    case "yesterday":
      return { forkDate: isoDate(new Date(now.getTime() - DAY)) };
    case "this-week":
      return { forkDate: isoDate(new Date(now.getTime() - 3.5 * DAY)), forkLabel: "earlier this week" };
    case "this-month":
      return { forkDate: isoDate(new Date(now.getTime() - 15 * DAY)), forkLabel: "earlier this month" };
    case "approximate-date":
      return { forkDate: choice.date, forkLabel: "around this time" };
    case "life-period":
      return { forkDate: choice.approximateDate, forkLabel: choice.label };
    case "unsure":
      // Place it a season back so it visibly precedes Now; label makes the uncertainty honest.
      return { forkDate: isoDate(new Date(now.getTime() - 90 * DAY)), forkLabel: "some time ago" };
  }
}

export type CreateBranchInput = {
  title: string;
  kindChoiceId: string;
  period: ForkPeriodChoice;
  loudness?: Loudness;
  description?: string;
  /** What it makes you feel (tap-only, chosen at creation). */
  anxieties?: string[];
  /** Feelings that are less available on the main line while this branch is active. */
  occupies?: string[];
};

export function createBranch(input: CreateBranchInput, now: Date = new Date()): PsychologicalBranch {
  const kind =
    BRANCH_KIND_CHOICES.find((k) => k.id === input.kindChoiceId) ?? BRANCH_KIND_CHOICES[0];
  const { forkDate, forkLabel } = resolveForkDate(input.period, now);
  const nowIso = now.toISOString();
  return {
    id: newId("br"),
    title: input.title.trim(),
    description: input.description,
    type: kind.type,
    orientation: kind.orientation,
    status: "active",
    forkDate,
    forkLabel,
    loudness: input.loudness ?? 3,
    anxieties: input.anxieties,
    occupies: input.occupies,
    storedQualities: [],
    unmetNeeds: [],
    controllability: "unclear",
    commits: [],
    mergeIds: [],
    firstCreatedAt: nowIso,
    lastActivatedAt: nowIso,
    recurrenceCount: 0,
  };
}

/** Does this branch still continue as a separate line into Now? */
export function isOpen(branch: PsychologicalBranch): boolean {
  return OPEN_STATUSES.includes(branch.status);
}

export function isClosed(branch: PsychologicalBranch): boolean {
  return CLOSED_STATUSES.includes(branch.status);
}

export function isWaiting(branch: PsychologicalBranch): boolean {
  return branch.status === "waiting-with-boundaries";
}

/** The date at which the branch line visually ends. */
export function branchEndDate(branch: PsychologicalBranch, now: Date = new Date()): string {
  if (isClosed(branch) && branch.mergeDate) return branch.mergeDate;
  return isoDate(now);
}

/** Any honest decision about a branch — acting, noting, or deliberately leaving it — loosens its loudness a little. */
export function easeLoudness(loudness: Loudness): Loudness {
  return Math.max(1, loudness - 1) as Loudness;
}

/**
 * Whole days since the branch was last given attention: a decision, or setting
 * its loudness dial by hand (creation counts as the first decision).
 */
export function daysSinceDecision(branch: PsychologicalBranch, now: Date = new Date()): number {
  // ISO dates compare lexically: the later of the two anchors wins;
  // creation only counts while neither exists yet.
  const anchors = [branch.lastDecisionOn, branch.loudnessSetOn].filter((d): d is string => !!d);
  const ref =
    anchors.length > 0 ? anchors.sort()[anchors.length - 1] : branch.firstCreatedAt.slice(0, 10);
  return Math.max(0, Math.floor((now.getTime() - Date.parse(ref)) / DAY));
}

/**
 * The loudness as felt today: every full undecided day adds one, up to the
 * maximum of 5. Any decision — or setting the dial by hand — resets the clock,
 * so what you set is exactly what is felt.
 * Waiting and closed branches do not drift — their state is already a decision.
 */
export function effectiveLoudness(branch: PsychologicalBranch, now: Date = new Date()): Loudness {
  if (isClosed(branch) || branch.status === "waiting-with-boundaries") return branch.loudness;
  const drift = daysSinceDecision(branch, now);
  return Math.min(5, branch.loudness + drift) as Loudness;
}

/** Merging reduces the branch's active loudness; the residue stays honest, not zero by decree. */
export function reduceLoudnessAfterMerge(loudness: Loudness, resultStatus: string): Loudness {
  if (resultStatus === "merged") return 1;
  if (resultStatus === "waiting" || resultStatus === "converted-to-project") {
    return Math.max(1, loudness - 2) as Loudness;
  }
  return Math.max(1, loudness - 1) as Loudness;
}

export function statusAfterMerge(resultStatus: string): BranchStatus {
  switch (resultStatus) {
    case "merged":
      return "merged";
    case "partly-merged":
      return "partly-integrated";
    case "waiting":
      return "waiting-with-boundaries";
    case "converted-to-project":
      return "converted-to-project";
    case "needs-support":
      return "needs-support";
    default:
      return "merged";
  }
}

/** Ordering used for "which branch is currently most activated". */
export function activationScore(branch: PsychologicalBranch): number {
  const statusWeight: Partial<Record<BranchStatus, number>> = {
    activated: 3,
    "merge-conflict": 2.5,
    active: 2,
    "needs-support": 2,
    "ready-to-merge": 1.5,
    explored: 1,
    "partly-integrated": 0.8,
    "converted-to-project": 0.5,
    "waiting-with-boundaries": 0.2,
  };
  return (statusWeight[branch.status] ?? 0) * 10 + effectiveLoudness(branch);
}

export function mostActivated(branches: PsychologicalBranch[]): PsychologicalBranch | undefined {
  return branches
    .filter(isOpen)
    .sort((a, b) => activationScore(b) - activationScore(a))[0];
}
