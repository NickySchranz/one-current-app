import { useMemo } from "react";
import { useDerivedValue } from "react-native-reanimated";
import {
  Canvas,
  PaintStyle,
  Picture,
  Path as SkiaPath,
  Skia,
  type SkPicture,
} from "@shopify/react-native-skia";
import { swayOffsetAt } from "@/features/life-timeline/useSquiggle";
import { countPathBuildUI } from "./perf-counters";
import type { Rope } from "./rope-bench-shared";
import { KNOTS_PER_WAVE, LEVEL, WAVELENGTH, layers } from "./rope-bench-shared";

/**
 * This module must not be imported until CanvasKit has resolved.
 *
 * `Skia` is bound when the module is evaluated, so a static import anywhere
 * in the app's graph captures it before the WASM exists and every draw then
 * fails with an opaque "PathBuilder of undefined". The documented shape is a
 * lazy import after LoadSkiaWeb(), and it is the same shape the real app will
 * need when the world moves onto the canvas.
 */
export function SkiaRopes({
  ropes,
  clock,
  width,
  height,
}: {
  ropes: Rope[];
  clock: { value: number };
  width: number;
  height: number;
}) {
  return (
    <Canvas style={{ width, height }}>
      {ropes.map((r) => (
        <SkiaRope key={r.x} rope={r} clock={clock} height={height} />
      ))}
    </Canvas>
  );
}

/** Cubics through the same curve, built once per frame, painted three times. */
function SkiaRope({ rope, clock, height }: { rope: Rope; clock: { value: number }; height: number }) {
  const n = useMemo(() => layers(), []);
  const total = rope.bottom - rope.top;
  const tick = useDerivedValue(() => Math.round(clock.value * 30) / 30, [clock]);
  /**
   * TWO paths per rope, used turn and turn about, and one scratch buffer.
   *
   * Reusing a single path was the intention — a fresh `Skia.Path.Make()` per
   * frame costs about twenty times a `reset()`, which is what made the first
   * run of this benchmark read backwards. But handing the SAME object back
   * every frame is worse than slow: `valueSetter.js:54` refuses an assignment
   * whose value is already there, so nothing downstream was ever told, and
   * this side of the benchmark was not repainting at all. A canvas that is
   * not drawing is cheap, and the number it produces is worthless.
   *
   * Alternating between two costs nothing and says the true thing: this frame
   * is not the last one.
   */
  const buffers = useMemo(() => [Skia.Path.Make(), Skia.Path.Make()], []);
  const scratch = useMemo(() => ({ xs: new Float64Array(64), i: 0 }), []);
  const path = useDerivedValue(() => {
    countPathBuildUI();
    const t = tick.value;
    const from = Math.max(rope.top, -120);
    const to = Math.min(rope.bottom, height + 120);
    const span = to - from;
    const knots = Math.min(
      64,
      Math.max(3, Math.ceil((span / WAVELENGTH) * KNOTS_PER_WAVE) + 1),
    );
    const dy = span / (knots - 1);
    const xs = scratch.xs;
    for (let i = 0; i < knots; i++) {
      const y = from + i * dy;
      xs[i] = rope.x + swayOffsetAt(rope.bottom - y, total, LEVEL, rope.phase, t, 1);
    }
    // Catmull-Rom through the knots, converted to cubics: the curve passes
    // through every sampled point, so the sine is reproduced rather than
    // chorded.
    scratch.i = 1 - scratch.i;
    const p = buffers[scratch.i];
    p.reset();
    p.moveTo(xs[0], from);
    for (let i = 0; i < knots - 1; i++) {
      const x0 = xs[Math.max(0, i - 1)];
      const x1 = xs[i];
      const x2 = xs[i + 1];
      const x3 = xs[Math.min(knots - 1, i + 2)];
      const y1 = from + i * dy;
      const y2 = y1 + dy;
      p.cubicTo(x1 + (x2 - x0) / 6, y1 + dy / 3, x2 - (x3 - x1) / 6, y2 - dy / 3, x2, y2);
    }
    return p;
  }, [tick, buffers, scratch]);
  return (
    <>
      <SkiaPath path={path} style="stroke" strokeWidth={7} color="#8894a0" opacity={0.35} />
      {n > 1 && <SkiaPath path={path} style="stroke" strokeWidth={3} color="#3d4a55" />}
      {n > 2 && (
        <SkiaPath path={path} style="stroke" strokeWidth={1} color="#ffffff" opacity={0.25} />
      )}
    </>
  );
}

