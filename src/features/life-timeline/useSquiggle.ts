import { useEffect, useMemo } from "react";
import {
  cancelAnimation,
  interpolateColor,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
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

// The sway (summit's ropes): not a travelling wave but a hanging rope's slow
// pendulum. The path runs fork (bottom, s=0) → anchor (top, s=total); the
// displacement is zero at the anchor, grows toward the low end, and is
// clamped back to zero just above the fork so both ends stay seated on the
// map. Loudness scales amplitude and pace — a quiet rope (1) hangs still.
const SWAY_AMP = [0, 0, 5, 8, 11, 14]; // px at the freest point
const SWAY_HZ = [0, 0, 0.28, 0.4, 0.55, 0.75]; // pendulum cycles per second
const KROPE = (2 * Math.PI) / 900; // slight phase lag down the rope's length
const FORK_CLAMP = 26; // px above the fork that re-seat on the route

export type StrokeMode = "slither" | "sway";

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
  /** Summit's rope texture: the dark round under-stroke (`d` only). */
  underlay: Partial<PathProps>;
  /** Summit's rope texture: the dashed twist ridges (`d` only). */
  bands: Partial<PathProps>;
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
  /** The main line's wave: the branch's attached ends ride it in rhythm. */
  wave?: WaveHandles | null;
  waveNowX?: number;
  wavePeriodMs?: number;
  /** The path starts on the main line (visible fork point). */
  attachStart?: boolean;
  /** The path ends on the main line (integrated — merge curve). */
  attachEnd?: boolean;
  /** "slither" is the travelling wave; "sway" is summit's hanging rope. */
  mode?: StrokeMode;
  /** Per-rope phase offset so a face of ropes never sways in sync. */
  swayPhase?: number;
}): BranchStrokeProps {
  const {
    trembling,
    level,
    basePath,
    born,
    flowing,
    flowDurationMs,
    reducedMotion,
    wave = null,
    waveNowX = 0,
    wavePeriodMs = 1,
    attachStart = false,
    attachEnd = false,
    mode = "slither",
    swayPhase = 0,
  } = opts;

  const riding = wave != null && !reducedMotion && (attachStart || attachEnd);
  const pts = useMemo<SamplePoint[]>(
    () => (trembling || riding ? samplePath(basePath) : []),
    [trembling, riding, basePath],
  );
  const total = pts.length > 0 ? pts[pts.length - 1].s : 0;

  // For riding-without-trembling, only the attached ends ever move: freeze
  // the middle of the path as a prebuilt string and rebuild just the ends.
  const rideSplit = useMemo(() => {
    if (pts.length === 0 || !riding) return null;
    const startCut = attachStart ? WAVE_BLEND : -1;
    const endCut = attachEnd ? total - WAVE_BLEND : Infinity;
    const startIdx: number[] = [];
    const endIdx: number[] = [];
    let mid = "";
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.s <= startCut) startIdx.push(i);
      else if (p.s >= endCut) endIdx.push(i);
      else mid += `L${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`;
    }
    return { startIdx, endIdx, mid };
  }, [pts, riding, attachStart, attachEnd, total]);

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
  // Two motions can compose: the loudness slither along the whole line, and
  // the main wave carrying the attached end(s) in the timeline's rhythm.
  // The slither advances at 30Hz too — dependents only fire on change.
  const tick = useDerivedValue(() => Math.round(clock.value * 30) / 30, []);
  const d = useDerivedValue(() => {
    if (pts.length === 0) return basePath;
    const ampP = wave ? Math.min(1.35, wave.progressSV.value + wave.surgeSV.value) : 0;
    const waveOn = riding && ampP > 0.01;
    if (!trembling && !waveOn) return basePath;
    const freqP = wave ? wave.progressSV.value : 0;
    const waveT = wave ? wave.tick.value : 0;
    const t = tick.value;
    if (mode === "sway") {
      // Summit never rides the calm wave (wave is null there), so this is
      // always the full rebuild — same cost class as a loud slither. No
      // frozen middle is possible: every point below the anchor moves.
      const swayAmp = trembling ? lerpTable(SWAY_AMP, level) : 0;
      const swayOmega = 2 * Math.PI * lerpTable(SWAY_HZ, level);
      let out = "";
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const a = total - p.s; // arc distance below the top anchor
        const pend = a / Math.max(total, 1);
        const seat = attachStart ? Math.min(1, p.s / FORK_CLAMP) : 1;
        const off =
          swayAmp * pend * seat * Math.sin(swayOmega * t - KROPE * a + swayPhase);
        const x = p.x + p.nx * off;
        const y = p.y + p.ny * off;
        out += `${out ? "L" : "M"}${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
      }
      return out;
    }
    const amp = trembling ? lerpTable(AMP, level) : 0;
    const k = (2 * Math.PI) / lerpTable(LAMBDA, level);
    const omega = 2 * Math.PI * lerpTable(SPEED, level);
    if (!trembling && waveOn && rideSplit) {
      // Fast path: bend only the attached ends around the frozen middle.
      let out = "";
      for (let j = 0; j < rideSplit.startIdx.length; j++) {
        const p = pts[rideSplit.startIdx[j]];
        const w = Math.max(0, 1 - p.s / WAVE_BLEND);
        const y = p.y - w * calmWaveOffset(p.x, waveT, ampP, freqP, waveNowX, wavePeriodMs);
        out += `${out ? "L" : "M"}${Math.round(p.x * 10) / 10} ${Math.round(y * 10) / 10}`;
      }
      out += out ? rideSplit.mid : "M" + rideSplit.mid.slice(1);
      for (let j = 0; j < rideSplit.endIdx.length; j++) {
        const p = pts[rideSplit.endIdx[j]];
        const w = Math.max(0, 1 - (total - p.s) / WAVE_BLEND);
        const y = p.y - w * calmWaveOffset(p.x, waveT, ampP, freqP, waveNowX, wavePeriodMs);
        out += `L${Math.round(p.x * 10) / 10} ${Math.round(y * 10) / 10}`;
      }
      return out;
    }
    let out = "";
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const taper = Math.min(1, p.s / TAPER, (total - p.s) / TAPER);
      const off = amp * taper * Math.sin(k * p.s - omega * t);
      let x = p.x + p.nx * off;
      let y = p.y + p.ny * off;
      if (waveOn) {
        const wS = attachStart ? Math.max(0, 1 - p.s / WAVE_BLEND) : 0;
        const wE = attachEnd ? Math.max(0, 1 - (total - p.s) / WAVE_BLEND) : 0;
        const w = Math.max(wS, wE);
        if (w > 0) {
          y -= w * calmWaveOffset(p.x, waveT, ampP, freqP, waveNowX, wavePeriodMs);
        }
      }
      out += `${out ? "L" : "M"}${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
    }
    return out;
  }, [trembling, riding, pts, level, basePath, total, attachStart, attachEnd, waveNowX, wavePeriodMs, wave, tick, rideSplit, mode, swayPhase]);

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
  // Summit's rope layers ride the same derived `d` — one string per frame,
  // three strokes. Each component needs its own animatedProps instance.
  const underlay = useAnimatedProps<PathProps>(() => ({ d: d.value }), [d]);
  const bands = useAnimatedProps<PathProps>(() => ({ d: d.value }), [d]);

  // Sub-pixel dash motion doesn't need per-frame writes: quantize to 0.25px
  // steps via a derived value, so the DOM only updates when a step lands.
  const flowQ = useDerivedValue(() => Math.round(flowOffset.value * 4) / 4, []);
  const flow = useAnimatedProps<PathProps>(
    () => ({ d: d.value, strokeDashoffset: flowQ.value }),
    [d, flowQ],
  );

  return { line, halo, flow, underlay, bands };
}

