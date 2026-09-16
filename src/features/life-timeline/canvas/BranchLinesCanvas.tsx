import { useEffect, useMemo } from "react";
import {
  Canvas,
  Group,
  Path as SkPath,
  Skia,
  type SkPath as SkPathType,
} from "@shopify/react-native-skia";
import { useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import {
  calmWaveOffset,
  slitherOffsetAt,
  waveWeightAt,
  type WaveHandles,
} from "../useSquiggle";
import { countPathBuildUI } from "@/dev/perf-counters";
import { SHOW_TESTING } from "@/config/flags";
import { PT_STRIDE, type LineSpec } from "./line-spec";

/**
 * Every horizontal thread line, on one canvas.
 *
 * The summit's ropes went first because they were the worst offender, but the
 * cost was never specific to ropes: a line rewrites its whole `d` string every
 * tick and hands it to two or three SVG nodes, and with forty-four threads
 * that was about nine hundred path builds a second on the riverbed map at
 * rest — measured at 22% of a frame's script budget, against 11% for ten
 * threads. It scales with the number of threads, which is the number that
 * grows as someone actually uses the app.
 *
 * The geometry is sampled once, when the layout is built, and kept as a flat
 * Float32Array. Per frame this walks those points, applies the slither and the
 * main line's wave, and fills one reused SkPath. No strings, no DOM, no
 * reconciliation.
 */
export function BranchLinesCanvas({
  lines,
  clock,
  wave,
  waveNowX,
  wavePeriodMs,
  scrollY,
  worldX,
  worldShift,
  dimExcept,
  keepId,
  width,
  height,
  reducedMotion,
}: {
  lines: LineSpec[];
  /**
   * The world's seconds — ONE clock for the whole map.
   *
   * Each line used to run its own repeating ramp, so forty-four threads meant
   * forty-four shared values written every frame. They are all reading the
   * same time, and sharing it also puts every line's quantized tick on the
   * same grid as the main wave's: two clocks a frame apart made a line
   * rebuild twice for one step of motion.
   */
  clock: SharedValue<number>;
  wave: WaveHandles | null;
  waveNowX: number;
  wavePeriodMs: number;
  /** The stage scrolls vertically; the canvas is pinned, so it carries it. */
  scrollY: SharedValue<number> | null;
  /**
   * The world camera, in the two halves the map has always had.
   *
   * `worldX` is React's: the number the `<Svg>` builds its viewBox from, which
   * changes only when a window is committed. `worldShift` is the finger's: the
   * transient the world group rides. They are separate because they are
   * written by different runtimes on different frames, and collapsing them
   * into one is what produces the one-frame flick `pan-jump-check` exists to
   * catch (PERF.md).
   *
   * The canvas lives OUTSIDE the `<Svg>`, so it inherits neither. It had
   * neither, and drew every thread a full overscan — a hundred and sixty
   * pixels — into the future, pinned there while the map panned beneath it.
   * The fork and merge dots stayed on the SVG and stayed correct, so a line
   * and the point it integrates at were drawn in different places.
   */
  worldX: number;
  worldShift: SharedValue<number> | null;
  /**
   * While Pip is holding one thread the others stand back. It is a prop
   * rather than part of the spec on purpose: the spec carries the SAMPLED
   * geometry, and Pip moves often — rebuilding it to fade a line would
   * re-sample every thread on the map each time he took a step.
   */
  dimExcept: string | null;
  /** The thread the user has hold of never stands back. */
  keepId: string | null;
  width: number;
  height: number;
  reducedMotion: boolean;
}) {
  /**
   * ONE camera for the whole canvas, not one per line.
   *
   * Every line used to build its own `[{ translateY }]` every frame — the
   * same number, forty-four times, each one a shared value in the single
   * mapper react-native-skia starts over the whole tree, and each one an
   * array and an object allocated per frame.
   */
  const camera = useDerivedValue<CameraStep[]>(
    () => [
      /**
       * ONE key per entry, and it is not a style choice.
       *
       * `processTransform3d` (skia/types/Matrix4.js) reads
       * `Object.keys(val)[0]` and acts on that alone, so an entry carrying
       * both `translateX` and `translateY` has its second field silently
       * dropped. Written as `{ translateX: 0, translateY: -scroll }` — which
       * is what a TypeScript variance error once talked me into — this
       * applied a zero x-shift and discarded the scroll entirely, and the
       * threads sat still while every other layer moved under them.
       */
      { translateX: (worldShift ? worldShift.value : 0) - worldX },
      { translateY: scrollY ? -Math.round(scrollY.value * 2) / 2 : 0 },
    ],
    [worldShift, worldX, scrollY],
  );
  /**
   * The camera, published for the checks.
   *
   * Not for its VALUE but for its SHAPE. `processTransform3d` acts on
   * `Object.keys(val)[0]` and ignores the rest of the entry, so a step
   * carrying two fields loses one of them silently — no error, no warning,
   * just a layer that stops moving while every other layer scrolls. The
   * compiler will not catch it either: the union is inferred through a
   * callback, so excess-property checking never fires. A check that can read
   * the steps can assert what the compiler cannot. Testing builds only.
   */
  useEffect(() => {
    if (!SHOW_TESTING || typeof window === "undefined") return;
    const w = window as unknown as { __ocCamera?: () => CameraStep[] };
    w.__ocCamera = () => camera.value;
    return () => {
      delete w.__ocCamera;
    };
  }, [camera]);

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Group transform={camera}>
      {lines.map((l) => (
        <Line
          key={l.id}
          spec={l}
          camera={camera}
          clock={clock}
          wave={wave}
          waveNowX={waveNowX}
          wavePeriodMs={wavePeriodMs}
          scrollY={scrollY}
          height={height}
          fade={dimExcept !== null && l.id !== dimExcept && l.id !== keepId ? 0.38 : 1}
          reducedMotion={reducedMotion}
        />
      ))}
      </Group>
    </Canvas>
  );
}

