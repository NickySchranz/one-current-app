/* Summit-theme check: forces Pro + the summit theme via storage seeding
   (the static dist is offline, so no server plan can revert it), then
   asserts the map really turned on end — vertical ropes, anchors near the
   ledge, vertical drag pans time, horizontal drag on a rope dials loudness,
   the pill reads Chalk!, and no SVG group leaked an HTML button (the
   react-native-svg web landmine). */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";

const DIST = new URL("../dist", import.meta.url).pathname;
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ico": "image/x-icon",
};
const server = createServer(async (req, res) => {
  const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(4179, r));

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ["--no-sandbox"],
  // this box has no root: chromium's shared libs live in the cache dir
  env: {
    ...process.env,
    LD_LIBRARY_PATH: `${process.env.HOME}/.cache/one-current-chromium-libs/usr/lib/x86_64-linux-gnu`,
  },
});
const errors = [];
const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok " : "FAIL"}  ${label}`);
  if (!ok) failures.push(label);
};
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
  localStorage.setItem("one-current-tutorial-v1", "done");
  // Pro + summit: loadSettings honors a saved Pro theme when the local Pro
  // flag is set (SHOW_TESTING build) and the offline dist never overrides it.
  localStorage.setItem("one-current-pro", "1");
  localStorage.setItem("one-current-theme", "summit");
});
await page.goto("http://localhost:4179/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// example data, then back to the map
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Load example threads" }).click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: "Now", exact: true }).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/summit-01-map.png" });

// ── 1. ropes run vertically; anchors gather near the ledge (top) ──
const ropes = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
    const len = el.getTotalLength();
    if (!len) continue;
    const m = el.getScreenCTM();
    const at = (l) => {
      const p = el.getPointAtLength(l);
      return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
    };
    out.push({ start: at(0), end: at(len) });
  }
  return out;
});
check(ropes.length > 0, `found ${ropes.length} rope hit paths`);
const verticalCount = ropes.filter(
  (r) => Math.abs(r.end.y - r.start.y) >= Math.abs(r.end.x - r.start.x),
).length;
check(
  verticalCount >= Math.ceil(ropes.length / 2),
  `ropes are vertical (${verticalCount}/${ropes.length} steeper than wide)`,
);
// The climbing camera keeps the ledge between the top edge (unanswered day)
// and screen center (day complete) — anchors never hang in the bottom half.
check(
  ropes.some((r) => r.end.y < 800 * 0.55),
  "at least one anchor hangs in the upper half (the ledge)",
);

// ── 2. the pill speaks climbing ──
check(await page.getByText("Chalk!").first().isVisible().catch(() => false), 'pill reads "Chalk!"');

// ── 3. no accessibility role leaked onto an SVG group ──
const svgButtons = await page.evaluate(() => document.querySelectorAll("svg button").length);
check(svgButtons === 0, "no <button> inside <svg>");

// ── 4. vertical drag pans time (Return to Now appears once away) ──
// Drag UP: into the past. (Downward pans forward, where the window is
// already clamped at Now + half a span.)
const awayBefore = await page.getByText("Return to Now").first().isVisible().catch(() => false);
await page.mouse.move(60, 540);
await page.mouse.down();
for (let i = 1; i <= 14; i++) await page.mouse.move(60, 540 - i * 16);
await page.mouse.up();
await page.waitForTimeout(800);
const awayAfter = await page.getByText("Return to Now").first().isVisible().catch(() => false);
check(!awayBefore && awayAfter, "vertical drag pans through time");
await page.screenshot({ path: "/tmp/summit-02-panned.png" });
await page.getByText("Return to Now").first().click();
await page.waitForTimeout(1200);

// ── 5. horizontal drag on a rope dials its loudness ──
const loudnessSnapshot = () =>
  page.evaluate(() => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) ?? "";
      if (!v.includes("loudness")) continue;
      try {
        const data = JSON.parse(v);
        const arr = Array.isArray(data) ? data : Object.values(data);
        for (const b of arr.flat()) {
          if (b && typeof b === "object" && "loudness" in b) out.push(`${b.title}:${b.loudness}`);
        }
      } catch {}
    }
    return out.sort().join("|");
  });
const before = await loudnessSnapshot();
const pt = await page.evaluate(() => {
  const el = document.querySelector('path[stroke="transparent"]');
  const p = el.getPointAtLength(el.getTotalLength() * 0.6);
  const m = el.getScreenCTM();
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
});
// leftward = quieter (a fresh example thread never starts at 1, so a
// change is guaranteed; rightward could no-op on an already-loud rope)
await page.mouse.move(pt.x, pt.y);
await page.mouse.down();
for (let i = 1; i <= 14; i++) await page.mouse.move(pt.x - i * 8, pt.y);
await page.screenshot({ path: "/tmp/summit-03-dial-mid.png" });
await page.mouse.up();
await page.waitForTimeout(1200);
const after = await loudnessSnapshot();
check(before !== after && after.length > 0, "horizontal drag dials loudness");

await page.screenshot({ path: "/tmp/summit-04-final.png" });
await page.close();

