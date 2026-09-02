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

/** Every visible rope's column — a turn shows up as a new arrangement. */
const ropeColumns = (pg) =>
  pg.evaluate(() => {
    const xs = [];
    for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
      const len = el.getTotalLength();
      if (len < 80) continue;
      const a = el.getPointAtLength(0);
      const b = el.getPointAtLength(len);
      if (Math.abs(len - Math.abs(b.y - a.y)) > 3) continue;
      let o = 1;
      for (let n = el; n && n.tagName !== "svg"; n = n.parentElement)
        o *= Number(getComputedStyle(n).opacity);
      if (o < 0.6) continue;
      const m = el.getScreenCTM();
      xs.push(Math.round(m.a * a.x + m.c * a.y + m.e));
    }
    return xs.sort((p, q) => p - q);
  });

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
  for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
    const len = el.getTotalLength();
    if (!len) continue;
    // only a rope facing the viewer: the ones round the back of the mountain
    // are drawn away to nothing and take no taps. The opacity that matters is
    // the product up the whole ancestor chain (the ring group is not the hit
    // path's immediate parent).
    let o = 1;
    for (let n = el; n && n.tagName !== "svg"; n = n.parentElement)
      o *= Number(getComputedStyle(n).opacity);
    if (o < 0.6) continue;
    const m = el.getScreenCTM();
    for (let f = 0.05; f < 0.96; f += 0.06) {
      const p = el.getPointAtLength(len * f);
      const x = m.a * p.x + m.c * p.y + m.e;
      const y = m.b * p.x + m.d * p.y + m.f;
      if (y > 130 && y < 690 && x > 30 && x < 1200) return { x, y };
    }
  }
  return null;
});
// A drag that STARTS on a rope means the same as a drag anywhere else:
// sideways turns the mountain. Loudness is the panel's business alone.
const colsBefore = await ropeColumns(page);
// Far enough to carry the face a whole rope round: a short drag settles
// back onto the rope it started on, which would prove nothing.
const dir = pt.x > 640 ? -1 : 1;
await page.mouse.move(pt.x, pt.y);
await page.mouse.down();
for (let i = 1; i <= 20; i++) await page.mouse.move(pt.x + dir * i * 20, pt.y);
await page.screenshot({ path: "/tmp/summit-03-turn-mid.png" });
await page.mouse.up();
await page.waitForTimeout(1200);
const after = await loudnessSnapshot();
const colsAfter = await ropeColumns(page);
check(before === after && after.length > 0, "a drag on a rope does NOT dial its loudness");
const turnedByDrag = colsAfter.some((x) => !colsBefore.some((y) => Math.abs(x - y) < 24));
check(turnedByDrag, "a sideways drag on a rope turns the mountain instead");

await page.screenshot({ path: "/tmp/summit-04-final.png" });
await page.close();

