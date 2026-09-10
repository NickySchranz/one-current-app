/* Using One Current without an account.
 *
 * Signing in used to be a wall: App.tsx returned <AuthGate/> whenever there
 * was no authUser, so a first-time visitor was asked to create an account
 * before seeing a single thing the app does — for features (cloud backup,
 * share codes, checkout) they had not asked for and could not yet want.
 * Every situation, moment and step lives in this device's own database, so
 * none of that needed an account in the first place.
 *
 * This asserts the local product is genuinely whole: a guest reaches Now,
 * captures something, and still has it after a reload — and that the parts
 * that really do need a server say so plainly instead of pretending.
 *
 * Run: npx expo export --platform web && node scripts/guest-check.mjs
 */
import { serveDist, launchBrowser, captureSituation } from "./promo-lib.mjs";

const PORT = 4346;
const dist = new URL("../dist", import.meta.url).pathname;

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const server = await serveDist(dist, PORT, "");
const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });

// Deliberately NO one-current-auth: this is someone who has just arrived.
await ctx.addInitScript(() => {
  localStorage.setItem("one-current-tutorial-v1", "done");
});

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(2200);

check(
  "a guest lands in the app, not on a sign-in wall",
  (await page.getByLabel("New thread").count()) > 0,
);
check(
  "and is not asked for a password to get there",
  (await page.getByPlaceholder("Password").count()) === 0,
);

const TITLE = "Whether to take the contract";
await captureSituation(page, TITLE);
check("a guest can capture a situation", await page.getByText(TITLE).first().isVisible().catch(() => false));

const stored = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("one-current/table/branches") ?? "[]"));
check("it is written to this device", (await stored()).some((b) => b.title === TITLE));

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2200);
check(
  "and it is still there after a reload",
  (await stored()).some((b) => b.title === TITLE),
);
check(
  "the app still opens straight into Now",
  (await page.getByLabel("New thread").count()) > 0,
);

// The honest half: what genuinely needs a server has to say so.
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(1200);
check(
  "Settings says there is no account, in plain words",
  await page.getByText("You are using One Current without an account.").isVisible().catch(() => false),
);
check(
  "and says where the data lives and how it can be lost",
  await page
    .getByText("Clearing your browser data", { exact: false })
    .isVisible()
    .catch(() => false),
);
check(
  "cloud backup names its real requirement rather than hiding",
  await page
    .getByText("Cloud backup needs an account. Everything else works without one.")
    .isVisible()
    .catch(() => false),
);
check(
  "and offers the way to get one",
  (await page.getByRole("button", { name: "Sign in" }).count()) > 0,
);

// Reaching sign-in must not destroy the local session on the way.
await page.getByRole("button", { name: "Sign in" }).first().click();
await page.waitForTimeout(900);
check(
  "sign-in is reachable",
  (await page.getByPlaceholder("Password").count()) > 0,
);
await page.getByRole("button", { name: "← Back to your situations" }).click();
await page.waitForTimeout(1200);
check(
  "and backing out returns to the situations, still intact",
  (await stored()).some((b) => b.title === TITLE),
);

check("no console errors", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
server.close();
console.log(`\n${failures} failure(s).`);
process.exit(failures > 0 ? 1 : 0);
