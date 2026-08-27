/* The words must match the app. Checks that no screen still claims nothing is
   sent anywhere, that the share flow itemises what leaves before either send
   button, and that the delete confirmation says what it does not clear. */
import { serveDist, launchBrowser } from "./promo-lib.mjs";

const OUT = "/tmp/claude-1003/-home-nicky-one-current-app/8ddb833f-df61-4841-9003-43c43c704c93/scratchpad";
const results = [];
const check = (label, ok, detail = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);

const server = await serveDist("/home/nicky/one-current-app/dist", 4219, "/one-current-app");
const browser = await launchBrowser();
let page;

try {
  page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const bodyText = () => page.locator("body").innerText();
  const tap = async (text, exact = true) => {
    const el = page.getByText(text, { exact }).first();
    await el.waitFor({ state: "visible", timeout: 15000 });
    await el.click();
    await page.waitForTimeout(500);
  };

  // ── 1. the sign-in screen no longer overpromises ───────────────────────
  await page.goto("http://localhost:4219/one-current-app/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2400);
  let text = await bodyText();
  check(
    "sign-in does not claim threads never leave the device",
    !/never leave this device/i.test(text),
  );
  check(
    "sign-in says what signing in does and does not do",
    /Signing in does not send your threads anywhere/i.test(text),
    text.slice(0, 0),
  );
  await page.screenshot({ path: `${OUT}/privacy-01-signin.png`, fullPage: true });

  // Sign in and skip the tutorial.
  await page.evaluate(() => {
    localStorage.setItem("one-current-auth", JSON.stringify({ email: "p@example.com" }));
    localStorage.setItem("one-current-tutorial-v1", "done");
    localStorage.setItem("one-current-pro", "true");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2600);

  // ── 2. example threads, so a share has something to describe ───────────
  // More *is* the settings page. Loading examples returns to Now, so come back.
  await tap("More");
  await page.waitForTimeout(900);
  const loadExamples = page.getByRole("button", { name: "Load example threads" });
  if ((await loadExamples.count()) > 0) {
    await loadExamples.first().click();
    await page.waitForTimeout(2000);
    await tap("More");
    await page.waitForTimeout(1200);
  }
  text = await bodyText();
  check("the settings page is open", /Privacy/.test(text) && /Share with a psychologist/.test(text));

  // ── 3. the privacy card tells the truth ────────────────────────────────
  check(
    "the privacy card no longer says nothing is sent anywhere",
    !/Nothing is sent anywhere\./.test(text),
  );
  check(
    "the privacy card names what can be sent, and that it is a choice",
    /Nothing is sent anywhere unless you send it/i.test(text) &&
      /cloud backup uploads a copy/i.test(text) &&
      /sharing uploads only the threads you pick/i.test(text),
  );
  check("burned words are promised to stay", /Words you write down to burn stay here/i.test(text));
  check(
    "cloud backup states what it sends and for how long",
    /every thread, moment, step and lesson/i.test(text) &&
      /until you replace it or delete your account/i.test(text),
  );
  await page.screenshot({ path: `${OUT}/privacy-02-settings.png`, fullPage: true });

  // ── 4. the delete confirmation admits what it cannot clear ─────────────
  const del = page.getByRole("button", { name: "Delete everything" });
  if ((await del.count()) > 0) {
    await del.first().click();
    await page.waitForTimeout(600);
  }
  text = await bodyText();
  check(
    "the delete confirmation says uploads are revoked too",
    /uploaded are revoked at the same time/i.test(text),
  );
  check(
    "the delete confirmation admits the backup survives",
    /cloud backup stays on the server/i.test(text),
  );
  await page.screenshot({ path: `${OUT}/privacy-03-delete.png`, fullPage: true });
  const keep = page.getByRole("button", { name: "Keep it" });
  if ((await keep.count()) > 0) {
    await keep.first().click();
    await page.waitForTimeout(400);
  }

  // ── 5. the share flow itemises what leaves, before sending ─────────────
  const shareHeading = page.getByText("Share with a psychologist", { exact: true }).first();
  await shareHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  text = await bodyText();
  check(
    "the share intro no longer calls the upload a file you hand over",
    !/as a file you hand over yourself/i.test(text),
  );
  check(
    "the share intro names the upload and its 14 days",
    /puts the file on our server for 14 days/i.test(text),
  );
  check(
    "no field list is shown before anything is picked",
    !/What leaves the app, for the/i.test(text),
  );

  // Pick every thread.
  const all = page.getByRole("button", { name: "All", exact: true });
  if ((await all.count()) > 0) {
    await all.first().click();
    await page.waitForTimeout(1400);
  }
  text = await bodyText();
  check(
    "picking threads reveals what leaves the app",
    /What leaves the app, for the \d+ thread/i.test(text),
    text.match(/What leaves the app[^\n]*/i)?.[0] ?? "not found",
  );
  check("the list names the client's own words", /in your words/i.test(text));
  check("the list names the loudness ratings", /every loudness rating you set/i.test(text));
  check("the list has a 'never included' section", /Never included/i.test(text));
  check(
    "the list promises burned words stay on the device",
    /words you wrote down to burn — those stay on this device/i.test(text),
  );
  check(
    "the list promises unpicked threads stay",
    /anything from threads you did not pick/i.test(text),
  );
  check(
    "no field leaves undescribed",
    !/not yet described/i.test(text),
    text.match(/not yet described[^\n]*/i)?.[0] ?? "",
  );

  // The list must sit above the send buttons, not after them.
  const orderOK = await page.evaluate(() => {
    const t = document.body.innerText;
    const list = t.search(/What leaves the app, for the/i);
    const create = t.indexOf("Create the file");
    return list >= 0 && create >= 0 && list < create;
  });
  check("the list is shown above the send buttons", orderOK);
  const fieldBlock = page.getByLabel("What leaves the app").first();
  if ((await fieldBlock.count()) > 0) {
    await fieldBlock.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await fieldBlock.screenshot({ path: `${OUT}/privacy-04-share-fields.png` });
  }

  // ── 6. phone width ─────────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(900);
  const phoneText = await bodyText();
  check("the field list survives at 390px", /What leaves the app/i.test(phoneText));
  await page.screenshot({ path: `${OUT}/privacy-05-phone.png`, fullPage: true });

  check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 200));
} catch (e) {
  check(`harness completed (${String(e).slice(0, 220)})`, false);
  if (page) await page.screenshot({ path: `${OUT}/privacy-crash.png` }).catch(() => {});
} finally {
  if (page) await page.close().catch(() => {});
  await browser.close();
  server.close();
}

console.log(results.join("\n"));
const failures = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures > 0 ? 1 : 0);
