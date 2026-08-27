/* Answering a thread that needs typing happens on its own stage: the thread
   stays visible above the keyboard, and finishing closes the stage so the map
   plays the result. Checks the stage itself, the completions, the exits, and
   that the sheet-only flows did not move. */
import { serveDist, launchBrowser } from "./promo-lib.mjs";

const OUT = "/tmp/claude-1003/-home-nicky-one-current-app/8ddb833f-df61-4841-9003-43c43c704c93/scratchpad";
const results = [];
const check = (label, ok, detail = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);

const server = await serveDist("/home/nicky/one-current-app/dist", 4231, "/one-current-app");
const browser = await launchBrowser();
let page;

try {
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // LANG=es-CO runs the same flow in Colombian Spanish, so the panels are seen
  // inside the stage's capped container in the language that wraps longest.
  const lang = process.env.LANG_CODE ?? "en";
  await page.addInitScript((l) => {
    localStorage.setItem("one-current-auth", JSON.stringify({ email: "s@example.com" }));
    localStorage.setItem("one-current-tutorial-v1", "done");
    localStorage.setItem("one-current-language", l);
  }, lang);
  await page.goto("http://localhost:4231/one-current-app/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2600);

  const bodyText = () => page.locator("body").innerText();
  /** English label → the one this run should tap. */
  const ES = {
    More: "Más",
    Act: "Actuar",
    Integrate: "Integrar",
    Note: "Anotar",
    Next: "Siguiente",
    Back: "Atrás",
    "Place it on today": "Ponerlo en hoy",
    "Note it": "Anotarlo",
    "I have moved past it": "Lo dejé atrás",
    "It is resolved": "Está resuelto",
    "Let it rest": "Déjalo descansar",
    "Set aside for now": "Dejar a un lado por ahora",
    Cancel: "Cancelar",
    Reflect: "Reflexionar",
    Now: "Ahora",
    "You let it rest": "Lo dejaste descansar",
    "Load example threads": "Cargar hilos de ejemplo",
    "smallest honest step": "paso honesto más pequeño",
    "The smallest honest step": "El paso honesto más pequeño",
    "What just happened": "Lo que acaba de pasar",
    "What is true about this thread now": "Qué es verdad sobre este hilo ahora",
    "What returns with you": "Qué vuelve contigo",
    "New thread": "Nuevo hilo",
    "What is pulling at you": "Qué te está jalando",
  };
  const L = (en) => (lang === "en" ? en : (ES[en] ?? en));
  const tap = async (text, exact = true) => {
    const el = page.getByText(text, { exact }).first();
    await el.waitFor({ state: "visible", timeout: 15000 });
    await el.click();
    await page.waitForTimeout(500);
  };
  /** A stage announces itself. Not by its label — that is translated — and not
      by the tab bar, which also hides whenever the keyboard is up. */
  const onStage = () =>
    page.evaluate(() => !!document.querySelector('[data-testid="reflection-stage"]'));
  /** The stage's drawing of the thread, whatever the language. */
  const stageArt = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-testid="reflection-stage"]');
      const svg = root?.querySelector("svg");
      const r = svg?.getBoundingClientRect();
      return { h: Math.round(r?.height ?? 0), top: Math.round(r?.top ?? -1), label: svg?.getAttribute("aria-label") ?? "" };
    });
  /** Read what was actually written: the repository persists each table. */
  const table = (name) =>
    page.evaluate(
      (n) => JSON.parse(localStorage.getItem(`one-current/table/${n}`) ?? "[]"),
      name,
    );

  // Example threads, then back to the map.
  await tap(L("More"));
  await page.waitForTimeout(800);
  const loadExamples = page.getByRole("button", { name: L("Load example threads") });
  if ((await loadExamples.count()) > 0) {
    await loadExamples.first().click();
    await page.waitForTimeout(2200);
  }
  // Loading the examples returns to Now on its own.
  await page.waitForTimeout(1200);

  /** Open a thread's reflect menu: tap to arm, tap again, expand. */
  /**
   * Is the open sheet about this thread? Its own title says so — and it has to
   * be read inside the sheet, because the map behind it names every thread.
   */
  const menuIsFor = async (label, actWord) =>
    page.evaluate(
      ({ frag, act }) => {
        const hit = [...document.querySelectorAll("div,span")].find(
          (e) => e.childElementCount === 0 && e.textContent?.trim() === act,
        );
        if (!hit) return false;
        // Climb to the panel that holds the choices and the thread's title.
        let node = hit;
        for (let i = 0; i < 10 && node.parentElement; i++) {
          node = node.parentElement;
          const text = node.innerText ?? "";
          if (text.includes(act) && text.length > 60) {
            if (text.includes(frag)) return true;
            // keep climbing only while still inside the sheet
            if (text.length > 900) return false;
          }
        }
        return false;
      },
      { frag: label, act: actWord },
    );
  const openMenu = async (label) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      // An already-open sheet counts only if it is about the right thread —
      // otherwise the next steps would answer somebody else's line.
      if (
        (await page.getByText(L("Act"), { exact: true }).count()) > 0 &&
        (await menuIsFor(label, L("Act")))
      ) {
        return true;
      }
      if ((await page.getByText(L("Act"), { exact: true }).count()) > 0) {
        // wrong thread: put it down and start again
        await page.keyboard.press("Escape");
        await page.waitForTimeout(700);
      }
      // Pip may have wandered to this thread and be offering his own pills;
      // his Reflect pill is then the way in, and it sits over the label.
      const pill = page.getByText(L("Reflect"), { exact: true }).first();
      if ((await pill.count()) > 0) {
        await pill.click();
        await page.waitForTimeout(900);
      } else {
        const th = page.getByText(label, { exact: false }).first();
        if ((await th.count()) === 0) return false;
        await th.click({ force: true });
        await page.waitForTimeout(1400);
      }
      const q = page.getByText(/What does this thread need from you now\?|¿Qué necesita este hilo de ti ahora\?/).first();
      if ((await q.count()) > 0) {
        await q.click();
        await page.waitForTimeout(800);
      }
      const reflect = page.getByRole("button", { name: L("Reflect") });
      if (
        (await page.getByText(L("Act"), { exact: true }).count()) === 0 &&
        (await reflect.count()) > 0
      ) {
        await reflect.first().click();
        await page.waitForTimeout(900);
      }
      if ((await page.getByText(L("Act"), { exact: true }).count()) > 0) return true;
    }
    return false;
  };

  const THREAD = "The rent increase letter";
  // Map labels get suffixed once answered — tap by a stable fragment.
  const THREAD_TAP = "increase letter";

  // ── 1. the stage itself ────────────────────────────────────────────────
  check("the reflect menu opens", await openMenu(THREAD_TAP));
  await tap(L("Act"));
  await page.waitForTimeout(1200);
  check("Act opens a stage, not a sheet", await onStage());
  let text = await bodyText();
  check("the stage names the thread", text.includes(THREAD));
  check("the stage shows Now", text.includes(L("Now")));
  check("the stage asks its question", text.includes(L("smallest honest step")));
  const solo = await stageArt();
  check("the thread's line is drawn on the stage", solo.h > 80, `h=${solo.h}`);
  check("the stage is labelled for a screen reader", solo.label.length > 8, solo.label);
  // No other thread may be on the stage — that is what "focused on one" means.
  const others = await page.evaluate(
    (keep) =>
      [
        "Everyone seems further along than me",
        "Jonas and the unanswered message",
        "The argument with my father",
        "Waiting for the scan results",
        "My sleep is a mess again",
      ].filter((n) => n !== keep && document.body.innerText.includes(n)).length,
    THREAD,
  );
  check("no other thread is on the stage", others === 0, `${others} others visible`);
  await page.screenshot({ path: `${OUT}/stage-01-act.png` });

  // ── 2. the line stays visible with the keyboard up ─────────────────────
  const field = page.getByLabel(L("The smallest honest step"));
  await field.click();
  await field.fill("Read the letter once, out loud");
  await page.waitForTimeout(700);
  const withKb = await stageArt();
  check(
    "the thread's line is still visible while typing",
    withKb.h > 60 && withKb.top >= 0,
    `h=${withKb.h} top=${withKb.top}`,
  );
  await page.screenshot({ path: `${OUT}/stage-02-typing.png` });

  // ── 3. completing Act closes the stage in one step ─────────────────────
  await tap(L("Next"));
  await page.waitForTimeout(600);
  await tap(L("Place it on today"));
  await page.waitForTimeout(2400);
  check("placing the step closes the stage with no second tap", !(await onStage()));
  text = await bodyText();
  check(
    "no leftover confirmation card",
    !/Action added to your main line/i.test(text) && !/Return to timeline/i.test(text),
  );
  const actions = await table("actions");
  check(
    "the step reached today's actions",
    actions.some((a) => (a.title ?? "").includes("Read the letter once")),
    `${actions.length} action(s)`,
  );
  await page.screenshot({ path: `${OUT}/stage-03-after-act.png` });

  // ── 4. Note: same stage, same auto-close ───────────────────────────────
  check("the menu reopens after acting", await openMenu(THREAD_TAP));
  await tap(L("Note"));
  await page.waitForTimeout(1200);
  check("Note opens a stage", await onStage());
  const noteField = page.getByLabel(L("What just happened"));
  await noteField.click();
  await noteField.fill("The landlord called back");
  await page.waitForTimeout(400);
  await tap(L("Note it"));
  await page.waitForTimeout(2200);
  check("noting it closes the stage", !(await onStage()));
  check("no leftover note confirmation", !/Noted on the thread/i.test(await bodyText()));
  const noted = await table("branches");
  check(
    "the moment is on the thread",
    noted.some((b) => (b.commits ?? []).some((m) => m.title === "The landlord called back")),
  );

  // ── 5. "It is resolved" stays on a stage, never falls back to a sheet ──
  check("the menu reopens after noting", await openMenu(THREAD_TAP));
  await tap(L("Integrate"));
  await page.waitForTimeout(1200);
  check("Integrate opens a stage", await onStage());
  check(
    "its outcomes are offered",
    (await bodyText()).includes(L("What is true about this thread now")),
  );
  await page.screenshot({ path: `${OUT}/stage-04-integrate.png` });
  await tap(L("It is resolved"));
  await page.waitForTimeout(1800);
  check("the resolved wizard is still a stage", await onStage());
  check("the wizard is showing", (await bodyText()).includes(L("What returns with you")));
  // The tall wizard must not grow until the thread has left the screen.
  const wizardStage = await stageArt();
  check(
    "the thread is still visible under the tall wizard",
    wizardStage.h > 80 && wizardStage.top >= 0,
    `h=${wizardStage.h} top=${wizardStage.top}`,
  );
  await page.screenshot({ path: `${OUT}/stage-05-wizard.png` });
  // Set aside: an explicit exit that returns to the map.
  const aside = page.getByText(L("Set aside for now"), { exact: true }).first();
  if ((await aside.count()) > 0) {
    await aside.click();
    await page.waitForTimeout(2000);
  }
  check("setting it aside returns to the map", !(await onStage()));

  // ── 6. Back from a stage lands on the reflect menu ─────────────────────
  check("the menu opens for Back", await openMenu(THREAD_TAP));
  await tap(L("Note"));
  await page.waitForTimeout(1100);
  await tap(L("Back"));
  await page.waitForTimeout(1800);
  check("Back leaves the stage", !(await onStage()));
  check(
    "Back lands on the reflect menu with its choices open",
    (await page.getByText(L("Act"), { exact: true }).count()) > 0,
  );

  // ── 7. the sheet-only flows did not move ──────────────────────────────
  text = await bodyText();
  check(
    "the loudness dial and Let it rest stay in the sheet",
    text.includes(L("Let it rest")),
  );
  await tap(L("Let it rest"));
  await page.waitForTimeout(1300);
  check("letting it rest never opens a stage", !(await onStage()));
  check("it answers in place", (await bodyText()).includes(L("You let it rest")));

  // ── 8. and "moved past it" ends the thread, closing the stage ─────────
  // Last, because it takes the thread off the map for good.
  check("the menu reopens after resting", await openMenu(THREAD_TAP));
  await tap(L("Integrate"));
  await page.waitForTimeout(1300);
  check("Integrate opens a stage again", await onStage());
  await tap(L("I have moved past it"));
  await page.waitForTimeout(2800);
  check("moving past it closes the stage", !(await onStage()));
  const merged = await table("branches");
  const subject = merged.find((b) => b.title === THREAD);
  check(
    "the thread is integrated",
    !!subject && !!subject.mergeDate,
    subject ? `status=${subject.status} mergeDate=${subject.mergeDate}` : "thread not found",
  );

  // ── 9. the map comes back settled on Now ─────────────────────────────
  // A stage unmounts the map, and on the way back the map deliberately
  // settles around the main line so Now is what you see first
  // (LifeTimeline's canvas-shape effect). Assert that, not a preserved
  // offset — the two would fight, and Now is the better resting place.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  const scroller = () =>
    page.evaluate(() => {
      const sv = [...document.querySelectorAll("div")].find(
        (d) => d.scrollHeight > d.clientHeight + 40 && d.clientHeight > 200,
      );
      return sv ? Math.round(sv.scrollTop) : -1;
    });
  await page.mouse.move(195, 500);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(1000);
  const scrolled = await scroller();
  check("the map scrolls (precondition)", scrolled > 40, `y=${scrolled}`);
  await page.getByRole("button", { name: L("New thread") }).first().click();
  await page.waitForTimeout(1600);
  check(
    "a stage took the whole screen",
    (await bodyText()).includes(L("What is pulling at you")),
  );
  check("the map is gone while the stage is up", (await scroller()) === -1);
  // Cancel, not Escape: the first Escape only leaves the focused field.
  await page.getByText(L("Cancel"), { exact: true }).first().click();
  await page.waitForTimeout(2200);
  const after = await scroller();
  check("the map is back and scrollable", after >= 0, `y=${after}`);
  check("the map comes back settled on Now", (await bodyText()).includes(L("Now")));

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ").slice(0, 300));
} catch (e) {
  check(`harness completed (${String(e).slice(0, 220)})`, false);
  if (page) await page.screenshot({ path: `${OUT}/stage-crash.png` }).catch(() => {});
} finally {
  if (page) await page.close().catch(() => {});
  await browser.close();
  server.close();
}

console.log(results.join("\n"));
const failures = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures > 0 ? 1 : 0);
