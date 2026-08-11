/* Cloud backup round-trip: a Pro seed user uploads a backup of the example
   threads, the device is wiped, and restoring brings every thread back. */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";

const API_DIR = "/home/nicky/one-current-api";
const API = "http://localhost:4000";
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
await new Promise((r) => server.listen(4184, r));

try {
  await fetch(`${API}/v1/health`);
  throw new Error("something already answers on :4000 — stop it first");
} catch (e) {
  if (!(e instanceof TypeError)) throw e;
}
const api = spawn("npx", ["tsx", "src/node.ts"], {
  cwd: API_DIR,
  stdio: "ignore",
  detached: true,
});
process.on("exit", () => {
  try {
    process.kill(-api.pid, "SIGKILL");
  } catch {}
});
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${API}/v1/health`)).ok) break;
  } catch {}
  if (i > 80) throw new Error("the API never came up on :4000");
  await new Promise((r) => setTimeout(r, 250));
}

// Flip the seed user to Pro through the stub checkout — the same code path
// the paywall uses — so the browser session starts out entitled.
const login = await (
  await fetch(`${API}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "nikischranz@gmail.com", password: "test" }),
  })
).json();
const auth = { authorization: `Bearer ${login.accessToken}` };
const checkout = await (
  await fetch(`${API}/v1/billing/checkout`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ app: "one-current" }),
  })
).json();
await fetch(`${API}/v1/billing/dev/complete`, {
  method: "POST",
  headers: { ...auth, "content-type": "application/json" },
  body: JSON.stringify({ sessionId: checkout.sessionId }),
});

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
const branchCount = () =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("one-current/table/branches") ?? "[]").length,
  );

await page.goto("http://localhost:4184/");
await page.waitForTimeout(1800);

// 1. sign in as the (now Pro) seed user
await page.getByLabel("Email").fill("nikischranz@gmail.com");
await page.getByLabel("Password").fill("test");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForTimeout(2000);
check("seed login opens the app", (await page.getByLabel("New thread").count()) > 0);

// 2. seed example threads and upload the backup
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "Load example threads" }).click();
await page.waitForTimeout(900);
const seeded = await branchCount();
check("example threads present", seeded >= 5, `n=${seeded}`);
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "Upload backup" }).click();
await page.waitForTimeout(2000);
check("backup uploaded", await page.getByText("Backup uploaded.").isVisible());

// 3. wipe every local table — as if this were a brand-new device
await page.evaluate(() => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("one-current/table/")) localStorage.removeItem(key);
  }
});
await page.reload();
await page.waitForTimeout(1800);
check("device wiped", (await branchCount()) === 0);

// 4. restore brings everything back
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "Restore backup" }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Yes, restore" }).click();
await page.waitForTimeout(2000);
check("backup restored message", await page.getByText("Backup restored.").isVisible());
const restored = await branchCount();
check("threads back after restore", restored === seeded, `n=${restored} want=${seeded}`);
await page.reload();
await page.waitForTimeout(1800);
check(
  "restored threads render",
  (await page.getByLabel("New thread").count()) > 0 && (await branchCount()) === seeded,
);

const relevant = errors.filter((e) => !e.includes("useNativeDriver"));
check("no console errors", relevant.length === 0, relevant.join(" | "));

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
