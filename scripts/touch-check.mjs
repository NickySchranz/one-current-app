/* The map, driven by a finger.
 *
 * Everything else under scripts/ drives it with a mouse at a desktop
 * viewport, which is how three touch regressions reached production at once:
 * vertical scrolling died on the horizontal maps, a drag stopped cancelling
 * the press-and-hold, and panning toward the future snapped back.
 *
 * Two things about how this drives:
 *
 *  · CDP `Input.dispatchTouchEvent`, not Playwright's `touchscreen`, which
 *    cannot hold a finger down across many moves.
 *  · Per-FRAME traces for anything about motion. The failures here last one
 *    frame; a before/after comparison sees none of them, and a screenshot
 *    sees none of them either.
 *
 *   EXPO_PUBLIC_SHOW_TESTING=1 npx expo export --platform web --clear
 *   node scripts/touch-check.mjs
 */
import { serveDist, launchBrowser } from "./promo-lib.mjs";

const PORT = 4405;
const server = await serveDist(new URL("../dist", import.meta.url).pathname, PORT, "");
const browser = await launchBrowser();

let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${msg}`);
  if (!ok) failed = true;
};

/** Viewport + input, so every check runs as a finger AND as a mouse. */
const MODES = [
  { name: "finger", ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: "mouse ", ctx: { viewport: { width: 1200, height: 900 } } },
];

async function openMap(theme, mode = MODES[0]) {
  const ctx = await browser.newContext(mode.ctx);
  await ctx.addInitScript((t) => {
    localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@onecurrentapp.com" }));
    localStorage.setItem("one-current-tutorial-v1", "done");
    localStorage.setItem("one-current-pro", "1");
    localStorage.setItem("one-current-theme", t);
  }, theme);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(false, `page error: ${e.message.split("\n")[0]}`));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "More" }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Load example threads" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Now" }).first().click();
  await page.waitForTimeout(2500);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp, touch: !!mode.ctx.hasTouch, w: mode.ctx.viewport.width, h: mode.ctx.viewport.height };
}

/** A finger or a mouse, held down across `steps` moves. */
async function swipe(map, { x, y, dx, dy, steps = 40, gap = 12, onMid }) {
  const { cdp, page, touch } = map;
  if (touch) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  else { await page.mouse.move(x, y); await page.mouse.down(); }
  for (let i = 1; i <= steps; i++) {
    if (touch) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + dx * i, y: y + dy * i }],
      });
    } else {
      await page.mouse.move(x + dx * i, y + dy * i);
    }
    if (gap) await page.waitForTimeout(gap);
    if (onMid && i === Math.floor(steps * 0.8)) await onMid();
  }
  if (touch) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  else await page.mouse.up();
  await page.waitForTimeout(800);
}

/**
 * Start watching whether the map still covers the screen.
 *
 * The check nothing here made, and the reason a regression that left 231px of
 * a 390px phone blank shipped three times. Every other assertion asks where
 * something IS; this one asks whether there is anything there at all.
 *
 * Sampled every displayed frame, because a strip that shows for ten frames
 * mid-drag is exactly as bad as one that stays.
 */
const watchCoverage = (page) =>
  page.evaluate(() => {
    window.__cover = [];
    const tick = () => {
      const svg = [...document.querySelectorAll("svg")].sort(
        (a, b) => b.clientWidth - a.clientWidth,
      )[0];
      if (svg) {
        const r = svg.getBoundingClientRect();
        // How much of the stage's width the drawn map fails to reach, either side.
        window.__cover.push([
          Math.round(Math.max(0, r.left)),
          Math.round(Math.max(0, window.innerWidth - r.right)),
        ]);
      }
      window.__coverR = requestAnimationFrame(tick);
    };
    window.__coverR = requestAnimationFrame(tick);
  });

const readCoverage = async (page) => {
  const rows = await page.evaluate(() => {
    if (window.__coverR) cancelAnimationFrame(window.__coverR);
    const s = window.__cover ?? [];
    window.__cover = [];
    return s;
  });
  if (!Array.isArray(rows) || rows.length === 0) return { left: 0, right: 0, frames: 0 };
  let left = 0;
  let right = 0;
  for (const [l, r] of rows) {
    left = Math.max(left, l);
    right = Math.max(right, r);
  }
  return { left, right, frames: rows.length };
};

/** Every date label's position, sampled once per displayed frame. */
const startTrace = (page, axis) =>
  page.evaluate((ax) => {
    window.__tr = [];
    const tick = () => {
      const row = {};
      if (ax === "x") {
        for (const el of document.querySelectorAll("div")) {
          if (el.children.length === 0 && /^\d+ \w|^Today$/.test(el.textContent ?? "")) {
            row[el.textContent] = Math.round(el.getBoundingClientRect().left * 10) / 10;
          }
        }
      } else {
        for (const t of document.querySelectorAll("svg text")) {
          if (/^\d+$/.test(t.textContent ?? "")) {
            row[t.textContent] = Math.round(t.getBoundingClientRect().top * 10) / 10;
          }
        }
      }
      window.__tr.push(row);
      window.__raf = requestAnimationFrame(tick);
    };
    window.__raf = requestAnimationFrame(tick);
  }, axis);

/**
 * Follow ONE label through the trace.
 *
 * It has to be one: at a rebase the set of ticks changes, so "the first one"
 * is a different day and the reading is noise — an earlier version of this
 * technique reported 116px jumps that were not there.
 */
async function readTrace(page) {
  const rows = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    const s = window.__tr;
    window.__tr = [];
    return s;
  });
  const labels = Object.keys(rows[0] ?? {}).filter((k) => rows.every((r) => r[k] !== undefined));
  if (!labels.length) return null;
  const label = labels[Math.floor(labels.length / 2)];
  const vs = rows.map((r) => r[label]);
  const moving = vs.slice(vs.findIndex((v, i) => i > 0 && v !== vs[i - 1]));
  let biggest = 0;
  let at = 0;
  for (let i = 1; i < moving.length; i++) {
    const d = Math.abs(moving[i] - moving[i - 1]);
    if (d > biggest) { biggest = d; at = i; }
  }
  return {
    label,
    travel: moving.length ? moving[moving.length - 1] - moving[0] : 0,
    biggest,
    at,
    frames: moving.length,
  };
}

// ── the horizontal maps ───────────────────────────────────────────────────
for (const mode of MODES) {
  const map = await openMap("riverbed", mode);
  const { ctx, page } = map;
  const at = (x) => Math.round(map.w * x);
  const tag = `riverbed/${mode.name}`;
  await watchCoverage(page);

  // 1. a vertical drag belongs to the SCROLLER, not to us. Gesture Handler
  //    stamps touch-action on the view it is attached to, and with nothing
  //    configured it stamps `none` — which killed this outright.
  const laneY = () =>
    page.evaluate(() => {
      const t = [...document.querySelectorAll("svg text")].find((e) => (e.textContent ?? "").length > 8);
      return t ? Math.round(t.getBoundingClientRect().top) : null;
    });
  if (map.touch) {
    const before = await laneY();
    await swipe(map, { x: at(0.5), y: map.h - 220, dx: 0, dy: -6, steps: 30 });
    const after = await laneY();
    check(
      before !== null && after !== null && Math.abs(after - before) > 40,
      `${tag}: a finger scrolls the lanes (${before} → ${after})`,
    );
  }

  // 2. sideways is ours, and it pans time without a jump
  const sheetBefore = await page
    .getByText("How loud", { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  await startTrace(page, "x");
  await swipe(map, { x: at(0.25), y: 420, dx: 5, dy: 0, steps: 45, gap: 10 });
  const back = await readTrace(page);
  check(!!back && back.travel > 150, `${tag}: pans time (${back?.travel.toFixed(0)}px, ${JSON.stringify(back?.label)})`);
  check(!!back && back.biggest <= 14, `${tag}: and never jumps doing it (${back?.biggest.toFixed(0)}px)`);
  // Nothing NEW opened: the quick menu's labels live in the tree whether or
  // not it is open, and a thread may already be armed from the scroll test.
  const sheetNow = await page
    .getByText("How loud", { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  check(!sheetNow || sheetBefore, `${tag}: a drag opens no sheet behind it`);

  /* 3. The END OF TIME.
   *
   * The window already reaches as far ahead as the app will look, so from the
   * resting view roughly half of every flick is a pull against a wall. It used
   * to judder there, and then — once the transient was clamped — it did
   * nothing at all, which is what "it drags a bit then snaps back" was about.
   * It gives now, and lets go. */
  const cover = await readCoverage(page);
  check(
    cover.left === 0 && cover.right === 0 && cover.frames > 60,
    `${tag}: the map covers the screen throughout (worst strip left ${cover.left}px, right ${cover.right}px over ${cover.frames} frames)`,
  );

  await page.close();
  await ctx.close();

  /* A FRESH map for the wall.
   *
   * This is the state the app opens in — the window already reaching as far
   * ahead as it will look — and it has to be reached without three other
   * drags having armed a thread or moved the window first, which is how a
   * person meets it and how this check kept measuring something else. */
  const fresh = await openMap("riverbed", mode);
  await watchCoverage(fresh.page);
  const world = () =>
    fresh.page.evaluate(() => {
      const t = [...document.querySelectorAll("svg text")].find((e) => (e.textContent ?? "").length > 8);
      return t ? Math.round(t.getBoundingClientRect().left * 10) / 10 : null;
    });
  const rest = await world();
  // Sampled in the page, once per displayed frame. Polling from here misses a
  // band eighty pixels wide that is gone in a few hundred milliseconds.
  await fresh.page.evaluate(() => {
    window.__band = [];
    const t = () => {
      const e = [...document.querySelectorAll("svg text")].find((n) => (n.textContent ?? "").length > 8);
      if (e) window.__band.push(Math.round(e.getBoundingClientRect().left * 10) / 10);
      window.__bandR = requestAnimationFrame(t);
    };
    window.__bandR = requestAnimationFrame(t);
  });
  // Not too near the right edge: the wholeness chip, the date rail and the
  // bonk bar all live over there, and a drag that starts on one of them never
  // reaches the map.
  await swipe(fresh, { x: at(0.55), y: 420, dx: -6, dy: 0, steps: 45, gap: 10 });
  const seen = await fresh.page.evaluate(() => {
    cancelAnimationFrame(window.__bandR);
    const s = window.__band;
    window.__band = [];
    return s;
  });
  const settled = await world();
  const give = seen.length ? Math.max(...seen.map((v) => Math.abs(v - (rest ?? 0)))) : 0;
  check(give > 20, `${tag}: the end of time gives (${give.toFixed(0)}px of band)`);
  check(
    rest !== null && settled !== null && Math.abs(settled - rest) < 2,
    `${tag}: and settles back onto it (${rest} → ${settled})`,
  );

  /* 4. Two rebases inside one render. A long drag with NO yielding between
   *    moves; a dropped rebase shows up as a whole 120px of missing travel. */
  await startTrace(fresh.page, "x");
  await swipe(fresh, { x: at(0.1), y: 420, dx: 9, dy: 0, steps: 40, gap: 0 });
  const fast = await readTrace(fresh.page);
  check(
    !!fast && fast.travel > 260,
    `${tag}: a fast flick loses no rebase (${fast?.travel.toFixed(0)}px of 360)`,
  );

  const coverFresh = await readCoverage(fresh.page);
  check(
    coverFresh.left === 0 && coverFresh.right === 0 && coverFresh.frames > 60,
    `${tag}: and covers it at the edge of time too (left ${coverFresh.left}px, right ${coverFresh.right}px)`,
  );

  await fresh.page.close();
  await fresh.ctx.close();
}

// ── the summit ────────────────────────────────────────────────────────────
for (const mode of MODES) {
  const map = await openMap("summit", mode);
  const { ctx, page } = map;
  const tag = `summit/${mode.name}`;
  await watchCoverage(page);

  await startTrace(page, "y");
  await swipe(map, { x: 60, y: map.h - 220, dx: 0, dy: -5, steps: 45, gap: 10 });
  const up = await readTrace(page);
  check(!!up && Math.abs(up.travel) > 150, `${tag}: climbs through time (${up?.travel.toFixed(0)}px)`);
  check(!!up && up.biggest <= 14, `${tag}: and never jumps doing it (${up?.biggest.toFixed(0)}px)`);

  // the end of time, downward
  await page.getByRole("button", { name: /Return to Now/i }).first().click().catch(() => {});
  await page.waitForTimeout(1800);
  const rail = () =>
    page.evaluate(() => {
      const t = [...document.querySelectorAll("svg text")].find((e) => /^\d+$/.test(e.textContent ?? ""));
      return t ? Math.round(t.getBoundingClientRect().top) : null;
    });
  const rest = await rail();
  const seen = [];
  const tick = setInterval(async () => { const v = await rail().catch(() => null); if (v !== null) seen.push(v); }, 40);
  await swipe(map, { x: 60, y: 300, dx: 0, dy: 6, steps: 45, gap: 10 });
  clearInterval(tick);
  const settled = await rail();
  const give = seen.length && rest !== null ? Math.max(...seen.map((v) => Math.abs(v - rest))) : 0;
  check(give > 20, `${tag}: the end of time gives (${give.toFixed(0)}px of band)`);
  check(
    rest !== null && settled !== null && Math.abs(settled - rest) < 3,
    `${tag}: and settles back onto it (${rest} → ${settled})`,
  );

  // sideways turns the mountain: the ropes move, the time frame does not
  /**
   * Every rope's column at a fixed height, keyed so a turn can be measured.
   *
   * By id and not by position: a turn changes WHICH ropes are in view, so
   * comparing the nth visible one to the nth visible one compares two
   * different ropes.
   *
   * The canvas publishes these itself when it is drawing; otherwise they come
   * from each rope's own hit path, which carries the TRUE geometry — never
   * squiggled — and is therefore the column with the sway already off it.
   */
  const ropeXs = () =>
    page.evaluate(() => {
      if (window.__ocRopes) {
        const out = {};
        for (const [id, f] of window.__ocRopes.entries()) {
          const v = f(400);
          if (v !== null) out[id] = Math.round(v);
        }
        return out;
      }
      const out = {};
      let n = 0;
      for (const el of document.querySelectorAll('path[stroke="transparent"]')) {
        const len = el.getTotalLength();
        if (!len || len < 400) continue;
        const m = el.getScreenCTM();
        if (!m) continue;
        const at = (l) => {
          const q = el.getPointAtLength(l);
          return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f };
        };
        if ((at(0).y - 400) * (at(len).y - 400) > 0) continue;
        const rising = at(len).y > at(0).y;
        let lo = 0;
        let hi = len;
        for (let k = 0; k < 30; k++) {
          const mid = (lo + hi) / 2;
          if (at(mid).y < 400 === rising) lo = mid; else hi = mid;
        }
        // Round the back the group is faded to nothing; skip what cannot be seen.
        let o = 1;
        for (let p = el; p && p.tagName !== "svg"; p = p.parentElement) o *= Number(getComputedStyle(p).opacity);
        if (o < 0.5) continue;
        out[`svg${n++}`] = Math.round(at((lo + hi) / 2).x);
      }
      return out;
    });
  const ropesBefore = await ropeXs();
  const railBefore = await rail();
  // Sampled WHILE the finger is down. On release the summit settles the turn
  // so a rope ends up facing you, and with only a couple of threads that
  // settle can land back where it started — a true turn with nothing to show
  // for it afterwards.
  let ropesAfter = null;
  await swipe(map, {
    x: Math.round(map.w * 0.5), y: 500, dx: -4, dy: 0, steps: 30, gap: 14,
    onMid: async () => { ropesAfter = await ropeXs(); },
  });
  const railAfter = await rail();
  const idsBefore = Object.keys(ropesBefore ?? {});
  const idsAfter = Object.keys(ropesAfter ?? {});
  const moved = ropesBefore && ropesAfter
    ? idsBefore.filter((id) => ropesAfter[id] !== undefined && Math.abs(ropesAfter[id] - ropesBefore[id]) > 8)
    : [];
  // Either a rope that stayed in view has moved, or the turn has brought a
  // different set of them round — both mean the mountain turned, and which
  // one you get depends on how many were facing you to begin with.
  const swapped = idsBefore.some((id) => !idsAfter.includes(id)) || idsAfter.some((id) => !idsBefore.includes(id));
  check(
    moved.length > 0 || swapped,
    `${tag}: a sideways drag turns the mountain (${moved.length} moved, ${idsBefore.length}→${idsAfter.length} in view)`,
  );
  check(
    railBefore !== null && railAfter !== null && Math.abs(railAfter - railBefore) <= 2,
    `${tag}: and leaves the time frame alone (${railBefore} → ${railAfter})`,
  );

  /* The rock turns IN PLACE.
   *
   * Its outline is shaped by the surface at the angle facing each edge, so a
   * turn rolls it — which is the point on the right, the edge you see against
   * sky. The left edge is meant to be off the screen entirely (the rock
   * reaches ninety pixels past it so only one side ever shows an edge), and
   * near the peak, where the rock narrows, it IS in frame: a bulge swinging
   * there reads as the whole mountain sliding sideways instead of rotating. */
  const rockEdges = () =>
    page.evaluate(() => {
      let best = null;
      let area = 0;
      for (const el of document.querySelectorAll("svg path")) {
        const f = el.getAttribute("fill");
        if (!f || f === "none" || f === "transparent") continue;
        const r = el.getBoundingClientRect();
        if (r.width * r.height > area && r.height > 300) { area = r.width * r.height; best = r; }
      }
      return best ? Math.round(best.left) : null;
    });
  const lefts = [];
  for (let k = 0; k < 5; k++) {
    const l = await rockEdges();
    if (l !== null) lefts.push(l);
    await swipe(map, { x: Math.round(map.w * 0.85), y: 500, dx: -12, dy: 0, steps: 24, gap: 12 });
  }
  const swing = lefts.length ? Math.max(...lefts) - Math.min(...lefts) : 999;
  check(swing <= 1, `${tag}: the rock's left edge holds still through a turn (${swing}px of swing)`);

  /* THE ROPES MUST ACTUALLY REPAINT.
   *
   * Every other check here reads the scene's own numbers, which are computed
   * from shared values and move whether or not anything reaches the screen.
   * On a phone the ropes swayed while the mountain was being turned and
   * stopped dead the moment it settled — because the canvas only repainted
   * when React re-rendered it. So this one looks at PIXELS: two shots of the
   * rope band, a second apart, with nothing touching the screen.
   */
  const band = { x: 0, y: Math.round(map.h * 0.18), width: map.w, height: 140 };
  const shotA = await page.screenshot({ clip: band });
  await page.waitForTimeout(1100);
  const shotB = await page.screenshot({ clip: band });
  let differing = 0;
  const n = Math.min(shotA.length, shotB.length);
  for (let i = 0; i < n; i++) if (shotA[i] !== shotB[i]) differing++;
  check(
    differing > n / 1000,
    `${tag}: the ropes repaint on their own (${differing} bytes of ${n} changed in a second at rest)`,
  );

  const cover = await readCoverage(page);
  check(
    cover.left === 0 && cover.right === 0 && cover.frames > 60,
    `${tag}: the map covers the screen throughout (worst strip left ${cover.left}px, right ${cover.right}px over ${cover.frames} frames)`,
  );

  /* The ropes must be spread by what the EYE sees, not by angle. Even angular
   * steps around the ring pile up at the sides, because the eye sees sin() of
   * them: measured at 24 threads, gaps of 8-16px against voids of 66-71px. */
  await page.evaluate(() => {
    const key = "one-current/table/branches";
    const rows = JSON.parse(localStorage.getItem(key) ?? "[]");
    const base = rows.find((b) => b.status === "active") ?? rows[0];
    if (!base) return;
    const extra = [];
    for (let i = 0; i < 14; i++) {
      extra.push({ ...base, id: `spread${i}`, title: `Spread ${i}`, status: "active", lastDecisionOn: undefined, mergeDate: undefined });
    }
    localStorage.setItem(key, JSON.stringify([...rows, ...extra]));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  // Only the ropes still WAITING: one answered today coils at its ledge, and
  // a ledge has to stay on the rock at its own depth, so those hang on a
  // shallower ring and land wherever that puts them.
  // Waiting, legible, and measured at its COLUMN — the sway wanders a rope
  // fourteen pixels either side of where it hangs, which is more than enough
  // to make "are they evenly spread" unanswerable from the drawing.
  const hanging = await page.evaluate(() => {
    if (!window.__ocRopeSpec) return null;
    const out = [];
    for (const info of Object.values(window.__ocRopeSpec)) {
      if (info.coiled || info.seen() <= 0.5) continue;
      const c = info.column();
      if (c !== null) out.push(Math.round(c));
    }
    return out;
  });
  const cols = hanging ?? Object.values(await ropeXs());
  cols.sort((a, b) => a - b);
  const gaps = cols.slice(1).map((v, i) => v - cols[i]);
  const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  // A quarter of the mean, not a third: a rope answered today coils at its
  // ledge, and a ledge has to stay on the rock at its own depth — so those
  // hang on a shallower ring and land wherever that puts them. The even
  // spread is a property of the ropes still waiting.
  check(
    gaps.length > 3 && Math.min(...gaps) > mean / 3,
    `${tag}: a busy ring spreads evenly (${gaps.length + 1} ropes, gaps ${gaps.map((g) => Math.round(g)).join(",")}, mean ${mean.toFixed(0)})`,
  );

  await page.close();
  await ctx.close();
}

await browser.close();
server.close();
console.log(failed ? "touch-check: FAILED" : "touch-check: all good");
process.exit(failed ? 1 : 0);