// ── 6. the climbing camera: peak hidden, monotonic climb, top-out ──
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
  const reseed = (mode) =>
    p2.evaluate((m) => {
      const key = "one-current/table/branches";
      const rows = JSON.parse(localStorage.getItem(key) ?? "[]");
      const today = new Date().toISOString().slice(0, 10);
      const open = rows.filter(
        (b) => b.status !== "merged" && b.status !== "converted-to-project" && !b.mergeDate,
      );
      let kept = 0;
      for (const b of open) {
        if (m === "fresh") {
          if (b.leftOn === today) delete b.leftOn;
          if (b.lastDecisionOn === today) b.lastDecisionOn = undefined;
        } else {
          const handled = b.lastDecisionOn === today || b.leftOn === today;
          if (!handled && kept === 0) { kept++; continue; }
          b.leftOn = today;
          b.lastDecisionOn = today;
        }
      }
      localStorage.setItem(key, JSON.stringify(rows));
      return open.length;
    }, mode);
  const capTop = () =>
    p2.evaluate(() => {
      const cap = [...document.querySelectorAll('path[fill="#ffffff"]')].find(
        (el) => el.getAttribute("opacity") === "0.65",
      );
      return cap ? cap.getBoundingClientRect().top : null;
    });
  // Screen y of every hanging rope's ANCHOR (a straight vertical hit path is
  // an open cliff rope, M dangle L anchor; closed history keeps its curves).
  const anchorTops = () =>
    p2.evaluate(() => {
      const tops = [];
      for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
        const len = el.getTotalLength();
        if (len < 80) continue;
        const a = el.getPointAtLength(0);
        const b = el.getPointAtLength(len);
        if (Math.abs(len - Math.abs(b.y - a.y)) > 3) continue;
        const m = el.getScreenCTM();
        const hi = b.y < a.y ? b : a;
        tops.push(m.b * hi.x + m.d * hi.y + m.f);
      }
      return tops;
    });
  const nowLabelY = () =>
    p2.evaluate(() => {
      const el = [...document.querySelectorAll("text")].find((t) => t.textContent === "Now");
      return el ? Math.round(el.getBoundingClientRect().top) : null;
    });
  /** The snow cap's box, and where the Now marker is. The face may pan
   * sideways to keep the climber in view (that is the summit's horizontal
   * scroll), but the mountain must never move RELATIVE to the timeline — that
   * would be the route leaning and dragging the rock with it. */
  const capBox = () =>
    p2.evaluate(() => {
      const cap = [...document.querySelectorAll('path[fill="#ffffff"]')].find(
        (el) => el.getAttribute("opacity") === "0.65",
      );
      const nowEl = [...document.querySelectorAll("text")].find((t) => t.textContent === "Now");
      if (!cap || !nowEl) return null;
      const b = cap.getBoundingClientRect();
      const n = nowEl.getBoundingClientRect();
      return {
        left: Math.round(b.left),
        top: Math.round(b.top),
        w: Math.round(b.width),
        h: Math.round(b.height),
        offset: Math.round(b.left - n.left),
      };
    });
  /** Screen y of a point on an INTEGRATED thread's curve (a curved hit path). */
  const closedCurveY = () =>
    p2.evaluate(() => {
      for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
        const len = el.getTotalLength();
        if (len < 40) continue;
        const a = el.getPointAtLength(0);
        const b = el.getPointAtLength(len);
        if (Math.abs(len - Math.abs(b.y - a.y)) <= 3) continue; // straight = open rope
        const m = el.getScreenCTM();
        const q = el.getPointAtLength(len * 0.5);
        return Math.round(m.b * q.x + m.d * q.y + m.f);
      }
      return null;
    });
  const nowBeforeSheet = await nowLabelY();
  const capBeforeFocus = await capBox();
  /** Screen y of every answered rope's cliff edge (its coil). */
  const coilYs = () =>
    p2.evaluate(() =>
      [...document.querySelectorAll('circle[fill="transparent"]')]
        .filter((c) => Number(c.getAttribute("r")) === 22)
        .map((c) => c.getBoundingClientRect().top + 22),
    );
  /** How many ropes still hang on the face (straight vertical hit paths). */
  const ropeCount = () =>
    p2.evaluate(() => {
      let n = 0;
      for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
        const len = el.getTotalLength();
        if (len < 80) continue;
        const a = el.getPointAtLength(0);
        const b = el.getPointAtLength(len);
        if (Math.abs(len - Math.abs(b.y - a.y)) <= 3) n++;
      }
      return n;
    });
  // fresh day: he stands at Now, every rope hanging from out of view,
  // the summit far out of sight
  await reseed("fresh");
  await p2.reload({ waitUntil: "networkidle" });
  await p2.waitForTimeout(2500);
  await p2.screenshot({ path: "/tmp/summit-05-freshday.png" });
  const topFresh = await capTop();
  check(topFresh !== null && topFresh < -40, `peak out of view on a fresh day (cap top ${Math.round(topFresh ?? 0)})`);
  const topsFresh = await anchorTops();
  check(
    topsFresh.length >= 4 && topsFresh.every((t) => t < 0),
    `every waiting rope hangs from out of view (${topsFresh.length} anchors, worst ${Math.round(Math.max(...topsFresh, -9999))})`,
  );
  // one rope left: answer it, watching the world only ever move down
  await reseed("one-left");
  await p2.reload({ waitUntil: "networkidle" });
  await p2.waitForTimeout(2500);
  const topOneLeft = await capTop();
  check(
    topOneLeft !== null && topOneLeft < -40,
    `the summit is still out of view with one rope left (cap top ${Math.round(topOneLeft ?? 0)})`,
  );
  const topsLeft = await anchorTops();
  check(
    topsLeft.length === 1 && topsLeft.every((t) => t < 0),
    `the one rope left to climb starts out of view (${topsLeft.length} anchor(s), top ${Math.round(topsLeft[0] ?? 9999)})`,
  );
  const ropePoint = () =>
    p2.evaluate(() => {
      for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
        const len = el.getTotalLength();
        if (len < 80) continue;
        const a = el.getPointAtLength(0);
        const b = el.getPointAtLength(len);
        if (Math.abs(len - Math.abs(b.y - a.y)) > 3) continue;
        const m = el.getScreenCTM();
        for (let f = 0.05; f < 0.96; f += 0.04) {
          const q = el.getPointAtLength(len * f);
          const x = m.a * q.x + m.c * q.y + m.e;
          const y = m.b * q.x + m.d * q.y + m.f;
          if (y > 130 && y < 690 && x > 30 && x < 1200) return { x, y };
        }
      }
      return null;
    });
  const pt2 = await p2.evaluate(() => {
    // the hanging rope: a STRAIGHT vertical hit path (an open cliff rope is
    // M..L; closed history keeps its curved time geometry)
    for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
      const len = el.getTotalLength();
      if (len < 80) continue;
      const a = el.getPointAtLength(0);
      const b = el.getPointAtLength(len);
      if (Math.abs(len - Math.abs(b.y - a.y)) > 3) continue; // curved → closed
      const m = el.getScreenCTM();
      for (let f = 0.05; f < 0.96; f += 0.04) {
        const p = el.getPointAtLength(len * f);
        const x = m.a * p.x + m.c * p.y + m.e;
        const y = m.b * p.x + m.d * p.y + m.f;
        if (y > 130 && y < 690 && x > 30 && x < 1200) return { x, y };
      }
    }
    return null;
  });
  check(!!pt2, "found the last hanging rope");
  await p2.mouse.click(pt2.x, pt2.y);
  await p2.waitForTimeout(2000);
  // One tap sends him over and he takes hold. A SECOND tap on the rope now
  // shins him up it and quiets it, so the way to the decisions sheet is to
  // tap the climber himself — resolved live, since he may have been raised.
  const pipBox = await p2.evaluate(() => {
    const sprite = [...document.querySelectorAll("svg g")].find(
      (g) => g.querySelectorAll(":scope > rect").length > 12,
    );
    if (!sprite) return null;
    const r = sprite.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  check(!!pipBox, "found the climber on the rope");
  if (pipBox) await p2.mouse.click(pipBox.x, pipBox.y);
  await p2.waitForTimeout(1200);
  // the sheet is up now: its inset must not have moved the time frame, and
  // focusing the rope must not have slid the mountain sideways
  const nowWithSheet = await nowLabelY();
  const capWithFocus = await capBox();
  // A tray inset would compress the time axis and shift Now by tens of px.
  // The 1px allowance is the same pinned-chip coupling the check below names:
  // arming a rope changes topInset, which nudges nowScreenY sub-pixel.
  check(
    nowBeforeSheet !== null &&
      nowWithSheet !== null &&
      Math.abs(nowWithSheet - nowBeforeSheet) <= 1,
    `the tray moves nothing (Now ${nowBeforeSheet} → ${nowWithSheet})`,
  );
  // The route must never LEAN toward a focused rope: routeX places the rock,
  // its texture, the summit dashes and every rope column, so a lean would
  // drag the whole mountain sideways (tens of px). The 5px allowance is a
  // known, separate coupling: arming a rope raises its pinned chip, which
  // changes topInset, which changes timeLen, which resizes the rock's
  // profile by ~4px. Present on the summit since the pinned chip was; not a
  // lean, and it does not move the rock relative to Now by more than a hair.
  check(
    capBeforeFocus !== null &&
      capWithFocus !== null &&
      Math.abs(capWithFocus.offset - capBeforeFocus.offset) <= 5,
    `the mountain never leans toward a focused rope (offset ${capBeforeFocus?.offset} → ${capWithFocus?.offset})`,
  );
  const closedBefore = await closedCurveY();
  await p2.getByText("What does this rope need from you now?", { exact: false }).first().click();
  await p2.waitForTimeout(700);
  // sample from the answer on: the climb + party must never move the world up
  await p2.evaluate(() => {
    window.__cam = [];
    const svg = [...document.querySelectorAll("svg")].sort(
      (a, b) => Number(b.getAttribute("width") ?? 0) - Number(a.getAttribute("width") ?? 0),
    )[0];
    // the mountain's own motion, measured on the snow cap itself (the layer
    // transform lives on an animated group whose attribute the renderer may
    // write in different shapes — the rendered box cannot lie)
    // resolved per frame: React can replace the node, and a detached one
    // reports a zero-sized box (which reads as "nothing moved")
    const findCap = () =>
      [...document.querySelectorAll('path[fill="#ffffff"]')].find(
        (el) => el.getAttribute("opacity") === "0.65",
      );
    const nowLabel = [...document.querySelectorAll("text")].find(
      (el) => el.textContent === "Now",
    );
    const read = () => {
      const cap = findCap();
      window.__cam.push([
        cap ? Math.round(cap.getBoundingClientRect().top) : 0,
        nowLabel ? Math.round(nowLabel.getBoundingClientRect().top) : 0,
        0,
      ]);
      if (window.__cam.length < 420) requestAnimationFrame(read);
    };
    requestAnimationFrame(read);
  });
  // Race-free version of "a cliff edge never appears on screen": with him
  // standing on the topmost ledge, one rung further up must already be above
  // the stage's top edge (48px — under the header), so the ledge he earns
  // next is out of view at the moment he earns it and can only come into
  // frame as he climbs.
  const ledgesBefore = (await coilYs()).sort((a, b) => a - b);
  const rungStep = ledgesBefore.length > 1 ? ledgesBefore[1] - ledgesBefore[0] : 0;
  check(
    rungStep > 0 && ledgesBefore[0] - rungStep < 48,
    `the next cliff edge is always out of view (his ledge ${Math.round(ledgesBefore[0])}, one rung up ${Math.round(ledgesBefore[0] - rungStep)}, stage top 48)`,
  );
  await p2.getByText("Let it rest", { exact: false }).first().click();
  // The answered rope must NOT vanish on the answer — it stays on the face,
  // now fixed to its cliff edge, and he climbs it.
  await p2.waitForTimeout(400);
  const stillHanging = await ropeCount();
  check(stillHanging === 1, `the answered rope stays on the face while he climbs it (${stillHanging} hanging)`);

  await p2.waitForTimeout(500);
  const closedMid = await closedCurveY();
  check(
    closedBefore !== null && closedMid !== null && Math.abs(closedMid - closedBefore) <= 2,
    `an integrated thread holds still through the climb (${closedBefore} → ${closedMid})`,
  );
  await p2.waitForTimeout(6300);
  const rows = await p2.evaluate(() => window.__cam);
  const cam = rows.map((r) => r[0]);
  let monotonic = true;
  const dips = [];
  for (let i = 1; i < cam.length; i++)
    // a pixel of tolerance: the measurement is a rasterized bounding box, and
    // a 1px wobble is the renderer, not the mountain moving up
    if (cam[i] < cam[i - 1] - 1.01) {
      monotonic = false;
      dips.push(`${i}:${cam[i - 1]}->${cam[i]} feet${rows[i - 1][1]}->${rows[i][1]}`);
    }
  if (dips.length) console.log("  dips:", dips.slice(0, 8).join("  "));
  check(cam.length > 60 && monotonic, `the mountain only ever moves down (${cam.length} samples)`);
  // A rung-sized single-frame delta is the geometry rebuild racing the
  // transform: the rock paints at its destination for one frame, then snaps
  // back and eases forward again.
  let worstJump = 0;
  for (let i = 1; i < cam.length; i++)
    worstJump = Math.max(worstJump, Math.abs(cam[i] - cam[i - 1]));
  check(worstJump < 46, `the climb never jumps a frame (worst frame ${Math.round(worstJump)}px)`);
  // THE PIN: the time frame — Now, its dates, the climber standing there —
  // does not move at all. Only the mountain does.
  const nowYs = rows.map((r) => r[1]).filter((v) => v > 0);
  const pinLo = Math.min(...nowYs);
  const pinHi = Math.max(...nowYs);
  check(
    nowYs.length > 60 && pinHi - pinLo <= 2,
    `Now (and the climber on it) never moves during the climb (${Math.round(pinLo)}..${Math.round(pinHi)})`,
  );
  const travel = cam[cam.length - 1] - cam[0];
  check(
    travel > 0.4 * (800 - 48),
    `the climb is a real ascent — the mountain slid ${Math.round(travel)}px down`,
  );
  const nowY = await p2.evaluate(() => {
    const el = [...document.querySelectorAll("text")].find((t) => t.textContent === "Now");
    return el ? Math.round(el.getBoundingClientRect().top) : null;
  });
  const topAfter = await capTop();
  check(
    topAfter !== null && nowY !== null && Math.abs(topAfter - nowY) < 90,
    `the last climb brings the summit down to him (cap top ${Math.round(topAfter ?? 0)}, Now ${nowY})`,
  );
  const hanging = await ropeCount();
  check(hanging === 0, "no rope still hangs after top-out (all coiled on their ledges)");
  // a rung is a screen-jump, so the conquered ledges trail off below the
  // frame — what must hold is that they exist, on the rock, in climb order
  // The mountain shows ONE edge, on the right, with sky (and the ranges
  // beyond) between it and the date rail; the left runs off the screen.
  const shape = await p2.evaluate(() => {
    let best = 0, box = null;
    for (const el of document.querySelectorAll("path")) {
      if (el.getAttribute("stroke")) continue;
      const f = el.getAttribute("fill");
      if (!f || f === "none" || f === "#ffffff") continue;
      const b = el.getBoundingClientRect();
      if (b.width * b.height > best) { best = b.width * b.height; box = { l: Math.round(b.left), r: Math.round(b.right) }; }
    }
    const rails = [...document.querySelectorAll("svg")]
      .map((s) => Number(s.getAttribute("width")))
      .filter((n) => n > 10 && n < 60);
    return { box, vw: window.innerWidth, rails };
  });
  check(
    !!shape.box && shape.box.r < shape.vw - 40 && shape.box.r > shape.vw * 0.6,
    `the right flank is in frame with sky beyond it (edge ${shape.box?.r} of ${shape.vw})`,
  );
  check(
    !!shape.box && shape.box.l <= 0,
    `the left side runs off the screen (left ${shape.box?.l})`,
  );
  check(
    shape.rails.some((w) => w <= 32),
    `the date rail is hair-thin (${shape.rails.join(",")})`,
  );
  const body = await p2.evaluate(() => {
    let best = 0, box = null;
    for (const el of document.querySelectorAll("path")) {
      if (el.getAttribute("stroke")) continue;
      const f = el.getAttribute("fill");
      if (!f || f === "none" || f === "#ffffff") continue;
      const b = el.getBoundingClientRect();
      if (b.width * b.height > best) { best = b.width * b.height; box = { bottom: Math.round(b.bottom), w: Math.round(b.width) }; }
    }
    return box;
  });
  check(
    !!body && body.bottom >= 790 && body.w >= 640,
    `the rock fills the frame at top-out (bottom ${body?.bottom}, width ${body?.w})`,
  );
  const cap = await capBox();
  check(
    !!cap && cap.h >= 0.12 * 800 && cap.w >= 400,
    `the summit is a real snowy cap (${cap?.w}×${cap?.h})`,
  );
  const allLedges = await coilYs();
  check(
    allLedges.length >= 6,
    `every climbed rope left its cliff edge on the face (${allLedges.length} ledges)`,
  );
  await p2.screenshot({ path: "/tmp/summit-06-topout.png" });
  await p2.close();
}

/** A rope facing the viewer (effective opacity up the whole chain). */
const ropeIn = (pg) =>
  pg.evaluate(() => {
    for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
      const len = el.getTotalLength();
      if (len < 80) continue;
      const a = el.getPointAtLength(0), b = el.getPointAtLength(len);
      if (Math.abs(len - Math.abs(b.y - a.y)) > 3) continue;
      let o = 1;
      for (let n = el; n && n.tagName !== "svg"; n = n.parentElement)
        o *= Number(getComputedStyle(n).opacity);
      if (o < 0.6) continue;
      const m = el.getScreenCTM();
      for (let f = 0.1; f < 0.9; f += 0.05) {
        const q = el.getPointAtLength(len * f);
        const y = m.b * q.x + m.d * q.y + m.f;
        if (y > 220 && y < 620) return { x: m.a * q.x + m.c * q.y + m.e, y };
      }
    }
    return null;
  });

