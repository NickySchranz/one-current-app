/* Gesture + merge-flow test: horizontal time pan, vertical loudness dial,
   integrate (merge) flow, and reduced-motion boot. */
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
await new Promise((r) => server.listen(4173, r));

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ["--no-sandbox"],
});

const errors = [];
async function newPage(opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, ...opts });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[console] ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  return page;
}
async function loadExamples(page) {
  // The login gate: seed a session so the checks land straight in the app.
await page.addInitScript(() => {
  localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
  // the guided tour greets first-run users; the checks skip it
  localStorage.setItem("one-current-tutorial-v1", "done");
});
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "More" }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Load example threads" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Now", exact: true }).first().click();
  await page.waitForTimeout(2000);
}
const branchPoint = (page, frac = 0.5) =>
  page.evaluate((f) => {
    const el = document.querySelector('path[stroke="transparent"]');
    const p = el.getPointAtLength(el.getTotalLength() * f);
    const m = el.getScreenCTM();
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  }, frac);

// ---- 1. horizontal time pan ------------------------------------------------
{
  const page = await newPage();
  await loadExamples(page);
  await page.screenshot({ path: "/tmp/gest-01-before-pan.png" });
  // drag on empty timeline space (above the top branch, mid-canvas)
  await page.mouse.move(500, 110);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(500 + i * 25, 110);
  await page.mouse.up();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/gest-02-after-pan.png" });
  console.log("pan: done");

  // ---- 2. vertical loudness dial --------------------------------------------
  await page.getByRole("button", { name: "Now", exact: true }).first().click();
  await page.waitForTimeout(1500);
  const pt = await branchPoint(page, 0.5);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) await page.mouse.move(pt.x, pt.y + i * 8);
  await page.screenshot({ path: "/tmp/gest-03-dial-mid.png" });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/tmp/gest-04-dial-after.png" });
  const stored = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) ?? "";
      if (v.includes("loudness")) {
        try {
          const data = JSON.parse(v);
          const arr = Array.isArray(data) ? data : Object.values(data);
          for (const b of arr.flat()) {
            if (b && typeof b === "object" && "loudness" in b)
              out.push(`${b.title}: ${b.loudness}`);
          }
        } catch {}
      }
    }
    return out;
  });
  console.log("dial: done —", stored.join(" | ") || "no loudness found in storage");
  await page.close();
}