// ─── The calm current ─────────────────────────────────────────────────────────
// When every open thread has its answer for the day, the MAIN line breathes:
// the same travelling sine as the threads, but low, slow and long. Both ends
// taper to zero so the arrowhead, the Now dot and every fork stay seated.
const CALM_AMP = 5.0; // px half-width at full progress — a prominent, unmissable swell
const CALM_LAMBDA_SOFT = 220; // px per cycle at the first answer of the day
const CALM_LAMBDA = 170; // px per cycle once everything is answered — the calm frequency
const CALM_TAPER = 48; // px of fade at each end
const MAIN_STROKE = 3.25; // the line's resting width; it gains up to +1px with progress
/** px of a branch's arc, from its fork or merge point, that rides the wave. */
const WAVE_BLEND = 46;

/**
 * The main line's wave as a function — one formula shared by the line
 * itself, the fork/merge dots, and the ends of every branch line, so they
 * all move in the same rhythm. Returns how far ABOVE the resting y the
 * line sits at x (callers subtract it from y).
 */
export function calmWaveOffset(
  x: number,
  t: number,
  ampP: number,
  freqP: number,
  nowX: number,
  periodMs: number,
): number {
  "worklet";
  if (ampP <= 0.01 || nowX <= 0) return 0;
  const taper = Math.min(1, x / CALM_TAPER, (nowX - x) / CALM_TAPER);
  if (taper <= 0) return 0;
  const lambda = CALM_LAMBDA_SOFT - (CALM_LAMBDA_SOFT - CALM_LAMBDA) * Math.min(1, freqP);
  const k = (2 * Math.PI) / lambda;
  const omega = (2 * Math.PI * 1000) / periodMs;
  return CALM_AMP * ampP * taper * Math.sin(k * x - omega * t);
}

