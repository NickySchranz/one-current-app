/* Capture hi-res app stills for the poster set, into
   one_current/promo/public/stills/. Phone states at deviceScaleFactor 3
   (print-grade), practice desktop at 2. Usage:
     node scripts/promo-stills.mjs [names…]   # default: all */
import { mkdir } from "node:fs/promises";
import {
  launchBrowser,
  openAppWithExampleData,
  openPage,
  serveDist,
  strokePoint,
} from "./promo-lib.mjs";

const OUT = "/home/nicky/one_current/promo/public/stills";
await mkdir(OUT, { recursive: true });
const PHONE = { width: 390, height: 844 };

const args = process.argv.slice(2);
const wants = (n) => args.length === 0 || args.includes(n);
const appServer = await serveDist(new URL("../dist", import.meta.url).pathname, 4188, "/one-current-app");
const psychoServer = await serveDist("/home/nicky/one-current-psycho/dist", 4189, "/one-current-psycho");
const browser = await launchBrowser();

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("still:", name);
};
const phonePage = () => openAppWithExampleData(browser, PHONE, { cursor: false, dsf: 3 });

/**
 * Open a thread's panel by tapping its line. The first tap on an open thread
 * only sends Pip to it (bonk-run targeting); the panel opens on the second.
 * Tap until the sheet is actually up rather than assuming a count.
 */
const openThread = async (page, pt) => {
  const sheet = page.getByText("What does this thread need from you now?").first();
  const pill = page.getByText("Reflect", { exact: true }).first();
  for (let i = 0; i < 4; i++) {
    // Pip may be standing at this very thread with his offer pills up, in
    // which case they cover the line and his Reflect pill is the way in.
    if (await pill.count()) {
      await pill.click();
      await page.waitForTimeout(900);
    } else {
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(1100);
    }
    if (await sheet.count()) return sheet;
    // Already expanded (a thread answered today opens straight onto its
    // choices, with no question left to tap).
    if (await page.getByText("Integrate", { exact: true }).count()) return null;
  }
  throw new Error("thread panel never opened");
};

