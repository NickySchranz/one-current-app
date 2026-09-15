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
  await page.getByRole("button", { name: /Return to Now/i }).first().click().catch(() => {});
  await page.waitForTimeout(1800);
  const world = () =>
    page.evaluate(() => {
      const g = [...document.querySelectorAll("svg g")]
        .map((n) => /translate\((-?[\d.]+)/.exec(n.getAttribute("transform") ?? ""))
        .filter(Boolean);
      return g.length > 1 ? Number(g[1][1]) : null;
    });
  const rest = await world();
  await startTrace(page, "x");
  const seen = [];
  const tick = setInterval(async () => { const v = await world().catch(() => null); if (v !== null) seen.push(v); }, 40);
  await swipe(map, { x: at(0.8), y: 420, dx: -6, dy: 0, steps: 45, gap: 10 });
  clearInterval(tick);
  await readTrace(page);
  const settled = await world();
  const give = seen.length ? Math.max(...seen.map((v) => Math.abs(v - (rest ?? 0)))) : 0;
  check(give > 20, `${tag}: the end of time gives (${give.toFixed(0)}px of band)`);
  check(
    rest !== null && settled !== null && Math.abs(settled - rest) < 2,
    `${tag}: and settles back onto it (${rest} → ${settled})`,
  );

  /* 4. Two rebases inside one render. A long drag with NO yielding between
   *    moves; a dropped rebase shows up as a whole 120px of missing travel. */
  await startTrace(page, "x");
  await swipe(map, { x: at(0.1), y: 420, dx: 9, dy: 0, steps: 40, gap: 0 });
  const fast = await readTrace(page);
  check(
    !!fast && fast.travel > 260,
    `${tag}: a fast flick loses no rebase (${fast?.travel.toFixed(0)}px of 360)`,
  );

  await page.close();
  await ctx.close();
}

// ── the summit ────────────────────────────────────────────────────────────
for (const mode of MODES) {
  const map = await openMap("summit", mode);
  const { ctx, page } = map;
  const tag = `summit/${mode.name}`;

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
  // By id, not by position in the list: a turn changes WHICH ropes are in
  // view, so comparing the nth visible one to the nth visible one compares
  // two different ropes.
  const ropeXs = () =>
    page.evaluate(() => {
      if (!window.__ocRopes) return null;
      const out = {};
      for (const [id, f] of window.__ocRopes.entries()) {
        const v = f(400);
        if (v !== null) out[id] = Math.round(v);
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
  const hanging = await page.evaluate(() => {
    if (!window.__ocRopeSpec) return [];
    const out = [];
    for (const info of Object.values(window.__ocRopeSpec)) {
      // Waiting, legible, and measured at its COLUMN — the sway wanders a
      // rope fourteen pixels either side of where it hangs.
      if (info.coiled || info.seen() <= 0.5) continue;
      const c = info.column();
      if (c !== null) out.push(Math.round(c));
    }
    return out;
  });
  const cols = hanging;
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
