/* Screenshot every walkthrough step at phone + desktop sizes into
   /tmp/walkthrough-shots (or $WALKSHOTS_DIR). Eyeball them after any overlay
   change — the functional checks cannot see overlaps.
   Usage: npx expo export --platform web && node scripts/walkthrough-shots.mjs */
import { serveDist, launchBrowser } from "./promo-lib.mjs";
const OUT = process.env.WALKSHOTS_DIR ?? "/tmp/walkthrough-shots";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });
const server = await serveDist(new URL("../dist", import.meta.url).pathname, 4351, "");
const browser = await launchBrowser();

async function run(tag, viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => localStorage.setItem("one-current-auth", JSON.stringify({ email: "shot@onecurrentapp.com" })));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${tag}] PAGEERROR:`, e.message));
  await page.goto("http://localhost:4351/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  // Pip is a plain SVG group (no a11y label — roles break SVG rendering), so
  // find him structurally: a dense pixel-sprite group with a real bounding box.
  const pip = () =>
    page.evaluate(() => {
      const g = [...document.querySelectorAll("svg g")].find(
        (el) => el.querySelectorAll("polygon, rect").length > 80,
      );
      if (!g) return "pip:ABSENT";
      const r = g.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? `pip:visible@${Math.round(r.x)},${Math.round(r.y)}` : "pip:zero-size";
    });
  const shot = async (name) => {
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
    console.log(`[${tag}] ${name} — ${await pip()}`);
  };
  await shot("01-welcome");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.waitForTimeout(700);
  await shot("02-point-plus");
  await page.getByLabel("New thread").first().click();
  await page.waitForTimeout(1000);
  await shot("03-creation");
  await page.getByLabel("Name the thread").fill("The garden fence");
  const next = page.getByRole("button", { name: "Next" });
  await next.click(); await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Today", exact: true }).first().click();
  await next.click(); await page.waitForTimeout(400);
  await next.click(); await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Start the thread" }).click();
  await page.waitForTimeout(1200);
  await shot("04-born-early");
  await page.waitForTimeout(1600);
  await shot("05-meet-thread");
  const stroke = await page.evaluate(() => {
    const p = document.querySelector('path[stroke="transparent"]');
    if (!p) return null;
    const at = p.getPointAtLength(p.getTotalLength() * 0.7);
    const m = p.getScreenCTM();
    return { x: m.a * at.x + m.c * at.y + m.e, y: m.b * at.x + m.d * at.y + m.f };
  });
  await page.mouse.click(stroke.x, stroke.y);
  await page.waitForTimeout(900);
  await shot("06-pip-arrives");
  await page.mouse.click(stroke.x, stroke.y);
  await page.waitForTimeout(900);
  await shot("07-menu");
  await page.getByText("What does this thread need from you now?").first().click();
  await page.waitForTimeout(600);
  await shot("08-menu-expanded");
  await page.getByText("Let it rest", { exact: true }).first().click();
  await page.waitForTimeout(700);
  await shot("09-rested");
  await page.getByRole("button", { name: "Return to timeline" }).click();
  await page.waitForTimeout(900);
  await shot("10-bonk");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.waitForTimeout(600);
  await shot("11-wholeness");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.waitForTimeout(600);
  await shot("12-history");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.waitForTimeout(600);
  await shot("13-more");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.waitForTimeout(600);
  await shot("14-done");
  await ctx.close();
}
await run("phone", { width: 390, height: 780 });
await run("desktop", { width: 1280, height: 800 });
await browser.close(); server.close();
