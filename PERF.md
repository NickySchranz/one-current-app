# Renderer performance

How to measure One Current's visual world, and what it measured before the
renderer-architecture work started.

## Running the harness

```sh
EXPO_PUBLIC_PERF=1 npx expo export --platform web --clear
node scripts/perf-probe.mjs --theme summit   --branches 44 --label before
node scripts/perf-probe.mjs --theme riverbed --branches 44 --label before
```

`EXPO_PUBLIC_PERF=1` is required. Without it the counter module compiles to
no-ops — a normal build, including production, carries none of this — and the
probe refuses to run rather than print zeroes that look like success.

On a device, `npx expo run:ios --device` shows the same counters in the corner
beside Reanimated's frame-rate monitor (`src/dev/PerfOverlay.tsx`).

## What the numbers mean

Frame rate alone cannot tell a drag that rebuilds the entire scene every frame
from one that rebuilds nothing — both read 60fps until the device is older or
the scene is bigger. So the harness reports two independent things:

- **Pacing and CPU**, from the Chrome DevTools Protocol: frame deltas (p50 /
  p95 / worst), script duration, layout, recalc, DOM nodes.
- **Event counters**, from `src/dev/perf-counters.ts`: React renders, geometry
  builds, canonical window commits, dynamic path builds. Platform-independent,
  and the actual acceptance criterion.

**Target during a continuous drag:** renders, geometry builds and window
commits at ≈ 0, transform updates at display rate, and exactly one commit and
one geometry build per rebase.

### A trap worth knowing

Drag near the **left edge** (x ≈ 60), never the centre. The middle of the stage
is where the climber stands and where his quick menu opens; both intercept the
pointer. A centre drag silently does nothing and reports a perfect zero for
every counter. `scripts/summit-check.mjs` drags at x=60 for the same reason.

## Baseline — `86213e2`, SVG renderer, 44 branches

Chromium headless on Linux. **Not** a phone: these are useful for ranking
causes and for before/after on the same machine, not as device figures.

| scene | phase | p50 frame | script | renders/s | geometry/s | commits/s | paths/s |
|---|---|---|---|---|---|---|---|
| riverbed | idle | 16.7 ms (60fps) | 21.4% | 0.8 | 0.0 | 0.0 | 915 |
| riverbed | drag | 33.3 ms (30fps) | 66.1% | 14.7 | 11.3 | 11.3 | 776 |
| summit | idle | 66.6 ms (15fps) | 38.6% | 0.0 | 0.0 | 0.0 | 740 |
| summit | drag | 66.6 ms (15fps) | 76.9% | 10.8 | 5.3 | 5.3 | 756 |

### What this says

**Two separate problems, with separate symptoms.**

*The summit is broken before anyone touches it.* 15fps at idle with **zero**
React renders and zero geometry builds — React is not involved. It is ~740
path-string rebuilds a second, and the reason is that a rope's base path is a
straight vertical line that gets sampled every 20px and re-serialised in full
on every tick. Rope length grows with rope count (`peakAbove = n·step +
headroom`), so total sampled geometry is **quadratic in branch count**: at 44
branches a waiting rope is ~20,000px ≈ 1,000 points, and ~20 of them are
visible. Ten branches hides this completely.

*The horizontal map is fine at idle and halves under the finger.* 60fps → 30fps,
script 21% → 66%, with 11.3 geometry rebuilds and 11.3 window commits per
second. Every touch event crosses to the RN runtime, commits a canonical
window, and rebuilds the whole scene.

Skia addresses the first by removing string serialisation and the SVG
attribute path; cubic-Bézier ropes address it independently by removing the
quadratic. The second is fixed by never telling React the finger moved.

## The renderer decision — SVG vs Skia, measured

`node scripts/renderer-bench.mjs --ropes N`, after
`EXPO_PUBLIC_PERF=1 npx expo export --platform web --clear && cp public/canvaskit.wasm dist/`.

Twenty-plus ropes hanging past the viewport, swaying with the app's own
`swayOffsetAt`, three strokes each exactly as `BranchLine` paints them, and
nothing else on screen. SVG samples the visible slice and serialises a `d`
string to three native nodes; Skia builds one `SkPath` of cubics and paints it
three times.

| ropes | SVG script | Skia script | SVG fps | Skia fps | SVG nodes | Skia nodes | SVG layout |
|---|---|---|---|---|---|---|---|
| 60 | 12.4% | **2.6%** | 60.0 | 60.0 | 223 | 44 | 49 ms |
| 140 | 25.8% | **5.1%** | 60.0 | 60.0 | 463 | 44 | 83 ms |
| 320 | 64.6% | **9.5%** | 50.7 | **60.0** | 1003 | 44 | 166 ms |

**Skia wins, by about five times in script cost, and it scales.** Node count
stays at 44 regardless of scene size, layout cost is zero rather than growing,
and it still holds 60fps where SVG has started dropping frames.

This is measured under **software rasterisation** — headless Chromium here has
no GPU and falls back to SwiftShader, which is the condition that should most
favour the browser's own SVG rasteriser. A real GPU should widen the gap, not
narrow it. It has not been measured on one; see the limitations below.

### The near-miss, recorded because it would have decided the opposite

The first run of this benchmark said Skia was **four times worse** — 25.6fps
against SVG's 60 at sixty ropes. The cause was one line in the benchmark, not
in Skia: `Skia.Path.Make()` inside the per-frame derived value, allocating a
fresh path thirty times a second per rope. Reusing one path per rope and
calling `reset()` took Skia from 49.1% script to 2.6% at the same scene.

Phase 20 of the brief warns about exactly this. Had the result been reported
without checking it, the conclusion would have been backwards.

## Limitations of everything above

- Chromium on Linux, **software rasterisation, no GPU**. Useful for ranking
  causes and for before/after on one machine. Not device figures.
- **Not measured on iOS or Android.** There is no `ios/` or `android/`
  directory and no `eas.json` in this repo; Skia is a native dependency and
  needs `expo prebuild` or a dev client. `npx expo run:ios --device` shows the
  same counters via `src/dev/PerfOverlay.tsx`, so the numbers are reachable
  there — they have not been read here, and nothing above should be presented
  as a device result.