/** The live handles every wave rider shares: one 30Hz tick, one strength.
 * The tick is quantized time — derived values only propagate on change, so
 * every consumer keyed to it runs at most 30×/s, invisible on a slow wave. */
export type WaveHandles = {
  tick: SharedValue<number>;
  progressSV: SharedValue<number>;
  surgeSV: SharedValue<number>;
};

export type CalmCurrentProps = {
  /** The sacred under-glow: breathing `d` + opacity that arrives at completion. */
  halo: Partial<PathProps>;
  /** A wider, fainter second glow layer — the light bleeding outward. */
  haloOuter: Partial<PathProps>;
  /** For the solid main line: the breathing `d` + a width that grows with progress. */
  line: Partial<PathProps>;
  /** For the accent current dashes: breathing `d` + travelling dashoffset. */
  flow: Partial<PathProps>;
  /** The per-answer flourish: a bright streak sweeping the whole line into Now. */
  shimmer: Partial<PathProps>;
  /** The same streak for the wide soft-glow pass (own props instance). */
  shimmerWide: Partial<PathProps>;
  /** Shared handles so branch lines and dots ride the same wave. */
  wave: WaveHandles;
};

/**
 * The main line gathering strength. `progress` is the fraction of open
 * threads answered today (1 = the calm, sacred state): the wave's amplitude
 * and the stroke's width grow with it, the wavelength tightens toward the
 * calm frequency, and each increment (`pulseKey`) sends a shimmer streak
 * sweeping down the line. The dash offset ramp lives in here too (not
 * useDashFlow), because dashes on a moving path need `d` and the offset in
 * one animatedProps set.
 */
