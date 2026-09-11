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
  // WebAssembly.instantiateStreaming refuses anything but application/wasm,
  // and CanvasKit then falls back to a slow ArrayBuffer path after logging a
  // console error — which every check here counts as an app error.
  ".wasm": "application/wasm",
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
  // This box has no root, so chromium's shared libraries live in the cache
  // directory rather than on the system path. Without this the shell dies at
  // launch with "libnspr4.so: cannot open shared object file" and the whole
  // script fails before its first assertion — which reads exactly like a
  // broken app. summit-check, live-check and share-export already carry it.
  env: {
    ...process.env,
    LD_LIBRARY_PATH: `${process.env.HOME}/.cache/one-current-chromium-libs/usr/lib/x86_64-linux-gnu`,
  },
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
// The login gate: seed a session so the checks land straight in the app.
await page.addInitScript(() => {
  localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
localStorage.setItem("one-current-tutorial-v1", "done");
});
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
await page.getByLabel("What's on your mind?").fill("Draft under test");
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
await page.getByLabel("What's on your mind?").fill("Kept thread");
// One field is the whole capture now; "Start the thread" lives at the end of
// the optional detail path.
await page.getByRole("button", { name: "Save", exact: true }).click();
// The born draw-in runs ~1.7s. Capture used to take three more steps before
// reaching this point, which hid the wait; with one field the harness has to
// state it, or it pans mid-animation and reads the draw-in as a stale dash.
await page.waitForTimeout(2600);
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
// The born draw-in is drawn as dash `L,L` with the offset animating from L
// down to 0, so a stuck one is that idiom with a non-zero offset left on it.
// Nothing else on the map uses it: the flow is a small repeating dash
// ("2,26"), and the answer shimmer is a single dash with an effectively
// infinite gap ("110,1000000") that sits idle and invisible until an answer
// fires it. The old heuristic — "a first value under 10000 is suspicious" —
// could not tell those apart, which is why it flagged an empty map.
const staleDash = await page.evaluate(() =>
  [...document.querySelectorAll("path")]
    .filter((p) => parseFloat(p.getAttribute("stroke-width") ?? "0") >= 2)
    .map((p) => ({
      da: p.getAttribute("stroke-dasharray"),
      off: parseFloat(p.getAttribute("stroke-dashoffset") ?? "0"),
    }))
    .filter((r) => {
      if (!r.da || r.da === "none") return false;
      const [a, b] = r.da.split(/[,\s]+/).map(parseFloat);
      return a === b && Math.abs(r.off) > 0.5; // a draw-in left part-way
    })
    .map((r) => `${r.da}@${r.off}`),
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

// 6. the draft line holds ONE lane while the answers change.
//
// This used to compare the label's y on the creation stage against its y on
// the map, and has been failing on main since creation moved to a screen of
// its own: that stage builds its own layout, with its own height and its own
// week window around Now, so the two coordinate systems were never going to
// agree. (Verified against main at the time of writing — identical numbers,
// y0=350 saved=654. The script had been dying earlier, at "Start the thread",
// so nobody saw it.) What still matters, and is testable, is that the line
// does not hop lanes while "since when?" is being answered, and that the
// saved thread actually lands on the map.
await page.getByLabel("New thread").first().click();
await page.waitForTimeout(900);
await page.getByLabel("What's on your mind?").fill("Pinned draft");
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Add detail →" }).click();
await page.waitForTimeout(600);
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
// One lane gap is >= 34px (paths.ts); a fork date reaching further back
// reframes the stage's own window, which moves the line a little without
// ever moving it to another lane.
const LANE_GAP = 34;
const sameLane = ys.every((y) => y !== null && Math.abs(y - y0) < LANE_GAP);
console.log(`draft keeps one lane while answering: ys=[${ys.join(", ")}]`, sameLane ? "OK" : "FAIL");
await page.screenshot({ path: "/tmp/draft-05-pinned-lane.png" });

// 7. saving puts it on the map, once, and it stays there.
for (let i = 0; i < 2; i++) {
  await page.getByRole("button", { name: "Next" }).first().click();
  await page.waitForTimeout(500);
}
await page.getByRole("button", { name: "Start the thread" }).click();
await page.waitForTimeout(2600);
await page.keyboard.press("Escape");
await page.waitForTimeout(800);
// Names are drawn twice on purpose — a stroked pass behind a filled one, so
// they stay readable over the map — so count distinct positions, not nodes.
const onMap = await page.evaluate(() => {
  const at = new Set(
    [...document.querySelectorAll("svg text")]
      .filter((el) => el.textContent.includes("Pinned draft"))
      .map((el) => `${el.getAttribute("x")},${el.getAttribute("y")}`),
  );
  return at.size;
});
console.log(`saved thread is on the map in one place: ${onMap}`, onMap === 1 ? "OK" : "FAIL");
const yMap = await labelY();
await page.mouse.move(500, 400);
await page.mouse.wheel(0, 200);
await page.waitForTimeout(800);
const yAfterScroll = await labelY();
console.log(
  `and holds its lane through a pan: ${yMap} -> ${yAfterScroll}`,
  yMap !== null && yAfterScroll !== null && Math.abs(yAfterScroll - yMap) < LANE_GAP ? "OK" : "FAIL",
);
await page.screenshot({ path: "/tmp/draft-06-after-save.png" });

await browser.close();
server.close();
console.log(errors.length ? "ERRORS:\n" + errors.slice(0, 10).join("\n") : "no console errors");
