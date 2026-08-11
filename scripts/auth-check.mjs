/* Auth checks: a fresh visitor meets the login gate, bad credentials are
   refused, register and sign-in both open the app, forgot-password answers
   politely, sign out returns to the gate, and the session survives a reload. */
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
await new Promise((r) => server.listen(4182, r));

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

// No seeded session — the whole point is meeting the gate cold.
await page.goto("http://localhost:4182/");
await page.waitForTimeout(1800);

// 1. a fresh visitor sees the login gate, not the app
check("login gate shown first", await page.getByText("Welcome back").isVisible());
check("app stays behind the gate", (await page.getByLabel("New thread").count()) === 0);

// 2. a malformed email is refused
await page.getByLabel("Email").fill("not-an-email");
await page.getByLabel("Password").fill("hunter2");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForTimeout(300);
check(
  "bad email refused",
  await page.getByText("That does not look like an email address.").isVisible(),
);

// 3. a short password is refused
await page.getByLabel("Email").fill("nicky@example.com");
await page.getByLabel("Password").fill("abc");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForTimeout(300);
check(
  "short password refused",
  await page.getByText("The password needs at least 4 characters.").isVisible(),
);

// 4. forgot password answers without confirming the account exists
await page.getByRole("button", { name: "Forgot your password?" }).click();
await page.waitForTimeout(300);
await page.getByLabel("Email").fill("nicky@example.com");
await page.getByRole("button", { name: "Send the link" }).click();
await page.waitForTimeout(300);
check(
  "reset link message shown",
  await page
    .getByText("If an account exists for nicky@example.com, a reset link is on its way.")
    .isVisible(),
);
await page.getByRole("button", { name: "Back to sign in" }).click();
await page.waitForTimeout(300);

// 5. register asks for a name, then signs in
await page.getByRole("button", { name: "Create an account" }).click();
await page.waitForTimeout(300);
await page.getByLabel("Email").fill("nicky@example.com");
await page.getByLabel("Password").fill("hunter2");
await page.getByRole("button", { name: "Register" }).click();
await page.waitForTimeout(300);
check("register needs a name", await page.getByText("What should we call you?").isVisible());
await page.getByLabel("Your name").fill("Nicky");
await page.getByRole("button", { name: "Register" }).click();
await page.waitForTimeout(1200);
check("register opens the app", (await page.getByLabel("New thread").count()) > 0);
const stored = await page.evaluate(() => localStorage.getItem("one-current-auth"));
check(
  "session stored with name and email",
  stored !== null &&
    JSON.parse(stored).email === "nicky@example.com" &&
    JSON.parse(stored).name === "Nicky",
);

// 6. Settings shows the account and signs out
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(600);
check(
  "account section names the user",
  await page.getByText("Signed in as Nicky (nicky@example.com)").isVisible(),
);
await page.getByRole("button", { name: "Sign out" }).click();
await page.waitForTimeout(600);
check("sign out returns to the gate", await page.getByText("Welcome back").isVisible());
check(
  "session cleared on sign out",
  (await page.evaluate(() => localStorage.getItem("one-current-auth"))) === null,
);

// 7. signing in works and the session survives a reload
await page.getByLabel("Email").fill("nicky@example.com");
await page.getByLabel("Password").fill("hunter2");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForTimeout(1200);
// The app resumes on the view it was on (More), so probe the nav bar.
check(
  "sign in opens the app",
  (await page.getByRole("button", { name: "Now" }).count()) > 0 &&
    (await page.getByText("Welcome back").count()) === 0,
);
await page.reload();
await page.waitForTimeout(1800);
check("session survives a reload", (await page.getByLabel("New thread").count()) > 0);
check("gate stays open after reload", (await page.getByText("Welcome back").count()) === 0);

// With no API running, the gate's API-first attempt logs a connection
// refusal before falling back to the device-only session — that is expected.
const relevant = errors.filter(
  (e) => !e.includes("useNativeDriver") && !e.includes("ERR_CONNECTION_REFUSED"),
);
check("no console errors", relevant.length === 0, relevant.join(" | "));

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
