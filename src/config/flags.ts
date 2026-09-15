/**
 * Testing affordances (fast clock, local Pro unlock, super-bonk fill, server
 * address override) are for development and review builds only. Production
 * builds hide them entirely; set EXPO_PUBLIC_SHOW_TESTING=1 to bring them
 * back in a special build.
 */
export const SHOW_TESTING = __DEV__ || process.env.EXPO_PUBLIC_SHOW_TESTING === "1";

/**
 * The testing panel (fast clock, Pro unlock, super-bonk fill, always-drop
 * tokens) exists ONLY in capture builds — the promo footage scripts drive the
 * app through it. Not even dev builds show it; export with
 * EXPO_PUBLIC_SHOW_TESTING=1 to get one.
 */
export const CAPTURE_TESTING = process.env.EXPO_PUBLIC_SHOW_TESTING === "1";

/**
 * Performance counters and the stress fixture.
 *
 * Deliberately its own flag rather than riding SHOW_TESTING: that one is
 * currently ON in production by request, and counters have no business
 * shipping to people. The harness exports with EXPO_PUBLIC_PERF=1; nothing
 * else ever sets it, so a normal build carries no-ops that the engine
 * inlines away.
 */
export const PERF_COUNTERS = __DEV__ || process.env.EXPO_PUBLIC_PERF === "1";

/**
 * Draw the summit's ropes on a Skia canvas instead of as SVG paths.
 *
 * OFF, and the reason is a correction rather than a preference.
 *
 * The canvas was turned on because it measured at half the SVG renderer's
 * idle cost. That measurement was wrong, and the way it was wrong is worth
 * keeping: react-native-skia repaints when a value it is handed CHANGES by
 * identity, and the canvas handed back the same mutated path object every
 * frame. So it was not repainting the sway at all — it redrew only when
 * something made React re-render, which is why on a phone the ropes swayed
 * while the mountain was being turned and stopped dead the moment it settled.
 * The cheap number was the cost of a canvas that was not drawing.
 *
 * Made to draw properly (see the two paths in SummitRopesCanvas), the same
 * scene measures, at 44 threads:
 *
 *              idle p50        idle script   drag p50     dropped (idle)
 *   Skia       33.3ms (30fps)  49.5%         116.7ms      159
 *   SVG        16.7ms (60fps)  13.5%          16.7ms        0
 *
 * So the SVG ropes are not the fallback; they are the faster renderer here.
 * The canvas stays behind this flag — it is written, correct, and might yet
 * win on hardware with a GPU, which this box does not have — but nothing
 * ships on it. `EXPO_PUBLIC_SKIA=1` turns it on to measure.
 */
export const SKIA_ROPES = process.env.EXPO_PUBLIC_SKIA === "1";

/**
 * Draw the horizontal themes' thread lines on a Skia canvas.
 *
 * OFF by default, and the reason is a measurement rather than a doubt about
 * the code. On the summit the canvas is a clear win: about half the script
 * cost and well under half the style recalculation, with the same frame
 * pacing. On the riverbed maps the same change is close to a wash — it trades
 * script for fill, and the twelve-odd full-width wavy lines on screen are a
 * great deal more stroke area than a handful of short ropes:
 *
 *   44 threads, riverbed, same code, SVG vs Skia
 *   idle  60fps both   script 22.8% -> 18.3%   recalc 159ms -> 64ms
 *   drag  p50 33.3ms both   p95 50ms -> 67ms   dropped 135 -> 170
 *
 * The box those numbers come from has no GPU: headless Chromium falls back to
 * SwiftShader, which is the condition that most favours the browser's own
 * rasteriser and most punishes a canvas. On real hardware the fill is close
 * to free and the script saving should stand — but that has not been
 * measured, so the default follows the evidence there is. Set
 * EXPO_PUBLIC_SKIA_LINES=1 to turn it on and measure it somewhere with a GPU.
 */
export const SKIA_LINES = process.env.EXPO_PUBLIC_SKIA_LINES === "1";
