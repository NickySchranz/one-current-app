/* Paywall checks: at ten open threads the + asks to upgrade, Pro themes are
   locked but visible, the share file is Pro-only — and the testing unlock in
   Settings opens all three, while turning it off steps a Pro theme back. */
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
await new Promise((r) => server.listen(4181, r));

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(e.message));

let failed = false;
const check = (name, ok, detail = "") => {
  console.log(`${name}: ${detail}${detail ? " " : ""}${ok ? "OK" : "FAIL"}`);
  if (!ok) failed = true;
};

// Seed exactly ten open threads before the app boots, and capture blob
// downloads (the share file) the same way share-export.mjs does.
await page.addInitScript(() => {
  localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
  const today = new Date().toISOString();
  const day = today.slice(0, 10);
  const branches = Array.from({ length: 10 }, (_, i) => ({
    id: `paywall-seed-${i}`,
    title: `Seeded thread ${i + 1}`,
    type: "event",
    orientation: "past",
    status: "active",
    forkDate: day,
    loudness: 2,
    storedQualities: [],
    unmetNeeds: [],
    controllability: "unclear",
    commits: [],
    mergeIds: [],
    firstCreatedAt: today,
    lastActivatedAt: today,
    recurrenceCount: 0,
  }));
  localStorage.setItem("one-current/table/branches", JSON.stringify(branches));
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
await page.goto("http://localhost:4181/");
await page.waitForTimeout(1800);

// 1. the eleventh thread meets the paywall, not the create form
await page.getByLabel("New thread").first().click();
await page.waitForTimeout(600);
check(
  "create gated at ten open threads",
  await page.getByText("Ten threads is the free current").isVisible(),
);
check(
  "create form did not open",
  (await page.getByLabel("Name the thread").count()) === 0,
);
await page.getByRole("button", { name: "Not now" }).click();
await page.waitForTimeout(400);

// 2. Pro themes are visible but locked; free themes still switch
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
await page.getByLabel("Koi pond — Pro").click();
await page.waitForTimeout(400);
check(
  "pro theme opens the paywall",
  await page.getByText("This look is part of Pro").isVisible(),
);
await page.getByRole("button", { name: "Not now" }).click();
await page.waitForTimeout(400);
check(
  "pro theme was not applied",
  (await page.evaluate(() => localStorage.getItem("one-current-theme"))) !== "koipond",
);
await page.getByRole("button", { name: "Sunprint" }).click();
await page.waitForTimeout(400);
check(
  "free theme still applies",
  (await page.evaluate(() => localStorage.getItem("one-current-theme"))) === "sunprint",
);

// 3. the share file is Pro-only
await page
  .getByLabel("Which threads")
  .getByText("Seeded thread 1", { exact: true })
  .click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Create the file" }).click();
await page.waitForTimeout(600);
check(
  "share gated behind Pro",
  await page.getByText("Sharing is part of Pro").isVisible(),
);
check(
  "no file was produced",
  (await page.evaluate(() => window.__captured)) === undefined,
);
await page.getByRole("button", { name: "Not now" }).click();
await page.waitForTimeout(400);

// 4. the testing unlock opens all three gates
await page.getByRole("checkbox", { name: "Pro unlocked (testing)" }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Koi pond" }).click();
await page.waitForTimeout(400);
check(
  "pro theme applies with Pro",
  (await page.evaluate(() => localStorage.getItem("one-current-theme"))) === "koipond",
);
await page.getByRole("button", { name: "Create the file" }).click();
await page.waitForFunction(() => typeof window.__captured === "string", null, {
  timeout: 5000,
});
const share = JSON.parse(await page.evaluate(() => window.__captured));
check("share file produced with Pro", share.threads?.length === 1);
await page.getByRole("button", { name: "Now" }).first().click();
await page.waitForTimeout(600);
await page.getByLabel("New thread").first().click();
await page.waitForTimeout(600);
check(
  "eleventh thread allowed with Pro",
  (await page.getByLabel("Name the thread").count()) > 0,
);
// First Escape only blurs the focused title field; the second sets the tray down.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.getByLabel("Name the thread").waitFor({ state: "detached", timeout: 5000 });
await page.waitForTimeout(400);

// 5. losing Pro steps the Pro theme back to the default
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
await page.getByRole("checkbox", { name: "Pro unlocked (testing)" }).click();
await page.waitForTimeout(400);
check(
  "pro theme falls back without Pro",
  await page.getByText("Warm paper, moss green, a slow steady current.").isVisible(),
);
// the stored choice survives, so unlocking again restores it after a reload
check(
  "stored theme choice kept",
  (await page.evaluate(() => localStorage.getItem("one-current-theme"))) === "koipond",
);

// 6. the entitlement persists across a reload
await page.getByRole("checkbox", { name: "Pro unlocked (testing)" }).click();
await page.waitForTimeout(400);
await page.reload();
await page.waitForTimeout(1800);
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
check(
  "Pro persists across reload",
  (await page.evaluate(() => localStorage.getItem("one-current-pro"))) === "1",
);
check(
  "pro theme restored on reload with Pro",
  await page.getByText("Still water. Every open thread is a koi nosing at Now — feed it a decision and the pond settles.").isVisible(),
);

const relevant = errors.filter((e) => !e.includes("useNativeDriver"));
check("no console errors", relevant.length === 0, relevant.join(" | "));

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
