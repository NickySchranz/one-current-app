/* Capture the landing-page screenshots from the current app builds.
   Writes straight into one_current/public/about/img/ — rerun after UI changes,
   then redeploy the landing (push one_current main). */
import { launchBrowser, openAppWithExampleData, openPage, serveDist, strokePoint } from "./promo-lib.mjs";

const IMG = "/home/nicky/one_current/public/about/img";

const appServer = await serveDist(new URL("../dist", import.meta.url).pathname, 4188, "/one-current-app");
const psychoServer = await serveDist("/home/nicky/one-current-psycho/dist", 4189, "/one-current-psycho");
const browser = await launchBrowser();

const shot = async (page, name) => {
  await page.screenshot({ path: `${IMG}/${name}.png` });
  console.log(`shot: ${name}`);
};

const appPage = (viewport) => openAppWithExampleData(browser, viewport, { cursor: false });

/**
 * Open a thread's panel by tapping its line. The first tap on an open thread
 * only sends Pip to it (bonk-run targeting); the panel opens on the second.
 * Pip may also be standing there with his offer pills up, covering the line —
 * then his Reflect pill is the way in.
 */
const openThread = async (page, pt) => {
  const sheet = page.getByText("What does this thread need from you now?").first();
  const pill = page.getByText("Reflect", { exact: true }).first();
  for (let i = 0; i < 4; i++) {
    if (await pill.count()) {
      await pill.click();
      await page.waitForTimeout(900);
    } else {
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(1100);
    }
    if (await sheet.count()) return sheet;
    // A thread already answered today opens straight onto its choices.
    if (await page.getByRole("button", { name: "Integrate" }).count()) return null;
  }
  throw new Error("thread panel never opened");
};

// ---- phone shots (390x780 @2x) ----
const phone = await appPage({ width: 390, height: 780 });
await shot(phone, "timeline-mobile");

// peek: tap a thread line — the quick menu opens on its slider
const pt = await strokePoint(phone, 0.7);
const sheet = await openThread(phone, pt);
await shot(phone, "peek");

// expanded: what does this thread need from you now?
if (sheet) {
  await sheet.click();
  await phone.waitForTimeout(900);
}
await shot(phone, "quick-menu");

// understand view
await phone.getByRole("button", { name: "Understand this thread" }).last().click();
await phone.waitForTimeout(1000);
await shot(phone, "understand");
await phone.keyboard.press("Escape");
await phone.waitForTimeout(300);
await phone.keyboard.press("Escape");
await phone.waitForTimeout(500);

// actions view
await phone.getByRole("button", { name: /Actions$/ }).first().click();
await phone.waitForTimeout(1000);
await shot(phone, "actions");
await phone.getByRole("button", { name: /Now$/ }).first().click();
await phone.waitForTimeout(1200);

// wholeness panel
// The chip describes the self on the high rungs and the attention on the low
// ones ("You are gathered" / "Your attention is scattered").
await phone.getByLabel(/^(You are|Your attention is) /).first().click();
await phone.waitForTimeout(900);
await shot(phone, "wholeness");
await phone.close();

// ---- Pip, mid-patrol (he lands, inspects, then speaks) ----
// Wait for the bubble rather than a fixed beat: the patrol's timing drifts,
// and a shot taken between phrases is a mascot standing there mutely.
const withPip = async (viewport, name) => {
  const page = await appPage(viewport);
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(1000);
    // The bubble is the one group carrying both a tail polygon and its text —
    // thread labels are bare <text>, so this never matches the map itself.
    const talking = await page.evaluate(() =>
      [...document.querySelectorAll("svg g")].some(
        (g) =>
          g.querySelector(":scope > polygon") &&
          g.querySelector(":scope > text") &&
          Number(getComputedStyle(g).opacity || 1) > 0.6,
      ),
    );
    if (talking) break;
  }
  await shot(page, name);
  await page.close();
};
await withPip({ width: 780, height: 680 }, "mascot-timeline");
await withPip({ width: 390, height: 680 }, "mascot-mobile");

// ---- theme shots (390x800 @2x) ----
const themes = [
  ["Pompom", "pompom"],
  ["Demonfire", "demonfire"],
  ["Koi pond", "koipond"],
  ["Carnival", "carnival"],
  ["Catnap", "catnap"],
  ["Abyss", "abyss"],
  ["Gravemist", "gravemist"],
];
const tp = await appPage({ width: 390, height: 800 });
for (const [label, file] of themes) {
  await tp.getByRole("button", { name: "More" }).first().click();
  await tp.waitForTimeout(500);
  await tp.getByRole("button", { name: label }).click();
  await tp.waitForTimeout(400);
  await tp.getByRole("button", { name: /Now$/ }).first().click();
  await tp.waitForTimeout(2200);
  await shot(tp, file);
}
await tp.close();

// ---- desktop timeline (1360x850 @2x) ----
const desk = await appPage({ width: 1360, height: 850 });
await shot(desk, "timeline-desktop");
await desk.close();

// ---- the practice app (1360x850 @2x) ----
const psycho = await openPage(browser, {
  url: "http://localhost:4189/one-current-psycho/",
  viewport: { width: 1360, height: 850 },
  seedAuth: false,
  cursor: false,
});
const psychoLogin = async (email, password) => {
  const out = psycho.getByRole("button", { name: "Sign out" });
  if (await out.count()) {
    await out.click();
    await psycho.waitForTimeout(1200);
  }
  await psycho.getByLabel("Email").fill(email);
  await psycho.getByLabel("Password", { exact: true }).fill(password);
  await psycho.getByRole("button", { name: "Sign in" }).click();
  await psycho.waitForTimeout(4500);
  return (await psycho.getByRole("button", { name: "+ Add" }).count()) > 0;
};
// Practice needs a practitioner account; a patient login cannot open it.
if (!(await psychoLogin("johannapoveda.28@gmail.com", "test")))
  throw new Error("no practitioner session for screenshots");
await psycho.getByRole("button", { name: "Load example clients" }).click();
await psycho.waitForTimeout(1200);
await psycho.getByRole("button", { name: "Open Maya R." }).click();
await psycho.waitForTimeout(1200);
// The client's shares include Wellspring ones, which have no timeline — open
// each until the threads share (the one with a Timeline toggle) is up.
const views = psycho.getByRole("button", { name: "View", exact: true });
const viewCount = await views.count();
let threadsOpen = false;
for (let i = 0; i < viewCount; i++) {
  await views.nth(i).click();
  await psycho.waitForTimeout(2000);
  if (await psycho.getByRole("button", { name: /^Timeline — / }).count()) {
    threadsOpen = true;
    break;
  }
  const back = psycho.getByRole("button", { name: "← Back" });
  if (await back.count()) {
    await back.click();
    await psycho.waitForTimeout(1200);
  }
  await psycho.getByRole("button", { name: "Open Maya R." }).click();
  await psycho.waitForTimeout(1200);
}
if (!threadsOpen) throw new Error("no threads share on this client");
await psycho.getByRole("button", { name: /^Timeline — / }).click();
await psycho.waitForTimeout(3000); // lines draw themselves in
await shot(psycho, "psycho-app");
await psycho.getByRole("button", { name: "Day by day" }).click();
await psycho.waitForTimeout(1200);
await shot(psycho, "psycho-daybyday");
await psycho.close();

await browser.close();
appServer.close();
psychoServer.close();
console.log("done");
process.exit(0);
