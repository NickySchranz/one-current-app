export type ZoomLevel = "years" | "months" | "weeks" | "days";

export type TimeWindow = {
  /** ISO date of the left edge. */
  start: string;
  /** ISO date of the right edge; may reach a little past today (the projection band). */
  end: string;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * At most half of the visible span may lie beyond today: panning forward can
 * bring Now to the middle of the screen, leaving room to read the decided
 * actions that continue each line into the future.
 */
export const MAX_FUTURE_FRACTION = 0.5;

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY);
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10);
}

/** Map an ISO date to an x coordinate inside [0, width]. Clamps outside the window. */
export function dateToX(date: string, window: TimeWindow, width: number): number {
  const span = Math.max(1, Date.parse(window.end) - Date.parse(window.start));
  const t = (Date.parse(date) - Date.parse(window.start)) / span;
  return Math.max(0, Math.min(1, t)) * width;
}

/** Same mapping without clamping: dates before the window map to negative x. */
export function dateToXRaw(date: string, window: TimeWindow, width: number): number {
  const span = Math.max(1, Date.parse(window.end) - Date.parse(window.start));
  const t = (Date.parse(date) - Date.parse(window.start)) / span;
  return t * width;
}

export function xToDate(x: number, window: TimeWindow, width: number): string {
  const span = Date.parse(window.end) - Date.parse(window.start);
  const t = Math.max(0, Math.min(1, x / Math.max(1, width)));
  return new Date(Date.parse(window.start) + t * span).toISOString().slice(0, 10);
}

/**
 * The default view: the recent week behind you and the same room ahead —
 * Now sits at the halfway point, with space to read the decided actions.
 */
export function weekWindow(now: Date = new Date()): TimeWindow {
  const today = now.toISOString().slice(0, 10);
  return { start: addDays(today, -4), end: addDays(today, 4) };
}

/** The last year, with Now at the halfway point. */
export function yearWindow(now: Date = new Date()): TimeWindow {
  const today = now.toISOString().slice(0, 10);
  return { start: addDays(today, -365), end: addDays(today, 365) };
}

/** Choose a window that comfortably contains every fork with breathing room. */
export function defaultWindow(forkDates: string[], now: Date = new Date()): TimeWindow {
  const today = now.toISOString().slice(0, 10);
  if (forkDates.length === 0) {
    return { start: addDays(today, -365), end: addDays(today, 365) };
  }
  const earliest = [...forkDates].sort()[0];
  const span = Math.max(120, daysBetween(earliest, today));
  const start = addDays(earliest, -Math.round(span * 0.12));
  // Extend past today a little beyond the halfway point, so Now keeps clear
  // water in front of it — room for Pip's offer bubble at the line ends.
  const future = daysBetween(start, today);
  return { start, end: addDays(today, Math.round(future * 1.15)) };
}

export function zoomLevelForWindow(window: TimeWindow): ZoomLevel {
  const days = daysBetween(window.start, window.end);
  if (days > 540) return "years";
  if (days > 90) return "months";
  if (days > 21) return "weeks";
  return "days";
}

export type TimeTick = { date: string; label: string; major: boolean };

/** Generate readable axis ticks for the current zoom level. */
export function generateTicks(window: TimeWindow, now: Date = new Date()): TimeTick[] {
  const level = zoomLevelForWindow(window);
  const start = parseWindowDate(window.start);
  const end = parseWindowDate(window.end);
  const ticks: TimeTick[] = [];
  const cursor = new Date(start);

  if (level === "years") {
    cursor.setMonth(0, 1);
    if (cursor < start) cursor.setFullYear(cursor.getFullYear() + 1);
    while (cursor <= end) {
      ticks.push({ date: iso(cursor), label: String(cursor.getFullYear()), major: true });
      cursor.setFullYear(cursor.getFullYear() + 1);
    }
  } else if (level === "months") {
    cursor.setDate(1);
    if (cursor < start) cursor.setMonth(cursor.getMonth() + 1);
    while (cursor <= end) {
      ticks.push({
        date: iso(cursor),
        label: cursor.toLocaleDateString(undefined, { month: "short", year: cursor.getMonth() === 0 ? "numeric" : undefined }),
        major: cursor.getMonth() === 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (level === "weeks") {
    cursor.setDate(cursor.getDate() + ((8 - cursor.getDay()) % 7)); // next Monday
    while (cursor <= end) {
      ticks.push({
        date: iso(cursor),
        label: cursor.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        major: cursor.getDate() <= 7,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    while (cursor <= end) {
      const isToday = iso(cursor) === iso(now);
      ticks.push({
        date: iso(cursor),
        label: isToday ? "Today" : cursor.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
        major: isToday,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return ticks;
}

/** Window edges may be day-only ("2026-08-04") or full ISO datetimes. */
function parseWindowDate(value: string): Date {
  return new Date(value.length > 10 ? value : value + "T00:00:00");
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Zoom the window around a focal point (0..1 across the width).
 * When `today` is given, the right edge may extend at most a half-span past it.
 */
export function zoomWindow(window: TimeWindow, factor: number, focal = 0.5, today?: string): TimeWindow {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const span = end - start;
  const newSpan = Math.max(7 * DAY, Math.min(40 * 365 * DAY, span * factor));
  const focalTime = start + span * focal;
  let newStart = focalTime - newSpan * focal;
  let newEnd = focalTime + newSpan * (1 - focal);
  const maxEnd = today ? Date.parse(today) + newSpan * MAX_FUTURE_FRACTION : end;
  if (newEnd > maxEnd) {
    newStart -= newEnd - maxEnd;
    newEnd = maxEnd;
  }
  // Full precision: day-truncation here would swallow small zoom/pan steps.
  return {
    start: new Date(newStart).toISOString(),
    end: new Date(newEnd).toISOString(),
  };
}

/**
 * Pan the window by a fraction of its span. The right edge may move at most a
 * half-span past today; panning back lets the future slide out of view.
 */
export function panWindow(window: TimeWindow, fraction: number, today: string): TimeWindow {
  const span = Date.parse(window.end) - Date.parse(window.start);
  let delta = span * fraction;
  const maxEnd = Date.parse(today) + span * MAX_FUTURE_FRACTION;
  if (Date.parse(window.end) + delta > maxEnd) {
    delta = maxEnd - Date.parse(window.end);
  }
  // Full precision: drag panning arrives in sub-day steps, and truncating to
  // whole days made small pans vanish (the window never reached Now).
  return {
    start: new Date(Date.parse(window.start) + delta).toISOString(),
    end: new Date(Date.parse(window.end) + delta).toISOString(),
  };
}
