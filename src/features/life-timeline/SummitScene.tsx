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
  type SharedValue,
} from "react-native-reanimated";
import { Circle, G, Path } from "react-native-svg";
import type { PathProps } from "react-native-svg";
import type { CalmCurrentProps } from "./useSquiggle";
import { samplePath } from "@/visualization/path-sample";
import { AnimatedPath, Fleck } from "./timeline-fx";
import { alpha, mix } from "@/ui/color";
import type { ThemeTokens } from "@/ui/theme";
import { mountainHalfWidth } from "@/visualization/vertical/transpose";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);



/** Deterministic jitter — stable across re-renders (same as timeline-fx's). */
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * One flank of the massif, top to bottom: the mountainHalfWidth profile
 * (shared with the rope-anchor placement, so every cliff ledge lands on
 * rock) sampled every ~60px with rocky jitter — diagonal and irregular,
 * never square.
 */
function flank(
  routeX: number,
  /** The summit tip — the profile's origin, wherever the band starts. */
  peakY: number,
  fromY: number,
  toY: number,
  width: number,
  side: 1 | -1,
  salt: number,
  scale: number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  // Sampled on an ABSOLUTE altitude grid (not `span / steps`): when the drawn
  // band changes, the vertices must land on the same altitudes as before or
  // the whole silhouette re-shapes itself in one frame.
  const GRID = 46;
  const first = Math.ceil(fromY / GRID) * GRID;
  for (let y = first; y < toY; y += GRID) {
    const hw = mountainHalfWidth(y - peakY, width, scale);
    // seeded by ALTITUDE, so the same rock keeps the same edge for ever
    const k = Math.round(y / GRID);
    const jx = (seeded(k, salt) - 0.5) * Math.min(14, hw * 0.12);
    const jy = (seeded(k, salt + 1) - 0.5) * 16;
    pts.push({
      x: Math.round(routeX + side * (hw + jx)),
      y: Math.round(y + jy),
    });
  }
  // the band always closes exactly on its lower edge
  pts.push({
    x: Math.round(routeX + side * mountainHalfWidth(toY - peakY, width, scale)),
    y: Math.round(toY),
  });
  return pts;
}

/**
 * The mountain itself: a granite face rising out of the canvas bottom to a
 * snow-capped peak above the ledge, with jagged rocky edges. Lives inside
 * the canvas, so it pans with the world and slides down with the camera.
 */
/**
 * The rock itself, in texture: strata seams and grit scattered over the whole
 * climbable height, inside the silhouette. This is what makes the ascent
 * VISIBLE — the camera slides the world down as he gains height, and without
 * marks on the rock there is nothing to see moving. Two batched paths, built
 * once per mountain.
 */
export function FaceTexture({
  routeX,
  peakY,
  bottomY,
  bandTop,
  bandBottom,
  width,
  timeLen,
  tk,
}: {
  routeX: number;
  peakY: number;
  bottomY: number;
  /** Only the band the camera can reach is drawn — the whole face is
   * thousands of px tall and repaints on every camera frame. Marks are
   * seeded by altitude, so the band can shift without them dancing. */
  bandTop?: number;
  bandBottom?: number;
  width: number;
  /** The stage height — the profile's yardstick (see mountainHalfWidth). */
  timeLen: number;
  tk: ThemeTokens;
}) {
  const step = 46;
  // Marks start just under the snow cap, so the rock is textured all the way
  // to the summit — this texture is the only thing that shows the climb
  // moving, and it used to be blanked out over the whole top of the mountain.
  const first = peakY + Math.round(0.2 * timeLen);
  const lo = Math.max(first, bandTop ?? first);
  const start = first + Math.floor((lo - first) / step) * step;
  const end = Math.min(bottomY, bandBottom ?? bottomY);
  const { seams, grit } = useMemo(() => {
    let seams = "";
    let grit = "";
    for (let y = start; y < end; y += step) {
      const i = Math.round(y / step) * 7;
      const hw = mountainHalfWidth(y - peakY, width, timeLen) * 0.82 - 12;
      if (hw < 14) continue;
      for (let k = 0; k < 2; k++) {
        const j = i + k;
        const cx = routeX + (seeded(j, 71) - 0.5) * 2 * hw;
        const yy = Math.round(y + (seeded(j, 72) - 0.5) * 26);
        const len = Math.round(34 + seeded(j, 73) * 96);
        const tilt = Math.round((seeded(j, 74) - 0.5) * 14);
        seams += `M ${Math.round(cx)} ${yy} l ${len} ${tilt} `;
      }
      for (let k = 0; k < 3; k++) {
        const j = i + 3 + k;
        const cx = Math.round(routeX + (seeded(j, 75) - 0.5) * 2 * hw);
        const yy = Math.round(y + seeded(j, 76) * step);
        grit += `M ${cx} ${yy} l ${1 + Math.round(seeded(j, 77) * 3)} 0 `;
      }
    }
    return { seams, grit };
  }, [routeX, peakY, start, end, width, timeLen]);
  return (
    <G pointerEvents="none">
      <Path d={seams} stroke={tk.inkSoft} strokeWidth={1.2} opacity={0.3} fill="none" />
      <Path
        d={grit}
        stroke={tk.inkSoft}
        strokeWidth={2.4}
        strokeLinecap="round"
        opacity={0.34}
        fill="none"
      />
    </G>
  );
}

