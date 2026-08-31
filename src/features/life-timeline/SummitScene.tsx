/**
 * The summit theme's stage pieces: the vertical route with its ledge and
 * altitude pennant, the coiled rope an answered thread leaves at its anchor,
 * the anchor knot at an open rope's top, and the rope-cut that replaces fire
 * when a worry is cut away. Everything here follows the map's perf rules:
 * shared values only in per-frame paths, quantized derived values, no
 * accessibility roles on SVG groups (the web renderer would swallow them).
 */

import { useEffect, useMemo } from "react";
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Circle, G, Path } from "react-native-svg";
import type { PathProps } from "react-native-svg";
import type { CalmCurrentProps } from "./useSquiggle";
import { samplePath } from "@/visualization/path-sample";
import { AnimatedPath, Fleck } from "./timeline-fx";
import { alpha } from "@/ui/color";
import type { ThemeTokens } from "@/ui/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

/** How far below the ledge the climber starts an unanswered day. */
export const CLIMB_SPAN_MAX = 380;

export function climbSpan(nowScreenY: number, timeLen: number): number {
  return Math.max(0, Math.min(CLIMB_SPAN_MAX, timeLen - nowScreenY - 90));
}

/**
 * The rock face's ledges: one notch per open rope plus base camp, evenly up
 * the climb band. Each answered rope moves the climber one notch higher —
 * these are the exact altitudes his rest point steps through.
 */
export function LedgeSteps({
  routeX,
  nowScreenY,
  timeLen,
  steps,
  tk,
}: {
  routeX: number;
  nowScreenY: number;
  timeLen: number;
  /** Open ropes today — the number of climbs between base camp and the ledge. */
  steps: number;
  tk: ThemeTokens;
}) {
  if (steps <= 0) return null;
  const span = climbSpan(nowScreenY, timeLen);
  if (span <= 0) return null;
  const marks: React.JSX.Element[] = [];
  for (let k = 0; k < steps; k++) {
    // base camp (k=0) up to just below the day's ledge; the ledge itself
    // (k=steps) is the big one drawn by <Ledge/>.
    const y = nowScreenY + (1 - k / steps) * span;
    const side = k % 2 === 0 ? -1 : 1;
    marks.push(
      <Path
        key={k}
        d={`M ${routeX + (side === -1 ? -14 : 2)} ${y} h 12`}
        stroke={tk.inkSoft}
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
        opacity={0.5}
      />,
    );
  }
  return <G pointerEvents="none">{marks}</G>;
}

/**
 * The route up the face: the same six strokes the horizontal main line
 * renders, fed by useSummitCurrent, plus the faded unclimbed continuation
 * above the ledge and an arrowhead pointing at the summit.
 */
export function SummitRoute({
  current,
  routeX,
  nowScreenY,
  timeLen,
  tk,
  calmProgress,
}: {
  current: CalmCurrentProps;
  routeX: number;
  nowScreenY: number;
  timeLen: number;
  tk: ThemeTokens;
  calmProgress: number;
}) {
  const base = `M ${routeX} ${timeLen} L ${routeX} ${nowScreenY}`;
  return (
    <G>
      <AnimatedPath
        animatedProps={current.haloOuter}
        d={base}
        stroke={tk.shimmer}
        strokeWidth={18}
        strokeLinecap="round"
        fill="none"
        opacity={0}
      />
      <AnimatedPath
        animatedProps={current.halo}
        d={base}
        stroke={tk.shimmer}
        strokeWidth={9}
        strokeLinecap="round"
        fill="none"
        opacity={0}
      />
      <AnimatedPath
        animatedProps={current.line}
        d={base}
        stroke={tk.lineMain}
        strokeWidth={3.25}
        fill="none"
      />
      <AnimatedPath
        animatedProps={current.flow}
        d={base}
        stroke={tk.accent}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={tk.mainFlowDash}
        opacity={0.7}
      />
      <AnimatedPath
        animatedProps={current.shimmerWide}
        d={base}
        stroke={alpha(tk.shimmer, 0.45)}
        strokeWidth={11}
        strokeLinecap="round"
        fill="none"
        opacity={0}
      />
      <AnimatedPath
        animatedProps={current.shimmer}
        d={base}
        stroke={tk.shimmer}
        strokeWidth={3.5}
        strokeLinecap="round"
        fill="none"
        opacity={0}
      />
      {/* the mountain keeps going: the unclimbed route above the ledge */}
      {nowScreenY > 4 && (
        <Path
          d={`M ${routeX} ${nowScreenY} L ${routeX} 0`}
          stroke={tk.lineMain}
          strokeWidth={2}
          fill="none"
          strokeDasharray={[2, 6]}
          opacity={0.4}
        />
      )}
      {/* arrowhead: the way is up */}
      <Path
        d={`M ${routeX - 6} ${nowScreenY + 12} L ${routeX} ${nowScreenY} L ${routeX + 6} ${nowScreenY + 12}`}
        stroke={tk.lineMain}
        strokeWidth={3.25 + calmProgress}
        fill="none"
      />
    </G>
  );
}

