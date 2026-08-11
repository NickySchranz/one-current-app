import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";

const DIST = "/home/nicky/one-current-app/dist";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ico": "image/x-icon" };
const server = createServer(async (req, res) => {
  const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(4177, r));

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
// The login gate: seed a session so the checks land straight in the app.
await page.addInitScript(() => {
  localStorage.setItem("one-current-auth", JSON.stringify({ email: "check@example.com" }));
});
await page.goto("http://localhost:4177/");
await page.waitForTimeout(1500);

// go to More, pick Español (Colombia)
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Español (Colombia)" }).click();
await page.waitForTimeout(400);
const idioma = await page.getByText("Idioma").count();
console.log("settings in es-CO (Idioma visible):", idioma > 0 ? "OK" : "FAIL");
const acerca = await page.getByText("Qué es One Current y cómo funciona").count();
console.log("es-CO about hint:", acerca > 0 ? "OK" : "FAIL");

// back to Now (Ahora) and open the create form
await page.getByRole("button", { name: "Ahora" }).first().click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Nuevo hilo" }).first().click().catch(async () => {
  await page.getByLabel("Nuevo hilo").first().click();
});
await page.waitForTimeout(500);
const jalando = await page.getByText("¿Qué te está jalando?").count();
console.log("create form es-CO title:", jalando > 0 ? "OK" : "FAIL");

// reload: language persists
await page.reload();
await page.waitForTimeout(1500);
const persisted = await page.getByText("Ahora").count();
console.log("es-CO persists after reload:", persisted > 0 ? "OK" : "FAIL");

console.log(errors.length ? `console errors: ${errors.join("; ")}` : "no console errors");
await browser.close();
server.close();
