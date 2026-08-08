import type { PsychologicalBranch } from "./types";
import { isClosed } from "./logic";

/** Options offered when a new concern resembles a branch merged before. */
export const RECURRENCE_REASONS = [
  { id: "new-event", label: "New real event" },
  { id: "body-depletion", label: "Same issue, stronger body depletion" },
  { id: "new-information", label: "New information" },
  { id: "new-emotional-layer", label: "New emotional layer" },
  { id: "seeking-reassurance", label: "Seeking reassurance" },
  { id: "incomplete-action", label: "Previous action was incomplete" },
  { id: "old-belief-returned", label: "The old belief returned" },
  { id: "unsure", label: "I am not sure" },
] as const;

export type RecurrenceReasonId = (typeof RECURRENCE_REASONS)[number]["id"];

export type RecurrenceRecommendation =
  | "add-moment"
  | "new-branch"
  | "reopen"
  | "new-conflict"
  | "recommend-support";

/** Recurrence does not mean the previous merge was false. */
export function recommendForRecurrence(reason: RecurrenceReasonId): RecurrenceRecommendation {
  switch (reason) {
    case "new-event":
      return "new-branch";
    case "new-information":
      return "reopen";
    case "body-depletion":
    case "seeking-reassurance":
    case "old-belief-returned":
    case "unsure":
      return "add-moment";
    case "incomplete-action":
      return "new-conflict";
    case "new-emotional-layer":
      return "recommend-support";
  }
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "my", "our", "and", "or", "to", "in", "with",
  "about", "for", "is", "am", "are", "i", "me", "not", "no",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9äöüßéèáàóò]+/i)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

/**
 * When creating a branch, check whether it resembles a branch that was merged before.
 * Matches by title similarity or shared type + orientation with strong word overlap.
 */
export function detectRecurrence(
  newTitle: string,
  existing: PsychologicalBranch[],
): PsychologicalBranch | undefined {
  const merged = existing.filter((b) => isClosed(b) || b.status === "partly-integrated");
  let best: PsychologicalBranch | undefined;
  let bestScore = 0;
  for (const b of merged) {
    const score = similarity(newTitle, b.title + " " + (b.description ?? ""));
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return bestScore >= 0.5 ? best : undefined;
}

/** Record a recurrence on the historical branch without erasing the previous merge. */
export function recordRecurrence(
  branch: PsychologicalBranch,
  now: Date = new Date(),
): PsychologicalBranch {
  return {
    ...branch,
    recurrenceCount: branch.recurrenceCount + 1,
    lastActivatedAt: now.toISOString(),
  };
}
