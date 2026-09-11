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
