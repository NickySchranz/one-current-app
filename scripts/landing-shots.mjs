/* Capture the landing-page screenshots from the current app builds.
   Writes straight into one_current/public/about/img/ — rerun after UI changes,
   then redeploy the landing (push one_current main). */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";

const IMG = "/home/nicky/one_current/public/about/img";
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ico": "image/x-icon",
};
function serveDist(dist, port) {
  const server = createServer(async (req, res) => {
    const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
    try {
      const body = await readFile(join(dist, path));
      res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}
const appServer = await serveDist(new URL("../dist", import.meta.url).pathname, 4188);
const psychoServer = await serveDist("/home/nicky/one-current-psycho/dist", 4189);

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ["--no-sandbox"],
});

const shot = async (page, name) => {
  await page.screenshot({ path: `${IMG}/${name}.png` });
  console.log(`shot: ${name}`);
};

async function appPage(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
    localStorage.setItem("one-current-pro", "1");
  });
  await page.goto("http://localhost:4188/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: "More" }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Load example threads" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /Now$/ }).first().click();
  await page.waitForTimeout(2500);
  return page;
}

// A point on a thread's curved stroke (the transparent hit path).
const strokePoint = (page, along) =>
  page.evaluate((at) => {
    const el = document.querySelector('path[stroke="transparent"]');
    const p = el.getPointAtLength(el.getTotalLength() * at);
    const m = el.getScreenCTM();
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  }, along);

// ---- phone shots (390x780 @2x) ----
const phone = await appPage({ width: 390, height: 780 });
await shot(phone, "timeline-mobile");

// peek: tap a thread line — the quick menu opens on its slider
const pt = await strokePoint(phone, 0.7);
await phone.mouse.click(pt.x, pt.y);
await phone.waitForTimeout(1200);
await shot(phone, "peek");

// expanded: what does this thread need from you now?
await phone.getByText("What does this thread need from you now?").first().click();
await phone.waitForTimeout(900);
await shot(phone, "quick-menu");

// understand view
await phone.getByRole("button", { name: "Understand this thread" }).last().click();
await phone.waitForTimeout(1000);
await shot(phone, "understand");
await phone.keyboard.press("Escape");
await phone.waitForTimeout(300);
await phone.keyboard.press("Escape");
await phone.waitForTimeout(500);

// actions view
await phone.getByRole("button", { name: /Actions$/ }).first().click();
await phone.waitForTimeout(1000);
await shot(phone, "actions");
await phone.getByRole("button", { name: /Now$/ }).first().click();
await phone.waitForTimeout(1200);

// wholeness panel
await phone.getByLabel(/You are /).first().click();
await phone.waitForTimeout(900);
await shot(phone, "wholeness");
await phone.close();

// ---- theme shots (390x800 @2x) ----
const themes = [
  ["Pompom", "pompom"],
  ["Demonfire", "demonfire"],
  ["Koi pond", "koipond"],
  ["Carnival", "carnival"],
  ["Catnap", "catnap"],
  ["Abyss", "abyss"],
  ["Gravemist", "gravemist"],
];
const tp = await appPage({ width: 390, height: 800 });
for (const [label, file] of themes) {
  await tp.getByRole("button", { name: "More" }).first().click();
  await tp.waitForTimeout(500);
  await tp.getByRole("button", { name: label }).click();
  await tp.waitForTimeout(400);
  await tp.getByRole("button", { name: /Now$/ }).first().click();
  await tp.waitForTimeout(2200);
  await shot(tp, file);
}
await tp.close();

// ---- desktop timeline (1360x850 @2x) ----
const desk = await appPage({ width: 1360, height: 850 });
await shot(desk, "timeline-desktop");
await desk.close();

// ---- the practice app (1360x850 @2x) ----
const psycho = await browser.newPage({ viewport: { width: 1360, height: 850 }, deviceScaleFactor: 2 });
await psycho.goto("http://localhost:4189/");
await psycho.waitForTimeout(1800);
await psycho.getByLabel("Email").fill("demo@onecurrent.app");
await psycho.getByLabel("Password", { exact: true }).fill("demo1234");
await psycho.getByRole("button", { name: "Sign in" }).click();
await psycho.waitForTimeout(800);
await psycho.getByRole("button", { name: "Load example clients" }).click();
await psycho.waitForTimeout(800);
await psycho.getByRole("button", { name: "Open Maya R." }).click();
await psycho.waitForTimeout(600);
await psycho.getByRole("button", { name: "View", exact: true }).first().click();
await psycho.waitForTimeout(1500);
await shot(psycho, "psycho-app");
await psycho.getByRole("button", { name: "Day by day" }).click();
await psycho.waitForTimeout(1200);
await shot(psycho, "psycho-daybyday");
await psycho.close();

await browser.close();
appServer.close();
psychoServer.close();
console.log("done");
