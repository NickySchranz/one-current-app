/* Capture promo footage from the current app builds as deterministic 30fps
   VP8 webm + beat logs, into one_current/promo/public/footage/. The Remotion
   project there (one_current/promo) turns these into the final videos.

   Usage:
     node scripts/promo-footage.mjs            # all scenes
     node scripts/promo-footage.mjs 03 09 10   # specific scenes

   Notes:
   - Scene 09 signs into the live Workers API with the seed patient account
     (off camera) so "Upload and get a code" is available; it writes the code
     to footage/share-code.txt. Scene 10 consumes that code (one-time use),
     so re-run 09 before re-running 10.
   - Seed-account emails must never be in frame: those scenes start recording
     only after navigation/scrolling is done. */
import { readFile, writeFile } from "node:fs/promises";
import {
  FOOTAGE_DIR,
  launchBrowser,
  openAppWithExampleData,
  openPage,
  Recorder,
  serveDist,
  strokePoint,
} from "./promo-lib.mjs";

const PHONE = { width: 390, height: 844 };
const DESK = { width: 1200, height: 800 };
const PATIENT_SEED = { email: "test@gmail.com", password: "hello1234" };
const PRACTICE_SEED = { email: "test@gmail.com", password: "hello1234" };

const args = process.argv.slice(2);
const wants = (id) => args.length === 0 || args.includes(id);

const appServer = await serveDist(new URL("../dist", import.meta.url).pathname, 4188, "/one-current-app");
const psychoServer = await serveDist("/home/nicky/one-current-psycho/dist", 4189, "/one-current-psycho");
const APP_URL = "http://localhost:4188/one-current-app/";
const PSYCHO_URL = "http://localhost:4189/one-current-psycho/";
const browser = await launchBrowser();

/* Tap a thread line on the timeline at `along` (0..1) of its stroke. */
async function tapStroke(rec, page, along, index = 0, glideMs = 600) {
  const pt = await strokePoint(page, along, index);
  if (!pt) throw new Error("no thread stroke found");
  await rec.glideTap(pt.x, pt.y, glideMs);
}

async function typeInto(rec, locator, text) {
  await rec.during(locator.click());
  await rec.during(locator.pressSequentially(text, { delay: 45 }), { min: 10 });
}

/* ---------------------------------------------------------------- scenes */

async function scene01_hero() {
  const page = await openAppWithExampleData(browser, PHONE);
  const rec = await new Recorder(page, "01-hero").start();
  rec.beat("timeline");
  await rec.hold(2600);

  rec.beat("fab");
  await rec.during(rec.glideClick(page.getByLabel("New thread").first(), 700));
  await rec.hold(700);

  rec.beat("form");
  await typeInto(rec, page.getByLabel("Name the thread"), "The presentation on Friday");
  console.log("  01 input value:", await page.getByLabel("Name the thread").inputValue().catch(() => "(n/a)"));
  await rec.glideClick(page.getByRole("button", { name: "Today", exact: true }).first(), 450);
  await rec.hold(400);
  rec.beat("start");
  // the submit sits below the fold in the tray — glideClick scrolls to it
  await rec.glideClick(page.getByRole("button", { name: "Start the thread" }), 600);
  await rec.hold(1000);
  // the new thread opens with its loudness dial — set how loud it feels
  const dial = page.getByRole("slider").first();
  await rec.during(dial.waitFor({ timeout: 8000 }).catch(() => {}), { min: 6, max: 90 });
  if (await dial.count()) {
    rec.beat("loudness");
    const box = await dial.boundingBox();
    if (box) await rec.glideTap(box.x + box.width * 0.7, box.y + box.height / 2, 600);
    await rec.hold(1200);
    await rec.during(page.keyboard.press("Escape"));
  } else {
    await page.screenshot({ path: `${FOOTAGE_DIR}/01-debug.png` });
    console.log(
      "  01 debug (no dial):",
      (await page.evaluate(() => document.body.innerText.slice(0, 300))).replace(/\n/g, " | "),
    );
  }
  await rec.hold(1600); // the thread forks off; Pip reacts
  rec.beat("born");
  await rec.hold(2200);

  rec.beat("tap-thread");
  await tapStroke(rec, page, 0.72, 0, 700);
  await rec.hold(1500); // peek: title + loudness dial
  rec.beat("menu");
  await rec.glideClick(page.getByText("What does this thread need from you now?").first(), 500);
  await rec.hold(1800); // the four options
  rec.beat("act");
  await rec.glideClick(page.getByRole("button", { name: "Act" }).first(), 500);
  await rec.hold(600);
  await typeInto(rec, page.getByLabel("The smallest honest step"), "Outline three slides");
  rec.beat("place");
  await rec.glideClick(page.getByRole("button", { name: "Place it on today" }), 500);
  await rec.hold(2800); // ✓ lands on the line, Pip reacts
  rec.beat("done");
  await rec.hold(1200);
  await rec.stop();
  await page.close();
}

