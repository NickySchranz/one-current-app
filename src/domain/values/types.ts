/**
 * What your one line is made of. A value is not a goal and never something
 * you are behind on: it is a direction you chose, kept in your own words, so
 * a loud thread can be held next to it instead of deciding on its own.
 *
 * Values are revisable by design — a situation can genuinely change what
 * matters — so a value keeps every earlier wording rather than overwriting
 * it, along with the thread that changed it.
 */

/**
 * Whose value this really is. A value held to avoid guilt or to satisfy
 * someone else tends to cost more than it gives, so the app asks once and
 * then treats such a value gently: kept, never used to steady you.
 */
export type ValueMotive = "chosen" | "expected-of-me" | "would-feel-guilty";

/** One change in a value's life, and what changed it. */
export type ValueTurn = {
  /** ISO datetime of the change. */
  at: string;
  kind:
    | "taken-up"
    | "reworded"
    | "renamed"
    | "motive-changed"
    | "set-down"
    | "taken-back-up";
  /** The wording that stood before this turn — never discarded. */
  was?: { name: string; looksLike: string[]; motive: ValueMotive };
  /** The thread whose situation changed it, when a thread did. */
  becauseOf?: string;
};

export type CoreValue = {
  id: string;
  /** One word or a few: the user's own, or one of the offered names. */
  name: string;
  /** What it looks like on a hard day — their words, tapped or written. */
  looksLike: string[];
  motive: ValueMotive;
  /** ISO date it was taken up. */
  chosenOn: string;
  /** ISO date it was set down. Set-down values are kept, never deleted. */
  setDownOn?: string;
  /**
   * ISO date to look at this again. Set when a value changed while a thread
   * was loud: changes made under pressure often settle back, so the app
   * offers a second look instead of trusting the first one.
   */
  revisitOn?: string;
  history: ValueTurn[];
};
