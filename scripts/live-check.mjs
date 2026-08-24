/* Live verification: both Pages sites boot, and the patient app signs in a
   seed user against the deployed Workers API (no offline fallback hint). */
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ["--no-sandbox"],
});
let failed = false;
const check = (name, ok, detail = "") => {
  console.log(`${name}: ${detail}${detail ? " " : ""}${ok ? "OK" : "FAIL"}`);
  if (!ok) failed = true;
};

// ---- patient app: live login against the Workers API ----
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto("https://nickyschranz.github.io/one-current-app/");
await page.waitForTimeout(2500);
check("app gate shown", await page.getByText("Welcome back").isVisible());
await page.getByLabel("Email").fill("test@gmail.com");
await page.getByLabel("Password").fill("hello1234");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForTimeout(4000);
check("live API login opens the app", (await page.getByLabel("New thread").count()) > 0);
check(
  "no offline hint",
  (await page.getByText("Offline — signed in on this device only.").count()) === 0,
);
const tokens = await page.evaluate(() => localStorage.getItem("one-current-tokens"));
check("tokens stored", tokens !== null && JSON.parse(tokens).access?.length > 0);
await page.close();

// ---- practice app: live login as the practitioner seed ----
const psycho = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await psycho.goto("https://nickyschranz.github.io/one-current-psycho/");
await psycho.waitForTimeout(2500);
await psycho.getByLabel("Email").fill("johannapoveda.28@gmail.com");
await psycho.getByLabel("Password", { exact: true }).fill("test");
await psycho.getByRole("button", { name: "Sign in" }).click();
await psycho.waitForTimeout(4000);
check(
  "psycho live API login",
  (await psycho.getByRole("button", { name: "+ Add" }).count()) > 0,
);
check("no offline pill", (await psycho.getByText("Offline", { exact: true }).count()) === 0);
await psycho.close();

await browser.close();
process.exit(failed ? 1 : 0);