async function scene02_pip() {
  const page = await openAppWithExampleData(browser, PHONE);
  const rec = await new Recorder(page, "02-pip").start();
  rec.beat("patrol");
  await rec.hold(9000); // ~2 patrol cycles: jump → run → inspect → talk
  rec.beat("tap-thread");
  await tapStroke(rec, page, 0.6, 1, 600); // Pip runs to the tapped thread
  await rec.hold(3500);
  rec.beat("close");
  await rec.during(page.keyboard.press("Escape"));
  await rec.hold(3500); // patrol resumes
  await rec.stop();
  await page.close();
}

async function scene03_louder() {
  const page = await openAppWithExampleData(browser, PHONE);
  const setRate = async (label) => {
    await page.getByRole("button", { name: "More" }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: label }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /Now$/ }).first().click();
    await page.waitForTimeout(1200);
  };

  // open a thread's quick menu and expand it; false if it has no expand row
  const openMenu = async (rec, along, idx) => {
    await tapStroke(rec, page, along, idx, 600);
    await rec.hold(1100);
    const expand = page.getByText("What does this thread need from you now?").first();
    if (!(await expand.count())) return false;
    await rec.glideClick(expand, 400);
    await rec.hold(800);
    return true;
  };
  // try several threads until one still has the full menu (open + undecided)
  const openMenuAny = async (rec, indices) => {
    for (const idx of indices) {
      if (await openMenu(rec, 0.7, idx)) return true;
      await rec.during(page.keyboard.press("Escape"));
      await rec.hold(400);
    }
    return false;
  };

  // ---- part A (hour per second): work several threads, each differently ----
  await setRate("An hour per second");
  const recA = await new Recorder(page, "03-louder-a").start();
  recA.beat("flowing");
  await recA.hold(2200);

  recA.beat("act");
  if (await openMenu(recA, 0.75, 0)) {
    await recA.glideClick(page.getByRole("button", { name: "Act" }).first(), 450);
    await recA.hold(500);
    await typeInto(recA, page.getByLabel("The smallest honest step"), "Answer it today");
    await recA.glideClick(page.getByRole("button", { name: "Place it on today" }), 450);
  }
  await recA.hold(1700);

  recA.beat("integrate");
  if (await openMenuAny(recA, [1, 2, 3])) {
    await recA.glideClick(page.getByRole("button", { name: "Integrate" }).first(), 450);
    await recA.hold(1200);
    await recA.glideClick(page.getByRole("button", { name: "It is resolved" }), 450);
    await recA.hold(1500);
    await recA.glideClick(page.getByRole("button", { name: "Integrate it into Now" }), 500);
    await recA.hold(2600); // reclaim flight
  }

  recA.beat("cant");
  if (await openMenuAny(recA, [1, 2, 3])) {
    await recA.glideClick(page.getByRole("button", { name: "Can't do anything about it now" }), 450);
    await recA.hold(1100);
    const back = page.getByRole("button", { name: "Return to timeline" });
    if (await back.count()) await recA.glideClick(back, 400);
  }
  await recA.hold(1000);

  recA.beat("lower");
  await tapStroke(recA, page, 0.7, 2, 600);
  await recA.hold(1000);
  const dial3 = page.getByRole("slider").first();
  if (await dial3.count()) {
    const box = await dial3.boundingBox();
    if (box) await recA.glideTap(box.x + box.width * 0.14, box.y + box.height / 2, 500);
    await recA.hold(900);
    await recA.during(page.keyboard.press("Escape"));
  }
  recA.beat("worked");
  await recA.hold(1600);
  await recA.stop();

  // ---- part B (day per second): the days roll over and the cycle restarts ----
  await setRate("A day per second");
  const recB = await new Recorder(page, "03-louder-b").start();
  recB.beat("days");
  await recB.hold(9000); // ✓ marks clear, undecided threads thicken again
  await recB.stop();
  await page.close();
}

