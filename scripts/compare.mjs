/* Side-by-side parity: drive the original web app and the RN-web port through
   identical states and screenshot both. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
function serve(dir, port) {
  const s = createServer(async (req, res) => {
    let p = req.url.split("?")[0].replace(/^\/one-current/, "");
    if (p === "/" || p === "") p = "/index.html";
    try {
      const body = await readFile(join(dir, p));
      res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((r) => s.listen(port, () => r(s)));
}

const s1 = await serve("/home/nicky/one_current/dist", 4174);
const s2 = await serve("/home/nicky/one-current-app/dist", 4173);

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ["--no-sandbox"],
});

async function drive(url, tag) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The login gate: seed a session so the checks land straight in the app,
  // and the testing Pro unlock so the creature-theme sweep is not paywalled.
await page.addInitScript(() => {
  localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
localStorage.setItem("one-current-tutorial-v1", "done");
  localStorage.setItem("one-current-pro", "1");
});
await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  // load the example threads from More
  await page.getByRole("button", { name: "More" }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Load example threads" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Now", exact: true }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `/tmp/cmp-${tag}-riverbed.png` });

  // theme sweeps
  for (const theme of ["Koi pond", "Demonfire", "Midnight console", "Catnap"]) {
    await page.getByRole("button", { name: "More" }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: theme }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Now", exact: true }).first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `/tmp/cmp-${tag}-${theme.replace(/ /g, "").toLowerCase()}.png` });
  }
  if (errors.length) console.log(`${tag} pageerrors:`, errors.slice(0, 5));
  await page.close();
}

await drive("http://localhost:4174/", "orig");
await drive("http://localhost:4173/", "port");

await browser.close();
s1.close();
s2.close();
console.log("done");
