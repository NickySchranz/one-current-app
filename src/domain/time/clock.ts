/**
 * The app's sense of "now": wall time, optionally skewed and optionally
 * running faster than real time. Both exist only for the Testing controls
 * (watching days pass) and are never persisted — reloading the page returns
 * the app to real time.
 *
 * The clock is anchored: app time = anchorApp + (real elapsed) × rate.
 * Changing the rate folds the elapsed time into the anchor first, so the
 * clock never jumps when the speed changes.
 */
let anchorRealMs = Date.now();
let anchorAppMs = anchorRealMs;
let rate = 1;

function appNowMs(): number {
  return anchorAppMs + (Date.now() - anchorRealMs) * rate;
}

export function appNow(): Date {
  return new Date(appNowMs());
}

/** How far ahead of real time the app is living right now. */
export function getSkewMs(): number {
  return appNowMs() - Date.now();
}

/** Set the skew outright (testing reset). Also returns the clock to 1×. */
export function setSkewMs(ms: number): void {
  anchorRealMs = Date.now();
  anchorAppMs = anchorRealMs + ms;
  rate = 1;
}

/** Jump the clock forward without touching the rate. */
export function advanceSkew(ms: number): void {
  anchorAppMs += ms;
}

export function getRate(): number {
  return rate;
}

/** How many app-milliseconds pass per real millisecond (1 = real time). */
export function setRate(next: number): void {
  const nowReal = Date.now();
  anchorAppMs = appNowMs();
  anchorRealMs = nowReal;
  rate = next;
}
