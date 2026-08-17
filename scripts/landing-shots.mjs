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

// ---- phone shots (390x780 @2x) ----
const phone = await appPage({ width: 390, height: 780 });
await shot(phone, "timeline-mobile");

// peek: tap a thread line — the quick menu opens on its slider
const pt = await strokePoint(phone, 0.7);
await phone.mouse.click(pt.x, pt.y);
await phone.waitForTimeout(1200);
await shot(phone, "peek");

// expanded: what does this thread need from you now?
await phone.getByText("What does this thread need from you now?").first().click();
await phone.waitForTimeout(900);
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
await phone.getByLabel(/You are /).first().click();
await phone.waitForTimeout(900);
await shot(phone, "wholeness");
await phone.close();

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
  await psycho.getByLabel("Email").fill(email);
  await psycho.getByLabel("Password", { exact: true }).fill(password);
  await psycho.getByRole("button", { name: "Sign in" }).click();
  await psycho.waitForTimeout(3000);
  return (await psycho.getByRole("button", { name: "+ Add" }).count()) > 0;
};
if (!(await psychoLogin("demo@onecurrent.app", "demo1234"))) {
  const out = psycho.getByRole("button", { name: "Sign out" });
  if (await out.count()) {
    await out.click();
    await psycho.waitForTimeout(1000);
  }
  if (!(await psychoLogin("johannapoveda.28@gmail.com", "test")))
    throw new Error("no practitioner session for screenshots");
}
await psycho.getByRole("button", { name: "Load example clients" }).click();
await psycho.waitForTimeout(800);
await psycho.getByRole("button", { name: "Open Maya R." }).click();
await psycho.waitForTimeout(600);
await psycho.getByRole("button", { name: "View", exact: true }).first().click();
await psycho.waitForTimeout(1500);
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
