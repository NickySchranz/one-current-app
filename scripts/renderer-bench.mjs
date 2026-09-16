/* SVG vs Skia, same scene, same maths — the decision gate.
 *
 * Twenty ropes swaying with the app's own `swayOffsetAt`, three strokes each,
 * nothing else on screen. The SVG side samples the visible slice and
 * serialises a `d` string to three native nodes; the Skia side builds one
 * SkPath of cubics and paints it three times.
 *
 *   EXPO_PUBLIC_PERF=1 npx expo export --platform web --clear
 *   cp public/canvaskit.wasm dist/
 *   node scripts/renderer-bench.mjs
 */
import { serveDist, launchBrowser } from "./promo-lib.mjs";

const PORT = 4370;
const dist = new URL("../dist", import.meta.url).pathname;
const server = await serveDist(dist, PORT, "");
const browser = await launchBrowser();

const pct = (xs, p) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * p)] : 0);

const ROPES = Number(process.argv[process.argv.indexOf("--ropes") + 1]) || 20;
/* Strokes per rope. Geometry is identical at any value; only fill changes,
   which is how "is this renderer building paths or filling pixels?" is asked. */
const LAYERS = Number(process.argv[process.argv.indexOf("--layers") + 1]) || 3;

async function run(mode) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/?bench=${mode}&ropes=${ROPES}&layers=${LAYERS}`, { waitUntil: "networkidle" });
  // Skia has to fetch and compile ~9MB of wasm before it draws anything.
  await page.waitForTimeout(mode === "svg" ? 3000 : 9000);

  const drew = await page.evaluate(() =>
    document.querySelectorAll("canvas").length > 0 || document.querySelectorAll("svg path").length > 0,
  );
  if (!drew) {
    console.log(`${mode.padEnd(7)} DID NOT RENDER — ${errors.slice(0, 2).join(" | ") || "no error reported"}`);
    await ctx.close();
    return;
  }

  /* Prove the scene is actually repainting before timing it.
   *
   * This benchmark once reported that Skia was five times faster than SVG.
   * It was not: the Skia side handed the same mutated SkPath object back on
   * every frame, Reanimated's valueSetter refuses an assignment whose value
   * is already there, and so nothing downstream was ever told. The canvas
   * was not drawing, and a canvas that is not drawing is very fast.
   *
   * Two screenshots a few sway ticks apart cost 200ms and make that class of
   * result impossible to publish by accident. */
  const shot = async () => (await page.locator(mode === "svg" ? "svg" : "canvas").first().screenshot()).toString("base64");
  const before1 = await shot();
  await page.waitForTimeout(140);
  if ((await shot()) === before1) {
    console.log(`${mode.padEnd(7)} DID NOT REPAINT in 140ms — the run is invalid, not fast`);
    await ctx.close();
    return;
  }

  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  const metrics = async () =>
    Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));

  await page.evaluate(() => {
    window.__ocPerf.reset();
    window.__frames = [];
    let last = performance.now();
    const tick = (t) => {
      window.__frames.push(t - last);
      last = t;
      window.__raf = requestAnimationFrame(tick);
    };
    window.__raf = requestAnimationFrame(tick);
  });
  const before = await metrics();
  const t0 = Date.now();
  await page.waitForTimeout(8000);
  const wallS = (Date.now() - t0) / 1000;
  const after = await metrics();
  const frames = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    return window.__frames.slice(1);
  });
  const counters = await page.evaluate(() => window.__ocPerf.snapshot());
  const scriptMs = ((after.ScriptDuration ?? 0) - (before.ScriptDuration ?? 0)) * 1000;
  const layoutMs = ((after.LayoutDuration ?? 0) - (before.LayoutDuration ?? 0)) * 1000;

  console.log(
    `${mode.padEnd(7)} fps ${(frames.length / wallS).toFixed(1).padStart(5)}  ` +
      `p50 ${pct(frames, 0.5).toFixed(1).padStart(5)}ms  p95 ${pct(frames, 0.95).toFixed(1).padStart(5)}ms  ` +
      `worst ${Math.max(0, ...frames).toFixed(0).padStart(4)}ms  ` +
      `script ${((scriptMs / (wallS * 1000)) * 100).toFixed(1).padStart(5)}%  ` +
      `layout ${layoutMs.toFixed(0).padStart(4)}ms  ` +
      `paths/s ${(counters.total.path / wallS).toFixed(0).padStart(5)}  ` +
      `nodes ${after.Nodes ?? "?"}`,
  );
  if (errors.length) console.log(`      errors: ${errors.slice(0, 2).join(" | ")}`);
  await ctx.close();
}

console.log(`\n${ROPES} ropes, ${LAYERS} stroke(s) each, 8s steady state\n`);
await run("svg");
await run("skia");
await run("picture");
await browser.close();
server.close();