async function scene04_merge() {
  const page = await openAppWithExampleData(browser, PHONE);
  const rec = await new Recorder(page, "04-merge").start();
  rec.beat("timeline");
  await rec.hold(1800);
  rec.beat("tap-thread");
  await tapStroke(rec, page, 0.7, 2, 700);
  await rec.hold(1400);
  await rec.glideClick(page.getByText("What does this thread need from you now?").first(), 450);
  await rec.hold(1300);
  rec.beat("integrate");
  await rec.glideClick(page.getByRole("button", { name: "Integrate" }).first(), 500);
  await rec.hold(1600); // "What is true about this thread now?"
  rec.beat("resolved");
  await rec.glideClick(page.getByRole("button", { name: "It is resolved" }), 500);
  await rec.hold(2400); // MergeWizard: what returns with you
  rec.beat("wizard");
  await rec.hold(1200);
  rec.beat("confirm");
  await rec.glideClick(page.getByRole("button", { name: "Integrate it into Now" }), 600);
  rec.beat("reclaim");
  await rec.hold(3200); // ReclaimFly: qualities fly home, line curves back
  rec.beat("after");
  await rec.hold(2400);
  await rec.stop();
  await page.close();
}

const CREATURE_THEMES = [
  ["Demonfire", "demonfire"],
  ["Koi pond", "koipond"],
  ["Carnival", "carnival"],
  ["Catnap", "catnap"],
  ["Abyss", "abyss"],
  ["Pompom", "pompom"],
  ["Gravemist", "gravemist"],
];

async function scene05_themes() {
  const page = await openAppWithExampleData(browser, PHONE);
  for (const [label, file] of CREATURE_THEMES) {
    await page.getByRole("button", { name: "More" }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: label }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /Now$/ }).first().click();
    await page.waitForTimeout(1800);
    const rec = await new Recorder(page, `05-theme-${file}`).start();
    await rec.hold(3600);
    await rec.stop();
  }
  await page.close();
}

async function scene06_history() {
  const page = await openAppWithExampleData(browser, PHONE);
  const rec = await new Recorder(page, "06-history").start();
  rec.beat("timeline");
  await rec.hold(1200);
  rec.beat("open-history");
  await rec.glideClick(page.getByRole("button", { name: "History" }).first(), 600);
  await rec.hold(2600);
  rec.beat("prev-day");
  await rec.glideClick(page.getByRole("button", { name: "Previous day" }), 500);
  await rec.hold(1600);
  await rec.glideClick(page.getByRole("button", { name: "Previous day" }), 400);
  await rec.hold(1600);
  rec.beat("integrated");
  const filter = page.getByRole("button", { name: "Integrated", exact: true }).first();
  if (await filter.count()) {
    await rec.glideClick(filter, 500);
    await rec.hold(1800);
  }
  const review = page.getByRole("button", { name: "What was integrated" }).first();
  if (await review.count()) {
    rec.beat("review");
    await rec.glideClick(review, 500);
    await rec.hold(2800);
    await rec.during(page.mouse.wheel(0, 420), { min: 12 });
    await rec.hold(1600);
    const back = page.getByRole("button", { name: "Return to Now" });
    if (await back.count()) {
      rec.beat("return");
      await rec.glideClick(back, 500);
      await rec.hold(1800);
    }
  } else {
    await rec.hold(3000);
  }
  await rec.stop();
  await page.close();
}