// ── 6. the climbing camera: peak hidden, pin, monotonic descent, rail ──
{
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  p2.on("pageerror", (e) => errors.push(e.message));
  await p2.addInitScript(() => {
    localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
    localStorage.setItem("one-current-tutorial-v1", "done");
    localStorage.setItem("one-current-pro", "1");
    localStorage.setItem("one-current-theme", "summit");
  });
  await p2.goto("http://localhost:4179/", { waitUntil: "networkidle" });
  await p2.waitForTimeout(1500);
  await p2.getByRole("button", { name: "More" }).first().click();
  await p2.waitForTimeout(500);
  await p2.getByRole("button", { name: "Load example threads" }).click();
  await p2.waitForTimeout(800);
  // leave exactly ONE rope unhandled: mark every other open branch rested today
  const seeded = await p2.evaluate(() => {
    const key = "one-current/table/branches";
    const rows = JSON.parse(localStorage.getItem(key) ?? "[]");
    const today = new Date().toISOString().slice(0, 10);
    const open = rows.filter((b) => b.status !== "merged" && b.status !== "converted-to-project" && !b.mergeDate);
    let left = 0;
    for (const b of open) {
      const handled = b.lastDecisionOn === today || b.leftOn === today;
      if (handled) continue;
      if (left === 0) { left++; continue; } // keep the first unhandled hanging
      b.leftOn = today;
      b.lastDecisionOn = today;
    }
    localStorage.setItem(key, JSON.stringify(rows));
    return open.length;
  });
  await p2.reload({ waitUntil: "networkidle" });
  await p2.waitForTimeout(2500);
  const capTop = () =>
    p2.evaluate(() => {
      const cap = [...document.querySelectorAll('path[fill="#ffffff"]')].find(
        (el) => el.getAttribute("opacity") === "0.65",
      );
      return cap ? cap.getBoundingClientRect().top : null;
    });
  const topBefore = await capTop();
  check(topBefore !== null && topBefore < -20, `peak off-screen with one rope left (cap top ${Math.round(topBefore ?? 0)})`);
  // start a monotonicity sampler on the WORLD group — the first g of the
  // widest svg (the header logo and the date rail are svgs too)
  await p2.evaluate(() => {
    window.__cam = [];
    const svg = [...document.querySelectorAll("svg")].sort(
      (a, b) => Number(b.getAttribute("width") ?? 0) - Number(a.getAttribute("width") ?? 0),
    )[0];
    const g = svg?.querySelector(":scope > g");
    const read = () => {
      const m = /translate\([^,]+,\s*([-\d.]+)/.exec(g?.getAttribute("transform") ?? "");
      window.__cam.push(m ? Number(m[1]) : 0);
      if (window.__cam.length < 400) requestAnimationFrame(read);
    };
    requestAnimationFrame(read);
  });
  const lastRope = p2.locator('path[stroke="transparent"]').first();
  const pt2 = await p2.evaluate(() => {
    // the one open rope: pick a hit path whose top end sits in the upper half
    for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
      const len = el.getTotalLength();
      if (!len) continue;
      const m = el.getScreenCTM();
      const a = el.getPointAtLength(len);
      const y = m.b * a.x + m.d * a.y + m.f;
      const x = m.a * a.x + m.c * a.y + m.e;
      if (y < 400) {
        const mid = el.getPointAtLength(len * 0.5);
        return { x: m.a * mid.x + m.c * mid.y + m.e, y: m.b * mid.x + m.d * mid.y + m.f };
      }
    }
    return null;
  });
  check(!!pt2, "found the last hanging rope");
  await p2.mouse.click(pt2.x, pt2.y);
  await p2.waitForTimeout(500);
  await p2.mouse.click(pt2.x, pt2.y);
  await p2.waitForTimeout(1200);
  await p2.getByText("What does this rope need from you now?", { exact: false }).first().click();
  await p2.waitForTimeout(700);
  await p2.getByText("Let it rest", { exact: false }).first().click();
  await p2.waitForTimeout(4200);
  const cam = await p2.evaluate(() => window.__cam);
  let monotonic = true;
  const dips = [];
  for (let i = 1; i < cam.length; i++)
    if (cam[i] < cam[i - 1] - 0.01) { monotonic = false; dips.push(`${i}:${cam[i - 1]}->${cam[i]}`); }
  if (dips.length) console.log("  dips:", dips.slice(0, 6).join("  "));
  check(cam.length > 60 && monotonic, `world only ever moves down during the climb (${cam.length} samples)`);
  const topAfter = await capTop();
  const stageH = 800 - 48;
  check(
    topAfter !== null && Math.abs(topAfter - (48 + stageH * 0.3)) < 30,
    `top-out frames the summit near 30% from the top (cap top ${Math.round(topAfter ?? 0)})`,
  );
  await p2.screenshot({ path: "/tmp/summit-05-topout.png" });
  await p2.close();
}
await browser.close();
server.close();

if (errors.length) console.log("console errors:\n" + errors.slice(0, 10).join("\n"));
if (failures.length || errors.length) {
  console.log(`\n${failures.length} check(s) failed, ${errors.length} console error(s).`);
  process.exit(1);
}
console.log("\nsummit-check: all good");
