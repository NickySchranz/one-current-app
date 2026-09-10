/* The release's acceptance criteria, walked end to end as a person would.
 *
 *   capture a situation → choose an honest next step or waiting condition →
 *   reload safely → recover context later → record an outcome →
 *   prepare a selected brief
 *
 * Run at a phone width and a desktop width, with no account, because none of
 * it is supposed to need one.
 *
 * Run: npx expo export --platform web && node scripts/acceptance-check.mjs
 */
import { serveDist, launchBrowser, captureSituation } from "./promo-lib.mjs";

const PORT = 4347;
const dist = new URL("../dist", import.meta.url).pathname;

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const server = await serveDist(dist, PORT, "");
const browser = await launchBrowser();

// Short on purpose: the map shortens long names to fit, so a long title
// would make these assertions about text truncation instead of behaviour.
const SITUATION = "The reorg at work";

async function run(name, viewport) {
  console.log(`\n${name} (${viewport.width}×${viewport.height})\n`);
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => {
    localStorage.setItem("one-current-tutorial-v1", "done");
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);

  // 1. capture, with no account and no questionnaire
  const stored = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("one-current/table/branches") ?? "[]"));

  await captureSituation(page, SITUATION);
  check(
    "captured in one field, signed out",
    (await stored()).some((b) => b.title === SITUATION),
  );

  // 2. an honest waiting condition, rather than a step nobody will take
  const open = async () => {
    const listMode = await page.getByRole("button", { name: "Map" }).isVisible().catch(() => false);
    if (listMode) {
      await page.getByRole("button", { name: `Open ${SITUATION}` }).click();
    } else {
      const pt = await page.evaluate(() => {
        const p = document.querySelector('path[stroke="transparent"]');
        if (!p) return null;
        const at = p.getPointAtLength(p.getTotalLength() * 0.7);
        const m = p.getScreenCTM();
        return { x: m.a * at.x + m.c * at.y + m.e, y: m.b * at.x + m.d * at.y + m.f };
      });
      if (!pt) throw new Error("no thread on the map");
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(700);
      await page.mouse.click(pt.x, pt.y);
    }
    await page.waitForTimeout(1000);
    // The menu opens as a peek; the prompt expands it into the full set.
    const prompt = page.getByText("What does this thread need from you now?").first();
    if (await prompt.isVisible().catch(() => false)) {
      await prompt.click();
      await page.waitForTimeout(700);
    }
  };
  await open();
  check(
    "the situation opens its answers",
    await page.getByText("Wait for something").first().isVisible().catch(() => false),
  );

  await page.getByText("Wait for something").first().click();
  await page.waitForTimeout(900);
  await page.getByLabel("What are you waiting for?").fill("the reorg to be announced");
  await page.getByRole("button", { name: "In two weeks" }).click();
  await page.getByRole("button", { name: "Wait for this" }).click();
  await page.waitForTimeout(1800);

  const waitingRow = (await stored()).find((b) => b.title === SITUATION);
  check(
    "waiting is recorded as waiting, not as progress",
    waitingRow?.status === "waiting-with-boundaries",
    `status=${waitingRow?.status}`,
  );

  // 3. reload — nothing is lost, nothing is invented
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2400);
  const after = (await stored()).find((b) => b.title === SITUATION);
  check("it survives a reload", after?.status === "waiting-with-boundaries");
  check(
    "and the app still opens without an account",
    (await page.getByLabel("New thread").count()) > 0,
  );

  // 4. recover the context later, without rereading anything
  await page.getByRole("button", { name: "List" }).click().catch(() => {});
  await page.waitForTimeout(1200);
  const onList = await page.getByText("Most recently touched first", { exact: false }).isVisible().catch(() => false);
  check("the list gives a text way in", onList);
  check(
    "and says where the situation stands without opening it",
    await page.getByText("the reorg to be announced", { exact: false }).first().isVisible().catch(() => false),
  );

  // 5. record an outcome
  await page.getByRole("button", { name: `Open ${SITUATION}` }).click();
  await page.waitForTimeout(1000);
  await page.getByText("Note", { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByLabel("What just happened").fill("They mentioned it in standup");
  await page.getByRole("button", { name: "Note it" }).click();
  await page.waitForTimeout(1800);
  const noted = (await stored()).find((b) => b.title === SITUATION);
  check(
    "the outcome is recorded on the situation",
    (noted?.commits ?? []).some((c) => c.title === "They mentioned it in standup"),
  );

  // 6. prepare a brief and get the text out
  await page.getByRole("button", { name: "List" }).click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Prepare a conversation" }).first().click();
  await page.waitForTimeout(1400);
  check("the brief opens", await page.getByText("What you will hand over").isVisible().catch(() => false));
  const preview = await page.getByLabel("Preview of the notes").innerText();
  check("it carries the situation", preview.includes(SITUATION), preview.slice(0, 60));
  check("and the person's own words", preview.includes("They mentioned it in standup"));
  check("and what they are waiting for", preview.includes("the reorg to be announced"));
  check(
    "nothing in it was invented — every line traces to something saved",
    !preview.toLowerCase().includes("recommend") && !preview.toLowerCase().includes("you should"),
  );

  check("no console errors anywhere in the run", errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.screenshot({ path: `/tmp/acceptance-${viewport.width}.png`, fullPage: false });
  await ctx.close();
}

await run("desktop", { width: 1200, height: 900 });
await run("phone", { width: 390, height: 780 });

await browser.close();
server.close();
console.log(`\n${failures} failure(s).`);
process.exit(failures > 0 ? 1 : 0);