/** Screen top of the "Now" label — the pin the whole time frame hangs on. */
const nowTopOf = (pg) =>
  pg.evaluate(() => {
    const el = [...document.querySelectorAll("text")].find((t) => t.textContent === "Now");
    return el ? Math.round(el.getBoundingClientRect().top) : null;
  });

/** The snow cap's box: where the mountain itself is. */
const capBoxOf = (pg) =>
  pg.evaluate(() => {
    const cap = [...document.querySelectorAll('path[fill="#ffffff"]')].find(
      (el) => el.getAttribute("opacity") === "0.65",
    );
    if (!cap) return null;
    const b = cap.getBoundingClientRect();
    return { top: Math.round(b.top), left: Math.round(b.left) };
  });

/** A point on the rock clear of every rope, to start a turn from. */
const emptyX = (pg) =>
  pg.evaluate(() => {
    const xs = [];
    for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
      const len = el.getTotalLength();
      if (len < 80) continue;
      const a = el.getPointAtLength(0), b = el.getPointAtLength(len);
      if (Math.abs(len - Math.abs(b.y - a.y)) > 3) continue;
      const m = el.getScreenCTM();
      xs.push(m.a * a.x + m.c * a.y + m.e);
    }
    for (let x = 40; x < window.innerWidth - 80; x += 6)
      if (xs.every((r) => Math.abs(r - x) > 30)) return x;
    return 40;
  });