/**
 * The sky behind the mountain, on its own slower rail (the stage moves this
 * group at a fraction of the camera): clouds low down giving way to stars as
 * the summit nears. Parallax is the other half of "he is going up" — the rock
 * rushing past at full speed, the sky drifting behind it.
 */
export function SkyParallax({
  peakY,
  bottomY,
  width,
  tk,
}: {
  peakY: number;
  bottomY: number;
  width: number;
  tk: ThemeTokens;
}) {
  const { clouds, stars } = useMemo(() => {
    const clouds: { x: number; y: number; s: number }[] = [];
    const span = Math.max(400, bottomY - peakY);
    const cloudCount = Math.min(14, Math.round(span / 260));
    for (let i = 0; i < cloudCount; i++) {
      clouds.push({
        // low and mid altitudes only — up top it is stars
        y: Math.round(peakY + 300 + (span - 300) * (i / Math.max(1, cloudCount - 1))),
        x: Math.round(seeded(i, 81) * width),
        s: 0.7 + seeded(i, 82) * 0.8,
      });
    }
    // one batched path — 30 circle nodes would repaint every frame
    let stars = "";
    for (let i = 0; i < 30; i++) {
      const x = Math.round(seeded(i, 85) * width);
      const y = Math.round(peakY - 260 + seeded(i, 86) * 900);
      const r = Math.round((0.9 + seeded(i, 87) * 1.3) * 10) / 10;
      stars += `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 `;
    }
    return { clouds, stars };
  }, [peakY, bottomY, width]);
  return (
    <G pointerEvents="none">
      <Path d={stars} fill={tk.inkSoft} opacity={0.5} />
      {clouds.map((c, i) => {
        const w = 70 * c.s;
        const h = 16 * c.s;
        return (
          <Path
            key={`c${i}`}
            d={`M ${c.x} ${c.y} q ${w * 0.25} ${-h} ${w * 0.5} 0 q ${w * 0.3} ${-h * 0.8} ${w * 0.5} 0 Z`}
            fill={tk.inkFaint}
            opacity={0.09}
          />
        );
      })}
    </G>
  );
}

