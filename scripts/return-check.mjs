/* The return greeting, end to end.
 *
 * Coming back after a break used to be the app's harshest moment: loudness
 * drifted +1 for every calendar day since the last decision, so a week away
 * put every thread at the top and the wholeness chip opened with "Today can
 * feel foggy and tiring". Nothing warned the user, and nothing they could have
 * done would have prevented it.
 *
 * This asserts the whole fix: absence does not raise the dial, Pip says the
 * threads were held, the chip withholds its forecast until the user has been
 * asked, and "Still true" re-anchors everything in one tap.
 *
 * Run: npx expo export --platform web && node scripts/return-check.mjs
 */
import { serveDist, launchBrowser } from "./promo-lib.mjs";

const PORT = 4344;
const dist = new URL("../dist", import.meta.url).pathname;

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const server = await serveDist(dist, PORT, "");
const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });

const DAYS_AWAY = 6;
await ctx.addInitScript((away) => {
  localStorage.setItem("one-current-auth", JSON.stringify({ email: "back@onecurrentapp.com" }));
  localStorage.setItem("one-current-tutorial-v1", "done");
  const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const day = (d) => iso(d).slice(0, 10);
  // Last here a week ago, and every thread answered that same day.
  localStorage.setItem("one-current-present-days", JSON.stringify([day(away + 1)]));
  const titles = ["The interview", "Mum's health", "The flat"];
  localStorage.setItem(
    "one-current/table/branches",
    JSON.stringify(
      titles.map((title, i) => ({
        id: `back-${i}`,
        title,
        type: "unknown",
        orientation: "unknown",
        status: "active",
        forkDate: day(30),
        loudness: 2,
        loudnessLog: [{ at: iso(30), loudness: 2 }],
        lastDecisionOn: day(away + 1),
        storedQualities: [],
        unmetNeeds: [],
        controllability: "unclear",
        commits: [],
        mergeIds: [],
        firstCreatedAt: iso(30),
        lastActivatedAt: iso(30),
        recurrenceCount: 0,
      })),
    ),
  );
}, DAYS_AWAY);

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const card = page.getByLabel("return-card");
check("the return card appears", (await card.count()) === 1);
check(
  "it names the gap",
  await page.getByText(`You were away ${DAYS_AWAY} days.`).isVisible().catch(() => false),
);
check(
  "it says the threads were held, not missed",
  await page.getByText("I kept them as you left them.").isVisible().catch(() => false),
);
check(
  "each thread shows the level it was LEFT at",
  (await page.getByText("was murmuring").count()) === 3,
  `${await page.getByText("was murmuring").count()} of 3`,
);

// The chip must not forecast a hard day before the user has been asked.
const chip = page.getByRole("button", { name: /where you left them|moves with your main line/ }).first();
await chip.click();
await page.waitForTimeout(400);
check(
  "the chip holds its judgement",
  await page.getByText("Your threads are where you left them.").isVisible().catch(() => false),
);
check(
  "no forecast of a hard day",
  !(await page.getByText("Today can feel foggy and tiring").isVisible().catch(() => false)),
);
await page.keyboard.press("Escape");
await chip.click({ force: true }).catch(() => {});
await page.waitForTimeout(300);

// "All still the same" is the cheap honest answer: it re-anchors, it does
// not decide. The other two — "Something changed", and per-row "Not any
// more" — are the rest of the brief's three.
check(
  "the other two honest answers are offered",
  (await page.getByRole("button", { name: "Something changed" }).count()) === 1 &&
    (await page.getByRole("button", { name: "Not any more" }).count()) > 0,
);
await page.getByRole("button", { name: "All still the same" }).click();
await page.waitForTimeout(800);
check("the card is set down", (await page.getByLabel("return-card").count()) === 0);

const stored = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("one-current/table/branches") ?? "[]"),
);
const today = new Date().toISOString().slice(0, 10);
check(
  "every thread re-anchored to today",
  stored.length === 3 && stored.every((b) => b.loudnessSetOn === today),
  stored.map((b) => b.loudnessSetOn).join(", "),
);
check(
  "and none was marked decided — the day's answers are still ahead",
  stored.every((b) => b.lastDecisionOn !== today),
);
check(
  "the stored loudness is untouched",
  stored.every((b) => b.loudness === 2),
  stored.map((b) => b.loudness).join(", "),
);
check("no console errors", errors.length === 0, errors.join(" | "));

await browser.close();
server.close();
console.log(`\n${failures} failure(s).`);
process.exit(failures > 0 ? 1 : 0);
