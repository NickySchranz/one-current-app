import type { IntegratedAction } from "../actions/types";
import type { PsychologicalBranch } from "../branches/types";
import type { BranchMerge } from "../merges/types";
import type { WaitingContainer } from "../waiting/types";

/**
 * Where a situation stands, assembled from what is already saved.
 *
 * This is the answer to the question the app exists for — "what happened,
 * what did I already decide or try, and what deserves attention now" — and it
 * is built by reading fields, not by inferring anything. No model, no
 * summarisation, no guessing: if the person did not write it or do it, it
 * does not appear.
 *
 * Every line carries a `voice`. Words the person wrote are quoted back as
 * theirs; anything the app assembled says so. That distinction is the whole
 * reason this can be shown to someone in a difficult conversation without
 * putting sentences in their mouth.
 */
export type StandsVoice = "theirs" | "app";

export type StandsLine = {
  kind: "development" | "decided" | "tried" | "next" | "waiting" | "open-question";
  /** The label for the line, always the app's own words. */
  label: string;
  /** The content. When `voice` is "theirs" this is verbatim user text. */
  text: string;
  voice: StandsVoice;
  /** ISO date the line refers to, where there is one. */
  on?: string;
};

export type WhereThisStands = {
  lines: StandsLine[];
  /**
   * Nothing has been recorded beyond the situation existing. The card must
   * say so rather than manufacture a next step — inventing one here would be
   * the app telling someone what to do about a thing it knows nothing about.
   */
  empty: boolean;
};

function day(iso: string): string {
  return iso.slice(0, 10);
}

const byNewest = <T,>(xs: T[], at: (x: T) => string): T[] =>
  [...xs].sort((a, b) => at(b).localeCompare(at(a)));

export function whereThisStands(input: {
  branch: PsychologicalBranch;
  actions: IntegratedAction[];
  merges: BranchMerge[];
  waiting?: WaitingContainer[];
}): WhereThisStands {
  const { branch } = input;
  const lines: StandsLine[] = [];

  const mine = input.actions.filter((a) =>
    a.branchesIntegrated.some((r) => r.branchId === branch.id),
  );

  // ── the latest thing that actually happened ────────────────────────────
  const latestMoment = byNewest(branch.commits, (m) => m.date)[0];
  if (latestMoment) {
    lines.push({
      kind: "development",
      label: "Latest",
      text: latestMoment.title,
      voice: "theirs",
      on: latestMoment.date,
    });
  }

  // ── what was decided ───────────────────────────────────────────────────
  const latestMerge = byNewest(
    input.merges.filter((m) => m.branchIds.includes(branch.id)),
    (m) => m.createdAt,
  )[0];
  if (latestMerge?.resolution) {
    lines.push({
      kind: "decided",
      label: "You decided",
      text: latestMerge.resolution,
      voice: "theirs",
      on: day(latestMerge.createdAt),
    });
  } else if (branch.currentBelief) {
    lines.push({
      kind: "decided",
      label: "Where you landed",
      text: branch.currentBelief,
      voice: "theirs",
    });
  }

  // ── what happens next: an open step, or something being waited on ─────
  const container = (input.waiting ?? []).find(
    (w) => !w.closedAt && (w.id === branch.waitingContainerId || w.branchId === branch.id),
  );
  const openStep = byNewest(
    mine.filter((a) => !a.completedAt && !a.handedOffAt),
    (a) => a.createdAt,
  )[0];

  // ── what was tried, kept distinct by outcome ───────────────────────────
  const completed = mine.filter((a) => a.completedAt);
  // An attempted step that is ALSO the open next step says both things at
  // once ("Still to finish"), so listing it twice just repeats the sentence
  // back at the person.
  const attempted = mine.filter(
    (a) => a.attemptedAt && !a.completedAt && a.id !== openStep?.id,
  );
  const handedOff = mine.filter((a) => a.handedOffAt && !a.completedAt);
  for (const a of byNewest(completed, (x) => x.completedAt ?? x.createdAt).slice(0, 2)) {
    lines.push({
      kind: "tried",
      label: "You did",
      text: a.title,
      voice: "theirs",
      on: day(a.completedAt ?? a.createdAt),
    });
  }
  for (const a of byNewest(attempted, (x) => x.attemptedAt ?? x.createdAt).slice(0, 2)) {
    lines.push({
      kind: "tried",
      label: "You tried",
      text: a.title,
      voice: "theirs",
      on: day(a.attemptedAt ?? a.createdAt),
    });
  }
  for (const a of byNewest(handedOff, (x) => x.handedOffAt ?? x.createdAt).slice(0, 1)) {
    lines.push({
      kind: "tried",
      label: "Moved to your own tasks",
      text: a.title,
      voice: "theirs",
      on: day(a.handedOffAt ?? a.createdAt),
    });
  }

  if (container) {
    lines.push({
      kind: "waiting",
      label: "Waiting for",
      text: container.awaiting,
      voice: "theirs",
      on: container.reviewDate,
    });
  } else if (openStep) {
    lines.push({
      kind: "next",
      label: openStep.attemptedAt ? "Still to finish" : "Next step",
      text: openStep.title,
      voice: "theirs",
      on: day(openStep.createdAt),
    });
  }

  // ── what is still unsettled ────────────────────────────────────────────
  if (branch.unmetNeeds.length > 0) {
    lines.push({
      kind: "open-question",
      label: "Still open",
      text: branch.unmetNeeds.join(", "),
      voice: "theirs",
    });
  }

  return { lines, empty: lines.length === 0 };
}

/** The one line worth leading with, when there is only room for one. */
export function headlineOf(stands: WhereThisStands): StandsLine | undefined {
  const order: StandsLine["kind"][] = ["waiting", "next", "development", "decided", "tried", "open-question"];
  for (const kind of order) {
    const found = stands.lines.find((l) => l.kind === kind);
    if (found) return found;
  }
  return undefined;
}
