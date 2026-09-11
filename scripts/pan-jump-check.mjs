/* The summit's pan must never show its seams.
 *
 * A drag moves the time frame on a transform and hands the store a real
 * window only every REBASE_PX of travel. At that moment two things change at
 * once — the window the gridlines are computed from, and the transform that
 * was standing in for it — and if they land on different frames the world
 * flicks forward and back by a whole rebase. It is one frame, so a screenshot
 * will never catch it and neither will an assertion about where things ended
 * up; the only way to see it is to watch one date, frame by frame, all the
 * way through.
 *
 * Follow ONE label. After a rebase the set of ticks changes, so "the first
 * text" is a different day and the trace is noise — an earlier version of
 * this check reported 116px jumps that were not there.
 *
 *   node scripts/pan-jump-check.mjs   (after an export with SHOW_TESTING=1)
 */
import { serveDist, launchBrowser } from "./promo-lib.mjs";
const server = await serveDist(new URL("../dist", import.meta.url).pathname, 4392, "");
const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem("one-current-auth", JSON.stringify({ email: "p@onecurrentapp.com" }));
  localStorage.setItem("one-current-tutorial-v1", "done");
  localStorage.setItem("one-current-pro", "1");
  localStorage.setItem("one-current-theme", "summit");
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.split("\n")[0]));
await page.goto("http://localhost:4392/", { waitUntil: "networkidle" });
await page.waitForTimeout(2600);

// Watch the date rail's own text nodes: they are the time frame made visible.
await page.evaluate(() => {
  window.__ys = [];
  const tick = () => {
    const rail = [...document.querySelectorAll("svg")].reduce((a, b) =>
      a && a.getBoundingClientRect().width < b.getBoundingClientRect().width ? a : b);
    // Follow ONE date, by its own label: after a rebase the set of ticks
    // changes, so "the first text" is a different day and the trace is noise.
    const row = {};
    for (const t of rail.querySelectorAll("text")) {
      row[t.textContent] = Math.round(t.getBoundingClientRect().top * 10) / 10;
    }
    window.__ys.push(row);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

await page.mouse.move(60, 700);
await page.mouse.down();
for (let i = 1; i <= 120; i++) {
  await page.mouse.move(60, 700 - i * 4);
  await page.waitForTimeout(8);
}
await page.mouse.up();
await page.waitForTimeout(600);

const rows = await page.evaluate(() => window.__ys);
// A label present in every frame of the trace is one we can follow throughout.
const labels = Object.keys(rows[0] ?? {}).filter((k) => rows.every((r) => r[k] !== undefined));
if (labels.length === 0) { console.log("no label survived the whole drag"); await browser.close(); server.close(); process.exit(1); }
const label = labels[Math.floor(labels.length / 2)];
console.log("following tick", JSON.stringify(label));
const ys = rows.map((r) => r[label]);
const moving = ys.slice(ys.findIndex((v, i) => i > 0 && v !== ys[i - 1]));
let back = 0, worst = 0, biggest = 0;
for (let i = 1; i < moving.length; i++) {
  const d = moving[i] - moving[i - 1];
  if (d > 0.6) { back++; worst = Math.max(worst, d); }   // dragging up: y must fall
  biggest = Math.max(biggest, Math.abs(d));
}
const travel = moving[0] - moving[moving.length - 1];
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"}  ${msg}`); if (!ok) failed = true; };
check(travel > 300, `the drag really pans the time frame (${travel.toFixed(0)}px over ${moving.length} frames)`);
check(back === 0, `no frame goes backwards at a rebase (${back}, worst ${worst.toFixed(1)}px)`);
check(biggest <= 12, `and none of them steps further than the finger did (${biggest.toFixed(1)}px)`);
await browser.close(); server.close();
console.log(failed ? "pan-jump-check: FAILED" : "pan-jump-check: all good");
process.exit(failed ? 1 : 0);