export function useCalmCurrent(opts: {
  /** 0..1 — answered open threads over all open threads. */
  progress: number;
  /** Increment on each new answer to fire the shimmer sweep. */
  pulseKey: number;
  mainY: number;
  nowX: number;
  /** ms per wave cycle — pace it from the theme's mainFlowDuration. */
  periodMs: number;
  /** ms per dash-flow cycle (the theme's mainFlowDuration itself). */
  dashDurationMs: number;
  reducedMotion: boolean;
  /** Optional shared world clock (seconds); the hook runs its own if absent. */
  worldClock?: SharedValue<number> | null;
  /** The theme's accent (the everyday current) and shimmer (the sacred one). */
  accentColor: string;
  shimmerColor: string;
  /** The solid line's everyday ink, and the gilded ink it earns at completion. */
  lineColor: string;
  sacredLineColor: string;
}): CalmCurrentProps {
  const {
    progress,
    pulseKey,
    mainY,
    nowX,
    periodMs,
    dashDurationMs,
    reducedMotion,
    worldClock = null,
    accentColor,
    shimmerColor,
    lineColor,
    sacredLineColor,
  } = opts;
  const complete = progress >= 0.999;
  const breathing = progress > 0.001 && !reducedMotion && nowX > 0;

  // A straight horizontal line needs no samplePath: x every 8px, normal (0,-1).
  const xs = useMemo(() => {
    const out: number[] = [];
    for (let x = 0; x <= nowX; x += 8) out.push(x);
    if (out.length === 0 || out[out.length - 1] !== nowX) out.push(nowX);
    return out;
  }, [nowX]);

  const clock = useSharedValue(0);
  useEffect(() => {
    if (!breathing) {
      cancelAnimation(clock);
      clock.value = 0;
      return;
    }
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(3600, { duration: 3600_000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, [breathing, clock]);

  // Each answer eases the line toward its full strength — never a snap.
  // Completing the day earns an exhale: the wave swells past full for a
  // breath, then settles into its calm.
  const progressSV = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      progressSV.value = withTiming(0, { duration: 300 });
      return () => cancelAnimation(progressSV);
    }
    progressSV.value = complete
      ? withSequence(
          withTiming(1.22, { duration: 900, easing: Easing.out(Easing.cubic) }),
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        )
      : withTiming(progress, { duration: 1400, easing: Easing.inOut(Easing.ease) });
    return () => cancelAnimation(progressSV);
  }, [progress, complete, reducedMotion, progressSV]);

  // The sacred glow belongs to completion only.
  const haloScale = useSharedValue(0);
  useEffect(() => {
    haloScale.value = withTiming(complete && !reducedMotion ? 1 : 0, {
      duration: 1600,
      easing: Easing.inOut(Easing.ease),
    });
    return () => cancelAnimation(haloScale);
  }, [complete, reducedMotion, haloScale]);

  // Each answer SURGES through the line: a quick swell of amplitude and
  // width on top of wherever progress stands — felt, not just seen.
  const surgeSV = useSharedValue(0);

  // Quantized time: the whole wave system advances at 30Hz, not display rate.
  const waveTick = useDerivedValue(() => Math.round(clock.value * 30) / 30, []);

  const d = useDerivedValue(() => {
    const ampP = Math.min(1.35, progressSV.value + surgeSV.value);
    if (ampP <= 0.01 || xs.length < 2) return `M 0 ${mainY} L ${nowX} ${mainY}`;
    const freqP = progressSV.value;
    const t = waveTick.value;
    let out = "";
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      const off = calmWaveOffset(x, t, ampP, freqP, nowX, periodMs);
      out += `${out ? "L" : "M"}${x} ${Math.round((mainY - off) * 10) / 10}`;
    }
    return out;
  }, [xs, mainY, nowX, periodMs, waveTick]);

  // The flourish: on each new answer a bright streak sweeps the line into
  // Now. Offset 60 parks the dash just before the path; -(nowX+80) is past
  // its end — the streak crosses everything in between.
  const sweepOffset = useSharedValue(110);
  const sweepOpacity = useSharedValue(0);
  // A line-wide flash of gold under every answer — brief, bright, unmissable.
  const flashSV = useSharedValue(0);
  useEffect(() => {
    if (pulseKey === 0 || reducedMotion || nowX <= 0) return;
    cancelAnimation(sweepOffset);
    cancelAnimation(sweepOpacity);
    // The surge: the wave and stroke swell for a beat on top of progress.
    if (!complete) {
      cancelAnimation(surgeSV);
      surgeSV.value = withSequence(
        withTiming(0.35, { duration: 260, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      );
    }
    cancelAnimation(flashSV);
    flashSV.value = withSequence(
      withTiming(complete ? 0.8 : 0.55, { duration: 180, easing: Easing.out(Easing.ease) }),
      withTiming(0, { duration: complete ? 1100 : 750, easing: Easing.inOut(Easing.ease) }),
    );
    sweepOffset.value = 110;
    if (complete) {
      // Completing the day: a full-strength sweep, then a softer echo.
      sweepOffset.value = withSequence(
        withTiming(-(nowX + 130), { duration: 950, easing: Easing.out(Easing.cubic) }),
        withTiming(110, { duration: 1 }),
        withTiming(-(nowX + 130), { duration: 1350, easing: Easing.out(Easing.ease) }),
      );
      sweepOpacity.value = 0;
      sweepOpacity.value = withSequence(
        withTiming(1, { duration: 110, easing: Easing.linear }),
        withTiming(1, { duration: 480, easing: Easing.linear }),
        withTiming(0, { duration: 340, easing: Easing.out(Easing.ease) }),
        withTiming(0.55, { duration: 160, easing: Easing.linear }),
        withTiming(0.55, { duration: 700, easing: Easing.linear }),
        withTiming(0, { duration: 450, easing: Easing.out(Easing.ease) }),
      );
    } else {
      sweepOffset.value = withTiming(-(nowX + 130), {
        duration: 1050,
        easing: Easing.out(Easing.cubic),
      });
      sweepOpacity.value = 0;
      // Quick rise, brief hold while the streak travels, then a soft fade.
      sweepOpacity.value = withSequence(
        withTiming(1, { duration: 120, easing: Easing.linear }),
        withTiming(1, { duration: 550, easing: Easing.linear }),
        withTiming(0, { duration: 380, easing: Easing.out(Easing.ease) }),
      );
    }
    return () => {
      cancelAnimation(sweepOffset);
      cancelAnimation(sweepOpacity);
      cancelAnimation(surgeSV);
      cancelAnimation(flashSV);
    };
  }, [pulseKey, complete, reducedMotion, nowX, sweepOffset, sweepOpacity, surgeSV, flashSV]);

  // While the line is sacred it glints now and then — a faint sweep every
  // little while, so the state keeps feeling alive without shouting.
  useEffect(() => {
    if (!complete || reducedMotion || nowX <= 0) return;
    const glint = () => {
      sweepOffset.value = 110;
      sweepOffset.value = withTiming(-(nowX + 130), {
        duration: 1600,
        easing: Easing.inOut(Easing.ease),
      });
      sweepOpacity.value = 0;
      sweepOpacity.value = withSequence(
        withTiming(0.5, { duration: 250, easing: Easing.linear }),
        withTiming(0.5, { duration: 850, easing: Easing.linear }),
        withTiming(0, { duration: 500, easing: Easing.out(Easing.ease) }),
      );
    };
    // First glint waits out the completion celebration.
    const id = setInterval(glint, 6500);
    return () => clearInterval(id);
  }, [complete, reducedMotion, nowX, sweepOffset, sweepOpacity]);

  // The slow current toward Now: the same 15 → 0 ramp useDashFlow runs.
  const flowOffset = useSharedValue(15);
  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(flowOffset);
      flowOffset.value = 15;
      return;
    }
    flowOffset.value = 15;
    flowOffset.value = withRepeat(
      withTiming(0, { duration: dashDurationMs, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(flowOffset);
  }, [reducedMotion, dashDurationMs, flowOffset]);

  // The sacred glow breathes with the wave — never a flat sticker of light —
  // and every answer flashes gold along the whole line for a beat.
  const halo = useAnimatedProps<PathProps>(() => {
    const breathe = 0.34 + 0.12 * Math.sin(((2 * Math.PI * 1000) / (periodMs * 1.4)) * waveTick.value);
    return { d: d.value, opacity: Math.max(haloScale.value * breathe, flashSV.value) };
  }, [d, periodMs]);
  const haloOuter = useAnimatedProps<PathProps>(() => {
    const breathe = 0.16 + 0.06 * Math.sin(((2 * Math.PI * 1000) / (periodMs * 1.4)) * waveTick.value + 1.2);
    return { d: d.value, opacity: Math.max(haloScale.value * breathe, flashSV.value * 0.45) };
  }, [d, periodMs]);
  // The solid line itself turns gilded at completion, and swells with each surge.
  const line = useAnimatedProps<PathProps>(
    () => ({
      d: d.value,
      strokeWidth: MAIN_STROKE + Math.min(progressSV.value + surgeSV.value, 1.5),
      stroke: interpolateColor(haloScale.value, [0, 1], [lineColor, sacredLineColor]),
    }),
    [d, lineColor, sacredLineColor],
  );
  // At completion the everyday current itself turns golden. Dash motion is
  // quantized to 0.25px steps so the DOM only hears about real movement.
  const flowQ = useDerivedValue(() => Math.round(flowOffset.value * 4) / 4, []);
  const flow = useAnimatedProps<PathProps>(
    () => ({
      d: d.value,
      strokeDashoffset: flowQ.value,
      stroke: interpolateColor(haloScale.value, [0, 1], [accentColor, shimmerColor]),
    }),
    [d, flowQ, accentColor, shimmerColor],
  );
  const shimmer = useAnimatedProps<PathProps>(
    () => ({
      d: d.value,
      strokeDasharray: [110, 1e6],
      strokeDashoffset: sweepOffset.value,
      opacity: sweepOpacity.value,
    }),
    [d],
  );
  // Same streak, its own props instance — one animatedProps per component.
  const shimmerWide = useAnimatedProps<PathProps>(
    () => ({
      d: d.value,
      strokeDasharray: [110, 1e6],
      strokeDashoffset: sweepOffset.value,
      opacity: sweepOpacity.value,
    }),
    [d],
  );
  const wave = useMemo<WaveHandles>(
    () => ({ tick: waveTick, progressSV, surgeSV }),
    [waveTick, progressSV, surgeSV],
  );

  return { halo, haloOuter, line, flow, shimmer, shimmerWide, wave };
}