// ── 7. the ring: the mountain turns, and every thread is accounted for ──
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
  await p2.waitForTimeout(900);
  await p2.reload({ waitUntil: "networkidle" });
  await p2.waitForTimeout(2600);
  // the ring of threads: an indicator with one mark per rope, always there
  const marks = await p2.evaluate(
    () => document.querySelectorAll('[aria-label="Turn the mountain to this rope"]').length,
  );
  const openRopes = await p2.evaluate(() => {
    const key = "one-current/table/branches";
    const rows = JSON.parse(localStorage.getItem(key) ?? "[]");
    return rows.filter(
      (b) => b.status !== "merged" && b.status !== "converted-to-project" && !b.mergeDate,
    ).length;
  });
  check(
    marks === openRopes && marks > 0,
    `the ring shows every thread, in view or not (${marks} marks for ${openRopes} ropes)`,
  );
  // turning the mountain brings different ropes to the front
  /** Where each visible rope sits, and how visible it is. */
  const facing = () =>
    p2.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
        const len = el.getTotalLength();
        if (len < 80) continue;
        const a = el.getPointAtLength(0);
        const b = el.getPointAtLength(len);
        if (Math.abs(len - Math.abs(b.y - a.y)) > 3) continue;
        const m = el.getScreenCTM();
        const o = Number(getComputedStyle(el.parentElement ?? el).opacity);
        out.push({ x: Math.round(m.a * a.x + m.c * a.y + m.e), o: Math.round(o * 100) / 100 });
      }
      return out.sort((p, q) => p.x - q.x);
    });
  const before = await facing();
  const turnFrom = await p2.evaluate(() => {
    const xs = [];
    for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
      const len = el.getTotalLength();
      if (len < 80) continue;
      const a = el.getPointAtLength(0), b = el.getPointAtLength(len);
      if (Math.abs(len - Math.abs(b.y - a.y)) > 3) continue;
      const m = el.getScreenCTM();
      xs.push(m.a * a.x + m.c * a.y + m.e);
    }
    for (let x = 40; x < window.innerWidth - 80; x += 6)
      if (xs.every((r) => Math.abs(r - x) > 28)) return x;
    return 40;
  });
  await p2.mouse.move(turnFrom, 560);
  await p2.mouse.down();
  for (let i = 1; i <= 22; i++) await p2.mouse.move(turnFrom + i * 24, 560);
  await p2.mouse.up();
  await p2.waitForTimeout(1000);
  const after = await facing();
  // at least a couple of ropes have swung a good way round
  let moved = 0;
  const bx = before.map((r) => r.x);
  for (const r of after) if (!bx.some((x) => Math.abs(x - r.x) < 24)) moved++;
  check(
    moved >= 2,
    `turning the mountain brings other ropes round (${moved} of ${after.length} in new places)`,
  );
  // he must not be carried out of view on a rope that turns away: he lets go
  // and walks back to Now
  const climberX = () =>
    p2.evaluate(() => {
      const sprite = [...document.querySelectorAll("svg g")].find(
        (g) => g.querySelectorAll(":scope > rect").length > 12,
      );
      const nowEl = [...document.querySelectorAll("text")].find((t) => t.textContent === "Now");
      return {
        pip: sprite ? Math.round(sprite.getBoundingClientRect().left) : null,
        // his height too: a leaked shin-up would slowly break the pin
        top: sprite ? Math.round(sprite.getBoundingClientRect().top) : null,
        now: nowEl ? Math.round(nowEl.getBoundingClientRect().left) : null,
      };
    });
  const home = await climberX();
  const ropeNow = await ropeIn(p2);
  if (ropeNow) {
    await p2.mouse.click(ropeNow.x, ropeNow.y);
    await p2.waitForTimeout(2000);
    const onRope = await climberX();
    // turn that rope round the back, twice, and let him decide
    for (let n = 0; n < 2; n++) {
      const from = await emptyX(p2);
      await p2.mouse.move(from, 620);
      await p2.mouse.down();
      for (let i = 1; i <= 20; i++) await p2.mouse.move(from - i * 24, 620);
      await p2.mouse.up();
      await p2.waitForTimeout(1600);
    }
    const back = await climberX();
    // He must arrive ON the rope he is handed to, not run past it and get
    // snapped back when the turn lands: no single frame may jump.
    let worstJump = 0;
    let last = null;
    for (let i = 0; i < 60; i++) {
      const c = await climberX();
      if (c.pip !== null && last !== null) worstJump = Math.max(worstJump, Math.abs(c.pip - last));
      last = c.pip;
      await p2.waitForTimeout(50);
    }
    check(worstJump < 40, `he arrives on the rope, never snapping onto it (worst frame ${worstJump}px)`);
    // A rope turned away is not one he rides out of sight: he takes the
    // nearest rope still facing the viewer, or goes back to Now if the face
    // has none left. Either way he must end up somewhere a hand could reach.
    const facingXs = await ropeColumns(p2);
    const atHome = back.pip !== null && Math.abs(back.pip - home.pip) < 30;
    const onAnother =
      back.pip !== null && facingXs.some((x) => Math.abs(x - (back.pip + 13)) < 44);
    check(
      home.pip !== null && onRope.pip !== null && back.pip !== null && (atHome || onAnother),
      `a rope turned away hands him to one still in view, or to Now (${home.pip} → ${onRope.pip} → ${back.pip}, ${atHome ? "home" : onAnother ? "on another rope" : "NOWHERE"})`,
    );
    // And he is back down at his own altitude: the shin-up never leaks.
    check(
      home.top !== null && back.top !== null && Math.abs(back.top - home.top) <= 12,
      `and he is back down at his station (top ${home.top} → ${onRope.top} → ${back.top})`,
    );
  }
  await p2.screenshot({ path: "/tmp/summit-07-turned.png" });
  await p2.close();
}