const stills = {
  async hero() {
    const page = await phonePage();
    await page.waitForTimeout(1500);
    await shot(page, "still-hero");
    await page.close();
  },

  async loud() {
    const page = await phonePage();
    await page.getByRole("button", { name: "More" }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "A day per second" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /Now$/ }).first().click();
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__clock.take());
    for (let i = 0; i < 70; i++) await page.evaluate(() => window.__clock.tick(100)); // ~7 days
    await shot(page, "still-loud");
    await page.close();
  },

  /**
   * The moment a thread comes home. Integrating now happens on a stage of its
   * own, and finishing it closes that stage and remounts the map — so the
   * clock is frozen *before* the confirming tap and the whole handover is
   * ticked through virtually. The frame lands with the line still drawing
   * itself along its merged path and the feelings mid-flight.
   */
  async reclaim() {
    const page = await phonePage();
    const pt = await strokePoint(page, 0.7, 1);
    const sheet = await openThread(page, pt);
    if (sheet) {
      await sheet.click();
      await page.waitForTimeout(800);
    }
    await page.getByRole("button", { name: "Integrate" }).first().click();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "It is resolved" }).click();
    await page.waitForTimeout(1600);
    const confirm = page.getByRole("button", { name: "Integrate it into Now" });
    await confirm.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.__clock.take());
    await confirm.click();
    // Virtual frames after the tap: the stage goes, the map comes back, the
    // merged line draws itself in and the feelings fly home. Tuned by eye;
    // RECLAIM_FRAMES lets the frame be re-tuned without editing the flow.
    const frames = Number(process.env.RECLAIM_FRAMES ?? 24);
    for (let i = 0; i < frames; i++) await page.evaluate(() => window.__clock.tick(33.33));
    await shot(page, "still-reclaim");
    await page.close();
  },

  /**
   * Answering a thread on its own screen: the thread's line and Now above, the
   * question below, keyboard up. The field is filled rather than just focused —
   * an empty input photographs as a placeholder, not as someone working.
   */
  async stage() {
    const page = await phonePage();
    const pt = await strokePoint(page, 0.7, 1);
    const sheet = await openThread(page, pt);
    if (sheet) {
      await sheet.click();
      await page.waitForTimeout(800);
    }
    await page.getByRole("button", { name: "Act" }).first().click();
    await page.waitForTimeout(1400);
    const field = page.getByLabel("The smallest honest step");
    await field.click();
    await field.fill("Read the letter once, out loud");
    await page.waitForTimeout(900);
    await shot(page, "still-stage");
    await page.close();
  },

  async pip() {
    const page = await phonePage();
    await page.waitForTimeout(8000); // patrol: jump → inspect → talk
    await shot(page, "still-pip");
    await page.close();
  },

  async wholeness() {
    const page = await phonePage();
    // The chip's label describes the self on the high rungs and the attention
    // on the low ones ("You are gathered" / "Your attention is scattered").
    await page.getByLabel(/^(You are|Your attention is) /).first().click();
    await page.waitForTimeout(1200);
    await shot(page, "still-wholeness");
    await page.close();
  },

  async share() {
    // needs live API tokens for the code path (same account as scene 09)
    const page = await openPage(browser, {
      url: "http://localhost:4188/one-current-app/",
      viewport: PHONE,
      seedAuth: false,
      cursor: false,
      dsf: 3,
    });
    await page.getByLabel("Email").fill("test@gmail.com");
    await page.getByLabel("Password").fill("hello1234");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForTimeout(4500);
    await page.evaluate(() => localStorage.setItem("one-current-pro", "1"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1800);
    await page.getByRole("button", { name: "More" }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Load example threads" }).click();
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "More" }).first().click();
    await page.waitForTimeout(800);
    const boxes = page.locator('[aria-label="Which threads"]').getByRole("checkbox");
    const n = Math.min(3, await boxes.count());
    for (let i = 0; i < n; i++) await boxes.nth(i).click();
    const upload = page.getByRole("button", { name: "Upload and get a code" });
    await upload.scrollIntoViewIfNeeded();
    await upload.click();
    await page.getByText(/^[A-Z0-9]{8}$/).waitFor({ timeout: 20000 });
    // Frame on the code itself. Pinning the section heading used to work, but
    // the "what leaves the app" list now sits between the picker and the
    // buttons and is long enough to fill a phone on its own — centring either
    // the heading or the list pushes the code out of shot.
    await page
      .getByText(/^[A-Z0-9]{8}$/)
      .first()
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(600);
    await shot(page, "still-share");
    await page.close();
  },

  async themes() {
    const THEMES = [
      ["Demonfire", "demonfire"],
      ["Koi pond", "koipond"],
      ["Carnival", "carnival"],
      ["Catnap", "catnap"],
      ["Abyss", "abyss"],
      ["Pompom", "pompom"],
      ["Gravemist", "gravemist"],
    ];
    const page = await phonePage();
    // fast-forward ~6 days so every thread is undecided and loud —
    // creatures render vivid and thick instead of the calm decided state
    await page.getByRole("button", { name: "More" }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "A day per second" }).click();
    await page.waitForTimeout(6000);
    await page.getByRole("button", { name: "Back to real time" }).click();
    await page.waitForTimeout(400);
    // no mascot during theme shots: Pip's inspection focuses one thread and
    // dims all the others — reduce motion hides him and keeps full opacity
    await page.getByRole("checkbox", { name: "Reduce motion (no line movement or pulsing)" }).click();
    await page.waitForTimeout(400);
    for (const [label, file] of THEMES) {
      await page.getByRole("button", { name: "More" }).first().click();
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: label }).click();
      await page.waitForTimeout(300);
      await page.getByRole("button", { name: /Now$/ }).first().click();
      await page.waitForTimeout(2000);
      await shot(page, `still-theme-${file}`);
    }
    await page.close();
  },

  async history() {
    const page = await phonePage();
    await page.getByRole("button", { name: "History" }).first().click();
    await page.waitForTimeout(1800);
    await shot(page, "still-history");
    await page.close();
  },

  async actions() {
    const page = await phonePage();
    await page.getByRole("button", { name: /Actions$/ }).first().click();
    await page.waitForTimeout(1500);
    await shot(page, "still-actions");
    await page.close();
  },

  async practice() {
    const page = await openPage(browser, {
      url: "http://localhost:4189/one-current-psycho/",
      viewport: { width: 1200, height: 800 },
      seedAuth: false,
      cursor: false,
    });
    const login = async (email, password) => {
      const out = page.getByRole("button", { name: "Sign out" });
      if (await out.count()) {
        await out.click();
        await page.waitForTimeout(1200);
      }
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForTimeout(4500);
      return (await page.getByRole("button", { name: "+ Add" }).count()) > 0;
    };
    // Practice needs a practitioner account; the patient seed cannot sign in here.
    if (!(await login("johannapoveda.28@gmail.com", "test"))) {
      if (!(await login("test@gmail.com", "hello1234"))) throw new Error("no practitioner session");
    }
    await page.getByRole("button", { name: "Load example clients" }).click();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Open Maya R." }).click();
    await page.waitForTimeout(1200);
    // The client's shares include Wellspring ones, which have no timeline —
    // open each until the threads share (the one with a Timeline toggle) is up.
    const views = page.getByRole("button", { name: "View", exact: true });
    const count = await views.count();
    let opened = false;
    for (let i = 0; i < count; i++) {
      await views.nth(i).click();
      await page.waitForTimeout(2000);
      if (await page.getByRole("button", { name: /^Timeline — / }).count()) {
        opened = true;
        break;
      }
      const back = page.getByRole("button", { name: "← Back" });
      if (await back.count()) {
        await back.click();
        await page.waitForTimeout(1200);
      }
      await page.getByRole("button", { name: "Open Maya R." }).click();
      await page.waitForTimeout(1200);
    }
    if (!opened) throw new Error("no threads share on this client");
    await page.getByRole("button", { name: /^Timeline — / }).click();
    await page.waitForTimeout(4500); // lines draw themselves in
    await shot(page, "still-practice");
    await page.close();
  },
};

for (const [name, fn] of Object.entries(stills)) {
  if (!wants(name)) continue;
  try {
    await fn();
  } catch (e) {
    console.error(`still ${name} FAILED:`, e.message.split("\n")[0]);
    process.exitCode = 1;
  }
}
await browser.close();
appServer.close();
psychoServer.close();
console.log("stills done");
process.exit(process.exitCode ?? 0);
