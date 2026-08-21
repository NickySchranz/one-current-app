/* Share-with-psychologist export: selecting threads and a start date produces
   a file holding only those threads and only events/loudness inside the window. */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
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
await new Promise((r) => server.listen(4179, r));

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
// Capture the blob download: page.on("download") is flaky with blob anchors in
// the headless shell, so the anchor's click fetches its own href instead.
await page.addInitScript(() => {
  localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
  localStorage.setItem("one-current-tutorial-v1", "done");
  const original = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) {
      window.__captured = null;
      void fetch(this.href)
        .then((r) => r.text())
        .then((text) => {
          window.__captured = text;
        });
      return;
    }
    return original.call(this);
  };
});
await page.goto("http://localhost:4179/");
await page.waitForTimeout(1800);

let failed = false;
const check = (name, ok, detail = "") => {
  console.log(`${name}: ${detail}${detail ? " " : ""}${ok ? "OK" : "FAIL"}`);
  if (!ok) failed = true;
};

// 1. seed example threads, note them in storage
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "Load example threads" }).click();
await page.waitForTimeout(900);

// 1b. burn one thread so the export carries a burned integrated event
await page.getByRole("button", { name: "Now", exact: true }).first().click();
await page.waitForTimeout(1500);
// burn the thread the export will include, by its timeline label
await page.getByText("The argument with my father", { exact: true }).first().click({ force: true });
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Reflect on this thread" }).click();
await page.waitForTimeout(600);
await page.getByText("What does this thread need from you now?").first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /^Integrate\b/ }).last().click();
await page.waitForTimeout(700);
await page.getByRole("button", { name: /Burn it away/ }).click();
await page.waitForTimeout(500);
await page.getByPlaceholder(/a fear, a story/).fill("the endless what-ifs");
await page.getByRole("button", { name: "Add to the fire" }).click();
await page.waitForTimeout(300);
await page.getByPlaceholder(/one sentence you'll keep/).fill("arguments end; family continues");
await page.getByRole("button", { name: "Strike the match" }).click();
await page.waitForTimeout(3800);
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
// Loading examples navigates back to Now — return to More for the share section.
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
// Sharing is a Pro feature now: flip the testing unlock first.
await page.getByRole("checkbox", { name: "Pro unlocked (testing)" }).click();
await page.waitForTimeout(300);
const allBranches = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("one-current/table/branches") ?? "[]").map((b) => ({
    id: b.id,
    title: b.title,
  })),
);
check("example threads present", allBranches.length >= 5, `n=${allBranches.length}`);

// 2. select two threads in the share section
const pick = [allBranches[0], allBranches[1]];
// the burned thread now rests in the collapsed Closed section — open it
const closedToggle = page.getByRole("button", { name: /^Closed/ }).first();
if (await closedToggle.isVisible().catch(() => false)) {
  await closedToggle.click();
  await page.waitForTimeout(300);
}
for (const b of pick) {
  await page
    .getByLabel("Which threads")
    .getByText(b.title, { exact: true })
    .click();
  await page.waitForTimeout(200);
}

// 3. a custom start date that excludes older history
const sinceDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
await page.getByRole("button", { name: "Since a date…" }).click();
await page.waitForTimeout(300);
await page.getByLabel("Since a date…").last().fill(sinceDate);
await page.waitForTimeout(300);

// 4. create the file and read the captured blob
await page.getByRole("button", { name: "Create the file" }).click();
await page.waitForFunction(() => typeof window.__captured === "string", null, { timeout: 5000 });
const raw = await page.evaluate(() => window.__captured);
const share = JSON.parse(raw);
// Saved for the psychologist app's round-trip import check.
await writeFile("/tmp/one-current-share-roundtrip.json", raw);

// 5. envelope
check(
  "envelope",
  share.app === "one-current-share" &&
    share.version === 1 &&
    share.from === sinceDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(share.to) &&
    !Number.isNaN(Date.parse(share.exportedAt)),
  `app=${share.app} v=${share.version} from=${share.from} to=${share.to}`,
);

// 6. exactly the selected threads
const ids = share.threads.map((t) => t.id).sort();
const want = pick.map((b) => b.id).sort();
check(
  "selected threads only",
  ids.length === 2 && ids.every((id, i) => id === want[i]),
  `got=[${share.threads.map((t) => t.title).join(", ")}]`,
);

// 7. every event and loudness entry inside [from, to]; at most one baseline before from
const KINDS = new Set(["started", "moment", "action-decided", "action-done", "integrated"]);
let eventsOk = true;
let loudnessOk = true;
let kindsOk = true;
for (const th of share.threads) {
  for (const e of th.events) {
    if (!(e.on >= share.from && e.on <= share.to)) eventsOk = false;
    if (!KINDS.has(e.kind)) kindsOk = false;
  }
  const before = th.loudness.filter((l) => l.at.slice(0, 10) < share.from).length;
  const after = th.loudness.filter((l) => l.at.slice(0, 10) > share.to).length;
  if (before > 1 || after > 0) loudnessOk = false;
  const sortedByTime = th.loudness.every(
    (l, i) => i === 0 || th.loudness[i - 1].at <= l.at,
  );
  if (!sortedByTime) loudnessOk = false;
}
check("events within window", eventsOk);
check("event kinds valid", kindsOk);
check(
  "the burned thread is gone from the export entirely",
  !JSON.stringify(share).includes("The argument with my father"),
);
check("loudness window + baseline", loudnessOk);

// 8. thread fields present
const fieldsOk = share.threads.every(
  (t) =>
    typeof t.id === "string" &&
    typeof t.title === "string" &&
    typeof t.kind === "string" &&
    typeof t.status === "string" &&
    typeof t.startedOn === "string" &&
    Array.isArray(t.loudness) &&
    Array.isArray(t.events),
);
check("thread fields", fieldsOk);

await browser.close();
server.close();
console.log(errors.length ? "ERRORS:\n" + errors.slice(0, 5).join("\n") : "no console errors");
if (failed || errors.length) process.exit(1);