/** The climber's live box: he moves up the rope, so nothing may cache it. */
const pipBox = (pg) =>
  pg.evaluate(() => {
    const sprite = [...document.querySelectorAll("svg g")].find(
      (g) => g.querySelectorAll(":scope > rect").length > 12,
    );
    if (!sprite) return null;
    const r = sprite.getBoundingClientRect();
    return {
      x: Math.round(r.left + r.width / 2),
      cx: r.left + r.width / 2,
      y: Math.round(r.top + r.height / 2),
      top: Math.round(r.top),
    };
  });

/** Where the rope's own visible stroke sits at the climber's altitude. */
const ropeXAtPip = (pg) =>
  pg.evaluate(() => {
    const sprite = [...document.querySelectorAll("svg g")].find(
      (g) => g.querySelectorAll(":scope > rect").length > 12,
    );
    if (!sprite) return null;
    const box = sprite.getBoundingClientRect();
    const row = box.top + box.height * 0.4; // roughly his hands
    const centre = box.left + box.width / 2;
    // Each visible rope's x AT that row, found by bisection on arc length
    // (the ropes are near-vertical, so y is monotonic along them); then the
    // one whose column is his is the one closest to his centre.
    let best = null;
    let bestDx = Infinity;
    for (const el of document.querySelectorAll("path")) {
      const stroke = el.getAttribute("stroke");
      if (!stroke || stroke === "transparent" || stroke === "none") continue;
      const len = el.getTotalLength();
      if (len < 400) continue; // a rope, not a mark
      let o = 1;
      for (let n = el; n && n.tagName !== "svg"; n = n.parentElement)
        o *= Number(getComputedStyle(n).opacity);
      if (o < 0.6) continue;
      const m = el.getScreenCTM();
      if (!m) continue;
      const yAt = (l) => {
        const q = el.getPointAtLength(l);
        return m.b * q.x + m.d * q.y + m.f;
      };
      let lo = 0;
      let hi = len;
      if ((yAt(lo) - row) * (yAt(hi) - row) > 0) continue; // does not cross him
      const rising = yAt(hi) > yAt(lo);
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (yAt(mid) < row === rising) lo = mid;
        else hi = mid;
      }
      const q = el.getPointAtLength((lo + hi) / 2);
      const x = m.a * q.x + m.c * q.y + m.e;
      if (Math.abs(x - centre) < bestDx) {
        bestDx = Math.abs(x - centre);
        best = x;
      }
    }
    return bestDx <= 40 ? best : null;
  });