// ---- 2b. Pip attacks: tap a thread, bonk it, run to the next --------------
{
  const page = await newPage();
  await loadExamples(page);
  await page.getByText("The rent increase letter", { exact: true }).first().click({ force: true });
  await page.waitForTimeout(400);
  const bonk = page.getByRole("button", { name: "Have Pip calm this thread" });
  const armed = await bonk.isVisible().catch(() => false);
  const panelStayedShut =
    (await page.getByText("What does this thread need from you now?").count()) === 0;
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("one-current/table/branches") ?? "[]"));
  await bonk.click();
  await page.waitForTimeout(180);
  await page.screenshot({ path: "/tmp/gest-11-attack-a.png" });
  await page.waitForTimeout(420);
  await bonk.click(); // rapid-fire: right after the cooldown lets go
  await page.waitForTimeout(1400);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("one-current/table/branches") ?? "[]"));
  const rent0 = before.find((b) => b.title === "The rent increase letter");
  const rent1 = after.find((b) => b.title === "The rent increase letter");
  const droppedTwice = rent1.loudness === Math.max(1, rent0.loudness - 2);
  // run to another thread: arming is instant, no patrol wait
  await page.getByText("The argument with my father", { exact: true }).first().click({ force: true });
  await page.waitForTimeout(400);
  const rearmed = await bonk.isVisible().catch(() => false);
  await bonk.click();
  await page.waitForTimeout(1200);
  const after2 = await page.evaluate(() => JSON.parse(localStorage.getItem("one-current/table/branches") ?? "[]"));
  const arg0 = before.find((b) => b.title === "The argument with my father");
  const arg1 = after2.find((b) => b.title === "The argument with my father");
  // the strike works on the FELT (drifted) loudness, so the stored value may
  // stay equal while the drift anchor resets — the proof is the fresh anchor
  const today = new Date().toISOString().slice(0, 10);
  const secondHit =
    arg1.loudnessSetOn === today &&
    arg1.loudness <= arg0.loudness &&
    arg1.loudnessSetOn !== arg0.loudnessSetOn;
  // with nothing armed, Bonk strikes wherever Pip is patrolling
  await page.getByRole("button", { name: "Put the club away" }).click().catch(() => {});
  await page.waitForTimeout(400);
  const barStillThere = await bonk.isVisible().catch(() => false);
  const beforeFree = await page.evaluate(() => JSON.parse(localStorage.getItem("one-current/table/branches") ?? "[]"));
  await bonk.click();
  await page.waitForTimeout(1000);
  const afterFree = await page.evaluate(() => JSON.parse(localStorage.getItem("one-current/table/branches") ?? "[]"));
  const todayStr = new Date().toISOString().slice(0, 10);
  const freeHit = afterFree.some((b) => {
    const was = beforeFree.find((x) => x.id === b.id);
    return was && b.loudnessSetOn === todayStr && (was.loudnessSetOn !== b.loudnessSetOn || b.loudness < was.loudness);
  });

  // Reflect opens the full panel for whatever is focused
  await page.getByRole("button", { name: "Reflect on this thread" }).click();
  await page.waitForTimeout(800);
  const panelOnSecondTap =
    (await page.getByText("How loud is this thread right now?").count()) > 0 ||
    (await page.getByText("What does this thread need from you now?").count()) > 0;
  console.log(
    "attack: done —",
    armed ? "armed on first tap" : "NOT ARMED",
    panelStayedShut ? "panel stayed shut" : "PANEL OPENED EARLY",
    droppedTwice ? "rapid double bonk (-2)" : `RAPID BONK BROKE (${rent0.loudness}→${rent1.loudness})`,
    rearmed && secondHit ? "ran to next thread (-1)" : "SECOND TARGET FAILED",
    panelOnSecondTap ? "reflect opens the panel" : "REFLECT DID NOT OPEN",
    barStillThere ? "bar always up" : "BAR HID",
    freeHit ? "bonks pip's own focus" : "FREE BONK MISSED",
  );
  if (!armed || !panelStayedShut || !droppedTwice || !rearmed || !secondHit || !panelOnSecondTap || !barStillThere || !freeHit)
    process.exitCode = 1;
  await page.close();
}

// ---- 3. merge (integrate) flow ---------------------------------------------
{
  const page = await newPage();
  await loadExamples(page);
  const pt = await branchPoint(page, 0.6);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(500);
  {
    const reflect = page.getByRole("button", { name: "Reflect on this thread" });
    if (await reflect.isVisible().catch(() => false)) await reflect.click();
  }
  await page.waitForTimeout(600);
  await page.getByText("What does this thread need from you now?").first().click();
  await page.waitForTimeout(500);
  const integrate = page.getByRole("button", { name: /^Integrate\b/ }).last();
  await integrate.click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /It is resolved/ }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/tmp/gest-05-merge-wizard.png" });
  await page.getByRole("button", { name: "Integrate it into Now" }).last().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "/tmp/gest-06-merged.png" });
  console.log("merge: done");
  await page.close();
}