/**
 * The same scene, drawn as ONE recorded picture instead of one node per rope.
 *
 * This is the arm that answers the architectural question, and the reason it
 * is a separate mode rather than a refactor of the one above.
 *
 * react-native-skia does not repaint a node. `sksg/Container.web.js` visits
 * the whole canvas at React-render time, flattens it into a single command
 * list, and starts ONE Reanimated mapper over every shared value it found. A
 * notification from any of them replays the ENTIRE list into a fresh picture
 * — and `Recorder/Core.js` allocates two objects per command while doing it.
 * So a tree of `<Path>` nodes is not a scene graph with per-node
 * invalidation; it is a fixed per-frame cost proportional to node count,
 * paid in JavaScript, whatever moved.
 *
 * Recording the ropes ourselves collapses that to one `drawPicture` command.
 * The drawing is identical — same knots, same cubics, same three strokes —
 * and the geometry is built exactly once either way.
 */
export function SkiaRopesPicture({
  ropes,
  clock,
  width,
  height,
}: {
  ropes: Rope[];
  clock: { value: number };
  width: number;
  height: number;
}) {
  const kit = useMemo(() => {
    const stroke = (w: number, colour: string, alpha: number) => {
      const p = Skia.Paint();
      p.setStyle(PaintStyle.Stroke);
      p.setStrokeWidth(w);
      p.setColor(Skia.Color(colour));
      p.setAlphaf(alpha);
      p.setAntiAlias(true);
      return p;
    };
    return {
      // One recorder, reused. `createPicture` builds one per call and never
      // disposes it, which on web is an abandoned WASM object per frame.
      rec: Skia.PictureRecorder(),
      bounds: Skia.XYWHRect(0, 0, width, height),
      path: Skia.Path.Make(),
      xs: new Float64Array(64),
      halo: stroke(7, "#8894a0", 0.35),
      core: stroke(3, "#3d4a55", 1),
      lit: stroke(1, "#ffffff", 0.25),
      n: layers(),
    };
  }, [width, height]);

  /** Guard state in plain memory: a shared value the worklet also writes is
   *  an input of its own mapper, so it would re-trigger itself every frame. */
  const seen = useMemo(() => ({ t: Number.NaN, pic: null as SkPicture | null, stale: null as SkPicture | null }), []);

  const picture = useDerivedValue<SkPicture>(() => {
    const t = Math.round(clock.value * 30) / 30;
    const held = seen.pic;
    if (held !== null && t === seen.t) return held;
    seen.t = t;

    const canvas = kit.rec.beginRecording(kit.bounds);
    const { path, xs } = kit;
    const nLayers = kit.n;
    for (let r = 0; r < ropes.length; r++) {
      const rope = ropes[r];
      const total = rope.bottom - rope.top;
      const from = Math.max(rope.top, -120);
      const to = Math.min(rope.bottom, height + 120);
      const span = to - from;
      const knots = Math.min(64, Math.max(3, Math.ceil((span / WAVELENGTH) * KNOTS_PER_WAVE) + 1));
      const dy = span / (knots - 1);
      for (let i = 0; i < knots; i++) {
        const y = from + i * dy;
        xs[i] = rope.x + swayOffsetAt(rope.bottom - y, total, LEVEL, rope.phase, t, 1);
      }
      countPathBuildUI();
      path.reset();
      path.moveTo(xs[0], from);
      for (let i = 0; i < knots - 1; i++) {
        const x0 = xs[Math.max(0, i - 1)];
        const x1 = xs[i];
        const x2 = xs[i + 1];
        const x3 = xs[Math.min(knots - 1, i + 2)];
        const y1 = from + i * dy;
        const y2 = y1 + dy;
        path.cubicTo(x1 + (x2 - x0) / 6, y1 + dy / 3, x2 - (x3 - x1) / 6, y2 - dy / 3, x2, y2);
      }
      canvas.drawPath(path, kit.halo);
      if (nLayers > 1) canvas.drawPath(path, kit.core);
      if (nLayers > 2) canvas.drawPath(path, kit.lit);
    }
    const next = kit.rec.finishRecordingAsPicture();
    if (seen.stale) seen.stale.dispose();
    seen.stale = seen.pic;
    seen.pic = next;
    return next;
  }, [ropes, clock, height, kit, seen]);

  return (
    <Canvas style={{ width, height }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
