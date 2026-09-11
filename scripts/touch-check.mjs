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

async function openMap(theme) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
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
  return { ctx, page, cdp };
}

/** A finger, held down across `steps` moves. */
async function swipe(cdp, page, { x, y, dx, dy, steps = 40, gap = 12 }) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + dx * i, y: y + dy * i }],
    });
    await page.waitForTimeout(gap);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(700);
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
{
  const { ctx, page, cdp } = await openMap("riverbed");

  // 1. a vertical finger drag belongs to the SCROLLER, not to us. Gesture
  //    Handler stamps touch-action on the view it is attached to, and with
  //    nothing configured it stamps `none` — which killed this outright.
  const laneY = () =>
    page.evaluate(() => {
      const t = [...document.querySelectorAll("svg text")].find((e) => (e.textContent ?? "").length > 8);
      return t ? Math.round(t.getBoundingClientRect().top) : null;
    });
  const before = await laneY();
  await swipe(cdp, page, { x: 200, y: 620, dx: 0, dy: -6, steps: 30 });
  const after = await laneY();
  check(
    before !== null && after !== null && Math.abs(after - before) > 40,
    `a finger scrolls the lanes (${before} → ${after})`,
  );

  // 2. sideways is ours, and it pans time without a jump
  await startTrace(page, "x");
  await swipe(cdp, page, { x: 120, y: 420, dx: 5, dy: 0, steps: 45, gap: 10 });
  const back = await readTrace(page);
  check(!!back && back.travel > 150, `a finger pans time (${back?.travel.toFixed(0)}px, following ${JSON.stringify(back?.label)})`);
  check(!!back && back.biggest <= 14, `and never jumps doing it (biggest step ${back?.biggest.toFixed(0)}px)`);

  // 3. and it opens nothing on the way past
  const sheet = await page.evaluate(() => document.body.innerText.includes("How loud"));
  check(!sheet, "a drag opens no sheet behind it");

  // 4. toward the future, into the limit: the world may stop, but never snap
  await startTrace(page, "x");
  await swipe(cdp, page, { x: 320, y: 420, dx: -5, dy: 0, steps: 60, gap: 10 });
  const fwd = await readTrace(page);
  check(!!fwd && fwd.biggest <= 14, `meeting the end of time does not snap (biggest step ${fwd?.biggest.toFixed(0)}px at frame ${fwd?.at}/${fwd?.frames})`);

  await page.close();
  await ctx.close();
}

// ── the summit ────────────────────────────────────────────────────────────
{
  const { ctx, page, cdp } = await openMap("summit");

  await startTrace(page, "y");
  await swipe(cdp, page, { x: 60, y: 620, dx: 0, dy: -5, steps: 45, gap: 10 });
  const up = await readTrace(page);
  check(!!up && Math.abs(up.travel) > 150, `a finger climbs through time (${up?.travel.toFixed(0)}px)`);
  check(!!up && up.biggest <= 14, `and never jumps doing it (biggest step ${up?.biggest.toFixed(0)}px)`);

  await startTrace(page, "y");
  await swipe(cdp, page, { x: 60, y: 300, dx: 0, dy: 5, steps: 60, gap: 10 });
  const down = await readTrace(page);
  check(!!down && down.biggest <= 14, `meeting the end of time does not snap (biggest step ${down?.biggest.toFixed(0)}px at frame ${down?.at}/${down?.frames})`);

  // sideways turns the mountain: the ropes move, the time frame does not
  const ropeXs = () =>
    page.evaluate(() =>
      window.__ocRopes
        ? [...window.__ocRopes.values()].map((at) => at(400)).filter((v) => v !== null).map((v) => Math.round(v))
        : null,
    );
  const railY = () =>
    page.evaluate(() => {
      const t = [...document.querySelectorAll("svg text")].find((e) => /^\d+$/.test(e.textContent ?? ""));
      return t ? Math.round(t.getBoundingClientRect().top) : null;
    });
  const ropesBefore = await ropeXs();
  const railBefore = await railY();
  await swipe(cdp, page, { x: 200, y: 500, dx: -4, dy: 0, steps: 30, gap: 14 });
  const ropesAfter = await ropeXs();
  const railAfter = await railY();
  check(
    !!ropesBefore && !!ropesAfter && ropesBefore.some((v, i) => Math.abs(v - (ropesAfter[i] ?? v)) > 8),
    `a sideways finger turns the mountain (${ropesBefore?.slice(0, 3)} → ${ropesAfter?.slice(0, 3)})`,
  );
  check(
    railBefore !== null && railAfter !== null && Math.abs(railAfter - railBefore) <= 2,
    `and leaves the time frame alone (rail ${railBefore} → ${railAfter})`,
  );

  /* 5. A rope that has been answered coils at its ledge, high above the
   *    viewport — so the canvas must stop drawing it in the hanging band.
   *
   *    This is the one that catches a stale spec. The draw worklet closes
   *    over the spec it was built with, and answering a rope changes whether
   *    it rides the mountain and where both its ends are; with the spec left
   *    out of the worklet's dependencies the canvas kept drawing every rope
   *    exactly where it used to hang. */
  const hanging = () =>
    page.evaluate(() =>
      window.__ocRopes
        ? [...window.__ocRopes.values()].filter((at) => at(400) !== null).length
        : null,
    );
  const before5 = await hanging();
  // Every open thread decided today: the same seeding summit-check uses.
  await page.evaluate(() => {
    const key = "one-current/table/branches";
    const today = new Date().toISOString().slice(0, 10);
    const rows = JSON.parse(localStorage.getItem(key) ?? "[]").map((b) =>
      b.status !== "merged" && b.status !== "converted-to-project" && !b.mergeDate
        ? { ...b, lastDecisionOn: today }
        : b,
    );
    localStorage.setItem(key, JSON.stringify(rows));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const after5 = await hanging();
  check(
    before5 !== null && after5 !== null && before5 > 0 && after5 < before5,
    `answered ropes leave the hanging band (${before5} → ${after5})`,
  );

  await page.close();
  await ctx.close();
}

await browser.close();
server.close();
console.log(failed ? "touch-check: FAILED" : "touch-check: all good");
process.exit(failed ? 1 : 0);
