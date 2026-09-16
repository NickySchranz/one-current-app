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
 * OFF, and the reason has changed twice. Both corrections are worth keeping,
 * because they are the same mistake made at two different depths.
 *
 * The canvas was first turned ON because it measured at half the SVG
 * renderer's idle cost. That was wrong: react-native-skia repaints when a
 * value it is handed CHANGES BY IDENTITY, and the canvas handed back the same
 * mutated path object every frame, so it was not repainting the sway at all.
 * The cheap number was the cost of a canvas that was not drawing.
 *
 * It was then turned OFF on a second measurement — and that one was taken on
 * a build where the same bug was still live in `BranchLinesCanvas` and in the
 * rope benchmark, and where the guard state was kept in shared values the
 * worklet also wrote, which re-triggers the worklet's own mapper and defeats
 * the guard entirely (`mappers.js`: a mapper subscribes to every shared value
 * its worklet reads). Both are fixed. These are the first numbers this file
 * has carried that were taken on a canvas that was actually drawing:
 *
 *   summit, 44 threads, idle     p50          script   dropped/6s
 *     SVG                        16.7ms 60fps  11.9%     0
 *     Skia                       16.7ms 60fps  39.0%    78
 *
 * So SVG still wins here, and the reason is not the one anybody guessed. An
 * ablation that cuts the fill to a third while leaving the geometry identical
 * (`renderer-bench.mjs --layers 1`) HALVES Skia's frame time, and removing
 * the twist — some seven thousand path commands a frame — moves it by 0.4 of
 * a percentage point. The cost is not geometry and not the scene tree. It is
 * rasterisation, and on this box that runs in WebAssembly on a CPU, because
 * headless Chromium falls back to SwiftShader. The SVG it is being compared
 * against is rasterised by the browser's own native, SIMD, multi-threaded
 * Skia. That is not a renderer comparison; it is a build comparison.
 *
 * The decision belongs on a device.
 *
 * **ON as of this build, by request.** The owner wants to see the canvas on
 * real hardware, which is the one thing this box cannot provide — headless
 * Chromium has no GPU. Set `EXPO_PUBLIC_SKIA=0` to put the SVG ropes back.
 */
export const SKIA_ROPES = process.env.EXPO_PUBLIC_SKIA !== "0";

/**
 * Draw the horizontal themes' thread lines on a Skia canvas.
 *
 * OFF, and this flag's old comment described a measurement that never
 * happened: it reported "60fps both at idle" for a canvas whose `drawn` and
 * `dashed` worklets returned the same SkPath object every frame and therefore
 * never repainted. Measured drawing, at 44 threads on the riverbed:
 *
 *                    idle p50        script   dropped/6s
 *     SVG             16.7ms 60fps    37.6%     21
 *     Skia            66.6ms 15fps    20.1%     98
 *
 * Read those two columns together, because they disagree in the useful
 * direction: the canvas does exactly what it was built to do — it takes 37.6%
 * of a frame's script down to 20.1% by deleting forty-four path strings a
 * tick and the SVG attribute writes behind them — and then loses anyway, four
 * times over, on the pixels. Same conclusion as the ropes, arrived at from
 * the opposite side.
 *
 * Measure it somewhere with a GPU.
 *
 * **ON as of this build, by request**, for the same reason as the ropes. Set
 * `EXPO_PUBLIC_SKIA_LINES=0` to put the SVG lines back.
 */
export const SKIA_LINES = process.env.EXPO_PUBLIC_SKIA_LINES !== "0";