export function MountainFace({
  routeX,
  peakY,
  width,
  timeLen,
  depth,
  bandAnchor,
  tk,
}: {
  routeX: number;
  /** The summit's tip. */
  peakY: number;
  width: number;
  timeLen: number;
  /** How far below the dated canvas the rock keeps going. */
  depth: number;
  /** The layer coordinate that the top of the viewport currently sits at —
   * i.e. minus how far this layer has been translated down (the climb). */
  bandAnchor?: number;
  tk: ThemeTokens;
}) {
  // A day's mountain is thousands of px tall and the browser re-rasterizes the
  // silhouette on every frame of a climb, so only the band the viewport can
  // reach is built — measured from the viewport's place in THIS layer's
  // coordinates, with a screen and a half of slack above (for a climb in
  // flight) and a screen past the bottom edge below.
  const bottom = timeLen + depth;
  const anchor = bandAnchor ?? 0;
  const drawTop = Math.max(peakY, anchor - 1.6 * timeLen);
  const drawBottom = Math.min(bottom, anchor + 2.6 * timeLen);
  const body = useMemo(() => {
    // the apex only belongs to the path when the peak is in the band
    const apex = drawTop <= peakY + 1;
    const top = apex ? peakY : drawTop;
    const left = flank(routeX, peakY, top, drawBottom, width, -1, 31, timeLen);
    const right = flank(routeX, peakY, top, drawBottom, width, 1, 33, timeLen);
    let d = `M ${left[left.length - 1].x} ${drawBottom}`;
    for (let i = left.length - 1; i >= 0; i--) d += ` L ${left[i].x} ${left[i].y}`;
    if (apex) {
      d += ` L ${routeX} ${Math.round(peakY)}`;
    } else {
      // a straight seam across the band's top, off-screen either way
      d += ` L ${Math.round(routeX - mountainHalfWidth(top - peakY, width, timeLen))} ${Math.round(top)}`;
      d += ` L ${Math.round(routeX + mountainHalfWidth(top - peakY, width, timeLen))} ${Math.round(top)}`;
    }
    for (const p of right) d += ` L ${p.x} ${p.y}`;
    return d + ` L ${right[right.length - 1].x} ${drawBottom} Z`;
  }, [routeX, peakY, drawTop, drawBottom, width, timeLen]);
  // the snow cap: the top ~110px of both flanks, closed with a ragged hem
  const cap = useMemo(() => {
    // a fifth of the stage: a cap you can see, at any stage size
    const drop = Math.round(0.22 * timeLen);
    const capBottom = peakY + drop;
    const left = flank(routeX, peakY, peakY, capBottom, width, -1, 31, timeLen);
    const right = flank(routeX, peakY, peakY, capBottom, width, 1, 33, timeLen);
    let d = `M ${left[left.length - 1].x} ${capBottom}`;
    for (let i = left.length - 1; i >= 0; i--) d += ` L ${left[i].x} ${left[i].y}`;
    d += ` L ${routeX} ${Math.round(peakY)}`;
    for (const p of right) d += ` L ${p.x} ${p.y}`;
    const lx = left[left.length - 1].x;
    const rx = right[right.length - 1].x;
    for (let i = 1; i <= 5; i++) {
      const t = i / 5;
      d += ` L ${Math.round(rx + (lx - rx) * t)} ${Math.round(capBottom + (seeded(i, 35) - 0.2) * (drop * 0.22))}`;
    }
    return d + " Z";
  }, [routeX, peakY, width, timeLen]);
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
 * A little cliff ledge: the shelf a rope is anchored to. The climber ends
 * an answered rope standing here; the coil rests on it until tomorrow.
 */
export function CliffLedge({ x, y, tk }: { x: number; y: number; tk: ThemeTokens }) {
  return (
    <G pointerEvents="none">
      {/* the rock underside */}
      <Path
        d={`M ${x - 15} ${y} l 5 10 l 21 0 l 4 -10 Z`}
        fill="#141b22"
        opacity={0.16}
      />
      {/* the shelf */}
      <Path
        d={`M ${x - 17} ${y} h 34`}
        stroke={tk.lineMain}
        strokeWidth={3.2}
        strokeLinecap="round"
        fill="none"
        opacity={0.8}
      />
      {/* snow dust on the lip */}
      <Path
        d={`M ${x - 13} ${y - 2} h 26`}
        stroke="#ffffff"
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
        opacity={0.6}
      />
    </G>
  );
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
  depth,
  tk,
  calmProgress,
}: {
  current: CalmCurrentProps;
  routeX: number;
  nowScreenY: number;
  timeLen: number;
  /** How far below the dated canvas the faded route keeps going. */
  depth: number;
  tk: ThemeTokens;
  calmProgress: number;
}) {
  const base = `M ${routeX} ${timeLen} L ${routeX} ${nowScreenY}`;
  return (
    <G>
      {/* the route fades on below the dated canvas — the camera may look there */}
      <Path
        d={`M ${routeX} ${timeLen} L ${routeX} ${timeLen + depth}`}
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
      {/* NOTE the line stops at Now. The way up the mountain is drawn on the
          ROCK (see the dashed route in the mountain layer), because it travels
          down with the rock as he climbs — the timeline itself never grows. */}
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
 * The altitude pennant: a little flag planted at the climber's feet — it
 * rides the same live shared value the camera tracks, so flag, climber and
 * mountain move as one (already quantized upstream). Under reduced motion
 * the value is static, so the flag is too.
 */
export function ClimbPennant({
  routeX,
  liveY,
  tk,
}: {
  routeX: number;
  /** The climber's feet in world coords — the stage's pipFeetY. */
  liveY: SharedValue<number>;
  tk: ThemeTokens;
}) {
  const props = useAnimatedProps(() => ({ translateY: liveY.value }), [liveY]);
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
