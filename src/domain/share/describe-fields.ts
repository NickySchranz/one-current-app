/**
 * What a share actually contains, in plain words, read off the built export
 * rather than written down by hand — so the list shown to the user before they
 * send cannot drift away from the payload.
 *
 * Every key the builder can emit has a label here. A key with no label shows up
 * in `unlabelled`, which the share screen surfaces rather than hiding: an
 * unnamed field leaving the app is exactly the thing this list exists to catch.
 */
import type { ShareExport } from "./types";

const THREAD_LABELS: Record<string, string> = {
  title: "the name you gave the thread",
  description: "anything you wrote to describe it",
  kind: "what kind of thread it is",
  orientation: "where it points (past, future, a person, your body…)",
  status: "where it stands now",
  startedOn: "when it started",
  startedLabel: "how you described when it started",
  integratedOn: "when it was integrated",
  feelings: "the feelings it held",
  anxieties: "what you said it makes you feel",
  originalBelief: "what you believed at the start, in your words",
  currentBelief: "what you believe now, in your words",
  needs: "what you marked as still true and coming with you",
  qualitiesReclaimed: "what you reclaimed when it integrated",
  controllability: "how much of it you said is in your hands",
  returnedCount: "how many times it came back",
  waiting: "what it is waiting on, and when to review it",
  loudness: "every loudness rating you set, with its date",
  events: "what happened on it, day by day",
  id: "an internal reference for the thread",
};

const EVENT_LABELS: Record<string, string> = {
  title: "the words you gave a moment or a step",
  description: "anything you wrote about a moment",
  momentType: "what kind of moment it was",
  impact: "how much you said a moment landed",
  beliefAdded: "a belief a moment added, in your words",
  effect: "whether a moment made the thread stronger, lighter or different",
  durationMinutes: "how long a step was meant to take",
  instruction: "the standing instruction for a step",
  minimumVersion: "the smallest version of a step",
  completionDefinition: "what counted as finishing a step",
  qualitiesCarried: "what a step carried with it",
  representedAs: "how the thread appeared inside a step",
  result: "how an integration ended",
  resolution: "what you wrote when it resolved",
  contributionKind: "what the thread went on to contribute",
  contribution: "what it now contributes, in your words",
  reclaimed: "what you reclaimed",
  stillValid: "what stayed true",
  outdatedBeliefs: "beliefs that aged out",
  outsideControl: "what you named as outside your control",
  released: "what you released",
  conflicts: "tensions with other threads, and how they resolved",
  on: "the date each thing happened",
  kind: "what kind of record each one is",
};

/** Never in a share, and worth saying so plainly. */
export const SHARE_NEVER_INCLUDES = [
  "words you wrote down to burn — those stay on this device",
  "anything from threads you did not pick",
  "your password, or anything from your account",
];

function isPresent(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

/**
 * The human-readable list of what this particular share carries. `unlabelled`
 * holds any key the builder emitted that has no label yet.
 */
export function describeShareFields(share: ShareExport): {
  threadFields: string[];
  eventFields: string[];
  unlabelled: string[];
} {
  const threadKeys = new Set<string>();
  const eventKeys = new Set<string>();
  const unlabelled = new Set<string>();

  for (const thread of share.threads) {
    for (const [key, value] of Object.entries(thread)) {
      if (!isPresent(value)) continue;
      if (THREAD_LABELS[key]) threadKeys.add(key);
      else unlabelled.add(`thread.${key}`);
    }
    for (const event of thread.events) {
      for (const [key, value] of Object.entries(event)) {
        if (!isPresent(value)) continue;
        if (EVENT_LABELS[key]) eventKeys.add(key);
        else unlabelled.add(`event.${key}`);
      }
    }
  }

  // Keep the reading order of the tables, not of the data.
  const inTableOrder = (table: Record<string, string>, keys: Set<string>) =>
    Object.keys(table)
      .filter((k) => keys.has(k))
      .map((k) => table[k]);

  return {
    threadFields: inTableOrder(THREAD_LABELS, threadKeys),
    eventFields: inTableOrder(EVENT_LABELS, eventKeys),
    unlabelled: [...unlabelled].sort(),
  };
}
