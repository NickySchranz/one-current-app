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

## After this branch — same scene, same machine

| scene | phase | p50 frame | script | renders/s | geometry/s | commits/s | dropped |
|---|---|---|---|---|---|---|---|
| riverbed | idle | 16.7 ms (60fps) | 24.1% | 0.8 | 0.0 | 0.0 | 0 |
| riverbed | drag | 33.3 ms (30fps) | 68.3% | 14.6 | 10.7 | 10.7 | 151 |
| summit | idle | **16.7 ms (60fps)** | **15.5%** | 0.0 | 0.0 | 0.0 | **0** |
| summit | drag | 33.3 ms (30fps) | 75.3% | 18.7 | 9.2 | 9.2 | 164 |

**Idle is fixed on the scene that was broken.** The summit went from 15fps to
60, script from 38.6% to 15.5%, and from 99 dropped frames in six seconds to
none — by drawing only the slice of each rope that is on screen. No renderer
change was involved.

**Dragging is not fixed**, and the numbers say exactly why: ten window commits
and ten full geometry rebuilds a second, with fifteen to nineteen React
renders behind them. Every touch event still crosses to the RN runtime and
commits a canonical window. That is the outstanding work.

Riverbed's idle script rose slightly (21.4% → 24.1%). Some of that is the
counters themselves — `countPathBuildUI` increments a shared value on every
path build, and that scene builds ~900 a second. The counters are not free,
and every "after" number here includes their cost.

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

## The canvas in the real app — same code, Skia off vs on

`EXPO_PUBLIC_SKIA=0` against the default, both from the same commit, same
44-thread summit, same machine:

| phase | script | style recalc | layout | SVG nodes | p50 frame |
|---|---|---|---|---|---|
| idle, SVG | 15.8% | 129 ms | 94 ms | 1198 | 16.7 ms (60fps) |
| idle, Skia | **9.2%** | **55 ms** | 67 ms | **1029** | 16.7 ms (60fps) |
| drag, SVG | 75.0% | 271 ms | 166 ms | 1214 | 33.3 ms (30fps) |
| drag, Skia | **70.4%** | **166 ms** | 128 ms | 1044 | 33.3 ms (30fps) |

Idle is close to half the script cost and under half the style recalculation.
The drag is barely moved, and that is the honest reading: the canvas removes
what the ropes cost to *draw*, and the drag is not spending its time drawing.
It is spending it in React, rebuilding the layout nine times a second and
reconciling forty-four threads across a thousand SVG nodes that are still
there — labels, moments, hit areas, the rock. Until the pan stops committing a
window per frame, a faster renderer cannot show up on that row.

Two findings from getting the canvas to parity, both of which a screenshot
would have hidden:

- **CanvasKit cannot read `hsl()`.** Its colour parser takes hex, `rgb()` and
  the named colours; `branchColor` speaks `hsl(h s% l%)`. An unparseable
  string does not throw — it comes back as opaque black. Every rope drew as a
  heavy black cord and looked twice its weight.
- **Sharing the sway formula is not the same as sharing its arguments.** The
  canvas rope agreed with `swayOffsetAt` and disagreed about the phase seed,
  the loudness and whether a hanging rope rides the mountain. The climber
  ended up 23px off the rope he was holding; he is now within 1px.

The checks can see the canvas because each rope publishes the function it
draws with (`window.__ocRopes`, testing builds only), reporting the frame that
was actually drawn. Scraping a path string would simply have stopped working.

## The same canvas on the horizontal maps — and why it is off

`EXPO_PUBLIC_SKIA_LINES=1` against the default, same commit, same 44-thread
riverbed:

| phase | script | style recalc | SVG nodes | p50 | p95 | dropped |
|---|---|---|---|---|---|---|
| idle, SVG | 22.8% | 159 ms | 1021 | 16.7 ms | 16.8 ms | 0 |
| idle, Skia | **18.3%** | **64 ms** | 924 | 16.7 ms | 16.8 ms | 3 |
| drag, SVG | 65.7% | 199 ms | 1004 | 33.3 ms | **50 ms** | **135** |
| drag, Skia | **62.0%** | **113 ms** | 903 | 33.3 ms | 67 ms | 170 |

Close to a wash: it trades script for fill. A dozen full-width wavy lines are
a great deal more stroke area than a handful of short ropes, and this box
rasterises in software. **The default follows the measurement that exists**,
not the one that probably applies on a phone — the code is there, behind
`EXPO_PUBLIC_SKIA_LINES`, for whoever can run it on a GPU.

