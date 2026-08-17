/* Shared capture harness for promo footage (see promo-footage.mjs).
   Records deterministic 30fps footage by virtualizing the page clock
   (Date / performance.now / rAF / timers) and stepping it one frame at a
   time, screenshotting each step at deviceScaleFactor 2. Frames stream
   into Playwright's bundled ffmpeg as MJPEG and come out as VP8 webm.
   Why not recordVideo/CDP screencast: on this box both produce blank or
   1x-only frames; page.screenshot is the only crisp 2x path. */
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

export const FOOTAGE_DIR = "/home/nicky/one_current/promo/public/footage";
export const FPS = 30;
const FRAME_MS = 1000 / FPS;
const FFMPEG = `${process.env.HOME}/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux`;
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const CHROME_LIBS = `${process.env.HOME}/.cache/one-current-chromium-libs/usr/lib/x86_64-linux-gnu`;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

export function serveDist(dist, port, stripPrefix = "") {
  const server = createServer(async (req, res) => {
    let path = req.url.split("?")[0];
    if (stripPrefix && path.startsWith(stripPrefix)) path = path.slice(stripPrefix.length);
    if (path === "" || path === "/") path = "/index.html";
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

export function launchBrowser() {
  return chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox"],
    env: { ...process.env, LD_LIBRARY_PATH: CHROME_LIBS },
  });
}

/* Controllable page clock. Realtime passthrough until __clock.take(); after
   that Date/performance.now/rAF/setTimeout/setInterval advance only via
   __clock.tick(ms). New timers scheduled during a tick wait for the next
   tick (seq guard), so zero-delay chains can't spin forever. */
const CLOCK_PATCH = `(() => {
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeCAF = window.cancelAnimationFrame.bind(window);
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);
  const nativePerfNow = performance.now.bind(performance);
  const NativeDate = Date;

  const st = {
    virtual: false,
    vNow: 0,
    epochOffset: 0,
    rafCbs: new Map(),
    rafId: 1,
    timers: new Map(),
    timerId: 1e7,
    seq: 0,
  };

  window.requestAnimationFrame = (cb) => {
    if (!st.virtual) return nativeRAF(cb);
    const id = st.rafId++;
    st.rafCbs.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (st.rafCbs.has(id)) st.rafCbs.delete(id);
    else nativeCAF(id);
  };
  window.setTimeout = (cb, delay = 0, ...args) => {
    if (!st.virtual || typeof cb !== "function") return nativeSetTimeout(cb, delay, ...args);
    const id = st.timerId++;
    st.timers.set(id, { at: st.vNow + Math.max(0, Number(delay) || 0), cb, args, interval: null, seq: st.seq++ });
    return id;
  };
  window.clearTimeout = (id) => {
    if (st.timers.has(id)) st.timers.delete(id);
    else nativeClearTimeout(id);
  };
  window.setInterval = (cb, delay = 0, ...args) => {
    if (!st.virtual || typeof cb !== "function") return nativeSetInterval(cb, delay, ...args);
    const id = st.timerId++;
    const iv = Math.max(1, Number(delay) || 0);
    st.timers.set(id, { at: st.vNow + iv, cb, args, interval: iv, seq: st.seq++ });
    return id;
  };
  window.clearInterval = (id) => {
    if (st.timers.has(id)) st.timers.delete(id);
    else nativeClearInterval(id);
  };
  performance.now = () => (st.virtual ? st.vNow : nativePerfNow());
  window.Date = class extends NativeDate {
    constructor(...a) {
      if (a.length) super(...a);
      else if (st.virtual) super(st.epochOffset + st.vNow);
      else super();
    }
    static now() {
      return st.virtual ? st.epochOffset + st.vNow : NativeDate.now();
    }
  };
  for (const k of ["parse", "UTC"]) window.Date[k] = NativeDate[k];

  window.__clock = {
    take() {
      st.vNow = nativePerfNow();
      st.epochOffset = NativeDate.now() - st.vNow;
      st.virtual = true;
    },
    tick(ms) {
      const target = st.vNow + ms;
      const seqLimit = st.seq;
      let fired = 0;
      for (;;) {
        let next = null, nextId = null;
        for (const [id, t] of st.timers) {
          if (t.at > target || t.seq >= seqLimit) continue;
          if (!next || t.at < next.at || (t.at === next.at && t.seq < next.seq)) { next = t; nextId = id; }
        }
        if (!next || fired++ > 5000) break;
        st.vNow = Math.max(st.vNow, next.at);
        if (next.interval) next.at += next.interval;
        else st.timers.delete(nextId);
        try { next.cb(...next.args); } catch (e) { console.error(e); }
      }
      st.vNow = target;
      const cbs = [...st.rafCbs.values()];
      st.rafCbs.clear();
      for (const cb of cbs) {
        try { cb(st.vNow); } catch (e) { console.error(e); }
      }
    },
  };
})();`;

/* Visible touch cursor: a soft dot that follows pointer moves plus a ring
   that ripples out on pointerdown. Ripples animate off the patched clock
   (rAF + performance.now), so they stay in sync with captured frames. */
const CURSOR_PATCH = `window.addEventListener("DOMContentLoaded", () => {
  const dot = document.createElement("div");
  dot.style.cssText =
    "position:fixed;z-index:99999;width:26px;height:26px;border-radius:50%;" +
    "background:rgba(38,37,31,0.28);border:1.5px solid rgba(255,255,255,0.85);" +
    "box-shadow:0 1px 6px rgba(0,0,0,0.25);pointer-events:none;" +
    "transform:translate(-50%,-50%);left:-100px;top:-100px";
  document.body.appendChild(dot);
  document.addEventListener("pointermove", (e) => {
    dot.style.left = e.clientX + "px";
    dot.style.top = e.clientY + "px";
  }, true);
  document.addEventListener("pointerdown", (e) => {
    dot.style.left = e.clientX + "px";
    dot.style.top = e.clientY + "px";
    const ring = document.createElement("div");
    ring.style.cssText =
      "position:fixed;z-index:99998;width:26px;height:26px;border-radius:50%;" +
      "border:2.5px solid rgba(38,37,31,0.55);pointer-events:none;" +
      "transform:translate(-50%,-50%);left:" + e.clientX + "px;top:" + e.clientY + "px";
    document.body.appendChild(ring);
    const t0 = performance.now();
    const grow = () => {
      const p = Math.min(1, (performance.now() - t0) / 450);
      const s = 1 + p * 2.2;
      ring.style.transform = "translate(-50%,-50%) scale(" + s + ")";
      ring.style.opacity = String(1 - p);
      if (p < 1) requestAnimationFrame(grow);
      else ring.remove();
    };
    requestAnimationFrame(grow);
  }, true);
});`;

/* Open an app page with auth + pro seeded, clock + cursor patches installed. */
export async function openPage(browser, { url, viewport, seedAuth = true, cursor = true }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.addInitScript(CLOCK_PATCH);
  if (cursor) await page.addInitScript(CURSOR_PATCH);
  await page.addInitScript(() => {
    localStorage.setItem("one-current-tutorial-v1", "done");
  });
  if (seedAuth) {
    await page.addInitScript(() => {
      localStorage.setItem("one-current-auth", JSON.stringify({ email: "promo@onecurrent.app" }));
      localStorage.setItem("one-current-pro", "1");
    });
  }
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  return page;
}

/* Patient app, example data loaded, back on Now. */
export async function openAppWithExampleData(browser, viewport, opts = {}) {
  const page = await openPage(browser, { url: "http://localhost:4188/one-current-app/", viewport, ...opts });
  await page.getByRole("button", { name: "More" }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Load example threads" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /Now$/ }).first().click();
  await page.waitForTimeout(2500);
  return page;
}

/* A point on a thread's curved stroke (the transparent hit path). */
export const strokePoint = (page, along, index = 0) =>
  page.evaluate(([at, idx]) => {
    const els = document.querySelectorAll('path[stroke="transparent"]');
    const el = els[Math.min(idx, els.length - 1)];
    if (!el) return null;
    const p = el.getPointAtLength(el.getTotalLength() * at);
    const m = el.getScreenCTM();
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  }, [along, index]);

export class Recorder {
  constructor(page, name) {
    this.page = page;
    this.name = name;
    this.frame = 0;
    this.beats = [];
    this.ff = null;
    this.ffDone = null;
    this.ffErr = "";
  }

  async start() {
    await mkdir(FOOTAGE_DIR, { recursive: true });
    await this.page.evaluate(() => window.__clock.take());
    this.ff = spawn(FFMPEG, [
      "-y",
      "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "pipe:0",
      "-c:v", "libvpx", "-b:v", "12M", "-crf", "6", "-deadline", "realtime", "-cpu-used", "5",
      "-pix_fmt", "yuv420p",
      join(FOOTAGE_DIR, `${this.name}.webm`),
    ], { stdio: ["pipe", "ignore", "pipe"] });
    this.ff.stderr.on("data", (d) => (this.ffErr += d));
    this.ff.stdin.on("error", () => {});
    this.ffDone = new Promise((r) => this.ff.on("close", r));
    return this;
  }

  /* Advance one frame: tick virtual time, screenshot, feed ffmpeg. */
  async capture(frames = 1) {
    for (let i = 0; i < frames; i++) {
      if (this.ff.exitCode !== null) throw new Error(`ffmpeg died (code ${this.ff.exitCode}): ${this.ffErr.slice(-400)}`);
      await this.page.evaluate((ms) => window.__clock.tick(ms), FRAME_MS);
      const buf = await this.page.screenshot({ type: "jpeg", quality: 90 });
      if (!this.ff.stdin.write(buf)) await new Promise((r) => this.ff.stdin.once("drain", r));
      this.frame++;
    }
  }

  /* Capture roughly `ms` of virtual time. */
  hold(ms) {
    return this.capture(Math.max(1, Math.round(ms / FRAME_MS)));
  }

  /* Pump frames while a Playwright action (click, fill…) settles. Actions
     wait on rAF-based stability checks, which only progress when we tick. */
  async during(promise, { min = 0, max = 600 } = {}) {
    let done = false, err = null, val;
    Promise.resolve(promise).then(
      (v) => ((done = true), (val = v)),
      (e) => ((done = true), (err = e)),
    );
    let captured = 0;
    while ((!done && captured < max) || captured < min) {
      await this.capture(1);
      captured++;
    }
    if (err) throw err;
    return val;
  }

  /* Glide the visible cursor to a point over `ms` of footage. */
  async glideTo(x, y, ms = 500) {
    const from = this.cursorAt ?? { x: this.page.viewportSize().width / 2, y: this.page.viewportSize().height * 0.75 };
    const steps = Math.max(2, Math.round(ms / FRAME_MS));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t * t * (3 - 2 * t); // smoothstep
      await this.page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
      await this.capture(1);
    }
    this.cursorAt = { x, y };
  }

  /* Glide to an element (by locator) and click it, capturing throughout.
     Scrolls it into view first (on camera) if it's outside the viewport. */
  async glideClick(locator, ms = 500) {
    const vp = this.page.viewportSize();
    let box = await locator.boundingBox();
    if (!box || box.y < 0 || box.y + box.height > vp.height || box.x < 0 || box.x + box.width > vp.width) {
      await this.during(locator.scrollIntoViewIfNeeded(), { min: 4, max: 90 });
      await this.capture(3);
      box = await locator.boundingBox();
    }
    if (!box) throw new Error(`no box for ${locator}`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await this.glideTo(x, y, ms);
    // let Playwright retarget the exact click point — animated trays can
    // shift between measuring and pressing (the cursor dot follows anyway)
    await this.during(locator.click({ timeout: 8000 }), { min: 2, max: 120 });
    await this.capture(1);
  }

  /* Tap at raw coordinates with the visible cursor. */
  async glideTap(x, y, ms = 500) {
    await this.glideTo(x, y, ms);
    await this.page.mouse.down();
    await this.capture(2);
    await this.page.mouse.up();
    await this.capture(1);
  }

  beat(label) {
    this.beats.push({ label, frame: this.frame });
  }

  async stop() {
    this.ff.stdin.end();
    await this.ffDone;
    await writeFile(
      join(FOOTAGE_DIR, `${this.name}.beats.json`),
      JSON.stringify({ fps: FPS, frames: this.frame, beats: this.beats }, null, 2),
    );
    if (this.ff.exitCode !== 0) throw new Error(`ffmpeg exit ${this.ff.exitCode}: ${this.ffErr.slice(-400)}`);
    console.log(`  ${this.name}: ${this.frame} frames (${(this.frame / FPS).toFixed(1)}s), ${this.beats.length} beats`);
  }
}