// ---- 3b. burn it away: fire, then truly gone ------------------------------
{
  const page = await newPage();
  await loadExamples(page);
  await page.getByText("The rent increase letter", { exact: true }).first().click({ force: true });
  await page.waitForTimeout(500);
  {
    const reflect = page.getByRole("button", { name: "Reflect on this thread" });
    if (await reflect.isVisible().catch(() => false)) await reflect.click();
  }
  await page.waitForTimeout(600);
  await page.getByText("What does this thread need from you now?").first().click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^Integrate\b/ }).last().click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Burn it away/ }).click();
  await page.waitForTimeout(500);
  const sugg = page.getByRole("button", { name: /^Burn / }).first();
  if (await sugg.isVisible().catch(() => false)) await sugg.click();
  await page.getByPlaceholder(/a fear, a story/).fill("the 3am spiral");
  await page.getByRole("button", { name: "Add to the fire" }).click();
  await page.waitForTimeout(200);
  const strike = page.getByRole("button", { name: "Strike the match" });
  const disabledBefore = await strike.isDisabled();
  await page.getByPlaceholder(/one sentence you'll keep/).fill("rent is a problem, not a verdict");
  await page.waitForTimeout(200);
  const enabledAfter = !(await strike.isDisabled());
  await page.screenshot({ path: "/tmp/gest-08-burn-form.png" });
  await strike.click();
  for (const [ms, name] of [[400, "a"], [500, "b"], [600, "c"], [700, "d"]]) {
    await page.waitForTimeout(ms);
    await page.screenshot({ path: `/tmp/gest-09-burning-${name}.png` });
  }
  const midFire = await page.evaluate(() =>
    [...document.querySelectorAll("svg circle, svg path")].some((p) => {
      const c = (p.getAttribute("stroke") ?? p.getAttribute("fill") ?? "").toLowerCase();
      return c === "#ff9a3d" || c === "#ffd27a" || c === "#ff6a2d";
    }),
  );
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "/tmp/gest-10-burned.png" });
  const after = await page.evaluate(async () => {
    const fire = [...document.querySelectorAll("svg circle, svg path")].some((p) => {
      const c = (p.getAttribute("stroke") ?? p.getAttribute("fill") ?? "").toLowerCase();
      return c === "#ff9a3d" || c === "#ffd27a" || c === "#ff6a2d";
    });
    const titleInDom = document.body.textContent.includes("The rent increase letter");
    const raw = localStorage.getItem("one-current/table/branches");
    const inStorage = raw ? raw.includes("The rent increase letter") : false;
    const staleDash = [...document.querySelectorAll("svg path")].some((p) => {
      const d = p.getAttribute("stroke-dasharray") ?? "";
      const w = parseFloat(p.getAttribute("stroke-width") ?? "0");
      return w >= 3 && /^8[ ,]4$/.test(d.trim());
    });
    return { fire, titleInDom, inStorage, staleDash };
  });
  await page.getByRole("button", { name: "History" }).first().click();
  await page.waitForTimeout(900);
  const lessonKept = (await page.getByText("rent is a problem, not a verdict").count()) > 0;
  const sectionShown = (await page.getByText("What the fires taught you").count()) > 0;
  console.log(
    "burn: done —",
    disabledBefore && enabledAfter ? "lesson gate ok" : "LESSON GATE BROKEN",
    midFire ? "flames seen" : "NO FLAMES",
    after.fire ? "FIRE LINGERS" : "fire out",
    !after.titleInDom && !after.inStorage ? "thread fully gone" : "THREAD SURVIVED",
    after.staleDash ? "STALE DASH" : "dashes clean",
    lessonKept && sectionShown ? "lesson kept in history" : "LESSON MISSING",
  );
  if (
    !disabledBefore || !enabledAfter || !midFire || after.fire ||
    after.titleInDom || after.inStorage || after.staleDash || !lessonKept || !sectionShown
  )
    process.exitCode = 1;
  await page.close();
}

// ---- 4. reduced motion boot ------------------------------------------------
{
  const page = await newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loadExamples(page);
  await page.screenshot({ path: "/tmp/gest-07-reduced-motion.png" });
  console.log("reduced-motion: done");
  await page.close();
}

await browser.close();
server.close();
console.log(errors.length ? "ERRORS:\n" + errors.slice(0, 20).join("\n") : "no console errors");
