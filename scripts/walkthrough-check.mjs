/* Headless check of the guided walkthrough: a fresh account is walked through
   creating its first thread, pointers land on the real controls, and finishing
   writes the done key. Run against a plain production export:
     npx expo export --platform web && node scripts/walkthrough-check.mjs */
import { serveDist, launchBrowser } from "./promo-lib.mjs";

const PORT = 4341;
const dist = new URL("../dist", import.meta.url).pathname;

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const server = await serveDist(dist, PORT, "");
const browser = await launchBrowser();

async function freshPage(viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => {
    localStorage.setItem("one-current-auth", JSON.stringify({ email: "walk@onecurrentapp.com" }));
  });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  return page;
}

const bubble = (page, text) => page.getByText(text, { exact: false }).first();
async function haloNear(page, locator) {
  const halo = page.getByLabel("walkthrough-halo").first();
  if (!(await halo.count())) return false;
  const [h, t] = await Promise.all([halo.boundingBox(), locator.boundingBox()]);
  if (!h || !t) return false;
  const cx = t.x + t.width / 2;
  const cy = t.y + t.height / 2;
  return cx > h.x - 8 && cx < h.x + h.width + 8 && cy > h.y - 8 && cy < h.y + h.height + 8;
}

// ---- phone-size guided run --------------------------------------------------
{
  const page = await freshPage({ width: 390, height: 780 });

  check("welcome card appears", await bubble(page, "Hi! I'm Pip!").isVisible().catch(() => false));
  await page.getByRole("button", { name: "Next →" }).click();
  await page.waitForTimeout(600);

  check("point-plus copy", await bubble(page, "Something on your mind right now?").isVisible().catch(() => false));
  check("halo rests on the + button", await haloNear(page, page.getByLabel("New thread").first()));

  await page.getByLabel("New thread").first().click();
  await page.waitForTimeout(900);
  check("creation screen took over (no walkthrough card)", !(await bubble(page, "Something on your mind").isVisible().catch(() => false)));

  await page.getByLabel("Name the thread").fill("My first real thread");
  const next = page.getByRole("button", { name: "Next" });
  await next.click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Today", exact: true }).first().click();
  await next.click();
  await page.waitForTimeout(500);
  await next.click(); // feelings optional
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Start the thread" }).click();
  await page.waitForTimeout(2600); // the born draw-in

  check("meet-thread copy", await bubble(page, "There it is — your first thread.").isVisible().catch(() => false));
  check("halo present for the thread", (await page.getByLabel("walkthrough-halo").count()) > 0);

  // First tap arms; second opens the menu.
  const stroke = await page.evaluate(() => {
    const p = document.querySelector('path[stroke="transparent"]');
    if (!p) return null;
    const at = p.getPointAtLength(p.getTotalLength() * 0.7);
    const m = p.getScreenCTM();
    return { x: m.a * at.x + m.c * at.y + m.e, y: m.b * at.x + m.d * at.y + m.f };
  });
  check("found the thread stroke", stroke !== null);
  await page.mouse.click(stroke.x, stroke.y);
  await page.waitForTimeout(800);
  check("pip-arrives copy", await bubble(page, "One tap brings me over.").isVisible().catch(() => false));
  await page.mouse.click(stroke.x, stroke.y);
  await page.waitForTimeout(900);
  check("menu open", await bubble(page, "What does this thread need from you now?").isVisible().catch(() => false));
  check("menu step copy", await bubble(page, "This is how you answer a thread.").isVisible().catch(() => false));

  // Answer the thread for real (Let it rest), then return — closing the menu
  // advances the walk.
  await page.getByText("What does this thread need from you now?").first().click();
  await page.waitForTimeout(500);
  await page.getByText("Let it rest", { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Return to timeline" }).click();
  await page.waitForTimeout(700);
  check("bonk step copy", await bubble(page, "See the little pill by the dates?").isVisible().catch(() => false));
  check("halo rests on the bonk pill", await haloNear(page, page.getByText("Bonk!").first()));
  await page.getByRole("button", { name: "Next →" }).click();
  await page.waitForTimeout(500);
  check("wholeness step copy", await bubble(page, "This shows how gathered you are.").isVisible().catch(() => false));
  await page.getByRole("button", { name: "Next →" }).click();
  await page.waitForTimeout(500);
  check("history halo on the History tab", await haloNear(page, page.getByRole("button", { name: "History" }).first()));
  await page.getByRole("button", { name: "Next →" }).click();
  await page.waitForTimeout(500);
  check("more halo on the More tab", await haloNear(page, page.getByRole("button", { name: "More" }).first()));
  await page.getByRole("button", { name: "Next →" }).click();
  await page.waitForTimeout(500);
  check("done step", await bubble(page, "That's everything!").isVisible().catch(() => false));
  await page.getByRole("button", { name: "Let's go!" }).click();
  await page.waitForTimeout(500);
  check("done key written", (await page.evaluate(() => localStorage.getItem("one-current-tutorial-v1"))) === "done");
  check("overlay gone", !(await bubble(page, "That's everything!").isVisible().catch(() => false)));

  // Restart from Settings, no reload.
  await page.getByText("≡More").first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Restart tour" }).click();
  await page.waitForTimeout(600);
  check("restart shows welcome without reload", await bubble(page, "Hi! I'm Pip!").isVisible().catch(() => false));
  check("restart cleared the key", (await page.evaluate(() => localStorage.getItem("one-current-tutorial-v1"))) === null);

  await page.context().close();
}

// ---- desktop pass: the floating + is the target -----------------------------
{
  const page = await freshPage({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Next →" }).click();
  await page.waitForTimeout(700);
  check("desktop halo lands on the floating +", await haloNear(page, page.getByLabel("New thread").first()));
  await page.context().close();
}

console.log(failures ? `\n${failures} failure(s)` : "\nwalkthrough: all green");
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