/** How far past the canvas edge a line still counts as visible. */
const MARGIN = 60;

/** Exactly one of the two, because Skia only ever reads the first key. */
type CameraStep = { translateX: number } | { translateY: number };
type Camera = SharedValue<CameraStep[]>;

function Line({
  spec,
  camera,
  clock,
  wave,
  waveNowX,
  wavePeriodMs,
  scrollY,
  height,
  fade,
  reducedMotion,
}: {
  spec: LineSpec;
  /** The one camera the whole canvas is drawn under; carried only so the
   *  testing probe can report where a line actually IS. */
  camera: Camera;
  clock: SharedValue<number>;
  wave: WaveHandles | null;
  waveNowX: number;
  wavePeriodMs: number;
  scrollY: SharedValue<number> | null;
  height: number;
  fade: number;
  reducedMotion: boolean;
}) {
  /**
   * A line that never moves is built once from its own path string and kept.
   *
   * A moving one gets TWO paths, used turn and turn about, and that is not a
   * flourish — it is the difference between drawing and not drawing.
   * Reanimated's `valueSetter` refuses an assignment whose value is the same
   * object it already holds (`valueSetter.js:54`), so handing back one
   * rewound-and-refilled path tells the renderer nothing and the slither
   * never repaints. It is the same mistake `flags.ts` records for the ropes,
   * and it is why the riverbed's SVG-vs-canvas table measured a canvas that
   * was standing still.
   */
  const stillPath = useMemo(
    () => (spec.count === 0 ? (Skia.Path.MakeFromSVGString(spec.d) ?? Skia.Path.Make()) : null),
    [spec.count, spec.d],
  );
  const buffers = useMemo(() => [Skia.Path.Make(), Skia.Path.Make()], []);
  const dashBuffers = useMemo(() => [Skia.Path.Make(), Skia.Path.Make()], []);
  /**
   * The scroll and the pan are a TRANSFORM, not a rebuild — and the transform
   * belongs to the canvas, once, not to each line. Paths are built in the
   * layout's own coordinates, so moving the world moves the group.
   */
  /**
   * The line's description, held in a shared value rather than closed over —
   * see the note beside `specSV` in SummitRopesCanvas. Naming it in a
   * dependency array tears down and rebuilds the mapper that feeds this
   * worklet its clock; leaving it out draws from a spec that has moved on.
   */
  const specSV = useSharedValue(spec);
  if (specSV.value !== spec) specSV.value = spec;
  const rides = !reducedMotion && !!wave && (spec.attachStart || spec.attachEnd);
  const slithers = !reducedMotion && spec.trembles;

  // The rate this line's own wave needs — the same table BranchLine's hook
  // uses, so a quiet line is not rebuilt thirty times a second to move a
  // fraction of a pixel.
  const rate = useMemo(
    () => (spec.level >= 4 ? 30 : spec.level >= 3 ? 20 : 10),
    [spec.level],
  );
  const tick = useDerivedValue(
    () => (slithers ? Math.round(clock.value * rate) / rate : 0),
    [clock, rate, slithers],
  );

  /**
   * The displaced points of the last build, so the flow dashes can be placed
   * along the line without walking it a second time.
   */
  const xy = useMemo(() => new Float32Array(Math.max(2, spec.count) * 2), [spec.count]);

  /**
   * What the last build was made from, and which buffer holds it.
   *
   * A PLAIN OBJECT, and that is the whole point. A mapper's inputs are every
   * shared value its worklet closes over (`mappers.js`, `extractInputs`), so
   * a guard kept in a shared value that the worklet also writes marks the
   * mapper dirty on every write — it re-runs at display rate no matter what
   * the guard says, which is a guard that costs more than it saves. These
   * were `useSharedValue(NaN)` and did exactly that. Plain memory is just
   * memory.
   *
   * `spec` is in here, and leaving it out was a bug you could watch happen.
   * The key was time and the wave and nothing else, so a line whose SHAPE had
   * changed — the map leans when a thread is focused, and every lane moves —
   * re-ran this worklet, failed to notice, and handed back the geometry it
   * drew before. A loud thread hid it, because its tick moves ten to thirty
   * times a second and drags the rebuild along behind it. A quiet one did
   * not: with no slither and a calm main line, `t` is pinned at 0 and the
   * wave key at -1 for as long as the day stays calm, so after the first
   * build the guard could never fall through again and the line was frozen
   * for the session. Under reduced motion that was every line on the map.
   *
   * The spec is safe to compare by identity: `keepUnchanged` in
   * `spec-cache.ts` hands back the PREVIOUS object whenever every field
   * matches within its epsilon, so a new object means something really moved.
   * That cache exists to make exactly this comparison possible.
   */
  const seen = useMemo(
    () => ({
      spec: null as LineSpec | null,
      t: Number.NaN,
      wave: Number.NaN,
      /** The viewport the cull was measured against. */
      h: Number.NaN,
      i: 0,
      di: 0,
    }),
    [],
  );

  const drawn = useDerivedValue<SkPathType>(() => {
    const spec = specSV.value;
    const shiftNow = scrollY ? -Math.round(scrollY.value * 2) / 2 : 0;
    // Off the viewport there is nothing to draw and nothing to fill. The
    // canvas is one viewport tall and the content is several, so at
    // forty-four threads most of them are somewhere else — and unlike the
    // SVG, which the browser clips per node, a canvas pays for every stroke
    // it is asked to lay down.
    if (spec.maxY + shiftNow < -MARGIN || spec.minY + shiftNow > height + MARGIN) {
      if (stillPath) return stillPath;
      const shown = buffers[seen.i];
      if (shown.isEmpty()) return shown;
      // Emptying it has to be SEEN, so the clear lands on the other buffer.
      seen.i = 1 - seen.i;
      seen.t = Number.NaN;
      const cleared = buffers[seen.i];
      cleared.reset();
      return cleared;
    }
    if (stillPath) return stillPath;
    const t = tick.value;
    // Quantized, and then USED quantized — the strength of the main wave is
    // a live spring, so an unrounded copy of it in the guard means the guard
    // never holds and every line rebuilds at display rate however slowly the
    // wave is actually moving. A hundredth of the amplitude is a fortieth of
    // a pixel.
    const ampP = rides && wave
      ? Math.round(Math.min(1.35, wave.progressSV.value + wave.surgeSV.value) * 100) / 100
      : 0;
    const waveOn = ampP > 0.01;
    const waveT = waveOn && wave ? wave.tick.value : 0;
    const freqP = waveOn && wave ? Math.round(wave.progressSV.value * 100) / 100 : 0;
    // One number standing for the whole wave state: if it and the slither
    // tick are where they were, the path already holds the answer.
    const waveKey = waveOn ? waveT * 10000 + ampP * 100 + freqP : -1;
    if (spec === seen.spec && t === seen.t && waveKey === seen.wave && height === seen.h) {
      return buffers[seen.i];
    }
    seen.spec = spec;
    seen.t = t;
    seen.wave = waveKey;
    seen.h = height;
    countPathBuildUI();

    const pts = spec.pts;
    const n = spec.count;
    // The other buffer: a new identity, which is the only way the renderer
    // can tell this frame from the last one.
    seen.i = 1 - seen.i;
    const path = buffers[seen.i];
    path.reset();
    for (let i = 0; i < n; i++) {
      const o = i * PT_STRIDE;
      const s = pts[o + 4];
      const off = slithers ? slitherOffsetAt(s, spec.total, spec.level, t) : 0;
      const x = pts[o] + pts[o + 2] * off;
      let y = pts[o + 1] + pts[o + 3] * off;
      if (waveOn) {
        const w = waveWeightAt(s, spec.total, spec.attachStart, spec.attachEnd);
        if (w > 0) {
          y -= w * calmWaveOffset(pts[o], waveT, ampP, freqP, waveNowX, wavePeriodMs);
        }
      }
      xy[i * 2] = x;
      xy[i * 2 + 1] = y;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    return path;
    // `spec` belongs in here — see the note in SummitRopesCanvas: the worklet
    // closes over what this array names, and this body reads the spec's
    // geometry, level and lane throughout.
  }, [specSV, tick, wave, scrollY, stillPath, buffers, seen, slithers, rides, height, xy]);

  useLineProbe(spec, drawn, camera);

  // The travelling dashes, quantized to a quarter pixel like the SVG layer.
  const flowQ = useDerivedValue(() => {
    if (!spec.flows || reducedMotion) return 0;
    const cycles = (clock.value * 1000) / spec.flowMs;
    return Math.round((15 - (cycles % 1) * 15) * 4) / 4;
  }, [clock, spec.flows, spec.flowMs, reducedMotion]);

  /**
   * The flow dashes, drawn as dashes rather than stroked through a dash
   * effect.
   *
   * `DashPathEffect` over one of these lines is ruinous: the theme asks for
   * a one-pixel dot every twelve, the line is a couple of hundred segments
   * long, and CanvasKit re-measures and re-splits the whole thing on every
   * draw. Measured, it was the difference between 60fps and EIGHT — the
   * ablation that found it took idle from 116ms a frame to 16.7ms with
   * nothing else changed.
   *
   * The points are already walked and already spaced evenly in arc length,
   * so each dot is one index lookup and one short segment. Same picture,
   * about sixty segments instead of a re-flattened polyline.
   */
  const dashed = useDerivedValue<SkPathType>(() => {
    // Reading this both orders us after the rebuild and guarantees `xy`
    // holds the frame that is actually on screen.
    const src = drawn.value;
    const phase = flowQ.value;
    // Two buffers here for the same reason as the line itself: the same
    // object handed back twice is a frame the renderer cannot see.
    seen.di = 1 - seen.di;
    const dashPath = dashBuffers[seen.di];
    dashPath.reset();
    if (!spec.flows || spec.count < 2 || src.isEmpty()) return dashPath;
    const on = spec.flowDash[0];
    const period = on + spec.flowDash[1];
    const step = spec.total / (spec.count - 1);
    for (let n = Math.floor(-phase / period); ; n++) {
      const s0 = n * period - phase;
      if (s0 > spec.total) break;
      if (s0 + on < 0) continue;
      const i = Math.max(0, Math.min(spec.count - 2, Math.floor(s0 / step)));
      const f = Math.max(0, Math.min(1, (s0 - i * step) / step));
      const ax = xy[i * 2] + (xy[i * 2 + 2] - xy[i * 2]) * f;
      const ay = xy[i * 2 + 1] + (xy[i * 2 + 3] - xy[i * 2 + 1]) * f;
      const dx = xy[i * 2 + 2] - xy[i * 2];
      const dy = xy[i * 2 + 3] - xy[i * 2 + 1];
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      dashPath.moveTo(ax, ay);
      dashPath.lineTo(ax + (dx / len) * on, ay + (dy / len) * on);
    }
    return dashPath;
  }, [drawn, flowQ, dashBuffers, seen, xy, spec]);

  return (
    <>
      {spec.haloed && (
        <SkPath
          path={drawn}
          style="stroke"
          strokeWidth={spec.width + 9}
          color={spec.colour}
          opacity={0.16 * fade}
          strokeCap="round"
        />
      )}
      <SkPath
        path={drawn}
        style="stroke"
        strokeWidth={spec.width}
        color={spec.colour}
        opacity={spec.opacity * fade}
        strokeCap="round"
      />
      {spec.flows && (
        <SkPath
          path={dashed}
          style="stroke"
          strokeWidth={Math.max(1.5, spec.width - 1)}
          color={spec.colour}
          opacity={0.85 * fade}
          // Butt, not round: these are sixty one-pixel dots per line and a
          // round cap is two extra arcs on each of them. Measured, the cap
          // alone was worth several frames a second at forty-four threads.
          strokeCap="butt"
        />
      )}
    </>
  );
}

/**
 * The line's drawn shape, for the checks — the canvas has no DOM.
 *
 * `draft` and `visual-check` read thread lines out of the SVG tree: how many
 * there are, where they sit, whether a newborn line's draw-in dash cleared.
 * Once Skia draws them there is nothing to query, and a harness that cannot
 * see the scene reports a broken app. Testing builds publish the path's own
 * bounds and its point count, which is what those assertions actually need.
 */
type LineProbe = () => { x: number; y: number; w: number; h: number } | null;

function useLineProbe(
  spec: LineSpec,
  drawn: SharedValue<SkPathType>,
  /** The camera the line is drawn under. Without it the probe reports where
   *  the path was BUILT, which since the world moved onto a transform is not
   *  where it is — a harness reading this would call a correct map broken. */
  camera: Camera,
): void {
  useEffect(() => {
    if (!SHOW_TESTING || typeof window === "undefined") return;
    const w = window as unknown as { __ocLines?: Map<string, LineProbe> };
    const reg = (w.__ocLines ??= new Map<string, LineProbe>());
    reg.set(spec.id, () => {
      const el = typeof document === "undefined" ? null : document.querySelector("canvas");
      const box = el ? el.getBoundingClientRect() : { left: 0, top: 0 };
      const b = drawn.value.getBounds();
      if (!b || b.width <= 0) return null;
      let dx = 0;
      let dy = 0;
      for (const t of camera.value) {
        // The SAME rule the renderer applies — first key wins, the rest is
        // ignored (skia/types/Matrix4.js). A probe that reimplements the
        // camera as it was INTENDED rather than as it is DRAWN reports a
        // healthy scene over a broken one, which is how the dropped scroll
        // translation survived a harness built to catch exactly that.
        const key = Object.keys(t)[0];
        if (key === "translateX") dx += (t as { translateX: number }).translateX;
        else if (key === "translateY") dy += (t as { translateY: number }).translateY;
      }
      return { x: box.left + b.x + dx, y: box.top + b.y + dy, w: b.width, h: b.height };
    });
    return () => {
      reg.delete(spec.id);
    };
  }, [spec, drawn, camera]);
}
