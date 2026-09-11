/* The performance harness: drive the heavy scene and report what it costs.
 *
 * Two kinds of number, and they answer different questions.
 *
 *   Frame pacing + script duration (Chrome DevTools Protocol) — "is it
 *   smooth". These are Chromium's numbers on this machine, not a phone's.
 *
 *   Event counters (src/dev/perf-counters) — "what is React doing while the
 *   finger moves". These are platform-independent and are the actual
 *   acceptance criterion: during a drag, renders/geometry/commits should be
 *   flat zero, with one of each per rebase.
 *
 * Needs a build that carries the counters:
 *   EXPO_PUBLIC_PERF=1 npx expo export --platform web --clear
 *   node scripts/perf-probe.mjs [--branches 44] [--theme summit] [--label before]
 */
import { serveDist, launchBrowser } from "./promo-lib.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const BRANCHES = Number(arg("branches", 44));
const THEME = arg("theme", "summit");
const LABEL = arg("label", "run");
const PORT = 4360;

const dist = new URL("../dist", import.meta.url).pathname;
const server = await serveDist(dist, PORT, "");
const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });

await ctx.addInitScript(
  ([theme]) => {
    localStorage.setItem("one-current-auth", JSON.stringify({ email: "perf@onecurrentapp.com" }));
    localStorage.setItem("one-current-tutorial-v1", "done");
    localStorage.setItem("one-current-pro", "1"); // summit is a Pro theme
    localStorage.setItem("one-current-theme", theme);
    localStorage.setItem("one-current-now-mode", "map");
  },
  [THEME],
);

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const hasCounters = await page.evaluate(() => typeof window.__ocPerf !== "undefined");
if (!hasCounters) {
  console.error(
    "No counters in this build. Re-export with EXPO_PUBLIC_PERF=1 — without it\n" +
      "the counter module compiles to no-ops and every number below would be a lie.",
  );
  await browser.close();
  server.close();
  process.exit(2);
}

// Put the heavy scene up.
await page.evaluate((n) => window.__ocLoadStress(n), BRANCHES);
await page.waitForTimeout(3000);

const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");
const metrics = async () =>
  Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));

/** rAF deltas sampled in-page: the honest view of pacing the user sees. */
async function startFrameSampling() {
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (t) => {
      window.__frames.push(t - last);
      last = t;
      window.__framesRaf = requestAnimationFrame(tick);
    };
    window.__framesRaf = requestAnimationFrame(tick);
  });
}
const stopFrameSampling = () =>
  page.evaluate(() => {
    cancelAnimationFrame(window.__framesRaf);
    return window.__frames.slice(1);
  });

const pct = (xs, p) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * p)] : 0);

async function phase(name, body) {
  await page.evaluate(() => window.__ocPerf.reset());
  const before = await metrics();
  await startFrameSampling();
  const t0 = Date.now();
  await body();
  const wallS = (Date.now() - t0) / 1000;
  const frames = await stopFrameSampling();
  const after = await metrics();
  const counters = await page.evaluate(() => window.__ocPerf.snapshot());
  const scriptMs = ((after.ScriptDuration ?? 0) - (before.ScriptDuration ?? 0)) * 1000;
  const layoutMs = ((after.LayoutDuration ?? 0) - (before.LayoutDuration ?? 0)) * 1000;
  const recalcMs = ((after.RecalcStyleDuration ?? 0) - (before.RecalcStyleDuration ?? 0)) * 1000;
  const per = (n) => (n / wallS).toFixed(1);
  console.log(`\n── ${name} (${wallS.toFixed(1)}s, ${BRANCHES} branches, ${THEME}) ──`);
  console.log(
    `  frames    n=${frames.length}  p50 ${pct(frames, 0.5).toFixed(1)}ms  ` +
      `p95 ${pct(frames, 0.95).toFixed(1)}ms  worst ${Math.max(0, ...frames).toFixed(1)}ms  ` +
      `dropped(>32ms) ${frames.filter((f) => f > 32).length}`,
  );
  console.log(
    `  cpu       script ${scriptMs.toFixed(0)}ms (${((scriptMs / (wallS * 1000)) * 100).toFixed(1)}%)  ` +
      `layout ${layoutMs.toFixed(0)}ms  recalc ${recalcMs.toFixed(0)}ms  ` +
      `nodes ${after.Nodes ?? "?"}`,
  );
  console.log(
    `  per sec   renders ${per(counters.total.render)}  geometry ${per(counters.total.geometry)}  ` +
      `commits ${per(counters.total.commit)}  paths ${per(counters.total.path)}`,
  );
  return { name, frames, scriptMs, wallS, counters };
}

/**
 * Drag near the left edge, not the centre. The middle of the stage is where
 * the climber stands and where his quick menu opens, and those intercept the
 * pointer — a centre drag silently does nothing and reports a beautiful zero
 * for every counter. scripts/summit-check.mjs drags at x=60 for the same
 * reason; this follows it.
 */
// Viewport coordinates, not the SVG's box: on the summit the canvas is far
// taller than the window, so a fraction of ITS height lands off-screen and
// the drag quietly hits nothing.
const box = { x: 60, y: Math.round(900 * 0.6) };

console.log(`\n===== ${LABEL} =====`);

await phase("idle", () => page.waitForTimeout(6000));

await phase("drag", async () => {
  // No sleep between moves: the browser delivers them as fast as it can, the
  // way a finger does. Sleeping would let the queue drain and flatter the
  // per-event cost, which is the thing being measured.
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  for (let i = 1; i <= 80; i++) {
    if (THEME === "summit") await page.mouse.move(box.x, box.y - i * 8);
    else await page.mouse.move(box.x + i * 8, box.y);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
});

console.log(errors.length ? `\nPAGE ERRORS: ${errors.slice(0, 3).join(" | ")}` : "\nno page errors");

await browser.close();
server.close();