const readBranches = (pg) =>
  pg.evaluate(() => JSON.parse(localStorage.getItem("one-current/table/branches") ?? "[]"));

// ── 8. he swings with the rope he holds, and shins up it to quiet it ──
{
  const p3 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  p3.on("pageerror", (e) => errors.push(e.message));
  await p3.addInitScript(() => {
    localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
    localStorage.setItem("one-current-tutorial-v1", "done");
    localStorage.setItem("one-current-pro", "1");
    localStorage.setItem("one-current-theme", "summit");
  });
  await p3.goto("http://localhost:4179/", { waitUntil: "networkidle" });
  await p3.waitForTimeout(1500);
  await p3.getByRole("button", { name: "More" }).first().click();
  await p3.waitForTimeout(500);
  await p3.getByRole("button", { name: "Load example threads" }).click();
  await p3.waitForTimeout(900);
  // Every open rope at full loudness, so the sway is at its widest and a tap
  // has room to drop it more than once.
  await p3.evaluate(() => {
    const key = "one-current/table/branches";
    const rows = JSON.parse(localStorage.getItem(key) ?? "[]").map((b) =>
      b.status !== "merged" && b.status !== "converted-to-project" && !b.mergeDate
        ? { ...b, loudness: 5, loudnessSetOn: new Date().toISOString().slice(0, 10) }
        : b,
    );
    localStorage.setItem(key, JSON.stringify(rows));
  });
  await p3.reload({ waitUntil: "networkidle" });
  await p3.waitForTimeout(2600);

  const rope8 = await ropeIn(p3);
  check(!!rope8, "found a rope to grab");
  if (rope8) {
    await p3.mouse.click(rope8.x, rope8.y);
    await p3.waitForTimeout(2200); // he walks over and takes hold

    // ── the swing: the rope moves, and he moves WITH it ──
    let ropeLo = Infinity, ropeHi = -Infinity;
    let gapLo = Infinity, gapHi = -Infinity;
    for (let i = 0; i < 70; i++) {
      const [rx, pip] = [await ropeXAtPip(p3), await pipBox(p3)];
      if (rx !== null && pip) {
        ropeLo = Math.min(ropeLo, rx);
        ropeHi = Math.max(ropeHi, rx);
        const gap = pip.cx - rx;
        gapLo = Math.min(gapLo, gap);
        gapHi = Math.max(gapHi, gap);
      }
      await p3.waitForTimeout(45);
    }
    const ropeTravel = Math.round(ropeHi - ropeLo);
    const gapSpread = Math.round(gapHi - gapLo);
    check(ropeTravel > 3, `the rope he holds really sways (${ropeTravel}px of travel)`);
    // The real assertion: any mistake in the phase, the clock, the pendulum
    // taper or the mountain's own travel shows up here as a widening gap.
    check(
      gapLo < Infinity && gapSpread <= 4,
      `he swings WITH it, not beside it (gap held to ${gapSpread}px)`,
    );

    // ── the shin: a tap on his rope quiets it and sends him up it ──
    const before = await readBranches(p3);
    const beforeBox = await pipBox(p3);
    const capBefore = await capBoxOf(p3);
    const nowBefore = await nowTopOf(p3);
    const coilsBefore = await p3.evaluate(
      () => document.querySelectorAll('[aria-label*="coil"]').length,
    );
    const rope8b = await ropeIn(p3);
    // Anywhere on the rope but ON him: his own hit rect opens the sheet.
    if (rope8b) await p3.mouse.click(rope8b.x, (beforeBox?.top ?? rope8b.y) + 150);
    await p3.waitForTimeout(1100);
    const after = await readBranches(p3);
    const afterBox = await pipBox(p3);
    const heldId = await p3.evaluate(() => {
      const sprite = [...document.querySelectorAll("svg g")].find(
        (g) => g.querySelectorAll(":scope > rect").length > 12,
      );
      return sprite ? 1 : 0;
    });
    const dropped = before.filter((b) => {
      const a = after.find((x) => x.id === b.id);
      return a && Math.round(a.loudness) === Math.round(b.loudness) - 1;
    });
    check(
      dropped.length === 1,
      `a tap on his rope drops exactly one thread one step (${dropped.length})`,
    );
    check(
      !!beforeBox && !!afterBox && beforeBox.top - afterBox.top >= 15,
      `and sends him up the rope (top ${beforeBox?.top} → ${afterBox?.top})`,
    );
    const sheetUp = await p3
      .getByText("What does this rope need from you now?", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    check(!sheetUp && heldId === 1, "the climb IS the act — no sheet opens");
    // Quieting is a touch, not a rung: nothing about the day's ladder moves.
    const capAfter = await capBoxOf(p3);
    const nowAfter = await nowTopOf(p3);
    const coilsAfter = await p3.evaluate(
      () => document.querySelectorAll('[aria-label*="coil"]').length,
    );
    check(
      capBefore !== null &&
        capAfter !== null &&
        Math.abs(capAfter.top - capBefore.top) <= 1 &&
        nowAfter === nowBefore &&
        coilsAfter === coilsBefore,
      `quieting adds no rung (cap ${capBefore?.top} → ${capAfter?.top}, Now ${nowBefore} → ${nowAfter})`,
    );
  }
  await p3.screenshot({ path: "/tmp/summit-08-shinned.png" });
  await p3.close();
}

// ── 9. full send: chalk at every rope, the mountain turning to reach them ──
{
  const p4 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  p4.on("pageerror", (e) => errors.push(e.message));
  await p4.addInitScript(() => {
    localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
    localStorage.setItem("one-current-tutorial-v1", "done");
    localStorage.setItem("one-current-pro", "1");
    localStorage.setItem("one-current-theme", "summit");
    // A full meter straight from storage: loadSettings reads this key and
    // clamps it to 0–100, so the pill comes up ready with no panel to visit.
    localStorage.setItem("one-current-bonk-charge", "100");
  });
  await p4.goto("http://localhost:4179/", { waitUntil: "networkidle" });
  await p4.waitForTimeout(1500);
  await p4.getByRole("button", { name: "More" }).first().click();
  await p4.waitForTimeout(500);
  await p4.getByRole("button", { name: "Load example threads" }).click();
  await p4.waitForTimeout(900);
  // Answer one thread for today so there IS a coiled rope for the sweep to
  // leave alone — the example data has none.
  await p4.evaluate(() => {
    const key = "one-current/table/branches";
    const rows = JSON.parse(localStorage.getItem(key) ?? "[]");
    const open = rows.filter(
      (b) => b.status !== "merged" && b.status !== "converted-to-project" && !b.mergeDate,
    );
    if (open.length) open[0].lastDecisionOn = new Date().toISOString().slice(0, 10);
    localStorage.setItem(key, JSON.stringify(rows));
  });
  await p4.reload({ waitUntil: "networkidle" });
  await p4.waitForTimeout(2600);

  check(
    await p4.getByText("FULL SEND!").first().isVisible().catch(() => false),
    'the pill reads "FULL SEND!"',
  );
  const todayIso = new Date().toISOString().slice(0, 10);
  // The ropes still HANGING: one answered today is coiled at its ledge, off
  // the face, and the sweep must leave it alone.
  const openIds = (await readBranches(p4))
    .filter((b) => b.status !== "merged" && b.status !== "converted-to-project" && !b.mergeDate)
    .filter((b) => b.lastDecisionOn !== todayIso && b.leftOn !== todayIso)
    .map((b) => b.id);
  const settledIds = (await readBranches(p4))
    .filter((b) => b.status !== "merged" && b.status !== "converted-to-project" && !b.mergeDate)
    .filter((b) => b.lastDecisionOn === todayIso || b.leftOn === todayIso)
    .map((b) => b.id);
  const settledBefore = (await readBranches(p4)).filter((b) => settledIds.includes(b.id));
  await p4.getByRole("button", { name: "Full send: Pip steadies every rope" }).click();
  // Sample right through the sweep: count how many times the face settles
  // into a NEW arrangement, and catch the chalk in the air at least once.
  const frames = [];
  let chalkMiss = null;
  for (let i = 0; i < 110; i++) {
    frames.push(await ropeColumns(p4));
    const miss = await p4.evaluate(() => {
      const sm = document.querySelector('path[stroke="#f4ead6"]');
      if (!sm) return null;
      const m = sm.getScreenCTM();
      if (!m) return null;
      const p = sm.getPointAtLength(0);
      const cx = m.a * p.x + m.c * p.y + m.e;
      let best = Infinity;
      for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
        const len = el.getTotalLength();
        if (len < 80) continue;
        let o = 1;
        for (let n = el; n && n.tagName !== "svg"; n = n.parentElement)
          o *= Number(getComputedStyle(n).opacity);
        if (o < 0.6) continue;
        const mm = el.getScreenCTM();
        if (!mm) continue;
        const a = el.getPointAtLength(0);
        best = Math.min(best, Math.abs(mm.a * a.x + mm.c * a.y + mm.e - cx));
      }
      return Number.isFinite(best) ? Math.round(best) : null;
    });
    if (miss !== null) chalkMiss = chalkMiss === null ? miss : Math.min(chalkMiss, miss);
    await p4.waitForTimeout(60);
  }
  const same = (a, b) => a.length === b.length && a.every((v, k) => Math.abs(v - b[k]) < 4);
  let stops = 0;
  for (let i = 1; i < frames.length; i++) {
    if (!same(frames[i], frames[i - 1]) && (i + 1 >= frames.length || same(frames[i + 1], frames[i])))
      stops++;
  }
  check(
    stops >= Math.min(3, openIds.length - 1),
    `the mountain turns rope by rope through a full send (${stops} settles for ${openIds.length} ropes)`,
  );
  check(
    chalkMiss !== null && chalkMiss < 26,
    `the chalk lands on the rope, not its un-turned column (${chalkMiss}px off)`,
  );
  // Every rope was chalked, including the ones that were round the back:
  // dialLoudness stamps loudnessSetOn, and the example data never sets it.
  await p4.waitForTimeout(1500);
  const rows9 = await readBranches(p4);
  const chalked = rows9.filter(
    (b) => openIds.includes(b.id) && b.loudnessSetOn === todayIso,
  ).length;
  check(
    chalked === openIds.length && openIds.length >= 4,
    `a full send chalks every rope, hidden or not (${chalked}/${openIds.length})`,
  );
  // And it leaves the coiled ones alone: answered today, they are not on the
  // face any more, so there is nothing there to chalk.
  const disturbed = settledIds.filter((id) => {
    const was = settledBefore.find((x) => x.id === id);
    const is = rows9.find((x) => x.id === id);
    return was && is && is.loudness !== was.loudness;
  });
  check(
    settledIds.length > 0 && disturbed.length === 0,
    `a rope already answered today is left coiled, not chalked (${settledIds.length} settled, ${disturbed.length} disturbed)`,
  );
  // And when it is over, the map holds still: nothing turns on its own.
  await p4.waitForTimeout(4200);
  const restA = await ropeColumns(p4);
  await p4.waitForTimeout(1800);
  const restB = await ropeColumns(p4);
  check(same(restA, restB), "the mountain never turns on its own once the sweep is done");
  await p4.screenshot({ path: "/tmp/summit-09-fullsend.png" });
  await p4.close();
}

await browser.close();
server.close();

if (errors.length) console.log("console errors:\n" + errors.slice(0, 10).join("\n"));
if (failures.length || errors.length) {
  console.log(`\n${failures.length} check(s) failed, ${errors.length} console error(s).`);
  process.exit(1);
}
console.log("\nsummit-check: all good");
