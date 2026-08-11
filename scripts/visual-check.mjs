/* One-off visual check: creature sits exactly at the line end (koipond),
   and the quick-menu loudness bar renders. */
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
await new Promise((r) => server.listen(4176, r));

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ["--no-sandbox"],
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
// The login gate: seed a session so the checks land straight in the app.
await page.addInitScript(() => {
  localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
});
await page.goto("http://localhost:4176/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// example data + koipond theme
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Load example threads" }).click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /koi/i }).click();
await page.waitForTimeout(500);
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Now", exact: true }).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/visual-01-koipond-sprites.png" });

// quick menu with the new bar slider: tap a thread line
const pt = await page.evaluate(() => {
  const p = document.querySelector('path[stroke="transparent"]');
  const len = p.getTotalLength();
  const at = p.getPointAtLength(len * 0.95);
  const m = p.getScreenCTM();
  return { x: m.a * at.x + m.c * at.y + m.e, y: m.b * at.x + m.d * at.y + m.f };
});
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/visual-02-quick-menu-bar.png" });

await browser.close();
server.close();
console.log(errors.length ? "ERRORS:\n" + errors.slice(0, 10).join("\n") : "no console errors");
