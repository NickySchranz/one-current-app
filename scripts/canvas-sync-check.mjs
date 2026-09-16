/* The Skia canvas and the SVG draw the same world from two different places:
 * the SVG lives inside the scroller and is moved by it, the canvas is pinned
 * beside it and reconstructs the same motion. Nothing in the app fails loudly
 * when those two disagree — the map simply looks wrong, which is how a frozen
 * line and a stale scroll offset both shipped.
 *
 * So this asks the only question that matters: does every thread the canvas
 * drew still sit under the SVG hit path that belongs to it, through the things
 * that used to break it?
 *
 *   EXPO_PUBLIC_PERF=1 EXPO_PUBLIC_SHOW_TESTING=1 npx expo export --platform web --clear
 *   cp public/canvaskit.wasm dist/
 *   node scripts/canvas-sync-check.mjs
 *
 * Needs SHOW_TESTING (for `window.__ocLines`) and the Skia flags left at their
 * defaults, which are on.
 */
import { serveDist, launchBrowser } from "./promo-lib.mjs";

const PORT = 4396;
const dist = new URL("../dist", import.meta.url).pathname;
const server = await serveDist(dist, PORT, "");
const browser = await launchBrowser();

let failures = 0;
const ok = (msg) => console.log(`ok   ${msg}`);
const fail = (msg) => {
  failures++;
  console.log(`FAIL ${msg}`);
};

/**
 * Where the canvas drew the threads, and where the SVG put theirs.
 *
 * Reported as two independent distributions rather than as a per-line gap, and
 * that is the whole point of the measurement. Pairing each canvas line to its
 * NEAREST hit path sounds stricter and is in fact blind to the failure being
 * looked for: when every line shifts by the same amount, nearest-neighbour
 * matching simply re-pairs them and reports that all is well. A uniform offset
 * is exactly what a stale camera and a frozen rebuild both produce. So the
 * check compares how far each LAYER moved, and asks them to agree.
 */
const readWorld = (page) =>
  page.evaluate(() => {
    const canvas = [];
    for (const [, probe] of window.__ocLines ?? []) {
      const b = probe();
      if (b && b.w > 20) canvas.push(b.y);
    }
    const svg = [...document.querySelectorAll('path[stroke="transparent"]')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 20)
      .map((r) => r.top);
    const scroller = [...document.querySelectorAll("div")].find(
      (d) => d.scrollHeight > d.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(d).overflowY),
    );
    return { canvas, svg, scrollTop: scroller ? Math.round(scroller.scrollTop) : null };
  });

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** How far each layer travelled between two readings. They must agree. */
const travel = (a, b) => ({
  canvas: Math.round(median(b.canvas) - median(a.canvas)),
  svg: Math.round(median(b.svg) - median(a.svg)),
});

async function run({ label, reducedMotion }) {
  /**
   * PHONE width, and that is not incidental.
   *
   * `OperationTray.tsx:158` gives a quick tray its own column at 900px and up,
   * where it costs the stage nothing. Below that it is a bottom sheet, the
   * scroll content grows by its height and shrinks back on the way out, and
   * the scroller clamps its own offset — which is the whole mechanism this
   * check exists for. Run it on a desktop viewport and every assertion passes
   * against code that is broken.
   */
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ...(reducedMotion ? { reducedMotion: "reduce" } : null),
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("one-current-auth", JSON.stringify({ email: "perf@onecurrentapp.com" }));
    localStorage.setItem("one-current-tutorial-v1", "done");
    localStorage.setItem("one-current-pro", "1");
    localStorage.setItem("one-current-theme", "riverbed");
    localStorage.setItem("one-current-now-mode", "map");
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  // CanvasKit is ~9MB of wasm before anything draws.
  await page.waitForTimeout(9000);
  await page.evaluate(() => window.__ocLoadStress?.(16));
  await page.waitForTimeout(3500);

  const rest = await readWorld(page);
  if (rest.canvas.length < 5) {
    fail(`${label}: only ${rest.canvas.length} threads on the canvas — the scene never loaded`);
    await ctx.close();
    return;
  }

  /* 1. THE LEAN. Focusing a thread shifts `mainY` so every lane moves, and it
   *    does it WITHOUT changing the thread count — so nothing rebuilds the
   *    draw worklet and a line has only its own dirty guard to notice with. A
   *    quiet line has no tick to notice by. This is the case that froze. */
  const pt = await page.evaluate(() => {
    for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
      const r = el.getBoundingClientRect();
      if (r.width > 60 && r.top > 140 && r.bottom < 640) {
        const p = el.getPointAtLength(el.getTotalLength() * 0.5);
        const m = el.getScreenCTM();
        return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
      }
    }
    return null;
  });
  if (!pt) {
    fail(`${label}: no thread on screen to open`);
    await ctx.close();
    return;
  }
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(450);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(1800);

  const leaned = await readWorld(page);
  const t1 = travel(rest, leaned);
  if (Math.abs(t1.svg) < 8) {
    console.log(`     (the lean moved the lanes by only ${t1.svg}px — weak signal)`);
  }
  if (Math.abs(t1.canvas - t1.svg) > 6) {
    fail(
      `${label}: focusing leaned the map and the canvas did not follow ` +
        `(svg moved ${t1.svg}px, canvas moved ${t1.canvas}px)`,
    );
  } else {
    ok(`${label}: the canvas follows the lean (both moved ${t1.svg}px)`);
  }

  /* 2. AND BACK. Closing shrinks the scroll content again, and the scroller
   *    clamps its own offset on the way out — a clamp that is not always a
   *    scroll event, which is how the canvas kept a scroll position the
   *    scroller had already abandoned. */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1800);

  const closed = await readWorld(page);
  const t2 = travel(leaned, closed);
  if (Math.abs(t2.canvas - t2.svg) > 6) {
    fail(
      `${label}: closing the panel left the canvas behind ` +
        `(svg moved ${t2.svg}px, canvas moved ${t2.canvas}px, ` +
        `scrollTop ${leaned.scrollTop} → ${closed.scrollTop})`,
    );
  } else {
    ok(`${label}: the canvas follows the panel closing (both moved ${t2.svg}px)`);
  }

  /* 3. Round trip: back where it started, on both layers. */
  const t3 = travel(rest, closed);
  if (Math.abs(t3.canvas - t3.svg) > 6) {
    fail(`${label}: after a full cycle the layers disagree by ${Math.abs(t3.canvas - t3.svg)}px`);
  } else {
    ok(`${label}: a full focus cycle leaves the two layers together`);
  }

  if (errors.length) fail(`${label}: page errors — ${errors.slice(0, 2).join(" | ")}`);
  await ctx.close();
}

// Reduced motion is the harsh case: with no slither and no wave there is no
// tick to hide a frozen line behind.
await run({ label: "moving", reducedMotion: false });
await run({ label: "reduced-motion", reducedMotion: true });

console.log(failures === 0 ? "\ncanvas-sync-check: all good" : `\n${failures} check(s) failed.`);
await browser.close();
server.close();
process.exit(failures === 0 ? 0 : 1);