Four things found while building it, which hold regardless of the flag:

- **A worklet declared above its own constants captures them in the temporal
  dead zone.** The Reanimated plugin builds a worklet's closure where the
  function is *defined*, not where it is called. `waveWeightAt` sitting above
  `WAVE_BLEND` killed the whole bundle on load with "Cannot access 'T' before
  initialization" — a blank page, nowhere near the cause.
- **`DashPathEffect` over a long polyline is ruinous.** A one-pixel dot every
  twelve, over a couple of hundred segments, re-measured and re-split on every
  draw. Ablating that one layer took idle from **116 ms a frame to 16.7 ms**
  with nothing else changed. The dashes are emitted as dashes now, with butt
  caps, which halved the drag's p95 again.
- **A canvas the size of the scrolling content is repainted at the size of the
  content** — three million pixels a frame, and the map ran at 4 fps. It is one
  viewport now, pinned, with the scroll as its camera.
- **A change guard is only as good as its coarsest input.** The main wave's
  strength is a live spring; an unrounded copy of it in the guard meant the
  guard never held.

## The pan — the row nothing else could move

Both maps' drags were committing a window to the store every frame, and each
commit rebuilt the layout and reconciled every thread. The summit turned out
not to need the rebuild at all: build the layout at two windows half a span
apart and every rope's anchor, free end, column, length and label is
byte-identical. A summit pan moves four things — gridlines, date rail, today
band, moment dots — and all four move by the same number of pixels. The
horizontal maps are the same story with one wrinkle: there the world really
does move, but as a **pure translation**, with lanes, labels, `mainY`, canvas
height and `nowX` all unchanged. The only coordinates that differ are the
forks `dateToX` was clamping at the edge — which is what the overscan gutter
is for.

So the finger moves a shared value, the world is a transform, and the store
hears about it once every 120px of travel.

| scene | measure | before | after |
|---|---|---|---|
| summit drag | p50 | 33.3 ms (30fps) | **16.7 ms (60fps)** |
| | script | 70.4% | **40.5%** |
| | commits/s | 8.6 | **2.2** |
| riverbed drag | p50 | 33.3 ms (30fps) | **16.7 ms (60fps)** |
| | p95 | 50.0 ms | **33.4 ms** |
| | script | 65.7% | **43.4%** |
| | commits/s | 11.6 | **1.8** |

Riverbed's idle cost rose slightly (22.8% → 24.0%): the canvas is built a
rebase wider at each edge, so there is more geometry that is never seen.

### The flick, and why the obvious fix does not work

A rebase changes two things that have to agree: the window every date is
measured against, and the transform standing in for the travel not yet
committed. **React owns the first and Reanimated the second, and they do not
land on the same frame.** Reducing the transient after the commit flicked the
whole map back a rebase and forward again — one frame, invisible to any
screenshot, and about one drag in five. Waiting for the render that carried
the new window did not fix it; the two writes are simply not simultaneous.

The fix is to stop having two owners. The transient is never reduced: it
accumulates raw finger travel, and **React** subtracts what it has already
committed, derived from the window itself, so the two cannot disagree because
there is only one of them.

`scripts/pan-jump-check.mjs` is the only thing that can see this. It follows
**one** date, frame by frame, through a 480px drag on both maps. Two things
matter about how it does that: it must follow a single label, because after a
rebase the set of ticks has changed and "the first one" is a different day (an
earlier version reported 116px jumps that were not there), and it must sample
every frame, because the failure is one frame long.

Two other things it caught: `panBy` takes a fraction of the **store's** window,
so converting pixels against the built canvas's width under-panned by exactly
the gutter's share — an 18px step at every rebase. And the transient has to
know how much forward travel is left before the window hits its future limit;
discovering at the rebase that the store refused means the world has already
been drawn somewhere it cannot go.

## Limitations of everything above

- Chromium on Linux, **software rasterisation, no GPU**. Useful for ranking
  causes and for before/after on one machine. Not device figures.
- **Not measured on iOS or Android.** There is no `ios/` or `android/`
  directory and no `eas.json` in this repo; Skia is a native dependency and
  needs `expo prebuild` or a dev client. `npx expo run:ios --device` shows the
  same counters via `src/dev/PerfOverlay.tsx`, so the numbers are reachable
  there — they have not been read here, and nothing above should be presented
  as a device result.
