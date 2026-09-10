import { newId } from "../ids";
import { presentDaysSince } from "../time/presence";
import {
  BRANCH_KIND_CHOICES,
  CLOSED_STATUSES,
  OPEN_STATUSES,
  UNKNOWN_KIND,
  type BranchStatus,
  type ForkPeriodChoice,
  type LoudnessSource,
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
  // An id that matches nothing means the kind was never named — the creation
  // flow deliberately does not ask. The thread then carries "unknown"
  // honestly, instead of silently becoming a past event: falling back to
  // BRANCH_KIND_CHOICES[0] typed every thread in the app "event"/"past",
  // which made every conflict rule unreachable and flattened the map to one
  // hue. Naming it later is what colours the line.
  const kind = BRANCH_KIND_CHOICES.find((k) => k.id === input.kindChoiceId) ?? UNKNOWN_KIND;
  const { forkDate, forkLabel } = resolveForkDate(input.period, now);
  const nowIso = now.toISOString();
  return {
    id: newId("br"),
    title: input.title.trim(),
    description: input.description,
    type: kind.type,
    orientation: kind.orientation,
    kindChoiceId: kind.id === UNKNOWN_KIND.id ? undefined : kind.id,
    status: "active",
    forkDate,
    forkLabel,
    loudness: input.loudness ?? 3,
    // Creation is the person's own first answer about how loud this is.
    loudnessLog: [{ at: nowIso, loudness: input.loudness ?? 3, source: "reported" }],
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

/** Sound-family names for the five rungs, level 1..5 — pass through t() where shown. */
export const LOUDNESS_WORDS = ["quiet", "murmuring", "speaking", "calling", "loud"] as const;
export const loudnessWord = (level: number) =>
  LOUDNESS_WORDS[Math.min(5, Math.max(1, Math.round(level))) - 1];

/** Any honest decision about a branch — acting, noting, or deliberately leaving it — loosens its loudness a little. */
export function easeLoudness(loudness: Loudness): Loudness {
  return Math.max(1, loudness - 1) as Loudness;
}

/**
 * Record on the branch's log that a mutation moved its loudness. Wrap every
 * `next` branch built from `prev`: if the dial did not move, `next` passes
 * through untouched.
 *
 * `source` defaults to "derived" deliberately — the app moving a value on
 * someone's behalf is the common case, and the dangerous mistake is banking a
 * derived value as though the person had reported it. Callers that ARE the
 * person speaking have to say so.
 */
export function trackLoudness(
  prev: PsychologicalBranch,
  next: PsychologicalBranch,
  now: Date = new Date(),
  source: LoudnessSource = "derived",
): PsychologicalBranch {
  if (next.loudness === prev.loudness) return next;
  return {
    ...next,
    loudnessLog: [
      ...(next.loudnessLog ?? []),
      { at: now.toISOString(), loudness: next.loudness, source },
    ],
  };
}

/**
 * Days the branch has gone unanswered **while the user was here to answer it**.
 * A decision, or setting the dial by hand, resets it (creation counts as the
 * first decision). Days the app was closed do not count — see ../time/presence.
 */
export function daysSinceDecision(branch: PsychologicalBranch, now: Date = new Date()): number {
  // ISO dates compare lexically: the later of the two anchors wins;
  // creation only counts while neither exists yet.
  const anchors = [branch.lastDecisionOn, branch.loudnessSetOn].filter((d): d is string => !!d);
  const ref =
    anchors.length > 0 ? anchors.sort()[anchors.length - 1] : branch.firstCreatedAt.slice(0, 10);
  return presentDaysSince(ref, isoDate(now));
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

/**
 * The branch's stored loudness on each of the last `days` days, oldest first —
 * a step series read straight out of `loudnessLog`, which until now was
 * recorded on every change and shown to nobody but the psychologist.
 *
 * Deliberately the STORED value, not the effective one: the drift is a
 * statement about today, and folding it into history would draw a rising curve
 * for a thread nobody touched. `null` means the thread did not exist yet.
 */
export function loudnessSeries(
  branch: PsychologicalBranch,
  days: number,
  now: Date = new Date(),
  options: { reportedOnly?: boolean } = {},
): (number | null)[] {
  const all = [...(branch.loudnessLog ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  // Drawing someone their own curve means drawing only what they said. An
  // automatic ease is a real event, but it is the app's move, and a line that
  // mixes the two would show a person "calming down" on days they never
  // answered. Unlabelled history is excluded too: it predates provenance, so
  // nobody can now say which it was, and guessing would be the same lie.
  const log = options.reportedOnly ? all.filter((e) => e.source === "reported") : all;
  const born = branch.firstCreatedAt.slice(0, 10);
  const out: (number | null)[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = isoDate(new Date(now.getTime() - i * DAY));
    if (day < born) {
      out.push(null);
      continue;
    }
    let value: number | null = null;
    for (const entry of log) {
      if (entry.at.slice(0, 10) <= day) value = entry.loudness;
      else break;
    }
    // Nothing logged at or before this day. On the full series the thread's
    // opening level is a fair stand-in; on the reported-only series it is
    // not — falling back to branch.loudness there would put a number the
    // person never gave into a line labelled as theirs.
    if (value !== null) out.push(value);
    else if (options.reportedOnly) out.push(log.length > 0 ? log[0].loudness : null);
    else out.push(log[0]?.loudness ?? branch.loudness);
  }
  return out;
}

/** How many times the person has said, in their own words, how loud this is. */
export function reportedLoudnessCount(branch: PsychologicalBranch): number {
  return (branch.loudnessLog ?? []).filter((e) => e.source === "reported").length;
}

/** True when the log holds movement whose origin was never recorded. */
export function hasUnlabelledLoudness(branch: PsychologicalBranch): boolean {
  return (branch.loudnessLog ?? []).some((e) => e.source === undefined);
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
