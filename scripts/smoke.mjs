/* Headless smoke test: serve dist/, load the app, report console errors,
   and capture screenshots at desktop and phone widths. */
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
    res.end("not found");
  }
});
await new Promise((r) => server.listen(4173, r));

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ["--no-sandbox"],
});

const errors = [];
async function shot(width, height, name, actions) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      errors.push(`[${name}][${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[${name}][pageerror] ${e.message}`));
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  if (actions) await actions(page);
  await page.screenshot({ path: `/tmp/smoke-${name}.png` });
  await page.close();
}

await shot(1280, 800, "desktop");
await shot(390, 780, "phone");

await browser.close();
server.close();

if (errors.length) {
  console.log("CONSOLE ISSUES:");
  for (const e of errors.slice(0, 40)) console.log(e.slice(0, 500));
} else {
  console.log("no console errors/warnings");
}
