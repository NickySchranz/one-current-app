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
import { alpha, mix } from "@/ui/color";
import type { ThemeTokens } from "@/ui/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * One ledge per rope still unattended, one fixed step apart. The climber
 * always stands exactly `unattended × LEDGE_STEP` below the summit ledge —
 * far enough that the top starts out of view — and each answer climbs him
 * one step while the camera slides the world down to keep him centered.
 */
export const LEDGE_STEP = 64;

/** Deterministic jitter — stable across re-renders (same as timeline-fx's). */
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** One jagged slope: points from (x0,y0) to (x1,y1) with rocky x-jitter. */
function jaggedEdge(x0: number, y0: number, x1: number, y1: number, salt: number): string {
  const steps = Math.max(3, Math.round(Math.abs(y1 - y0) / 56));
  let d = "";
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t + (seeded(i, salt) - 0.35) * 30;
    const py = y0 + (y1 - y0) * t + (seeded(i, salt + 1) - 0.5) * 14;
    d += ` L ${Math.round(px)} ${Math.round(py)}`;
  }
  d += ` L ${Math.round(x1)} ${Math.round(y1)}`;
  return d;
}

/**
 * The mountain itself: a granite face rising out of the canvas bottom to a
 * snow-capped peak above the ledge, with jagged rocky edges. Lives inside
 * the canvas, so it pans with the world and slides down with the camera.
 */
export function MountainFace({
  routeX,
  peakY,
  width,
  timeLen,
  tk,
}: {
  routeX: number;
  /** The summit's tip — a bit above wherever the ledge currently hangs. */
  peakY: number;
  width: number;
  timeLen: number;
  tk: ThemeTokens;
}) {
  // The camera can look well below the dated canvas early in the day — the
  // face keeps going down so there is always rock under the climber.
  const bottom = timeLen + 900;
  const leftX = -24;
  const rightX = width + 24;
  const body = useMemo(
    () =>
      `M ${leftX} ${bottom}` +
      jaggedEdge(leftX, bottom, routeX, peakY, 31) +
      jaggedEdge(routeX, peakY, rightX, bottom, 33) +
      ` Z`,
    [leftX, bottom, routeX, peakY, rightX],
  );
  // the snow cap: the top stretch of both slopes, closed with a ragged hem
  const cap = useMemo(() => {
    const drop = 88;
    const lx = routeX + (leftX - routeX) * (drop / Math.max(1, bottom - peakY));
    const rx = routeX + (rightX - routeX) * (drop / Math.max(1, bottom - peakY));
    let d = `M ${Math.round(lx)} ${peakY + drop}`;
    d += jaggedEdge(lx, peakY + drop, routeX, peakY, 31);
    d += jaggedEdge(routeX, peakY, rx, peakY + drop, 33);
    // ragged hem back to the start
    const hemSteps = 5;
    for (let i = 1; i <= hemSteps; i++) {
      const t = i / hemSteps;
      const px = rx + (lx - rx) * t;
      const py = peakY + drop + (seeded(i, 35) - 0.2) * 26;
      d += ` L ${Math.round(px)} ${Math.round(py)}`;
    }
    return d + " Z";
  }, [leftX, rightX, routeX, peakY, bottom]);
  const rock = mix(tk.inkFaint, tk.bg, 48);
  return (
    <G pointerEvents="none">
      <Path d={body} fill={rock} opacity={0.42} />
      <Path d={body} fill="none" stroke={tk.inkFaint} strokeWidth={2.5} opacity={0.55} />
      <Path d={cap} fill="#ffffff" opacity={0.65} />
    </G>
  );
}

/**
 * The rock face's ledges: one notch per unattended rope, a fixed step apart
 * below the summit ledge. The climber stands on the lowest; each answer
 * removes one and he climbs to the next.
 */
export function LedgeSteps({
  routeX,
  nowScreenY,
  steps,
  tk,
}: {
  routeX: number;
  nowScreenY: number;
  /** Ropes still unattended — the climbs left between him and the summit. */
  steps: number;
  tk: ThemeTokens;
}) {
  if (steps <= 0) return null;
  const marks: React.JSX.Element[] = [];
  for (let k = 1; k <= steps; k++) {
    const y = nowScreenY + k * LEDGE_STEP;
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
  peakY = 0,
}: {
  current: CalmCurrentProps;
  routeX: number;
  nowScreenY: number;
  timeLen: number;
  tk: ThemeTokens;
  calmProgress: number;
  /** Where the mountain peaks — the unclimbed route dashes end there. */
  peakY?: number;
}) {
  const base = `M ${routeX} ${timeLen} L ${routeX} ${nowScreenY}`;
  return (
    <G>
      {/* the route fades on below the dated canvas — the camera may look there */}
      <Path
        d={`M ${routeX} ${timeLen} L ${routeX} ${timeLen + 900}`}
        stroke={tk.lineMain}
        strokeWidth={3.25}
        fill="none"
        opacity={0.35}
      />
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
      {/* the mountain keeps going: the unclimbed route up to the peak */}
      {nowScreenY - peakY > 4 && (
        <Path
          d={`M ${routeX} ${nowScreenY} L ${routeX} ${peakY}`}
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
 * The altitude pennant: a little flag planted at the climber's current
 * ledge, gliding up one step with each answer. Eased on the UI thread;
 * still under reduced motion.
 */
export function ClimbPennant({
  routeX,
  targetY,
  tk,
  reducedMotion,
}: {
  routeX: number;
  /** The climber's current ledge altitude (world y). */
  targetY: number;
  tk: ThemeTokens;
  reducedMotion: boolean;
}) {
  const p = useSharedValue(targetY);
  useEffect(() => {
    cancelAnimation(p);
    if (reducedMotion) {
      p.value = targetY;
      return;
    }
    p.value = withTiming(targetY, { duration: 700, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(p);
  }, [targetY, reducedMotion, p]);
  // Quantized so the DOM hears steps, not every frame of the ease.
  const q = useDerivedValue(() => Math.round(p.value * 2) / 2, []);
  const props = useAnimatedProps(() => ({ translateY: q.value }), [q]);
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
      {/* branchColor is hsl() — shade with translucent black, not mix() */}
      <Path
        d={spiral}
        stroke="#141b22"
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
        opacity={0.45}
        pointerEvents="none"
      />
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