async function scene07_privacy() {
  const page = await openAppWithExampleData(browser, PHONE);
  // off camera: open More and scroll straight to the Privacy section
  await page.getByRole("button", { name: "More" }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Export everything" }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);

  const rec = await new Recorder(page, "07-privacy").start();
  rec.beat("privacy");
  await rec.hold(2600);
  rec.beat("export");
  const download = page.waitForEvent("download").catch(() => null);
  await rec.glideClick(page.getByRole("button", { name: "Export everything" }), 600);
  await rec.during(download, { max: 90 });
  await rec.hold(1800);
  rec.beat("back-to-now");
  await rec.glideClick(page.getByRole("button", { name: /Now$/ }).first(), 600);
  await rec.hold(3200);
  await rec.stop();
  await page.close();
}

async function scene08_wholeness() {
  const page = await openAppWithExampleData(browser, PHONE);
  const rec = await new Recorder(page, "08-wholeness").start();
  rec.beat("timeline");
  await rec.hold(1500);
  rec.beat("gauge");
  await rec.glideClick(page.getByLabel(/You are /).first(), 600);
  await rec.hold(3600); // "How you are doing" panel
  rec.beat("close-panel");
  await rec.glideClick(page.getByLabel(/You are /).first(), 450); // toggle closed
  await rec.hold(600);
  rec.beat("decide");
  await tapStroke(rec, page, 0.72, 0, 600);
  await rec.hold(1400);
  const expand = page.getByText("What does this thread need from you now?").first();
  if (await expand.count()) {
    await rec.glideClick(expand, 450);
    await rec.hold(800);
    await rec.glideClick(page.getByRole("button", { name: "Act" }).first(), 450);
    await rec.hold(500);
    await typeInto(rec, page.getByLabel("The smallest honest step"), "One honest step");
    await rec.glideClick(page.getByRole("button", { name: "Place it on today" }), 450);
  } else {
    await rec.during(page.keyboard.press("Escape"));
  }
  await rec.hold(1500);
  rec.beat("gauge-after");
  await rec.glideClick(page.getByLabel(/You are /).first(), 600);
  await rec.hold(3000);
  await rec.stop();
  await page.close();
}

async function scene09_share() {
  // Fresh page WITHOUT seeded auth: sign into the live API (off camera) so
  // the code upload is available. The account email must stay out of frame.
  const page = await openPage(browser, { url: APP_URL, viewport: PHONE, seedAuth: false });
  await page.getByLabel("Email").fill(PATIENT_SEED.email);
  await page.getByLabel("Password").fill(PATIENT_SEED.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForTimeout(4500);
  const tokens = await page.evaluate(() => localStorage.getItem("one-current-tokens"));
  if (!tokens) throw new Error("live sign-in failed — no tokens; scene 09 needs the API");
  // ensure Pro + example data
  await page.evaluate(() => localStorage.setItem("one-current-pro", "1"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: "More" }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Load example threads" }).click();
  await page.waitForTimeout(900);
  // straight to the share section, off camera
  await page.getByRole("button", { name: "More" }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Upload and get a code" }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.getByText("Share with a psychologist").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);

  const rec = await new Recorder(page, "09-share").start();
  rec.beat("picker");
  await rec.hold(2200);
  rec.beat("pick");
  const boxes = page.locator('[aria-label="Which threads"]').getByRole("checkbox");
  const n = await boxes.count();
  for (let i = 0; i < Math.min(3, n); i++) {
    await rec.glideClick(boxes.nth(i), 450);
    await rec.hold(350);
  }
  rec.beat("window");
  await rec.glideClick(page.getByRole("button", { name: "Last month" }), 500);
  await rec.hold(900);
  rec.beat("upload");
  await rec.glideClick(page.getByRole("button", { name: "Upload and get a code" }), 600);
  // pump frames until the code appears (real network under virtual clock)
  const codeLoc = page.getByText(/^[A-Z0-9]{8}$/);
  try {
    await rec.during(codeLoc.waitFor({ timeout: 20000 }), { max: 240 });
  } catch (e) {
    await page.screenshot({ path: `${FOOTAGE_DIR}/09-debug.png` });
    console.log(
      "  09 debug text:",
      (await page.evaluate(() => document.body.innerText.slice(0, 500))).replace(/\n/g, " | "),
    );
    throw e;
  }
  rec.beat("code");
  await rec.hold(3600);
  await rec.stop();
  const code = (await codeLoc.textContent())?.trim();
  if (code) await writeFile(`${FOOTAGE_DIR}/share-code.txt`, code);
  console.log("  share code:", code);
  await page.close();
}

async function scene10_practice() {
  // Live practitioner session, established off camera.
  const page = await openPage(browser, {
    url: PSYCHO_URL,
    viewport: DESK,
    seedAuth: false,
    cursor: true,
  });
  // a good session reaches the client list with no "Offline" pill on camera
  const practiceLogin = async ({ email, password }) => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForTimeout(4500);
    const inApp = await page.getByRole("button", { name: "+ Add" }).count();
    const offline = await page.getByText("Offline", { exact: true }).count();
    return inApp > 0 && offline === 0;
  };
  if (!(await practiceLogin(PRACTICE_SEED))) {
    const signOut = page.getByRole("button", { name: "Sign out" });
    if (await signOut.count()) {
      await signOut.click();
      await page.waitForTimeout(1200);
    }
    if (!(await practiceLogin({ email: "johannapoveda.28@gmail.com", password: "test" })))
      throw new Error("no working practitioner session");
  }
  await page.getByRole("button", { name: "Load example clients" }).click();
  await page.waitForTimeout(1200);

  // Part A: redeem the code from scene 09 on Maya's page.
  const code = (await readFile(`${FOOTAGE_DIR}/share-code.txt`, "utf8").catch(() => "")).trim();
  await page.getByRole("button", { name: "Open Maya R." }).click();
  await page.waitForTimeout(1500);

  if (code) {
    const recA = await new Recorder(page, "10-redeem").start();
    recA.beat("client");
    const codeInput = page.getByLabel("Share code");
    await recA.during(codeInput.scrollIntoViewIfNeeded(), { min: 6 });
    await recA.hold(1000);
    recA.beat("type-code");
    await typeInto(recA, codeInput, code);
    await recA.hold(500);
    recA.beat("redeem");
    await recA.glideClick(page.getByRole("button", { name: "Redeem" }), 500);
    await recA.during(
      page.getByText("The share arrived — it is listed above with the other shared files.").waitFor({ timeout: 20000 }),
      { max: 240 },
    );
    recA.beat("arrived");
    await recA.hold(2600);
    await recA.stop();
  } else {
    console.log("  (no share-code.txt — skipping 10-redeem)");
  }

  // Part B: the tour of Maya's shared window.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  const recB = await new Recorder(page, "10-practice").start();
  recB.beat("client");
  await recB.hold(2000);
  recB.beat("view-share");
  await recB.glideClick(page.getByRole("button", { name: "View", exact: true }).first(), 700);
  await recB.hold(2800); // SharePulse: the first question answered at a glance
  recB.beat("timeline");
  await recB.glideClick(page.getByRole("button", { name: /^Timeline — / }), 600);
  await recB.hold(4200); // lines draw themselves in
  recB.beat("focus");
  const focus = page.getByRole("button", { name: /^Focus / }).first();
  if (await focus.count()) {
    await recB.glideClick(focus, 500);
    await recB.hold(2600); // others dim
  }
  recB.beat("daybyday");
  await recB.glideClick(page.getByRole("button", { name: /^Day by day — / }), 600);
  await recB.hold(2000);
  await recB.during(page.mouse.wheel(0, 500), { min: 15 });
  await recB.hold(1500);
  recB.beat("history");
  await recB.during(page.getByRole("button", { name: "← Back" }).click());
  await recB.hold(1200);
  const full = page.getByRole("button", { name: "View full history" });
  if (await full.count()) {
    await recB.glideClick(full, 600);
    await recB.hold(3600);
  }
  recB.beat("end");
  await recB.hold(1000);
  await recB.stop();
  await page.close();
}

/* ------------------------------------------------------------------ main */

const scenes = {
  "01": scene01_hero,
  "02": scene02_pip,
  "03": scene03_louder,
  "04": scene04_merge,
  "05": scene05_themes,
  "06": scene06_history,
  "07": scene07_privacy,
  "08": scene08_wholeness,
  "09": scene09_share,
  "10": scene10_practice,
};

for (const id of Object.keys(scenes).sort()) {
  if (!wants(id)) continue;
  console.log(`scene ${id}…`);
  try {
    await scenes[id]();
  } catch (e) {
    console.error(`scene ${id} FAILED:`, e.message);
    process.exitCode = 1;
  }
}

await browser.close();
appServer.close();
psychoServer.close();
console.log("footage done");
process.exit(process.exitCode ?? 0); // keep-alive sockets otherwise hold the loop
