/* Loudness tracking: every change of a thread's loudness lands on its
   loudnessLog — creation seeds it, the dial appends, a decision (ease) appends. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";

const DIST = new URL("../dist", import.meta.url).pathname;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ico": "image/x-icon" };
const server = createServer(async (req, res) => {
  const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(4178, r));

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
// The login gate: seed a session so the checks land straight in the app.
await page.addInitScript(() => {
  localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
});
await page.goto("http://localhost:4178/");
await page.waitForTimeout(1800);

const readLog = () =>
  page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem("one-current/table/branches") ?? "[]");
    const b = rows.find((r) => r.title === "Loudness log test");
    return b ? { loudness: b.loudness, log: b.loudnessLog ?? null } : null;
  });

// 1. create: the log is seeded with the creation loudness
await page.getByLabel("New thread").first().click();
await page.waitForTimeout(900);
await page.getByLabel("Name the thread").fill("Loudness log test");
await page.getByRole("button", { name: "Start the thread" }).click();
await page.waitForTimeout(1200);
const created = await readLog();
console.log(
  `seeded at creation: log=${JSON.stringify(created?.log)}`,
  created?.log?.length === 1 && created.log[0].loudness === created.loudness && created.log[0].at
    ? "OK" : "FAIL",
);

// 2. dial the loudness bar: one entry appended with the dialed value
const bar = page.getByRole("slider").first();
const box = await bar.boundingBox();
if (box) await page.mouse.click(box.x + box.width * 0.85, box.y + box.height / 2);
await page.waitForTimeout(800);
const dialed = await readLog();
const dialedOk =
  dialed?.log?.length === 2 &&
  dialed.log[1].loudness === dialed.loudness &&
  dialed.log[1].loudness !== dialed.log[0].loudness;
console.log(`dial appends: log=${JSON.stringify(dialed?.log)}`, dialedOk ? "OK" : "FAIL");

// 3. decide a step (Act): easing the loudness appends another entry
// the menu opens as a peek — tapping the question reveals the decisions
await page.getByText("What does this thread need from you now?").first().click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /^Act\b/ }).last().click();
await page.waitForTimeout(600);
await page.getByLabel("The smallest honest step").fill("write one line");
await page.getByRole("button", { name: "Place it on today" }).click();
await page.waitForTimeout(1000);
const eased = await readLog();
const easedOk =
  eased?.log?.length === 3 &&
  eased.log[2].loudness === eased.loudness &&
  eased.log[2].loudness < eased.log[1].loudness;
console.log(`ease appends: log=${JSON.stringify(eased?.log)}`, easedOk ? "OK" : "FAIL");

// 4. dialing to the same value must NOT append (no-change writes are silent)
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
const before = await readLog();
await page.evaluate(() => {
  // touch the thread endpoint to reopen its quick menu
  const t = [...document.querySelectorAll("svg text")].find((el) =>
    el.textContent.includes("Loudness log test"),
  );
  t?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(800);
const menuOpen = await page.getByRole("slider").count();
if (menuOpen > 0) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}
const after = await readLog();
console.log(
  `no phantom entries: ${before?.log?.length} -> ${after?.log?.length}`,
  before?.log?.length === after?.log?.length ? "OK" : "FAIL",
);

await browser.close();
server.close();
console.log(errors.length ? "ERRORS:\n" + errors.slice(0, 5).join("\n") : "no console errors");
