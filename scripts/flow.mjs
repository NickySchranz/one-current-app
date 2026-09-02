/* Interaction flow test: create a thread, watch it appear, open the quick
   menu, dial through the trays — screenshots at each step, console watched. */
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

const step = async (name, ms = 700) => {
  await page.waitForTimeout(ms);
  await page.screenshot({ path: `/tmp/flow-${name}.png` });
  console.log(`step: ${name}`);
};

// The login gate: seed a session so the checks land straight in the app.
await page.addInitScript(() => {
  localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
localStorage.setItem("one-current-tutorial-v1", "done");
});
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

/** Walk the create wizard: name → since when → feelings → the last step.
 * Four steps since the single form was replaced; scripts that filled a name
 * and reached straight for the last button had no coverage of it at all,
 * which is how a dead final step shipped unnoticed. */
async function createThread(page, title, opts = {}) {
  await page.getByLabel("New thread").first().click();
  await page.waitForTimeout(900);
  await page.getByLabel("Name the thread").fill(title);
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Next" }).first().click();   // → since when
  await page.waitForTimeout(500);
  await page.getByText(opts.when ?? "Today", { exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Next" }).first().click();   // → feelings
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Next" }).first().click();   // → loudness
  await page.waitForTimeout(600);
  if (opts.beforeFinish) await opts.beforeFinish(page);
  await page.getByRole("button", { name: "Start the thread" }).click();
  await page.waitForTimeout(opts.settle ?? 1400);
}

// 1-2. walk the create wizard: name, since when, feelings, then start it
await createThread(page, "Tax return looming", {
  beforeFinish: async () => step("01-create-tray"),
});
await step("02-branch-born", 1600);

// 3. close the follow-up tray, then tap the branch line → quick menu
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
// click a point actually on the curved stroke, not the bbox centre
const pt = await page.evaluate(() => {
  const el = document.querySelector('path[stroke="transparent"]');
  const p = el.getPointAtLength(el.getTotalLength() * 0.6);
  const m = el.getScreenCTM();
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
});
await page.mouse.click(pt.x, pt.y);
await step("03-armed-bar");
// The "Reflect on this thread" pill beside Pip is gone: a first tap arms the
// thread and a second opens its decisions.
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(700);
await step("03b-quick-menu");

// 4. expand "what does this thread need" and choose Act
await page.getByText("What does this thread need from you now?").first().click();
await step("04a-menu-expanded");
const act = page.getByRole("button", { name: /^Act\b/ }).last();
if (await act.count()) {
  await act.click();
  await step("04-quick-act");
}

// close with Escape — first Escape only blurs the focused field (parity),
// the second sets the tray down
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await step("05-closed");

// 5. wholeness chip open (its label is the day summary "You are …")
await page.getByLabel(/You are /).first().click();
await step("06-wholeness-panel");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// 6. navigate: History, More
await page.getByRole("button", { name: "History" }).first().click();
await step("07-history");
await page.getByRole("button", { name: "More" }).first().click();
await step("08-more");

await browser.close();
server.close();
console.log(errors.length ? "CONSOLE ERRORS:\n" + errors.slice(0, 25).map((e) => e.slice(0, 400)).join("\n") : "no console errors");
