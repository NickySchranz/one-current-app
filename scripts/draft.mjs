/* Optimistic-create test: the line appears when the form opens, follows the
   typed name, vanishes on cancel, and stays on save. Dashed lines: none. */
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
await new Promise((r) => server.listen(4175, r));

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ["--no-sandbox"],
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:4175/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const branchCount = () =>
  page.evaluate(() => document.querySelectorAll('path[stroke="transparent"]').length);

const before = await branchCount();

// 1. opening the form draws the line immediately
await page.getByLabel("New thread").first().click();
await page.waitForTimeout(1200);
const whileOpen = await branchCount();
console.log(`optimistic line: before=${before} open=${whileOpen}`, whileOpen === before + 1 ? "OK" : "FAIL");

// 2. the typed name walks onto the line
await page.getByLabel("Name the thread").fill("Draft under test");
await page.waitForTimeout(400);
const hasLabel = await page.evaluate(() =>
  [...document.querySelectorAll("svg text")].some((t) => t.textContent.includes("Draft under test")),
);
console.log("live label:", hasLabel ? "OK" : "FAIL");
await page.screenshot({ path: "/tmp/draft-01-open.png" });

// 3. cancel takes it away
await page.getByRole("button", { name: "Cancel" }).click();
await page.waitForTimeout(800);
const afterCancel = await branchCount();
const labelGone = await page.evaluate(
  () => ![...document.querySelectorAll("svg text")].some((t) => t.textContent.includes("Draft under test")),
);
console.log(
  `cancel removes: count=${afterCancel}`,
  afterCancel === before && labelGone ? "OK" : "FAIL",
);
await page.screenshot({ path: "/tmp/draft-02-cancelled.png" });

// 4. create again, save — the line stays (and survives reload)
await page.getByLabel("New thread").first().click();
await page.waitForTimeout(800);
await page.getByLabel("Name the thread").fill("Kept thread");
await page.getByRole("button", { name: "Start the thread" }).click();
await page.waitForTimeout(1500);
// no loudness field in the create form anymore
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
const afterSave = await branchCount();
console.log(`save keeps: count=${afterSave}`, afterSave === before + 1 ? "OK" : "FAIL");

// 4b. after the born animation, panning must not reveal a stale draw-in dash
await page.mouse.move(500, 150);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(500 + i * 30, 150);
await page.mouse.up();
await page.waitForTimeout(600);
const staleDash = await page.evaluate(() =>
  [...document.querySelectorAll("path")]
    .filter((p) => parseFloat(p.getAttribute("stroke-width") ?? "0") >= 2)
    .map((p) => p.getAttribute("stroke-dasharray"))
    .filter((da) => {
      if (!da || da === "none") return false;
      const first = parseFloat(da);
      // a dash longer than any path is a solid stroke; short dashes are the bug
      return first < 10000 && first > 3; // ignore the dotted future axis (2 6)
    }),
);
console.log(
  `stale born dash after pan: [${staleDash.join(" | ")}]`,
  staleDash.length === 0 ? "OK" : "FAIL",
);
await page.screenshot({ path: "/tmp/draft-04-after-pan.png" });
await page.getByRole("button", { name: "Now", exact: true }).first().click();
await page.waitForTimeout(800);

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const persisted = await page.evaluate(() =>
  [...document.querySelectorAll("svg text")].some((t) => t.textContent.includes("Kept thread")),
);
console.log("persists after reload:", persisted ? "OK" : "FAIL");

// 5. dashed lines nowhere on thread strokes (example data has a handed-off thread)
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Load example threads" }).click();
await page.waitForTimeout(900);
await page.getByRole("button", { name: "Now", exact: true }).first().click();
await page.waitForTimeout(2000);
const dashed = await page.evaluate(() =>
  [...document.querySelectorAll('path[stroke-dasharray]')]
    .filter((p) => {
      // the main line's future dots and flow shimmer are allowed; thread
      // bodies are the thick coloured strokes
      const w = parseFloat(p.getAttribute("stroke-width") ?? "0");
      const da = p.getAttribute("stroke-dasharray");
      return w >= 2 && da === "8 4";
    })
    .length,
);
console.log(`dashed thread lines: ${dashed}`, dashed === 0 ? "OK" : "FAIL");
await page.screenshot({ path: "/tmp/draft-03-examples.png" });

// 6. lane stability: with other threads on the board, the optimistic line
// must keep its vertical spot while "since when?" changes.
await page.getByLabel("New thread").first().click();
await page.waitForTimeout(900);
await page.getByLabel("Name the thread").fill("Pinned draft");
await page.waitForTimeout(400);
// SVG user-space y of the label: lane position pure, unaffected by the
// stage's focus scrolling.
const labelY = () =>
  page.evaluate(() => {
    const t = [...document.querySelectorAll("svg text")].find((el) =>
      el.textContent.includes("Pinned draft"),
    );
    return t ? Math.round(parseFloat(t.getAttribute("y"))) : null;
  });
const y0 = await labelY();
const ys = [y0];
for (const when of ["This week", "This month", "Earlier…"]) {
  await page.getByRole("radiogroup", { name: "When this began" }).getByText(when).click();
  await page.waitForTimeout(500);
  ys.push(await labelY());
}
await page.getByText("I am not sure").click();
await page.waitForTimeout(500);
ys.push(await labelY());
const stable = ys.every((y) => y !== null && Math.abs(y - y0) <= 1);
console.log(`draft lane stays put: ys=[${ys.join(", ")}]`, stable ? "OK" : "FAIL");
await page.screenshot({ path: "/tmp/draft-05-pinned-lane.png" });

// 7. saving must not move the line either — the quick menu (loudness) opens
// and the line stays exactly where the draft drew it.
await page.getByRole("button", { name: "Start the thread" }).click();
await page.waitForTimeout(1200);
const ySaved = await labelY();
// nudge the loudness bar, then check again
const bar = page.getByRole("slider").first();
const box = await bar.boundingBox();
if (box) await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
await page.waitForTimeout(600);
const yLoud = await labelY();
// Loudness intentionally pulls a line a few px away from the main line
// (paths.ts pullOffset); a lane hop would be a whole laneGap (>=34px).
const PULL = 16;
const pinnedThroughSave =
  ySaved !== null && yLoud !== null && Math.abs(ySaved - y0) <= 1 && Math.abs(yLoud - y0) <= PULL;
console.log(
  `line stays after save + loudness: y0=${y0} saved=${ySaved} loud=${yLoud}`,
  pinnedThroughSave ? "OK" : "FAIL",
);
await page.screenshot({ path: "/tmp/draft-06-after-save-loudness.png" });
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
const yClosed = await labelY();
console.log(
  `line stays after menu closes: closed=${yClosed}`,
  yClosed !== null && Math.abs(yClosed - y0) <= PULL ? "OK" : "FAIL",
);

await browser.close();
server.close();
console.log(errors.length ? "ERRORS:\n" + errors.slice(0, 10).join("\n") : "no console errors");
