import { useMemo } from "react";
import { useDerivedValue } from "react-native-reanimated";
import { Canvas, Path as SkiaPath, Skia } from "@shopify/react-native-skia";
import { swayOffsetAt } from "@/features/life-timeline/useSquiggle";
import { countPathBuildUI } from "./perf-counters";
import type { Rope } from "./rope-bench-shared";
import { KNOTS_PER_WAVE, LEVEL, WAVELENGTH } from "./rope-bench-shared";

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
  const total = rope.bottom - rope.top;
  const tick = useDerivedValue(() => Math.round(clock.value * 30) / 30, [clock]);
  // One Path per rope for its lifetime, rewound and refilled each frame
  // rather than reallocated — Phase 20's rule, and the difference between
  // measuring Skia and measuring the allocator.
  const reusable = useMemo(() => Skia.Path.Make(), []);
  const path = useDerivedValue(() => {
    countPathBuildUI();
    const t = tick.value;
    const from = Math.max(rope.top, -120);
    const to = Math.min(rope.bottom, height + 120);
    const span = to - from;
    const knots = Math.max(3, Math.ceil((span / WAVELENGTH) * KNOTS_PER_WAVE) + 1);
    const dy = span / (knots - 1);
    const xs: number[] = [];
    for (let i = 0; i < knots; i++) {
      const y = from + i * dy;
      xs.push(rope.x + swayOffsetAt(rope.bottom - y, total, LEVEL, rope.phase, t, 1));
    }
    // Catmull-Rom through the knots, converted to cubics: the curve passes
    // through every sampled point, so the sine is reproduced rather than
    // chorded.
    const p = reusable;
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
  }, [tick, reusable]);
  return (
    <>
      <SkiaPath path={path} style="stroke" strokeWidth={7} color="#8894a0" opacity={0.35} />
      <SkiaPath path={path} style="stroke" strokeWidth={3} color="#3d4a55" />
      <SkiaPath path={path} style="stroke" strokeWidth={1} color="#ffffff" opacity={0.25} />
    </>
  );
}
