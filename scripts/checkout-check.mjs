/* Stub checkout: a free seed user meets the paywall on a Pro theme, presses
   Upgrade to Pro, the stub checkout completes, and the theme unlocks — the
   server plan wins over the local testing checkbox. */
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
await new Promise((r) => server.listen(4185, r));

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

await page.goto("http://localhost:4185/");
await page.waitForTimeout(1800);

// 1. the seed user signs in over the API, plan free
await page.getByLabel("Email").fill("johannapoveda.28@gmail.com");
await page.getByLabel("Password").fill("test");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForTimeout(2000);
check("seed login opens the app", (await page.getByLabel("New thread").count()) > 0);

// 2. a Pro theme meets the paywall, with a live Upgrade button
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
await page.getByLabel("Koi pond — Pro").click();
await page.waitForTimeout(400);
check("paywall shown", await page.getByText("This look is part of Pro").isVisible());
const upgrade = page.getByRole("button", { name: "Upgrade to Pro" });
check("upgrade button live with tokens", (await upgrade.count()) > 0);

// 3. the stub checkout completes and the paywall closes itself
await upgrade.click();
await page.waitForTimeout(2500);
check(
  "paywall closed after upgrade",
  (await page.getByText("This look is part of Pro").count()) === 0,
);

// 4. the plan is pro on the server…
const login = await (
  await fetch(`${API}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "johannapoveda.28@gmail.com", password: "test" }),
  })
).json();
check("server plan is pro", login.user?.plan === "pro", `plan=${login.user?.plan}`);

// 5. …and the Pro theme now applies in the app
await page.getByRole("button", { name: "Koi pond" }).click();
await page.waitForTimeout(400);
check(
  "pro theme applies after upgrade",
  (await page.evaluate(() => localStorage.getItem("one-current-theme"))) === "koipond",
);

// 6. the entitlement survives a reload (syncMe on boot refreshes serverPro)
await page.reload();
await page.waitForTimeout(2000);
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
check(
  "pro theme still applied after reload",
  await page
    .getByText(
      "Still water. Every open thread is a koi nosing at Now — feed it a decision and the pond settles.",
    )
    .isVisible(),
);

const relevant = errors.filter((e) => !e.includes("useNativeDriver"));
check("no console errors", relevant.length === 0, relevant.join(" | "));

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