/** The day's ledge: a small platform with a snow cap at the Now point. */
export function Ledge({
  routeX,
  nowScreenY,
  tk,
}: {
  routeX: number;
  nowScreenY: number;
  tk: ThemeTokens;
}) {
  return (
    <G pointerEvents="none">
      <Path
        d={`M ${routeX - 16} ${nowScreenY} h 32`}
        stroke={tk.lineMain}
        strokeWidth={3.5}
        strokeLinecap="round"
        fill="none"
        opacity={0.85}
      />
      <Path
        d={`M ${routeX - 13} ${nowScreenY - 2} h 26`}
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        opacity={0.75}
      />
    </G>
  );
}

/**
 * The altitude pennant: a little flag that climbs toward the ledge as the
 * day's ropes get their answers, planted at the ledge when everything is
 * answered. Eased on the UI thread; still under reduced motion.
 */
export function ClimbPennant({
  routeX,
  nowScreenY,
  timeLen,
  progress,
  tk,
  reducedMotion,
}: {
  routeX: number;
  nowScreenY: number;
  timeLen: number;
  /** 0..1 — answered open ropes over all open ropes. */
  progress: number;
  tk: ThemeTokens;
  reducedMotion: boolean;
}) {
  const span = climbSpan(nowScreenY, timeLen);
  const p = useSharedValue(progress);
  useEffect(() => {
    cancelAnimation(p);
    if (reducedMotion) {
      p.value = progress;
      return;
    }
    p.value = withTiming(progress, { duration: 700, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(p);
  }, [progress, reducedMotion, p]);
  // Quantized so the DOM hears steps, not every frame of the ease.
  const q = useDerivedValue(() => Math.round(p.value * 100) / 100, []);
  const props = useAnimatedProps(
    () => ({ translateY: nowScreenY + (1 - q.value) * span }),
    [nowScreenY, span, q],
  );
  const x = routeX + 11;
  return (
    <AnimatedG animatedProps={props} pointerEvents="none">
      <Path d={`M ${x} 0 v -13`} stroke={tk.inkSoft} strokeWidth={1.6} strokeLinecap="round" />
      <Path d={`M ${x} -13 l 9 3.2 l -9 3.2 Z`} fill={tk.shimmer} stroke={tk.inkSoft} strokeWidth={0.8} />
    </AnimatedG>
  );
}

/**
 * An answered rope, off the face for the day: a small coil resting at its
 * anchor, still tappable. The date compare brings the rope back tomorrow.
 */
export function CoiledRope({
  x,
  y,
  color,
  bg,
  onPress,
}: {
  x: number;
  y: number;
  color: string;
  bg: string;
  onPress?: () => void;
}) {
  const spiral = useMemo(() => {
    let d = "";
    const turns = 3;
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * turns * 2 * Math.PI;
      const r = 1.5 + 7.5 * t;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r * 0.85;
      d += `${d ? "L" : "M"}${Math.round(px * 10) / 10} ${Math.round(py * 10) / 10}`;
    }
    return d;
  }, [x, y]);
  return (
    <G opacity={0.9}>
      <Circle cx={x} cy={y} r={22} fill="transparent" onPress={onPress} />
      <Path
        d={spiral}
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
        pointerEvents="none"
      />
      {/* the quiet check: this rope has its answer for today */}
      <Path
        d={`M ${x - 3.2} ${y + 0.2} l 2.2 2.3 l 4 -4.8`}
        fill="none"
        stroke={bg}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    </G>
  );
}

/** The knot at an open rope's anchor — the rope's presence at the ledge. */
export function AnchorKnot({
  x,
  y,
  color,
  bg,
  opacity = 1,
  onPress,
}: {
  x: number;
  y: number;
  color: string;
  bg: string;
  opacity?: number;
  onPress?: () => void;
}) {
  return (
    <G opacity={opacity}>
      <Circle cx={x} cy={y} r={6} fill={bg} stroke={color} strokeWidth={2.4} onPress={onPress} />
      <Circle cx={x} cy={y} r={2.2} fill={color} pointerEvents="none" />
      {/* the sling over the anchor point */}
      <Path
        d={`M ${x - 4.2} ${y - 4} Q ${x} ${y - 9} ${x + 4.2} ${y - 4}`}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        pointerEvents="none"
      />
    </G>
  );
}

// ─── The cut ─────────────────────────────────────────────────────────────────

/** Hemp — a cut rope keeps its own material, like fire keeps its embers. */
const ROPE = "#c9b490";
const ROPE_DARK = "#a08a66";
const FRAY = "#f0e3c8";

/**
 * Summit's burn: the rope is cut just under its anchor. A bright fray at the
 * cut, fibers springing loose, then the length below drops with a decaying
 * pendulum sway and fades; the stub recoils up into the anchor. Purely
 * visual — finalizeBurn does the removing; the caller gates reduced motion.
 * Same duration as BurnAway so the burn flow's timers need no change.
 */
export function RopeCut({ path, durationMs = 2800 }: { path: string; durationMs?: number }) {
  const pts = useMemo(() => samplePath(path, 8), [path]);
  const total = pts.length > 0 ? pts[pts.length - 1].s : 0;
  const cutS = Math.max(0, total - 34);

  const progress = useSharedValue(0);
  const fray = useSharedValue(0);
  const sparkT = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    fray.value = 0;
    fray.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) }),
    );
    sparkT.value = 0;
    sparkT.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) });
    progress.value = withDelay(
      300,
      withTiming(1, { duration: durationMs - 300, easing: Easing.in(Easing.quad) }),
    );
    return () => {
      cancelAnimation(progress);
      cancelAnimation(fray);
      cancelAnimation(sparkT);
    };
  }, [durationMs, progress, fray, sparkT]);

  // Quantized fall time: the falling rope is rebuilt in steps, not per frame.
  const q = useDerivedValue(() => Math.round(progress.value * 100) / 100, []);

  // The length below the cut: falls, sways like a released pendulum, fades.
  const fallingProps = useAnimatedProps<PathProps>(() => {
    const t = q.value;
    const fall = t * t * 360;
    let out = "";
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.s > cutS) break;
      const sway = 13 * (1 - t) * Math.sin(t * 9 + p.s * 0.02) * Math.min(1, t * 4);
      out += `${out ? "L" : "M"}${Math.round((p.x + sway) * 10) / 10} ${Math.round((p.y + fall) * 10) / 10}`;
    }
    if (!out) out = `M 0 -9999`;
    return { d: out, opacity: Math.max(0, 0.95 * (1 - t)) };
  }, [pts, cutS, q]);

  // The stub above the cut recoils up into the anchor and fades.
  const stub = useMemo(() => {
    let out = "";
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.s < cutS) continue;
      out += `${out ? "L" : "M"}${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`;
    }
    return out || `M 0 -9999`;
  }, [pts, cutS]);
  const stubProps = useAnimatedProps<PathProps>(() => ({
    translateY: -6 * Math.min(1, q.value * 3),
    opacity: Math.max(0, 0.9 - q.value * 1.4),
  }), [q]);

  // The bright fray at the cut point.
  const cutPoint = useMemo(() => {
    for (let i = pts.length - 1; i >= 0; i--) {
      if (pts[i].s <= cutS) return pts[i];
    }
    return pts[0] ?? { x: 0, y: 0 };
  }, [pts, cutS]);
  const frayProps = useAnimatedProps(() => ({
    r: Math.max(0.1, 3 + fray.value * 14),
    opacity: fray.value * 0.8,
  }), [fray]);

  if (pts.length === 0) return null;
  return (
    <G pointerEvents="none">
      <AnimatedPath
        animatedProps={fallingProps}
        stroke={ROPE}
        strokeWidth={3.4}
        strokeLinecap="round"
        fill="none"
      />
      <AnimatedPath
        animatedProps={stubProps}
        d={stub}
        stroke={ROPE_DARK}
        strokeWidth={3.4}
        strokeLinecap="round"
        fill="none"
      />
      <AnimatedCircle animatedProps={frayProps} cx={cutPoint.x} cy={cutPoint.y} fill={FRAY} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Fleck
          key={i}
          x={cutPoint.x}
          y={cutPoint.y}
          angle={-Math.PI / 2 + (i - 2.5) * 0.5}
          dist={14 + (i % 3) * 5}
          size={1.6}
          color={i % 2 === 0 ? FRAY : ROPE_DARK}
          rise={7}
          delay={i * 0.06}
          t={sparkT}
        />
      ))}
    </G>
  );
}
