import { newId } from "@/domain/ids";
import { RECLAIMABLE_QUALITIES } from "@/domain/branches/diff";
import type { CoreValue, ValueMotive, ValueTurn } from "./types";

/**
 * The names offered when naming what matters. Deliberately the same
 * vocabulary a thread gives back when it is integrated
 * (RECLAIMABLE_QUALITIES) — so what you keep reclaiming and what you stand
 * for speak the same language, and no word means two things in two pickers.
 */
export const VALUE_NAMES = RECLAIMABLE_QUALITIES;

/** How many values stay live at once before the list stops being a set. */
export const MAX_LIVE_VALUES = 5;
/** How many the first naming invites — enough to steady you, few enough to finish. */
export const FIRST_SORT_TARGET = 3;
/** A value changed while a thread was this loud gets a second look. */
export const LOUD_ENOUGH_TO_REVISIT = 4;
/** How long until that second look. */
const REVISIT_DAYS = 14;

/**
 * What each offered value can look like on a hard day. Tapping one of these
 * is the whole authoring step — nothing here asks for typing, and the line
 * that is tapped is specific enough to become today's step by itself.
 */
export const LOOKS_LIKE: Record<string, string[]> = {
  confidence: [
    "say the thing once, without softening it",
    "let the work speak and stop watching faces",
    "ask for what it is worth",
  ],
  love: [
    "show up before being asked",
    "stay in the room for the hard part",
    "say the warm thing out loud",
  ],
  connection: [
    "answer the message today",
    "tell someone the true version",
    "sit with them and put the phone down",
  ],
  direction: [
    "do the next thing, not every thing",
    "choose, then stop reopening it",
    "spend the first hour on what matters",
  ],
  freedom: [
    "leave the option open",
    "say no without a reason",
    "keep one part of the day unspoken for",
  ],
  "self-respect": [
    "say the hard thing kindly",
    "not explain myself twice",
    "leave when it is finished",
  ],
  rest: [
    "stop at a stopping place",
    "let it be unfinished overnight",
    "lie down before earning it",
  ],
  vitality: [
    "move before deciding anything",
    "eat a real meal, sitting down",
    "be outside while it is light",
  ],
  purpose: [
    "give the best hour to the real work",
    "finish one thing that outlives today",
    "keep the promise made to myself",
  ],
  expression: [
    "say it in my own words",
    "make the thing badly rather than not at all",
    "tell the truth about how it went",
  ],
  safety: [
    "name the limit out loud",
    "step back before it gets loud",
    "keep the ground I stand on",
  ],
  acceptance: [
    "let it be what it is today",
    "stop arguing with what already happened",
    "hold the not-knowing without fixing it",
  ],
  closure: [
    "let the last word be mine and quiet",
    "put it where it happened",
    "stop rereading it",
  ],
  play: [
    "do the pointless thing on purpose",
    "let something be fun and useless",
    "laugh before solving it",
  ],
  competence: [
    "do the small part properly",
    "learn the bit I keep avoiding",
    "ask the question that shows I do not know",
  ],
};

/** The lines to offer for a name — a user's own word gets a general set. */
export function looksLikeFor(name: string): string[] {
  return (
    LOOKS_LIKE[name.toLowerCase()] ?? [
      "do the small honest version of it today",
      "say what is true about it out loud",
      "let it lead one decision",
    ]
  );
}

/** Values still in your life. Set-down values stay, but step out of the way. */
export function liveValues(values: CoreValue[]): CoreValue[] {
  return values.filter((v) => !v.setDownOn);
}

/** Values kept from before. */
export function setDownValues(values: CoreValue[]): CoreValue[] {
  return values.filter((v) => !!v.setDownOn);
}

/**
 * The values that can steady you. A value held because someone expects it,
 * or to avoid guilt, is never offered as ground to stand on — holding a
 * worry against it would only add the guilt back.
 */
export function steadyingValues(values: CoreValue[]): CoreValue[] {
  return liveValues(values).filter((v) => v.motive === "chosen");
}

export function canTakeUpValue(values: CoreValue[]): boolean {
  return liveValues(values).length < MAX_LIVE_VALUES;
}

function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  const d = new Date(day + "T00:00:00");
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function createValue(
  input: { name: string; looksLike: string[]; motive: ValueMotive; becauseOf?: string },
  now: Date = new Date(),
): CoreValue {
  return {
    id: newId("cv"),
    name: input.name,
    looksLike: input.looksLike,
    motive: input.motive,
    chosenOn: isoDate(now),
    history: [
      { at: now.toISOString(), kind: "taken-up", becauseOf: input.becauseOf },
    ],
  };
}

/**
 * A turn in a value's life. The wording that stood before is always kept,
 * and a change made while a thread was loud earns a second look later —
 * what shifts under pressure often settles back.
 */
export function turnValue(
  value: CoreValue,
  patch: { name?: string; looksLike?: string[]; motive?: ValueMotive; setDown?: boolean },
  context: { becauseOf?: string; loudness?: number } = {},
  now: Date = new Date(),
): CoreValue {
  const was = { name: value.name, looksLike: value.looksLike, motive: value.motive };
  const kind: ValueTurn["kind"] = patch.setDown
    ? value.setDownOn
      ? "taken-back-up"
      : "set-down"
    : patch.name !== undefined && patch.name !== value.name
      ? "renamed"
      : patch.motive !== undefined && patch.motive !== value.motive
        ? "motive-changed"
        : "reworded";

  const next: CoreValue = {
    ...value,
    name: patch.name ?? value.name,
    looksLike: patch.looksLike ?? value.looksLike,
    motive: patch.motive ?? value.motive,
    history: [...value.history, { at: now.toISOString(), kind, was, becauseOf: context.becauseOf }],
  };

  if (patch.setDown) {
    next.setDownOn = value.setDownOn ? undefined : isoDate(now);
  }
  // Changed while the thread was still loud: look at it again when it is not.
  if (!patch.setDown && (context.loudness ?? 0) >= LOUD_ENOUGH_TO_REVISIT) {
    next.revisitOn = addDays(isoDate(now), REVISIT_DAYS);
  }
  return next;
}

/** Values whose second look has come round. */
export function dueForRevisit(values: CoreValue[], now: Date = new Date()): CoreValue[] {
  const today = isoDate(now);
  return liveValues(values).filter((v) => v.revisitOn && v.revisitOn <= today);
}

/** Clear the second-look flag once it has been offered and answered. */
export function settleRevisit(value: CoreValue): CoreValue {
  return { ...value, revisitOn: undefined };
}

/** Every turn across every value, newest first — the History reading. */
export function allTurns(
  values: CoreValue[],
): { value: CoreValue; turn: ValueTurn }[] {
  return values
    .flatMap((value) => value.history.map((turn) => ({ value, turn })))
    .sort((a, b) => (a.turn.at < b.turn.at ? 1 : -1));
}
