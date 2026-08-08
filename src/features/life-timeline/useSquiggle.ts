import { useEffect, useMemo } from "react";
import {
  cancelAnimation,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { PathProps } from "react-native-svg";
import { pathLength, samplePath, type SamplePoint } from "@/visualization/path-sample";

// Loudness made visible: a sine wave travels along the line from the fork
// toward Now, so the stroke slithers like a snake while both ends stay
// anchored. Louder = wider, faster, tighter wavelength. The scale is the
// thread's loudness (1–5): a quiet thread (1) lies perfectly still.
const AMP = [0, 0, 1.8, 2.6, 3.4, 4.2]; // px, half-width of the wave
const SPEED = [0, 0, 0.8, 1.3, 2.1, 3.2]; // wave cycles per second
const LAMBDA = [56, 56, 56, 48, 40, 34]; // px of line per wave cycle
const TAPER = 18; // px over which the wave fades to zero at both ends

/** Linear blend between neighbouring table entries for fractional levels. */
function lerpTable(table: number[], level: number): number {
  "worklet";
  const clamped = Math.max(0, Math.min(table.length - 1, level));
  const lo = Math.floor(clamped);
  const hi = Math.min(table.length - 1, lo + 1);
  return table[lo] + (table[hi] - table[lo]) * (clamped - lo);
}

export type BranchStrokeProps = {
  /** For the visible line: squiggle `d` + the newborn draw-in dash. */
  line: Partial<PathProps>;
  /** For the halo behind a highlighted line: squiggle `d` only. */
  halo: Partial<PathProps>;
  /** For the directional flow dashes: squiggle `d` + travelling dashoffset. */
  flow: Partial<PathProps>;
};

/**
 * All stroke animation for one branch, rebuilt on Reanimated: the true
 * geometry is sampled once in JS (pure math, no DOM) and each frame a
 * worklet rewrites the path's `d` with a travelling sine offset — on the
 * UI thread, no React re-renders. The same derived `d` feeds the line,
 * halo and flow strokes so the string is built once per frame.
 */
export function useBranchStrokes(opts: {
  /** The slither: only while the line is loud, open, unresting and in view. */
  trembling: boolean;
  level: number;
  basePath: string;
  /** Just created: the line draws itself from the fork toward Now (1.1s ease-out). */
  born: boolean;
  /** Directional dashes toward the present (`.branch-flow`). */
  flowing: boolean;
  /** CSS `--flow-duration` in ms; emphasized lines use 1400. */
  flowDurationMs: number;
  reducedMotion: boolean;
}): BranchStrokeProps {
  const { trembling, level, basePath, born, flowing, flowDurationMs, reducedMotion } = opts;

  const pts = useMemo<SamplePoint[]>(
    () => (trembling ? samplePath(basePath) : []),
    [trembling, basePath],
  );
  const total = pts.length > 0 ? pts[pts.length - 1].s : 0;

  // Time in seconds, ticking on the UI thread while the slither is active.
  const clock = useSharedValue(0);
  useEffect(() => {
    if (!trembling || pts.length === 0) {
      cancelAnimation(clock);
      clock.value = 0;
      return;
    }
    clock.value = 0;
    // One long linear ramp, repeated: the sine only cares about elapsed time.
    clock.value = withRepeat(
      withTiming(3600, { duration: 3600_000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, [trembling, pts, clock]);

  // The squiggled path, built once per frame and shared by all three strokes.
  const d = useDerivedValue(() => {
    if (!trembling || pts.length === 0) return basePath;
    const amp = lerpTable(AMP, level);
    const k = (2 * Math.PI) / lerpTable(LAMBDA, level);
    const omega = 2 * Math.PI * lerpTable(SPEED, level);
    const t = clock.value;
    let out = "";
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const taper = Math.min(1, p.s / TAPER, (total - p.s) / TAPER);
      const off = amp * taper * Math.sin(k * p.s - omega * t);
      out += `${out ? "L" : "M"}${(p.x + p.nx * off).toFixed(2)} ${(p.y + p.ny * off).toFixed(2)}`;
    }
    return out;
  }, [trembling, pts, level, basePath, total]);

  // Newborn draw-in: dash the full length, sweep the offset to zero.
  const drawing = born && !reducedMotion;
  const bornLen = useMemo(() => (drawing ? pathLength(basePath) : 0), [drawing, basePath]);
  const bornOffset = useSharedValue(0);
  useEffect(() => {
    if (!drawing || bornLen <= 0) return;
    bornOffset.value = bornLen;
    bornOffset.value = withTiming(0, { duration: 1100, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(bornOffset);
  }, [drawing, bornLen, bornOffset]);

  // Directional flow, replicating `@keyframes flow { from: 15; to: 0 }`.
  const flowActive = flowing && !reducedMotion;
  const flowOffset = useSharedValue(15);
  useEffect(() => {
    if (!flowActive) {
      cancelAnimation(flowOffset);
      flowOffset.value = 15;
      return;
    }
    flowOffset.value = 15;
    flowOffset.value = withRepeat(
      withTiming(0, { duration: flowDurationMs, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(flowOffset);
  }, [flowActive, flowDurationMs, flowOffset]);

  const line = useAnimatedProps<PathProps>(() => {
    if (drawing && bornLen > 0) {
      return {
        d: d.value,
        strokeDasharray: [bornLen, bornLen],
        strokeDashoffset: bornOffset.value,
      };
    }
    // Animated props only apply the keys they return, so the draw-in dash
    // must be reset explicitly — otherwise it lingers and the line renders
    // dashed once squiggling or panning makes the path longer than bornLen.
    // A dash far longer than any on-screen path is simply a solid stroke.
    return { d: d.value, strokeDasharray: [1e6, 1e6], strokeDashoffset: 0 };
  }, [drawing, bornLen, d]);

  const halo = useAnimatedProps<PathProps>(() => ({ d: d.value }), [d]);

  const flow = useAnimatedProps<PathProps>(
    () => ({ d: d.value, strokeDashoffset: flowOffset.value }),
    [d],
  );

  return { line, halo, flow };
}
