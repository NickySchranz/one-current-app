import type { PsychologicalBranch } from "../branches/types";
import { effectiveLoudness, isClosed, isOpen, isWaiting, isoDate } from "../branches/logic";

/**
 * The shared vocabulary of feelings a line can occupy. Tap to choose — never
 * typed. When a line is decided on or merged, what it held returns to the
 * one main line.
 */
export const FEELINGS = [
  "calm",
  "focus",
  "sleep",
  "presence",
  "confidence",
  "lightness",
  "patience",
  "joy",
  "energy",
  "closeness",
  "hope",
  "self-trust",
] as const;

export type Feeling = (typeof FEELINGS)[number];

/** What an open line makes you feel — tap-only, named at creation. */
export const ANXIETIES = [
  "worry",
  "dread",
  "guilt",
  "regret",
  "anger",
  "sadness",
  "shame",
  "restlessness",
  "overwhelm",
  "loneliness",
  "envy",
  "helplessness",
] as const;

export type Anxiety = (typeof ANXIETIES)[number];

/** Each anxiety tends to lock specific feelings away from the main line. */
const LOCKS: Record<Anxiety, Feeling[]> = {
  worry: ["calm", "sleep"],
  dread: ["hope", "lightness"],
  guilt: ["self-trust", "lightness"],
  regret: ["presence", "self-trust"],
  anger: ["calm", "patience"],
  sadness: ["joy", "energy"],
  shame: ["confidence", "closeness"],
  restlessness: ["focus", "presence"],
  overwhelm: ["focus", "calm"],
  loneliness: ["closeness", "joy"],
  envy: ["confidence", "self-trust"],
  helplessness: ["hope", "energy"],
};

/** From what a line makes you feel, suggest which feelings become less available. */
export function suggestLockedFeelings(anxieties: string[]): string[] {
  const locked = new Set(
    anxieties.flatMap((a) => LOCKS[a as Anxiety] ?? []),
  );
  return FEELINGS.filter((f) => locked.has(f));
}

/** Was any decision taken about this branch today? */
export function decidedToday(branch: PsychologicalBranch, now: Date = new Date()): boolean {
  return branch.lastDecisionOn === isoDate(now);
}

/**
 * Feelings this line is holding right now. A merged line holds nothing —
 * you have moved past it. A decision today releases them for the day.
 */
export function heldFeelings(branch: PsychologicalBranch, now: Date = new Date()): string[] {
  if (isClosed(branch)) return [];
  if (decidedToday(branch, now)) return [];
  return branch.occupies ?? [];
}

export type IntegrationSummary = {
  /** Open lines still holding feelings, strongest scattering first. */
  held: { branch: PsychologicalBranch; feelings: string[] }[];
  /** Feelings released by today's decisions and merges. */
  returnedToday: string[];
  /** Feelings not held by any line: with you, on the main line. */
  withYou: string[];
};

/** How your attention and feelings are scattered across lines — or home. */
export function integrationSummary(
  branches: PsychologicalBranch[],
  now: Date = new Date(),
): IntegrationSummary {
  const held = branches
    .map((branch) => ({ branch, feelings: heldFeelings(branch, now) }))
    .filter((h) => h.feelings.length > 0)
    .sort((a, b) => b.feelings.length - a.feelings.length);

  const heldSet = new Set(held.flatMap((h) => h.feelings));

  const returnedToday = [
    ...new Set(
      branches
        .filter(
          (b) =>
            (b.occupies?.length ?? 0) > 0 &&
            (decidedToday(b, now) || (isClosed(b) && b.mergeDate === isoDate(now))),
        )
        .flatMap((b) => b.occupies ?? []),
    ),
  ].filter((f) => !heldSet.has(f));

  const withYou = FEELINGS.filter((f) => !heldSet.has(f));

  return { held, returnedToday, withYou };
}

export type EnergySplit = {
  /** Fraction of today's energy that stays on the main line (0..1). */
  mainShare: number;
  /** Open lines drawing energy away, strongest first. */
  parts: { branch: PsychologicalBranch; share: number }[];
};

/** Weight the main line carries regardless of branches. */
const MAIN_BASE = 12;

/**
 * How today's energy is split across the lines. Undecided open lines draw
 * energy proportional to their felt loudness; a decision today (or calm waiting)
 * shrinks their draw sharply — the reclaimed energy returns to the main line.
 */
export function energySplit(
  branches: PsychologicalBranch[],
  now: Date = new Date(),
): EnergySplit {
  const loads = branches
    .filter(isOpen)
    .map((branch) => {
      let load: number = effectiveLoudness(branch, now);
      if (isWaiting(branch)) load *= 0.25;
      else if (decidedToday(branch, now)) load *= 0.3;
      return { branch, load };
    })
    .filter((l) => l.load > 0)
    .sort((a, b) => b.load - a.load);

  const total = MAIN_BASE + loads.reduce((s, l) => s + l.load, 0);
  return {
    mainShare: MAIN_BASE / total,
    parts: loads.map(({ branch, load }) => ({ branch, share: load / total })),
  };
}
