/* API auth checks: with the server up, a seed user signs in over the API and
   gets tokens; a wrong password is a real error (no fallback); registering a
   new account also lands on the API. With the server gone, the gate falls
   back to a device-only session and Settings shows the offline hint. */
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
await new Promise((r) => server.listen(4183, r));

// The API as a child process; its whole process group is killed at the end
// (and mid-test for the offline part) — npx alone would leave the server up.
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
const stopApi = () => {
  try {
    process.kill(-api.pid, "SIGKILL");
  } catch {}
};
process.on("exit", stopApi);
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
const tokens = () => page.evaluate(() => localStorage.getItem("one-current-tokens"));

await page.goto("http://localhost:4183/");
await page.waitForTimeout(1800);

// 1. a wrong password is a real error — the gate stays shut, no fallback
await page.getByLabel("Email").fill("nikischranz@gmail.com");
await page.getByLabel("Password").fill("wrong-password");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForTimeout(1500);
check(
  "wrong password refused",
  await page.getByText("That email and password do not match.").isVisible(),
);
check("no fallback session", (await page.getByLabel("New thread").count()) === 0);
check("no tokens stored", (await tokens()) === null);

// 2. the seed user signs in over the API and gets tokens
await page.getByLabel("Password").fill("test");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForTimeout(2000);
check("seed login opens the app", (await page.getByLabel("New thread").count()) > 0);
const stored = await tokens();
check(
  "tokens stored",
  stored !== null && typeof JSON.parse(stored).access === "string",
);

// 3. Settings shows the account without the offline hint
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
check(
  "account section shows the email",
  (await page.getByText(/nikischranz@gmail\.com/).count()) > 0,
);
check(
  "no offline hint with a server session",
  (await page.getByText("Offline — signed in on this device only.").count()) === 0,
);

// 4. sign out clears the session and the tokens
await page.getByRole("button", { name: "Sign out" }).click();
await page.waitForTimeout(1000);
check("sign out returns to the gate", await page.getByText("Welcome back").isVisible());
check("tokens cleared on sign out", (await tokens()) === null);

// 5. registering a brand-new account lands on the API
await page.getByRole("button", { name: "Create an account" }).click();
await page.waitForTimeout(300);
const fresh = `check-${Date.now()}@example.com`;
await page.getByLabel("Your name").fill("Check");
await page.getByLabel("Email").fill(fresh);
await page.getByLabel("Password").fill("hunter2");
await page.getByRole("button", { name: "Register" }).click();
await page.waitForTimeout(2000);
// The app resumes on the view it was on (More), so probe the nav bar.
check(
  "register opens the app",
  (await page.getByRole("button", { name: "Now" }).count()) > 0 &&
    (await page.getByText("Welcome back").count()) === 0,
);
check("register stored tokens", (await tokens()) !== null);
const meRes = await fetch(`${API}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: fresh, password: "hunter2" }),
});
check("registered account exists on the server", meRes.status === 200);

// 6. sign out, stop the API — the gate falls back to a device-only session
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "Sign out" }).click();
await page.waitForTimeout(1000);
stopApi();
await new Promise((r) => setTimeout(r, 500));
await page.getByLabel("Email").fill("offline@example.com");
await page.getByLabel("Password").fill("whatever");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForTimeout(2500);
check(
  "offline sign-in opens the app",
  (await page.getByRole("button", { name: "Now" }).count()) > 0 &&
    (await page.getByText("Welcome back").count()) === 0,
);
check("offline session has no tokens", (await tokens()) === null);
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
check(
  "offline hint shown",
  await page.getByText("Offline — signed in on this device only.").isVisible(),
);

// Connection-refused noise from the deliberately stopped API is expected.
const relevant = errors.filter(
  (e) =>
    !e.includes("useNativeDriver") &&
    !e.includes("ERR_CONNECTION_REFUSED") &&
    !e.includes("Failed to load resource"),
);
check("no console errors", relevant.length === 0, relevant.join(" | "));

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
