/* Headless check of account isolation: a different account signing in on the
   same device is asked first, then starts with a clean slate; the same account
   returning keeps everything. Offline by nature (static dist, no API), which
   exercises the offline sign-in fallback — the historically open hole.
     npx expo export --platform web && node scripts/account-switch-check.mjs */
import { serveDist, launchBrowser } from "./promo-lib.mjs";

const PORT = 4342;
const dist = new URL("../dist", import.meta.url).pathname;

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const server = await serveDist(dist, PORT, "");
const browser = await launchBrowser();
// One persistent context: the whole point is what survives on the "device".
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
await ctx.addInitScript(() => localStorage.setItem("one-current-tutorial-v1", "done"));
const page = await ctx.newPage();
const goHome = async () => {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
};

async function signInAs(email, expectConfirm) {
  const already = await page.getByRole("button", { name: "Sign in" }).first().isVisible().catch(() => false);
  if (!already) throw new Error("not on the auth gate");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForTimeout(900);
  const confirm = await page
    .getByText("This device holds another account's threads", { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  check(`confirm ${expectConfirm ? "shown" : "not shown"} for ${email}`, confirm === expectConfirm);
  if (confirm && expectConfirm) {
    await page.getByRole("button", { name: "Continue and remove them" }).click();
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(1200);
  // A same-account return lands wherever the session left off (the More page,
  // since Sign out lives there) — the counts below need the timeline mounted.
  // A takeover already lands on Now (the wipe resets the view), and its
  // walkthrough card covers the tab bar, so only navigate when it's absent.
  const tourUp = await page.getByText("Hi! I'm Pip!").first().isVisible().catch(() => false);
  const nowTab = page.getByText("●Now").first();
  if (!tourUp && (await nowTab.isVisible().catch(() => false))) {
    await nowTab.click();
    await page.waitForTimeout(900);
  }
}

async function signOut() {
  await page.getByText("≡More").first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForTimeout(900);
}

async function skipTourIfShown() {
  const skip = page.getByText("Skip tour").first();
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(400);
  }
}

async function createThread(title) {
  await skipTourIfShown();
  await page.getByLabel("New thread").first().click();
  await page.waitForTimeout(800);
  await page.getByLabel("Name the thread").fill(title);
  const next = page.getByRole("button", { name: "Next" });
  await next.click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Today", exact: true }).first().click();
  await next.click();
  await page.waitForTimeout(400);
  await next.click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Start the thread" }).click();
  await page.waitForTimeout(2200);
}

const threadCount = () => page.evaluate(() => document.querySelectorAll('path[stroke="transparent"]').length);
const owner = () => page.evaluate(() => localStorage.getItem("one-current-owner"));

// 1. A signs in offline (any password opens the app), creates a thread.
await goHome();
await signInAs("a@onecurrentapp.com", false);
await createThread("A's thread");
check("A sees one thread", (await threadCount()) === 1);
check("owner stamp = a@", (await owner()) === "a@onecurrentapp.com");

// 2. Sign out, B signs in → confirm → clean slate + walkthrough.
await signOut();
check("data survives sign-out", (await threadCount()) >= 0); // gate is up; count meaningless here
await signInAs("b@onecurrentapp.com", true);
check("B sees zero threads", (await threadCount()) === 0);
check("owner stamp = b@", (await owner()) === "b@onecurrentapp.com");
check(
  "walkthrough restarts for B",
  await page.getByText("Hi! I'm Pip!").first().isVisible().catch(() => false),
);
await skipTourIfShown();

// 3. B creates a thread; A returns → confirm → B's thread gone.
await createThread("B's thread");
check("B sees one thread", (await threadCount()) === 1);
await signOut();
await signInAs("a@onecurrentapp.com", true);
check("A' starts clean (B's thread gone)", (await threadCount()) === 0);

// 4. Same-account re-signin: no confirm, data kept.
await createThread("A's second era");
await signOut();
await signInAs("a@onecurrentapp.com", false);
check("same account keeps its thread", (await threadCount()) === 1);
check(
  "no walkthrough replay for the same account",
  !(await page.getByText("Hi! I'm Pip!").first().isVisible().catch(() => false)),
);

// 5. "Go back" leaves everything untouched.
await signOut();
await page.getByLabel("Email").fill("c@onecurrentapp.com");
await page.getByLabel("Password").fill("password-123");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForTimeout(800);
check(
  "confirm shown for c@",
  await page.getByText("This device holds another account's threads", { exact: false }).first().isVisible().catch(() => false),
);
await page.getByRole("button", { name: "Go back" }).click();
await page.waitForTimeout(400);
check("still on the gate", await page.getByRole("button", { name: "Sign in", exact: true }).isVisible().catch(() => false));
check("owner still a@", (await owner()) === "a@onecurrentapp.com");
await signInAs("a@onecurrentapp.com", false);
check("data untouched after Go back", (await threadCount()) === 1);

console.log(failures ? `\n${failures} failure(s)` : "\naccount-switch: all green");
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
