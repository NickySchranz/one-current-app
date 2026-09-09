/**
 * Which days the app was actually open.
 *
 * Loudness drifts upward for every day a thread goes unanswered, and that part
 * is honest: an unanswered thread does get louder. Counting days the app was
 * *closed* is not. A worry does not grow because an app went unopened — the
 * app is a mirror, not the mechanism. Before this module existed, four days
 * away put every thread at the maximum, so someone returning after a week
 * opened a board that read as an emergency, with no warning beforehand and
 * nothing they could have done about it. That is the worst possible moment for
 * an app to raise its voice.
 *
 * So drift counts only the days the user was here to answer. Like the clock in
 * ./clock, this is an ambient the store fills in, so the eighteen call sites of
 * effectiveLoudness() do not each have to carry a presence log.
 */

const DAY = 24 * 60 * 60 * 1000;

/** ISO days (YYYY-MM-DD) the app was opened, ascending. Null until the store loads it. */
let presentDays: readonly string[] | null = null;

export function setPresentDays(days: readonly string[]): void {
  presentDays = [...days].sort();
}

export function getPresentDays(): readonly string[] {
  return presentDays ?? [];
}

/**
 * Whole days that have passed since `ref` **and that the user was present for**.
 *
 * `today` always counts as present — the store records it on open, and a
 * missing entry should never make the app forget the user is looking at it.
 * With no log at all (a domain consumer outside the app), this falls back to
 * plain calendar days, which is the behaviour this replaced.
 */
export function presentDaysSince(ref: string, today: string): number {
  if (ref >= today) return 0;
  if (presentDays === null) {
    return Math.max(0, Math.floor((Date.parse(today) - Date.parse(ref)) / DAY));
  }
  let n = 0;
  for (const day of presentDays) {
    if (day > ref && day < today) n++;
  }
  return n + 1; // today itself
}

/**
 * How long the app went unopened before `today` — the gap the return card
 * speaks to. 0 while the user is here daily.
 */
export function daysAwayBefore(today: string): number {
  if (presentDays === null) return 0;
  const previous = presentDays.filter((d) => d < today).pop();
  if (!previous) return 0;
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(previous)) / DAY) - 1);
}

/** Record a day as present, keeping the log bounded. Returns the new log. */
export function withDay(days: readonly string[], day: string, keep = 90): string[] {
  const next = days.includes(day) ? [...days] : [...days, day];
  next.sort();
  return next.slice(-keep);
}
