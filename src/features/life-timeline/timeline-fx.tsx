import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  type EasingFunction,
  type EasingFunctionFactory,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import type { PathProps } from "react-native-svg";
import type { ThemeId } from "@/visualization/theme";
import { pathLength, samplePath } from "@/visualization/path-sample";
import { mix } from "@/ui/color";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
export const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Run a CSS-keyframe-like multi-stop loop on a shared value. `at` is 0–1. */
function runStops(
  sv: SharedValue<number>,
  stops: { at: number; v: number }[],
  durationMs: number,
  easing: EasingFunction | EasingFunctionFactory,
) {
  sv.value = stops[0].v;
  const segments = stops
    .slice(1)
    .map((s, i) =>
      withTiming(s.v, { duration: (s.at - stops[i].at) * durationMs, easing }),
    );
  sv.value = withRepeat(
    segments.length === 1 ? segments[0] : withSequence(...segments),
    -1,
    false,
  );
}

type GlowStop = { at: number; opacity: number; scale: number; ty?: number };
type GlowSpec = {
  duration: number;
  easing: EasingFunction | EasingFunctionFactory;
  stops: GlowStop[];
};

const easeInOut = Easing.inOut(Easing.ease);
const breathe: GlowStop[] = [
  { at: 0, opacity: 0.1, scale: 0.85 },
  { at: 0.5, opacity: 0.28, scale: 1.15 },
  { at: 1, opacity: 0.1, scale: 0.85 },
];

/** Each theme's Now light carries itself differently (global.css keyframes). */
const GLOWS: Partial<Record<ThemeId, GlowSpec | null>> = {
  // porcelain: a still Now — no animation, quiet opacity
  porcelain: null,
  sunprint: { duration: 5500, easing: easeInOut, stops: breathe },
  midnight: {
    duration: 1800,
    easing: Easing.bezier(0.2, 0.6, 0.4, 1),
    stops: [
      { at: 0, opacity: 0.4, scale: 0.6 },
      { at: 0.7, opacity: 0, scale: 1.7 },
      { at: 1, opacity: 0, scale: 1.7 },
    ],
  },
  duskwood: {
    duration: 4400,
    easing: easeInOut,
    stops: [
      { at: 0, opacity: 0.08, scale: 0.85 },
      { at: 0.18, opacity: 0.3, scale: 1.1 },
      { at: 0.26, opacity: 0.12, scale: 0.95 },
      { at: 0.34, opacity: 0.34, scale: 1.18 },
      { at: 0.62, opacity: 0.1, scale: 0.9 },
      { at: 0.74, opacity: 0.26, scale: 1.05 },
      { at: 1, opacity: 0.08, scale: 0.85 },
    ],
  },
  demonfire: {
    duration: 3200,
    easing: easeInOut,
    stops: [
      { at: 0, opacity: 0.1, scale: 0.9 },
      { at: 0.4, opacity: 0.32, scale: 1.12 },
      { at: 0.6, opacity: 0.2, scale: 1.02 },
      { at: 1, opacity: 0.1, scale: 0.9 },
    ],
  },
  koipond: {
    duration: 3600,
    easing: Easing.out(Easing.ease),
    stops: [
      { at: 0, opacity: 0.3, scale: 0.7 },
      { at: 0.6, opacity: 0.05, scale: 1.5 },
      { at: 1, opacity: 0, scale: 1.6 },
    ],
  },
  carnival: {
    duration: 2600,
    easing: easeInOut,
    stops: [
      { at: 0, opacity: 0.18, scale: 0.95, ty: 0 },
      { at: 0.5, opacity: 0.3, scale: 1.1, ty: -1.5 },
      { at: 1, opacity: 0.18, scale: 0.95, ty: 0 },
    ],
  },
  catnap: {
    duration: 6000,
    easing: easeInOut,
    stops: [
      { at: 0, opacity: 0.2, scale: 1 },
      { at: 0.46, opacity: 0.16, scale: 0.98 },
      { at: 0.5, opacity: 0.02, scale: 0.9 },
      { at: 0.54, opacity: 0.16, scale: 0.98 },
      { at: 1, opacity: 0.2, scale: 1 },
    ],
  },
  abyss: {
    duration: 4800,
    easing: easeInOut,
    stops: [
      { at: 0, opacity: 0.06, scale: 0.8 },
      { at: 0.5, opacity: 0.4, scale: 1.25 },
      { at: 1, opacity: 0.06, scale: 0.8 },
    ],
  },
  pompom: {
    duration: 2100,
    easing: easeInOut,
    stops: [
      { at: 0, opacity: 0.16, scale: 0.95, ty: 0 },
      { at: 0.32, opacity: 0.3, scale: 1.08, ty: -1.8 },
      { at: 0.48, opacity: 0.2, scale: 0.98, ty: 0 },
      { at: 0.62, opacity: 0.28, scale: 1.05, ty: -1.2 },
      { at: 1, opacity: 0.16, scale: 0.95, ty: 0 },
    ],
  },
  gravemist: {
    duration: 5200,
    easing: easeInOut,
    stops: [
      { at: 0, opacity: 0.1, scale: 0.9 },
      { at: 0.22, opacity: 0.26, scale: 1.05 },
      { at: 0.3, opacity: 0.14, scale: 0.96 },
      { at: 0.44, opacity: 0.3, scale: 1.12 },
      { at: 0.7, opacity: 0.12, scale: 0.92 },
      { at: 0.82, opacity: 0.22, scale: 1.02 },
      { at: 1, opacity: 0.1, scale: 0.9 },
    ],
  },
  // summit: thin-air breathing — slow, wide, unhurried
  summit: { duration: 5000, easing: easeInOut, stops: breathe },
};
// riverbed / inkwash and any theme without a character: the default breathe.
const DEFAULT_GLOW: GlowSpec = { duration: 3000, easing: easeInOut, stops: breathe };

/** The breathing halo behind the Now dot, in the theme's own rhythm. */
export function NowGlow({
  cx,
  cy,
  fill,
  theme,
  reducedMotion,
}: {
  cx: number;
  cy: number;
  fill: string;
  theme: ThemeId;
  reducedMotion: boolean;
}) {
  const spec = theme in GLOWS ? GLOWS[theme] : DEFAULT_GLOW;
  const still = reducedMotion || spec === null || spec === undefined;
  const stillOpacity = theme === "porcelain" ? 0.14 : 0.18;

  const opacity = useSharedValue(stillOpacity);
  const scale = useSharedValue(1);
  const ty = useSharedValue(0);
  useEffect(() => {
    if (still || !spec) {
      cancelAnimation(opacity);
      cancelAnimation(scale);
      cancelAnimation(ty);
      opacity.value = stillOpacity;
      scale.value = 1;
      ty.value = 0;
      return;
    }
    runStops(opacity, spec.stops.map((s) => ({ at: s.at, v: s.opacity })), spec.duration, spec.easing);
    runStops(scale, spec.stops.map((s) => ({ at: s.at, v: s.scale })), spec.duration, spec.easing);
    if (spec.stops.some((s) => s.ty !== undefined)) {
      runStops(ty, spec.stops.map((s) => ({ at: s.at, v: s.ty ?? 0 })), spec.duration, spec.easing);
    }
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
      cancelAnimation(ty);
    };
  }, [still, spec, stillOpacity, opacity, scale, ty]);

  // Coarse steps (invisible at these sizes) so the glow writes to the DOM
  // a handful of times a second instead of every frame.
  const qO = useDerivedValue(() => Math.round(opacity.value * 200) / 200, []);
  const qR = useDerivedValue(() => Math.round(14 * scale.value * 10) / 10, []);
  const qY = useDerivedValue(() => Math.round(ty.value * 10) / 10, []);
  const props = useAnimatedProps(
    () => ({ opacity: qO.value, r: qR.value, cy: cy + qY.value }),
    [cy, qO, qR, qY],
  );

  return <AnimatedCircle animatedProps={props} cx={cx} cy={cy} r={14} fill={fill} />;
}

/** A travelling dash offset (`@keyframes flow` and friends). */
export function useDashFlow(
  active: boolean,
  from: number,
  to: number,
  durationMs: number,
): Partial<PathProps> {
  const sv = useSharedValue(from);
  useEffect(() => {
    if (!active) {
      cancelAnimation(sv);
      sv.value = from;
      return;
    }
    sv.value = from;
    sv.value = withRepeat(
      withTiming(to, { duration: durationMs, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(sv);
  }, [active, from, to, durationMs, sv]);
  // Quantize to 0.25px steps: derived values propagate only on change, so
  // the DOM hears about the dash a few times a second, not every frame.
  const q = useDerivedValue(() => Math.round(sv.value * 4) / 4, []);
  return useAnimatedProps(() => ({ strokeDashoffset: q.value }), [q]);
}

/** `.merge-preview-target`: a breathing ring at Now while a merge is considered. */
export function MergePreviewTarget({
  cx,
  cy,
  stroke,
  reducedMotion,
}: {
  cx: number;
  cy: number;
  stroke: string;
  reducedMotion: boolean;
}) {
  const opacity = useSharedValue(0.55);
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(opacity);
      cancelAnimation(scale);
      opacity.value = 0.55;
      scale.value = 1;
      return;
    }
    runStops(opacity, [{ at: 0, v: 0.1 }, { at: 0.5, v: 0.28 }, { at: 1, v: 0.1 }], 2400, easeInOut);
    runStops(scale, [{ at: 0, v: 0.85 }, { at: 0.5, v: 1.15 }, { at: 1, v: 0.85 }], 2400, easeInOut);
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
    };
  }, [reducedMotion, opacity, scale]);
  const props = useAnimatedProps(() => ({ opacity: opacity.value, r: 12 * scale.value }));
  return (
    <AnimatedCircle
      animatedProps={props}
      cx={cx}
      cy={cy}
      r={12}
      fill="none"
      stroke={stroke}
      strokeWidth={1.5}
    />
  );
}

/**
 * `.reclaim-chip` — a feeling flying home from a decided line to Now
 * (`@keyframes reclaim-fly`, 1.7s ease-in-out, staggered 0.14s apart).
 */
export function ReclaimFly({
  index,
  x0,
  y0,
  dx,
  dy,
  children,
}: {
  index: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  children: React.ReactNode;
}) {
  const p = useSharedValue(0);
  const opacity = useSharedValue(0);
  useEffect(() => {
    const delay = index * 140;
    p.value = 0;
    opacity.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration: 1700, easing: easeInOut }));
    opacity.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 204, easing: easeInOut }),
        withTiming(0.9, { duration: 1071, easing: easeInOut }),
        withTiming(0, { duration: 425, easing: easeInOut }),
      ),
    );
    return () => {
      cancelAnimation(p);
      cancelAnimation(opacity);
    };
  }, [index, p, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: dx * p.value },
      { translateY: dy * p.value },
      { scale: 1 - 0.55 * p.value },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: x0, top: y0 }, style]}
    >
      {children}
    </Animated.View>
  );
}

const AnimatedCircleFx = Animated.createAnimatedComponent(Circle);
const AnimatedGFx = Animated.createAnimatedComponent(G);
const AnimatedRectFx = Animated.createAnimatedComponent(Rect);

/** The ember palette, borrowed from the dragon. */
const EMBER = "#ff9a3d";
const EMBER_DEEP = "#ff6a2d";
const EMBER_BRIGHT = "#ffd27a";
const CHAR = "#3a2f28";

/**
 * `.burn-away` v2 — fire truly consumes a thread. The whole line ignites and
 * flickers alive, an erase front sweeps fork→end while char crumbles behind
 * it, flame clusters burn at intervals along the path, embers rise and
 * drift, and it ends with nothing left: the thread is deleted when the fire
 * is done. Purely visual — finalizeBurn does the removing. Caller gates
 * reduce motion.
 */
export function BurnAway({ path, durationMs = 2800 }: { path: string; durationMs?: number }) {
  const len = pathLength(path);
  const points = samplePath(path, 8);
  const progress = useSharedValue(0);
  const flick = useSharedValue(0);
  const flash = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    flash.value = 0;
    // ignition: a bright flash, then the sweep begins
    flash.value = withSequence(
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 420, easing: Easing.inOut(Easing.quad) }),
    );
    progress.value = withDelay(
      300,
      withTiming(1, { duration: durationMs - 300, easing: Easing.inOut(Easing.quad) }),
    );
    flick.value = withRepeat(withTiming(1, { duration: 90, easing: Easing.linear }), -1, true);
    return () => {
      cancelAnimation(progress);
      cancelAnimation(flick);
      cancelAnimation(flash);
    };
  }, [durationMs, progress, flick, flash]);

  // the not-yet-consumed line burns alive: flickering width and brightness
  const aliveProps = useAnimatedProps(() => ({
    strokeDashoffset: -progress.value * len,
    strokeWidth: 3.2 + flick.value * 2.6,
    stroke: flick.value > 0.66 ? EMBER_BRIGHT : flick.value > 0.33 ? EMBER : EMBER_DEEP,
    opacity: progress.value >= 1 ? 0 : 0.95,
  }));
  // a hot glow underneath the burning stretch
  const glowLineProps = useAnimatedProps(() => ({
    strokeDashoffset: -progress.value * len,
    strokeWidth: 10 + flick.value * 5,
    opacity: progress.value >= 1 ? 0 : 0.22 + flick.value * 0.08,
  }));
  // char crumbling behind the front: broken dashes, fading
  const charProps = useAnimatedProps(() => ({
    strokeDashoffset: -Math.max(0, progress.value - 0.1) * len,
    opacity: 0.55 * (1 - progress.value),
  }));
  // the ignition flash at the endpoint
  const end = points[points.length - 1] ?? { x: 0, y: 0 };
  const flashProps = useAnimatedProps(() => ({
    r: Math.max(0.1, 6 + flash.value * 30),
    opacity: flash.value * 0.7,
  }));

  // flame clusters along the whole path, each with its own phase; a cluster
  // burns while the front has not passed it, then gutters out
  const clusterEvery = Math.max(3, Math.floor(points.length / 9));
  const clusters = points.filter((_, i) => i % clusterEvery === 0);

  return (
    <G pointerEvents="none">
      <AnimatedPath
        d={path}
        stroke={EMBER}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${len} ${len}`}
        animatedProps={glowLineProps}
      />
      <AnimatedPath
        d={path}
        stroke={CHAR}
        strokeWidth={4.5}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${len} ${len}`}
        animatedProps={charProps}
      />
      <AnimatedPath
        d={path}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${len} ${len}`}
        animatedProps={aliveProps}
      />
      {clusters.map((pnt, i) => (
        <FlameCluster
          key={i}
          x={pnt.x}
          y={pnt.y}
          at={i / Math.max(1, clusters.length - 1)}
          progress={progress}
          flick={flick}
          phase={(i * 37) % 100}
        />
      ))}
      {points
        .filter((_, i) => i % Math.max(2, Math.floor(points.length / 18)) === 0)
        .map((pnt, i, arr) => (
          <Spark key={`s${i}`} x={pnt.x} y={pnt.y} at={i / Math.max(1, arr.length - 1)} progress={progress} />
        ))}
      <AnimatedCircleFx cx={end.x} cy={end.y} fill={EMBER_BRIGHT} animatedProps={flashProps} />
    </G>
  );
}

/** Three teardrop flames sharing a base, flickering out of phase. */
function FlameCluster({ x, y, at, progress, flick, phase }: {
  x: number;
  y: number;
  at: number;
  progress: SharedValue<number>;
  flick: SharedValue<number>;
  phase: number;
}) {
  const mk = (dx: number, size: number, speed: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedProps(() => {
      const consumed = progress.value > at;
      const gutter = consumed ? Math.max(0, 1 - (progress.value - at) * 6) : 1;
      const j = Math.abs(Math.sin((flick.value + phase / 100) * Math.PI * speed));
      return {
        cx: x + dx + j * 1.4,
        cy: y - 3 - j * (3 + size),
        r: Math.max(0.1, (size + j * 1.6) * gutter),
        opacity: progress.value >= 1 ? 0 : 0.85 * gutter,
      };
    });
  const f1 = mk(-3, 2.2, 2);
  const f2 = mk(0, 3.4, 3);
  const f3 = mk(3, 2.0, 2.5);
  const core = mk(0, 1.6, 3.5);
  return (
    <G>
      <AnimatedCircleFx fill={EMBER_DEEP} animatedProps={f1} />
      <AnimatedCircleFx fill={EMBER} animatedProps={f2} />
      <AnimatedCircleFx fill={EMBER} animatedProps={f3} />
      <AnimatedCircleFx fill={EMBER_BRIGHT} animatedProps={core} />
    </G>
  );
}

/** One spark: rises and fades once the erase front passes its seed point. */
function Spark({ x, y, at, progress }: {
  x: number;
  y: number;
  at: number;
  progress: SharedValue<number>;
}) {
  const props = useAnimatedProps(() => {
    const local = Math.max(0, Math.min(1, (progress.value - at) * 3.2));
    return {
      cx: x + Math.sin((at + 1) * 40 + local * 7) * 7 * local,
      cy: y - local * (22 + at * 26),
      r: Math.max(0.1, 1.7 * (1 - local * 0.55)),
      opacity: local <= 0 || local >= 1 ? 0 : 0.9 * (1 - local),
    };
  });
  return <AnimatedCircleFx fill={EMBER_BRIGHT} animatedProps={props} />;
}

/**
 * `.smoke-chip` — a burned word rising as smoke: up and away, greying out.
 * The inverse of ReclaimFly, which carries feelings home.
 */
export function SmokeFly({ index, x0, y0, children }: {
  index: number;
  x0: number;
  y0: number;
  children: React.ReactNode;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withDelay(index * 180, withTiming(1, { duration: 1900, easing: easeInOut }));
    return () => cancelAnimation(p);
  }, [index, p]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.12 ? p.value * 7 : (1 - p.value) * 0.9,
    transform: [
      { translateX: Math.sin(p.value * 5 + index) * 10 },
      { translateY: -70 * p.value },
      { scale: 1 - 0.3 * p.value },
    ],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: x0, top: y0 }, style]}>
      {children}
    </Animated.View>
  );
}

// ─── Pip's attack ─────────────────────────────────────────────────────────────

type AttackVariant =
  | "generic"
  | "demonfire"
  | "koipond"
  | "carnival"
  | "catnap"
  | "abyss"
  | "gravemist"
  | "pompom"
  | "summit";

export function attackVariantFor(theme: ThemeId): AttackVariant {
  switch (theme) {
    case "demonfire":
    case "koipond":
    case "carnival":
    case "catnap":
    case "abyss":
    case "gravemist":
    case "pompom":
    case "summit":
      return theme;
    default:
      return "generic";
  }
}

// Chalk, matching SummitScene's rope palette — which imports `Fleck` from
// this file, so the constants cannot be shared without a cycle.
// CHALK_SMUDGE is also a harness hook: summit-check finds the mark on the
// rope by this stroke. Do not change it without changing that script.
const CHALK = "#ffffff";
const CHALK_DUST = "#f0e3c8"; // = SummitScene's FRAY
const CHALK_SMUDGE = "#f4ead6";
/** White on a pale sky is invisible: the block and its ring need a rim. */
const CHALK_RIM = "#9aa7b4";
/** Fraction of the fx's life the chalk block spends in the air (~200ms). */
const THROW = 0.18;

/** One flying particle of an impact: shoots outward, arcs, fades. */
export function Fleck({ x, y, angle, dist, size, color, rise, delay, t }: {
  x: number;
  y: number;
  angle: number;
  dist: number;
  size: number;
  color: string;
  rise: number;
  delay: number;
  t: SharedValue<number>;
}) {
  const props = useAnimatedProps(() => {
    const local = Math.max(0, Math.min(1, (t.value - delay) / (1 - delay)));
    const ease = 1 - (1 - local) * (1 - local);
    return {
      cx: x + Math.cos(angle) * dist * ease,
      cy: y + Math.sin(angle) * dist * ease - rise * ease * ease,
      r: Math.max(0.1, size * (1 - local * 0.7)),
      opacity: local <= 0 || local >= 1 ? 0 : 0.95 * (1 - local),
    };
  });
  return <AnimatedCircleFx fill={color} animatedProps={props} />;
}

/** The expanding shockwave at the point of impact. */
export function Shockwave({ x, y, color, t, scale = 1, delay = 0 }: {
  x: number;
  y: number;
  color: string;
  t: SharedValue<number>;
  scale?: number;
  /** Hold off until this fraction of `t` — a thrown impact waits for the
   * throw to land before the ring goes out. */
  delay?: number;
}) {
  const props = useAnimatedProps(() => {
    const local = Math.max(0, Math.min(1, (t.value - delay) / (1 - delay)));
    return {
      r: Math.max(0.1, 5 + local * 40 * scale),
      opacity: local <= 0 ? 0 : (1 - local) * 0.55,
      strokeWidth: Math.max(0.2, 2.4 * (1 - local)),
    };
  });
  return <AnimatedCircleFx cx={x} cy={y} fill="none" stroke={color} animatedProps={props} />;
}

/**
 * `.attack-fx` — the moment Pip's strike lands on a thread. A shockwave, a
 * spray of theme-true particles at the creature's spot, and the line itself
 * flashing and shaking. Purely visual; the loudness already dropped.
 */
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

/**
 * Summit's strike: he throws a block of chalk at the rope and it bursts into
 * dust. No slash — nobody slashes a rope — and no white flash of the line
 * either, which also keeps this clear of the rope's own mountain
 * coordinates: a short segment at his altitude IS the rope.
 */
function ChalkFx({ x, y, calm, fromX, fromY, rot = null, angle = 0, radius = 0 }: AttackFxProps) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withTiming(1, { duration: 1150, easing: Easing.out(Easing.quad) });
    return () => cancelAnimation(t);
  }, [t]);

  // How far the rope has been carried round by the turn. Zero off the summit.
  const ringDx = useDerivedValue(
    () => (rot ? (Math.sin(angle + rot.value) - Math.sin(angle)) * radius : 0),
    [rot, angle, radius],
  );
  // The chalk block, in the air: a low arc from his hand to the rope, then
  // gone. A block, not a speck — white on a pale sky needs a dark rim and a
  // real size or it reads as nothing at all.
  const BLOCK = 7;
  const blockProps = useAnimatedProps(() => {
    const e = Math.min(1, t.value / THROW);
    const hx = fromX ?? x;
    const hy = fromY ?? y;
    const tx = x + ringDx.value;
    return {
      x: hx + (tx - hx) * e - BLOCK / 2,
      y: hy + (y - hy) * e - 34 * Math.sin(Math.PI * e) - BLOCK / 2,
      opacity: e >= 1 ? 0 : 1,
      // it tumbles as it flies
      rotation: e * 190,
    };
  });
  // The puff: a soft cloud of dust that blooms where it struck and thins out.
  const cloudProps = useAnimatedProps(() => {
    const l = Math.max(0, Math.min(1, (t.value - THROW) / 0.45));
    return {
      r: Math.max(0.1, 4 + l * (calm ? 12 : 26)),
      opacity: l <= 0 || l >= 1 ? 0 : 0.5 * (1 - l) * (calm ? 0.5 : 1),
    };
  });
  // The impact rides the turn: the dust goes round the back WITH its rope.
  const ringRide = useAnimatedProps(() => ({
    translateX: Math.round(ringDx.value * 2) / 2,
  }));
  // The chalk left on the rope. A summit rope is a straight vertical line
  // (transpose builds `M ax dangleY L ax ay`), so a short segment at his own
  // altitude IS the rope — no mountain-coordinate path, no climb offset.
  const smudgeProps = useAnimatedProps(() => {
    const l = Math.max(0, (t.value - THROW) / (1 - THROW));
    return {
      opacity: l <= 0 ? 0 : 0.7 * (1 - l) * (calm ? 0.4 : 1),
      strokeWidth: 5 + l * 4,
    };
  });

  // He throws chalk at the rope: the block flies, bursts, and leaves a
  // white smudge that settles as dust. No slash — nobody slashes a rope.
  const n = calm ? 6 : 16;
  return (
    <G pointerEvents="none">
      <AnimatedRectFx
        width={BLOCK}
        height={BLOCK - 2}
        rx={1.6}
        fill={CHALK}
        stroke={CHALK_RIM}
        strokeWidth={1}
        animatedProps={blockProps}
      />
      <AnimatedGFx animatedProps={ringRide}>
        <AnimatedPath
          d={`M ${x} ${y - 26} L ${x} ${y + 26}`}
          stroke={CHALK_SMUDGE}
          strokeLinecap="round"
          fill="none"
          animatedProps={smudgeProps}
        />
        <AnimatedCircleFx cx={x} cy={y} fill={CHALK} animatedProps={cloudProps} />
        <Shockwave x={x} y={y} color={CHALK_RIM} t={t} scale={calm ? 0.4 : 0.85} delay={THROW} />
        {Array.from({ length: n }, (_, i) => (
          // dust, not shrapnel: a settling fan, never a full circle
          <Fleck
            key={i}
            x={x}
            y={y}
            angle={Math.PI * (0.12 + (0.76 * ((i * 7) % n)) / n)}
            dist={(calm ? 14 : 34) * (0.6 + ((i * 37) % 10) / 18)}
            size={2 + ((i * 13) % 5) / 2}
            color={i % 3 === 0 ? CHALK_DUST : CHALK}
            rise={-8}
            delay={THROW + (i % 5) * 0.035}
            t={t}
          />
        ))}
        {!calm && <MinusOne x={x} y={y} color={CHALK_DUST} t={t} delay={THROW} />}
      </AnimatedGFx>
    </G>
  );
}

type AttackFxProps = {
  x: number;
  y: number;
  path: string;
  variant: AttackVariant;
  accent: string;
  calm: boolean;
  /** Where a thrown strike starts: his hand, in screen coordinates. */
  fromX?: number;
  fromY?: number;
  /**
   * Summit: the rope hangs round a mountain that turns, so `x` is its
   * UN-turned column and the turn is added here, per frame, on the UI thread.
   * The JS side's committed angle is a whole animation behind — and the user
   * can turn the face while a puff is still in the air.
   */
  rot?: SharedValue<number> | null;
  angle?: number;
  radius?: number;
};

/**
 * Which strike this theme lands. A dispatcher with no hooks of its own, so
 * each strike's per-frame work exists only where it is actually drawn — the
 * chalk's worklets must not tick through a bonk on the twelve flat maps.
 */
export function AttackFx(props: AttackFxProps) {
  if (props.variant === "summit") return <ChalkFx {...props} />;
  return <StrikeFx {...props} />;
}

function StrikeFx({ x, y, path, variant, accent, calm }: AttackFxProps) {
  const t = useSharedValue(0);
  const shake = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withTiming(1, { duration: 1150, easing: Easing.out(Easing.quad) });
    shake.value = 0;
    shake.value = withSequence(
      withTiming(1, { duration: 60, easing: Easing.linear }),
      withRepeat(withTiming(-1, { duration: 65, easing: Easing.linear }), 9, true),
      withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) }),
    );
    return () => {
      cancelAnimation(t);
      cancelAnimation(shake);
    };
  }, [t, shake]);

  // the struck line flashes bright and judders, settling as the wave fades
  const lineProps = useAnimatedProps(() => ({
    opacity: (1 - t.value) * (calm ? 0.25 : 0.8),
    strokeWidth: 3 + (1 - t.value) * 3,
    translateX: shake.value * 4 * (1 - t.value),
    translateY: shake.value * 2.4 * (1 - t.value),
  }));

  if (calm) {
    // a shrug, not a strike: one soft ring, three drowsy motes
    return (
      <G pointerEvents="none">
        <Shockwave x={x} y={y} color={accent} t={t} scale={0.5} />
        {[0, 1, 2].map((i) => (
          <Fleck key={i} x={x} y={y} angle={-Math.PI / 2 + (i - 1) * 0.5} dist={12}
            size={1.6} color={accent} rise={8} delay={i * 0.12} t={t} />
        ))}
      </G>
    );
  }

  // "summit" has its own component (ChalkFx) — it never reaches here.
  const P: Record<Exclude<AttackVariant, "summit">, { colors: string[]; n: number; rise: number; spread: number; extra?: "slash" | "ripple" | "whoosh" | "bang" | "wisp" }> = {
    generic: { colors: [accent, "#ffffff"], n: 16, rise: 8, spread: 44, extra: "slash" },
    demonfire: { colors: ["#8a8a8a", "#bdbdbd", EMBER], n: 12, rise: 22, spread: 22 },
    koipond: { colors: ["#9fd4e8", "#d7f0fa", "#6db8d6"], n: 12, rise: 14, spread: 26, extra: "ripple" },
    carnival: { colors: ["#ffd166", "#ef66a6", "#7bdff2"], n: 14, rise: 10, spread: 32, extra: "whoosh" },
    catnap: { colors: ["#cfc3b8", "#9c8f83"], n: 8, rise: 16, spread: 18, extra: "bang" },
    abyss: { colors: ["#7fe0d6", "#3f8f88"], n: 10, rise: -14, spread: 20 },
    gravemist: { colors: ["#cdd6dd", "#93a1ac"], n: 9, rise: 10, spread: 34, extra: "wisp" },
    pompom: { colors: ["#f2c9a0", "#e8b184", "#fff1df"], n: 13, rise: 12, spread: 24 },
  };
  const cfg = P[variant as Exclude<AttackVariant, "summit">];

  const slashProps = useAnimatedProps(() => ({
    opacity: t.value < 0.35 ? 0.9 : Math.max(0, 0.9 - (t.value - 0.35) * 3),
    strokeWidth: Math.max(0.2, 4.5 * (1 - t.value)),
  }));

  return (
    <G pointerEvents="none">
      <AnimatedPath
        d={path}
        stroke="#ffffff"
        strokeLinecap="round"
        fill="none"
        animatedProps={lineProps}
      />
      <Shockwave x={x} y={y} color={accent} t={t} />
      {cfg.extra === "ripple" && <Shockwave x={x} y={y + 4} color={cfg.colors[0]!} t={t} scale={1.5} />}
      {cfg.extra === "slash" &&
        [-0.5, 0, 0.5].map((o) => (
          <AnimatedPath
            key={o}
            d={`M ${x - 14} ${y - 10 + o * 10} L ${x + 14} ${y + 8 + o * 10}`}
            stroke={accent}
            strokeLinecap="round"
            fill="none"
            animatedProps={slashProps}
          />
        ))}
      {cfg.extra === "whoosh" &&
        [0, 1, 2].map((i) => (
          <AnimatedPath
            key={i}
            d={`M ${x + 6} ${y - 6 + i * 6} q 14 ${-2 + i} 26 ${-6 + i * 2}`}
            stroke={cfg.colors[i % cfg.colors.length]!}
            strokeLinecap="round"
            fill="none"
            animatedProps={slashProps}
          />
        ))}
      {cfg.extra === "bang" && (
        <AnimatedPath
          d={`M ${x} ${y - 22} l 2.4 6 l 6 0.6 l -4.4 4.4 l 1.4 6 l -5.4 -3.2 l -5.4 3.2 l 1.4 -6 l -4.4 -4.4 l 6 -0.6 Z`}
          stroke={cfg.colors[0]!}
          fill={cfg.colors[1]!}
          animatedProps={slashProps}
        />
      )}
      {cfg.extra === "wisp" &&
        [0, 1].map((i) => (
          <AnimatedPath
            key={i}
            d={`M ${x - 4} ${y - 4 - i * 7} q 12 ${-6 - i * 2} 26 ${-3 - i * 4}`}
            stroke={cfg.colors[0]!}
            strokeLinecap="round"
            fill="none"
            animatedProps={slashProps}
          />
        ))}
      <MinusOne x={x} y={y} color={accent} t={t} />
      {Array.from({ length: cfg.n }, (_, i) => {
        const angle = (i / cfg.n) * Math.PI * 2 + (i % 3) * 0.21;
        return (
          <Fleck
            key={i}
            x={x}
            y={y}
            angle={angle}
            dist={cfg.spread * (0.7 + ((i * 37) % 10) / 22)}
            size={2 + ((i * 13) % 5) / 2.2}
            color={cfg.colors[i % cfg.colors.length]!}
            rise={cfg.rise}
            delay={(i % 4) * 0.05}
            t={t}
          />
        );
      })}
    </G>
  );
}

/**
 * Pip's strike: windup squash, a leap at the line, a jolt on landing, and a
 * little hop back — all as one transform burst around the sprite.
 */
export function LungeG({ active, dx, dy, tilt = 9, hop = 10, children }: {
  active: boolean;
  dx: number;
  dy: number;
  /**
   * Degrees of body rotation at the top of the leap. The rotation has no
   * origin, so it turns the group about the canvas origin rather than about
   * the sprite — harmless at a leap's scale on a horizontal map, but on the
   * summit (where he plants and THROWS instead of leaping) it would fling
   * him across the face, so that caller passes 0.
   */
  tilt?: number;
  /** How high the leap arcs. A throw does not leave the ground. */
  hop?: number;
  children: React.ReactNode;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(p);
      p.value = 0;
      return;
    }
    p.value = 0;
    p.value = withSequence(
      withTiming(0.25, { duration: 110, easing: Easing.in(Easing.quad) }), // windup
      withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }), // leap + strike
      withTiming(0.35, { duration: 160, easing: Easing.inOut(Easing.quad) }), // recoil
      withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) }), // settle
    );
    return () => cancelAnimation(p);
  }, [active, p]);
  const props = useAnimatedProps(() => {
    const leap = Math.max(0, (p.value - 0.25) / 0.75);
    const squash = p.value <= 0.25 ? 1 - p.value * 0.5 : 1 + leap * 0.08;
    return {
      translateX: dx * leap,
      translateY: dy * leap - Math.sin(leap * Math.PI) * hop,
      scaleY: squash,
      rotation: leap * (dx >= 0 ? tilt : -tilt),
    };
  });
  return <AnimatedGFx animatedProps={props}>{children}</AnimatedGFx>;
}

/** The "−1" that floats off a struck thread: the mechanic, made visible. */
function MinusOne({ x, y, color, t, delay = 0 }: {
  x: number;
  y: number;
  color: string;
  t: SharedValue<number>;
  /** Hold off until this fraction of `t` (a thrown impact lands late). */
  delay?: number;
}) {
  const props = useAnimatedProps(() => {
    const local = Math.max(0, Math.min(1, (t.value - delay) / (1 - delay)));
    return {
      y: y - 16 - local * 26,
      opacity: local <= 0 ? 0 : local < 0.12 ? local * 8 : Math.max(0, 1.15 - local * 1.15),
      fontSize: 15 + local * 4,
    };
  });
  return (
    <AnimatedSvgText
      x={x}
      fill={color}
      stroke="#ffffff"
      strokeWidth={0.6}
      fontWeight="700"
      textAnchor="middle"
      animatedProps={props}
    >
      −1
    </AnimatedSvgText>
  );
}

// ─── Completion celebration ──────────────────────────────────────────────────
// Reaching the sacred state earns a themed spectacle: rings bloom out of the
// Now dot and a flight of theme-true particles crosses the timeline —
// carnival confetti, demonfire embers, duskwood fireflies, abyss bubbles…

export type CelebrationSpec = {
  shape: "dot" | "rect" | "diamond" | "streak";
  motion: "rise" | "fall" | "drift";
  count: number;
  twinkle?: boolean;
  /** Resolve the particle palette from theme tokens. */
  palette: (c: { shimmer: string; accent: string; danger: string }) => string[];
};

const DEFAULT_CELEBRATION: CelebrationSpec = {
  shape: "dot",
  motion: "drift",
  count: 16,
  twinkle: true,
  palette: (c) => [c.shimmer, c.accent],
};

const CELEBRATIONS: Partial<Record<ThemeId, CelebrationSpec>> = {
  midnight: { shape: "rect", motion: "rise", count: 18, twinkle: true, palette: (c) => [c.accent, c.shimmer] },
  sunprint: { shape: "diamond", motion: "fall", count: 16, palette: (c) => [c.shimmer, c.accent, c.danger] },
  duskwood: { shape: "dot", motion: "drift", count: 14, twinkle: true, palette: (c) => [c.shimmer, "#b7e07e"] },
  porcelain: { shape: "diamond", motion: "fall", count: 14, palette: (c) => [c.shimmer, c.danger] },
  demonfire: { shape: "streak", motion: "rise", count: 20, palette: (c) => [c.shimmer, "#ff5533", "#ffd27a"] },
  koipond: { shape: "dot", motion: "drift", count: 16, palette: (c) => [c.shimmer, "#ffffff", c.accent] },
  carnival: { shape: "rect", motion: "fall", count: 26, palette: (c) => [c.shimmer, c.accent, c.danger, "#7fb1ff"] },
  catnap: { shape: "dot", motion: "drift", count: 14, twinkle: true, palette: (c) => [c.shimmer, "#c9b7e8"] },
  abyss: { shape: "dot", motion: "rise", count: 18, palette: (c) => [c.shimmer, c.accent] },
  pompom: { shape: "dot", motion: "drift", count: 18, palette: (c) => [c.shimmer, "#ffd7b0"] },
  gravemist: { shape: "dot", motion: "drift", count: 14, twinkle: true, palette: (c) => [c.shimmer, "#cfe3dd"] },
  // summit: a snow burst at the ledge, glinting in alpenglow
  summit: { shape: "dot", motion: "fall", count: 18, twinkle: true, palette: (c) => [c.shimmer, "#ffffff", c.accent] },
};

export function celebrationFor(theme: ThemeId): CelebrationSpec {
  return CELEBRATIONS[theme] ?? DEFAULT_CELEBRATION;
}

/** Deterministic per-particle "randomness" — stable across re-renders. */
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function CelebrationParticle({
  spec,
  index,
  x0,
  y0,
  color,
}: {
  spec: CelebrationSpec;
  index: number;
  x0: number;
  y0: number;
  color: string;
}) {
  const p = useSharedValue(0);
  const dur = 1500 + seeded(index, 1) * 1000;
  useEffect(() => {
    p.value = 0;
    p.value = withDelay(index * 60, withTiming(1, { duration: dur, easing: Easing.out(Easing.quad) }));
    return () => cancelAnimation(p);
  }, [index, p, dur]);

  // All randomness resolved here — the worklet closes over plain numbers.
  const drift = (seeded(index, 2) - 0.5) * 95;
  const lift = 70 + seeded(index, 3) * 75;
  const spin = (seeded(index, 4) - 0.5) * 560;
  const wander = (seeded(index, 5) - 0.5) * 34;
  const motion = spec.motion;
  const twinkle = !!spec.twinkle;
  const style = useAnimatedStyle(() => {
    const t = p.value;
    const dy =
      motion === "rise"
        ? -lift * t
        : motion === "fall"
          ? lift * 0.9 * t
          : -18 * Math.sin(t * Math.PI) + wander * t;
    const fadeIn = Math.min(1, t * 6);
    const fadeOut = 1 - Math.max(0, (t - 0.65) / 0.35);
    const tw = twinkle ? 0.55 + 0.45 * Math.sin(t * 14 + index) : 1;
    return {
      opacity: Math.max(0, fadeIn * fadeOut * tw),
      transform: [
        { translateX: drift * t + Math.sin(t * 6 + index) * 7 },
        { translateY: dy },
        { rotate: `${spin * t}deg` },
        { scale: 1 - 0.25 * t },
      ],
    };
  });
  const base =
    spec.shape === "rect"
      ? { width: 7, height: 4.5, borderRadius: 1 }
      : spec.shape === "diamond"
        ? { width: 7, height: 7, borderRadius: 1.5 }
        : spec.shape === "streak"
          ? { width: 2.5, height: 9, borderRadius: 1.25 }
          : { width: 6, height: 6, borderRadius: 3 };
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: x0, top: y0, backgroundColor: color }, base, style]}
    />
  );
}

function CelebrationRing({ x, y, delay, color }: { x: number; y: number; delay: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(p);
  }, [delay, p]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.max(0, (1 - p.value) * 0.85),
    transform: [{ scale: 0.15 + p.value * 2.4 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: x - 32,
          top: y - 32,
          width: 64,
          height: 64,
          borderRadius: 32,
          borderWidth: 2.5,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

/**
 * The full completion spectacle: three rings bloom from the Now dot while a
 * flight of theme-true particles lifts off the whole line. Mount it once at
 * the crossing into the sacred state; unmount after ~3s.
 */
export function CelebrationBurst({
  theme,
  nowX,
  mainY,
  shimmer,
  accent,
  danger,
  spreadAxis = "x",
  spreadLen = 0,
}: {
  theme: ThemeId;
  nowX: number;
  mainY: number;
  shimmer: string;
  accent: string;
  danger: string;
  /** "x" spreads along the horizontal line (default); "y" down a vertical
   * route (summit), over `spreadLen` px below (nowX, mainY). */
  spreadAxis?: "x" | "y";
  spreadLen?: number;
}) {
  const spec = celebrationFor(theme);
  const palette = spec.palette({ shimmer, accent, danger });
  return (
    <>
      {[0, 220, 460].map((delay, i) => (
        <CelebrationRing key={i} x={nowX} y={mainY} delay={delay} color={shimmer} />
      ))}
      {Array.from({ length: spec.count }, (_, i) => (
        <CelebrationParticle
          key={i}
          spec={spec}
          index={i}
          x0={
            spreadAxis === "y"
              ? nowX - 4 + (seeded(i, 8) - 0.5) * 10
              : nowX * (0.06 + 0.88 * seeded(i, 9))
          }
          y0={
            spreadAxis === "y"
              ? mainY + spreadLen * (0.06 + 0.88 * seeded(i, 9))
              : mainY - 4 + (seeded(i, 8) - 0.5) * 10
          }
          color={palette[i % palette.length]}
        />
      ))}
    </>
  );
}

// ─── Theme backdrop: ambient weather behind the timeline ─────────────────────
// Every theme has its own weather, and the weather knows how gathered you
// are: as wholeness rises the layer grows warmer, brighter and more serene;
// scattered days keep it dim, sparse and restless. Gravemist runs the other
// way — its fog THINS as you come back together.

export type BackdropSpec = {
  kind: "drift" | "rise" | "fall" | "twinkle";
  count: number;
  /** particle size range, px */
  size: [number, number];
  /** opacity ceiling at [scattered, whole] */
  opacity: [number, number];
  /** loop-duration multiplier at [scattered, whole] — bigger = more serene */
  speed: [number, number];
  /** particle color at [scattered, whole] */
  palette: (c: { shimmer: string; accent: string; inkFaint: string }) => [string, string];
  /** the mood axis is inverted: gathering CLEARS the layer (gravemist fog) */
  clears?: boolean;
};

const DEFAULT_BACKDROP: BackdropSpec = {
  kind: "drift",
  count: 12,
  size: [3, 5],
  opacity: [0.05, 0.15],
  speed: [0.7, 1.3],
  palette: (c) => [c.inkFaint, c.shimmer],
};

const BACKDROPS: Partial<Record<ThemeId, BackdropSpec>> = {
  midnight: { kind: "twinkle", count: 22, size: [1.5, 3], opacity: [0.10, 0.30], speed: [0.5, 1.4], palette: (c) => [c.inkFaint, c.shimmer] },
  sunprint: { kind: "fall", count: 12, size: [2.5, 4.5], opacity: [0.06, 0.16], speed: [0.7, 1.3], palette: (c) => [c.inkFaint, c.shimmer] },
  duskwood: { kind: "drift", count: 14, size: [2, 4], opacity: [0.10, 0.30], speed: [0.6, 1.2], palette: (c) => [c.inkFaint, c.shimmer] },
  porcelain: { kind: "drift", count: 8, size: [2, 3.5], opacity: [0.03, 0.09], speed: [0.8, 1.5], palette: (c) => [c.inkFaint, c.shimmer] },
  demonfire: { kind: "rise", count: 16, size: [2, 4], opacity: [0.12, 0.26], speed: [0.45, 1.1], palette: () => ["#c23b2a", "#ffce7a"] },
  koipond: { kind: "drift", count: 14, size: [2.5, 5], opacity: [0.07, 0.20], speed: [0.6, 1.4], palette: (c) => [c.inkFaint, c.shimmer] },
  carnival: { kind: "fall", count: 16, size: [2.5, 4.5], opacity: [0.07, 0.18], speed: [0.6, 1.2], palette: (c) => [c.accent, c.shimmer] },
  catnap: { kind: "drift", count: 12, size: [3, 6], opacity: [0.06, 0.16], speed: [0.7, 1.4], palette: (c) => ["#b7a5d6", c.shimmer] },
  abyss: { kind: "rise", count: 16, size: [1.5, 3.5], opacity: [0.10, 0.26], speed: [0.55, 1.2], palette: (c) => [c.inkFaint, c.shimmer] },
  pompom: { kind: "drift", count: 14, size: [3, 6], opacity: [0.07, 0.18], speed: [0.7, 1.3], palette: (c) => ["#e8c9ad", c.shimmer] },
  gravemist: { kind: "drift", count: 14, size: [26, 54], opacity: [0.05, 0.16], speed: [0.7, 1.3], palette: (c) => [c.inkFaint, c.shimmer], clears: true },
  // summit: gentle snowfall that warms toward alpenglow as the day gathers
  summit: { kind: "fall", count: 16, size: [2, 4], opacity: [0.08, 0.2], speed: [0.6, 1.2], palette: (c) => [c.inkFaint, "#ffffff"] },
};

export function backdropFor(theme: ThemeId): BackdropSpec {
  return BACKDROPS[theme] ?? DEFAULT_BACKDROP;
}

function BackdropParticle({
  spec,
  index,
  width,
  height,
  moodSV,
  colors,
  durationMs,
  tick,
}: {
  spec: BackdropSpec;
  index: number;
  width: number;
  height: number;
  moodSV: SharedValue<number>;
  colors: [string, string];
  durationMs: number;
  /** Shared 30Hz layer time (seconds) — one clock for the whole fleet. */
  tick: SharedValue<number>;
}) {
  const loopSec = durationMs / 1000;
  const x = seeded(index, 11) * width;
  const y = seeded(index, 12) * height;
  const sz = spec.size[0] + seeded(index, 13) * (spec.size[1] - spec.size[0]);
  const phase = seeded(index, 14);
  const swayAmp = 12 + seeded(index, 15) * 20;
  const kind = spec.kind;
  const count = spec.count;
  const clears = !!spec.clears;
  const [op0, op1] = spec.opacity;
  const [c0, c1] = colors;

  const style = useAnimatedStyle(() => {
    const m = moodSV.value;
    const axis = clears ? 1 - m : m;
    const tt = (tick.value / loopSec + phase) % 1;
    // density: particles wake up one by one as the mood axis rises
    const gate = Math.max(0, Math.min(1, axis * count - index));
    const ceiling = op0 + (op1 - op0) * axis;
    let fade = 1;
    let tx = 0;
    let ty = 0;
    let scale = 1;
    if (kind === "rise") {
      ty = 60 - 130 * tt;
      tx = Math.sin(tt * 4 * Math.PI + index) * 9;
      fade = Math.sin(tt * Math.PI);
    } else if (kind === "fall") {
      ty = -60 + 130 * tt;
      tx = Math.sin(tt * 3 * Math.PI + index) * 12;
      fade = Math.sin(tt * Math.PI);
    } else if (kind === "twinkle") {
      fade = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (tt * 3 + index * 0.37)));
      scale = 1 + 0.2 * Math.sin(2 * Math.PI * (tt * 2 + index));
    } else {
      tx = Math.sin(2 * Math.PI * tt + index) * swayAmp;
      ty = Math.cos(2 * Math.PI * tt * 0.8 + index * 1.7) * (swayAmp * 0.55);
      fade = 0.7 + 0.3 * Math.sin(2 * Math.PI * tt + index * 0.9);
    }
    return {
      opacity: ceiling * gate * fade,
      backgroundColor: interpolateColor(m, [0, 1], [c0, c1]),
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: x,
          top: y,
          width: sz,
          height: sz,
          borderRadius: sz / 2,
        },
        style,
      ]}
    />
  );
}

/**
 * The ambient weather layer. Mount it as the stage's first child (it renders
 * behind the transparent canvas). `mood` is the wholeness score 0..1 — the
 * layer glides toward warm/bright/serene as it rises.
 */
export function ThemeBackdrop({
  theme,
  width,
  height,
  mood,
  shimmer,
  accent,
  inkFaint,
  reducedMotion,
  worldClock = null,
}: {
  theme: ThemeId;
  width: number;
  height: number;
  mood: number;
  shimmer: string;
  accent: string;
  inkFaint: string;
  reducedMotion: boolean;
  worldClock?: SharedValue<number> | null;
}) {
  const spec = backdropFor(theme);
  const moodSV = useSharedValue(mood);
  useEffect(() => {
    moodSV.value = withTiming(mood, { duration: 1200, easing: Easing.inOut(Easing.ease) });
    return () => cancelAnimation(moodSV);
  }, [mood, moodSV]);

  // The shared world clock, quantized to 30Hz — one heartbeat for the fleet.
  const ownClock = useSharedValue(0);
  const clock = worldClock ?? ownClock;
  useEffect(() => {
    if (worldClock || reducedMotion) {
      cancelAnimation(ownClock);
      ownClock.value = 0;
      return;
    }
    ownClock.value = 0;
    ownClock.value = withRepeat(withTiming(3600, { duration: 3600_000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(ownClock);
  }, [worldClock, reducedMotion, ownClock]);
  const tick = useDerivedValue(() => Math.round(clock.value * 30) / 30, []);

  // Loop duration follows the mood only in coarse steps, so loops rarely
  // restart; opacity/color glide continuously off the shared value.
  const bucket = Math.round(Math.max(0, Math.min(1, mood)) * 4) / 4;
  const speedMul = spec.speed[0] + (spec.speed[1] - spec.speed[0]) * (spec.clears ? 1 - bucket : bucket);

  if (reducedMotion) return null;
  const colors = spec.palette({ shimmer, accent, inkFaint });
  return (
    <>
      {Array.from({ length: spec.count }, (_, i) => (
        <BackdropParticle
          key={i}
          spec={spec}
          index={i}
          width={width}
          height={height}
          moodSV={moodSV}
          colors={colors}
          durationMs={Math.round((7000 + seeded(i, 16) * 5000) * speedMul)}
          tick={tick}
        />
      ))}
    </>
  );
}

// ─── Theme scenery: the place behind the timeline ────────────────────────────
// Each theme dresses the stage as somewhere real, in layers: a gradient
// wash of air or water, light (rays, sun, moon, lantern), a far and a near
// silhouette for depth, and living foreground pieces — seaweed with leaves
// under the koi pond, kelp bulbs in the abyss, cattails on the riverbed,
// bunting and tents at the carnival, brush-stroke mountains with a red seal
// on porcelain. Everything sits at whisper opacity and brightens as the day
// gathers itself.

type SceneColors = {
  shimmer: string;
  accent: string;
  inkFaint: string;
  bg: string;
  danger: string;
};

type FrondSpec = {
  count: number;
  height: [number, number];
  sway: number;
  width: number;
  colors: (c: SceneColors) => string[];
  /** leaf nodes along each blade */
  leaves?: boolean;
  /** what grows at the tip */
  tip?: "bulb" | "cattail";
};

type SilhouetteKind = "pines" | "rocks" | "hills" | "slabs" | "tents" | "towers";
type SilhouetteLayer = {
  kind: SilhouetteKind;
  heightFrac: number;
  color: (c: SceneColors) => string;
  /** seed salt, so far and near layers differ */
  salt: number;
};

export type SceneSpec = {
  /** scene opacity at [scattered, whole] */
  opacity: [number, number];
  /** vertical gradient wash over the whole stage */
  wash?: { top: (c: SceneColors) => string; bottom: (c: SceneColors) => string; topO: number; bottomO: number };
  /** slow diagonal light beams (underwater / god rays) */
  rays?: { count: number; color: (c: SceneColors) => string };
  /** far-to-near bottom silhouettes */
  silhouettes?: SilhouetteLayer[];
  fronds?: FrondSpec;
  orb?: { xFrac: number; yFrac: number; r: number; color: (c: SceneColors) => string; sunRays?: boolean };
  crescent?: { xFrac: number; yFrac: number; r: number; color: (c: SceneColors) => string };
  /** rows of carnival bunting */
  garlands?: number;
  garlandColors?: (c: SceneColors) => [string, string];
  deco?: "brushMountains" | "tree";
};

const SCENES: Partial<Record<ThemeId, SceneSpec>> = {
  riverbed: {
    opacity: [0.08, 0.18],
    silhouettes: [{ kind: "hills", heightFrac: 0.07, color: (c) => c.inkFaint, salt: 2 }],
    fronds: { count: 7, height: [40, 100], sway: 8, width: 3, colors: (c) => [c.accent, "#7a935f"], tip: "cattail" },
  },
  midnight: {
    opacity: [0.06, 0.15],
    crescent: { xFrac: 0.86, yFrac: 0.15, r: 26, color: (c) => c.shimmer },
    silhouettes: [{ kind: "towers", heightFrac: 0.12, color: (c) => c.inkFaint, salt: 3 }],
  },
  sunprint: {
    opacity: [0.09, 0.2],
    orb: { xFrac: 0.14, yFrac: 0.18, r: 40, color: (c) => c.shimmer, sunRays: true },
    silhouettes: [
      { kind: "hills", heightFrac: 0.1, color: () => "#d9a06b", salt: 4 },
      { kind: "hills", heightFrac: 0.06, color: () => "#c07a4a", salt: 5 },
    ],
  },
  duskwood: {
    opacity: [0.08, 0.18],
    crescent: { xFrac: 0.12, yFrac: 0.14, r: 20, color: (c) => c.shimmer },
    silhouettes: [
      { kind: "pines", heightFrac: 0.26, color: () => "#3f5d46", salt: 6 },
      { kind: "pines", heightFrac: 0.16, color: () => "#243b2c", salt: 7 },
    ],
  },
  porcelain: { opacity: [0.06, 0.13], deco: "brushMountains" },
  demonfire: {
    opacity: [0.09, 0.19],
    wash: { top: () => "#000000", bottom: () => "#3a0f08", topO: 0, bottomO: 0.5 },
    orb: { xFrac: 0.5, yFrac: 1.04, r: 80, color: () => "#ff6a2d" },
    silhouettes: [
      { kind: "rocks", heightFrac: 0.2, color: () => "#4a1b10", salt: 8 },
      { kind: "rocks", heightFrac: 0.12, color: () => "#2f0f08", salt: 9 },
    ],
  },
  koipond: {
    opacity: [0.11, 0.24],
    wash: { top: () => "#8fc3d4", bottom: () => "#1d5a4c", topO: 0.05, bottomO: 0.3 },
    rays: { count: 3, color: (c) => c.shimmer },
    fronds: { count: 9, height: [60, 160], sway: 14, width: 4.5, colors: () => ["#2e6b5a", "#3f8a6f"], leaves: true },
  },
  carnival: {
    opacity: [0.1, 0.21],
    garlands: 2,
    garlandColors: (c) => [c.accent, c.shimmer],
    silhouettes: [{ kind: "tents", heightFrac: 0.12, color: () => "#c2694a", salt: 10 }],
  },
  catnap: {
    opacity: [0.07, 0.16],
    crescent: { xFrac: 0.85, yFrac: 0.13, r: 22, color: (c) => c.shimmer },
    silhouettes: [
      { kind: "hills", heightFrac: 0.1, color: () => "#cbbfe4", salt: 11 },
      { kind: "hills", heightFrac: 0.06, color: () => "#b7a5d6", salt: 12 },
    ],
  },
  abyss: {
    opacity: [0.12, 0.26],
    wash: { top: () => "#000000", bottom: () => "#02121a", topO: 0, bottomO: 0.55 },
    rays: { count: 2, color: (c) => c.shimmer },
    fronds: { count: 8, height: [90, 210], sway: 10, width: 5.5, colors: () => ["#155264", "#1d6a7d"], leaves: true, tip: "bulb" },
  },
  pompom: {
    opacity: [0.08, 0.18],
    silhouettes: [
      { kind: "hills", heightFrac: 0.09, color: () => "#f7ddc4", salt: 13 },
      { kind: "hills", heightFrac: 0.055, color: () => "#f2c9a8", salt: 14 },
    ],
  },
  gravemist: {
    opacity: [0.06, 0.16],
    wash: { top: () => "#000000", bottom: (c) => c.inkFaint, topO: 0, bottomO: 0.18 },
    orb: { xFrac: 0.12, yFrac: 0.76, r: 18, color: (c) => c.shimmer },
    silhouettes: [
      { kind: "slabs", heightFrac: 0.09, color: (c) => c.inkFaint, salt: 15 },
      { kind: "slabs", heightFrac: 0.12, color: (c) => c.inkFaint, salt: 16 },
    ],
    deco: "tree",
  },
  summit: {
    opacity: [0.1, 0.22],
    wash: { top: () => "#bcd4e6", bottom: () => "#5c7284", topO: 0.12, bottomO: 0.28 },
    orb: { xFrac: 0.85, yFrac: 0.12, r: 30, color: (c) => c.shimmer },
    silhouettes: [
      { kind: "rocks", heightFrac: 0.3, color: () => "#8fa3b2", salt: 17 },
      { kind: "rocks", heightFrac: 0.18, color: () => "#6b8090", salt: 18 },
    ],
  },
};

export function sceneFor(theme: ThemeId): SceneSpec | undefined {
  return SCENES[theme];
}

/** Bottom silhouettes, built deterministically from the stage size. */
function silhouettePath(kind: SilhouetteKind, w: number, bottom: number, hMax: number, salt: number): string {
  let d = `M 0 ${bottom}`;
  let x = 0;
  let i = salt * 17;
  if (kind === "pines") {
    while (x < w) {
      const pw = 30 + seeded(i, 21) * 44;
      const ph = hMax * (0.45 + seeded(i, 22) * 0.55);
      d += ` L ${x + pw * 0.5} ${bottom - ph} L ${x + pw} ${bottom}`;
      x += pw * (0.7 + seeded(i, 20) * 0.5);
      i++;
    }
  } else if (kind === "tents") {
    while (x < w) {
      const pw = 70 + seeded(i, 21) * 60;
      const ph = hMax * (0.6 + seeded(i, 22) * 0.4);
      // a tent: curved sides meeting at a peak
      d += ` L ${x + 4} ${bottom}`;
      d += ` Q ${x + pw * 0.32} ${bottom - ph * 0.75} ${x + pw * 0.5} ${bottom - ph}`;
      d += ` Q ${x + pw * 0.68} ${bottom - ph * 0.75} ${x + pw - 4} ${bottom}`;
      x += pw + 26 + seeded(i, 23) * 60;
      i++;
    }
  } else if (kind === "towers") {
    while (x < w) {
      const tw = 18 + seeded(i, 24) * 30;
      const th = hMax * (0.25 + seeded(i, 25) * 0.75);
      d += ` L ${x} ${bottom} L ${x} ${bottom - th} L ${x + tw} ${bottom - th} L ${x + tw} ${bottom}`;
      x += tw + 8 + seeded(i, 26) * 26;
      i++;
    }
  } else if (kind === "rocks") {
    while (x < w) {
      const pw = 40 + seeded(i, 23) * 70;
      const ph = hMax * (0.3 + seeded(i, 24) * 0.7);
      d += ` L ${x + pw * (0.3 + seeded(i, 25) * 0.4)} ${bottom - ph} L ${x + pw} ${bottom - hMax * 0.12 * seeded(i, 26)}`;
      x += pw;
      i++;
    }
    d += ` L ${w} ${bottom}`;
  } else if (kind === "hills") {
    while (x < w) {
      const pw = 90 + seeded(i, 27) * 130;
      const ph = hMax * (0.5 + seeded(i, 28) * 0.5);
      d += ` Q ${x + pw / 2} ${bottom - ph * 2} ${x + pw} ${bottom}`;
      x += pw;
      i++;
    }
  } else {
    // slabs: quiet rounded stones, spaced apart in the grass
    x = 18 + seeded(i, 32) * 50;
    while (x < w - 30) {
      const sw = 24 + seeded(i, 29) * 16;
      const sh = hMax * (0.55 + seeded(i, 30) * 0.45) * 1.4;
      d += ` L ${x} ${bottom} L ${x} ${bottom - sh + 6} Q ${x} ${bottom - sh} ${x + sw / 2} ${bottom - sh}`;
      d += ` Q ${x + sw} ${bottom - sh} ${x + sw} ${bottom - sh + 6} L ${x + sw} ${bottom}`;
      x += sw + 70 + seeded(i, 31) * 140;
      i++;
    }
  }
  d += ` L ${w} ${bottom} Z`;
  return d;
}

/** Peaks of the tent row (same seeds as the silhouette), for the flags. */
function tentPeaks(w: number, bottom: number, hMax: number, salt: number): { x: number; y: number }[] {
  const peaks: { x: number; y: number }[] = [];
  let x = 0;
  let i = salt * 17;
  while (x < w) {
    const pw = 70 + seeded(i, 21) * 60;
    const ph = hMax * (0.6 + seeded(i, 22) * 0.4);
    peaks.push({ x: x + pw * 0.5, y: bottom - ph });
    x += pw + 26 + seeded(i, 23) * 60;
    i++;
  }
  return peaks;
}

/** Point on the frond's quadratic at t, given the animated bend. */
function frondPoint(x: number, baseY: number, h: number, b: number, t: number): { x: number; y: number } {
  "worklet";
  const cx = x + b * 0.35;
  const cy = baseY - h * 0.55;
  const ex = x + b;
  const ey = baseY - h;
  const u = 1 - t;
  return {
    x: u * u * x + 2 * u * t * cx + t * t * ex,
    y: u * u * baseY + 2 * u * t * cy + t * t * ey,
  };
}

function SceneFrond({
  x,
  baseY,
  h,
  sway,
  width,
  color,
  leafColor,
  leaves,
  tip,
  phase,
  speed,
  clock,
  still,
}: {
  x: number;
  baseY: number;
  h: number;
  sway: number;
  width: number;
  color: string;
  leafColor: string;
  leaves: boolean;
  tip?: "bulb" | "cattail";
  phase: number;
  speed: number;
  clock: SharedValue<number>;
  still: boolean;
}) {
  const bend = useDerivedValue(() => {
    if (still) return sway * 0.35;
    const t = Math.round(clock.value * 30) / 30; // 30Hz is plenty for a sway
    return Math.round(sway * Math.sin(t * speed + phase) * 10) / 10;
  }, [still, sway, speed, phase]);
  const blade = useAnimatedProps(() => {
    const b = bend.value;
    return { d: `M ${x} ${baseY} Q ${x + b * 0.35} ${baseY - h * 0.55} ${x + b} ${baseY - h}` };
  }, [x, baseY, h, bend]);
  const leafA = useAnimatedProps(() => {
    const p = frondPoint(x, baseY, h, bend.value, 0.45);
    return { cx: p.x, cy: p.y };
  }, [x, baseY, h, bend]);
  const leafB = useAnimatedProps(() => {
    const p = frondPoint(x, baseY, h, bend.value, 0.72);
    return { cx: p.x, cy: p.y };
  }, [x, baseY, h, bend]);
  const tipProps = useAnimatedProps(() => {
    const p = frondPoint(x, baseY, h, bend.value, 1);
    return { cx: p.x, cy: p.y };
  }, [x, baseY, h, bend]);
  return (
    <>
      <AnimatedPath animatedProps={blade} stroke={color} strokeWidth={width} strokeLinecap="round" fill="none" />
      {leaves && (
        <>
          <AnimatedCircle animatedProps={leafA} cx={x} cy={baseY} r={width * 0.9} fill={leafColor} />
          <AnimatedCircle animatedProps={leafB} cx={x} cy={baseY} r={width * 0.75} fill={leafColor} />
        </>
      )}
      {tip === "bulb" && (
        <AnimatedCircle animatedProps={tipProps} cx={x} cy={baseY} r={width * 0.95} fill={leafColor} />
      )}
      {tip === "cattail" && (
        <AnimatedCircle animatedProps={tipProps} cx={x} cy={baseY} r={width * 1.15} fill="#8a6b4a" />
      )}
    </>
  );
}

/** A slow diagonal light beam, swelling and fading like light through water. */
function SceneRay({
  x0,
  width,
  height,
  color,
  phase,
  clock,
  still,
}: {
  x0: number;
  width: number;
  height: number;
  color: string;
  phase: number;
  clock: SharedValue<number>;
  still: boolean;
}) {
  const o = useDerivedValue(() => {
    if (still) return 0.06;
    const t = Math.round(clock.value * 10) / 10; // rays swell over seconds
    return Math.round((0.04 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.25 + phase))) * 500) / 500;
  }, [still, phase]);
  const props = useAnimatedProps(() => ({ opacity: o.value }), [o]);
  const slant = height * 0.35;
  return (
    <AnimatedPath
      animatedProps={props}
      d={`M ${x0} 0 L ${x0 + width} 0 L ${x0 + width + slant} ${height} L ${x0 + slant} ${height} Z`}
      fill={color}
    />
  );
}

function SceneOrb({
  cx,
  cy,
  r,
  color,
  sunRays,
  still,
}: {
  cx: number;
  cy: number;
  r: number;
  color: string;
  sunRays?: boolean;
  still: boolean;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (still) {
      cancelAnimation(p);
      p.value = 0.5;
      return;
    }
    p.value = 0;
    p.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4200, easing: easeInOut }),
        withTiming(0, { duration: 4200, easing: easeInOut }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(p);
  }, [still, p]);
  const q = useDerivedValue(() => Math.round(p.value * 100) / 100, []);
  const inner = useAnimatedProps(() => ({ opacity: 0.55 + 0.25 * q.value, r: r * (0.94 + 0.08 * q.value) }), [r, q]);
  const outer = useAnimatedProps(() => ({ opacity: 0.2 + 0.12 * q.value, r: r * (1.6 + 0.15 * q.value) }), [r, q]);
  const rayEls: React.JSX.Element[] = [];
  if (sunRays) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r1 = r * 1.35;
      const r2 = r * (1.9 + seeded(i, 51) * 0.5);
      const spread = 0.09;
      rayEls.push(
        <Path
          key={i}
          d={`M ${cx + Math.cos(a - spread) * r1} ${cy + Math.sin(a - spread) * r1} L ${cx + Math.cos(a) * r2} ${cy + Math.sin(a) * r2} L ${cx + Math.cos(a + spread) * r1} ${cy + Math.sin(a + spread) * r1} Z`}
          fill={color}
          opacity={0.35}
        />,
      );
    }
  }
  return (
    <>
      <AnimatedCircle animatedProps={outer} cx={cx} cy={cy} r={r * 1.6} fill={color} />
      {rayEls}
      <AnimatedCircle animatedProps={inner} cx={cx} cy={cy} r={r} fill={color} />
    </>
  );
}

/**
 * The theme's stage dressing, in depth layers. Mount behind the weather;
 * opacity glides with the wholeness mood. Under reduced motion everything
 * renders, but perfectly still.
 */
export function ThemeScenery({
  theme,
  width,
  height,
  mood,
  shimmer,
  accent,
  inkFaint,
  bg,
  danger,
  reducedMotion,
  worldClock = null,
}: {
  theme: ThemeId;
  width: number;
  height: number;
  mood: number;
  shimmer: string;
  accent: string;
  inkFaint: string;
  bg: string;
  danger: string;
  reducedMotion: boolean;
  worldClock?: SharedValue<number> | null;
}) {
  const spec = sceneFor(theme);
  const moodSV = useSharedValue(mood);
  useEffect(() => {
    moodSV.value = withTiming(mood, { duration: 1200, easing: easeInOut });
    return () => cancelAnimation(moodSV);
  }, [mood, moodSV]);
  const ownClock = useSharedValue(0);
  const clock = worldClock ?? ownClock;
  const animated = !reducedMotion && !!(spec?.fronds || spec?.rays);
  useEffect(() => {
    if (worldClock || !animated) {
      cancelAnimation(ownClock);
      ownClock.value = 0;
      return;
    }
    ownClock.value = 0;
    ownClock.value = withRepeat(withTiming(3600, { duration: 3600_000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(ownClock);
  }, [worldClock, animated, ownClock]);

  const [o0, o1] = spec?.opacity ?? [0, 0];
  const wrapStyle = useAnimatedStyle(() => ({ opacity: o0 + (o1 - o0) * moodSV.value }), [o0, o1]);

  if (!spec || width <= 0 || height <= 0) return null;
  const colors: SceneColors = { shimmer, accent, inkFaint, bg, danger };
  const bottom = height - 24; // the pinned date strip owns the last band

  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0 }, wrapStyle]}>
      <Svg width={width} height={height}>
        {spec.wash && (
          <>
            <Defs>
              <LinearGradient id="scene-wash" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={spec.wash.top(colors)} stopOpacity={spec.wash.topO} />
                <Stop offset="1" stopColor={spec.wash.bottom(colors)} stopOpacity={spec.wash.bottomO} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={width} height={height} fill="url(#scene-wash)" />
          </>
        )}
        {spec.rays &&
          Array.from({ length: spec.rays.count }, (_, i) => (
            <SceneRay
              key={i}
              x0={width * (0.12 + 0.7 * seeded(i, 52))}
              width={26 + seeded(i, 53) * 40}
              height={height}
              color={spec.rays!.color(colors)}
              phase={seeded(i, 54) * Math.PI * 2}
              clock={clock}
              still={reducedMotion}
            />
          ))}
        {spec.crescent &&
          (() => {
            const c = spec.crescent!;
            const cx = width * c.xFrac;
            const cy = height * c.yFrac;
            return (
              <>
                <Circle cx={cx} cy={cy} r={c.r * 1.7} fill={c.color(colors)} opacity={0.18} />
                <Circle cx={cx} cy={cy} r={c.r} fill={c.color(colors)} />
                <Circle cx={cx + c.r * 0.42} cy={cy - c.r * 0.18} r={c.r * 0.88} fill={bg} />
              </>
            );
          })()}
        {spec.silhouettes?.map((layer, li) => (
          <Path
            key={li}
            d={silhouettePath(layer.kind, width, bottom, height * layer.heightFrac, layer.salt)}
            fill={layer.color(colors)}
            opacity={li === 0 && spec.silhouettes!.length > 1 ? 0.55 : 1}
          />
        ))}
        {spec.silhouettes
          ?.filter((l) => l.kind === "tents")
          .map((layer, li) =>
            tentPeaks(width, bottom, height * layer.heightFrac, layer.salt).map((p, i) => (
              <Path
                key={`${li}-${i}`}
                d={`M ${p.x} ${p.y} L ${p.x} ${p.y - 10} L ${p.x + 9} ${p.y - 7} L ${p.x} ${p.y - 4}`}
                stroke={layer.color(colors)}
                strokeWidth={1.5}
                fill={colors.shimmer}
              />
            )),
          )}
        {spec.deco === "brushMountains" && (
          <>
            {/* two sumi-e mountain strokes and the painter's red seal */}
            <Path
              d={`M ${-20} ${bottom - height * 0.13} C ${width * 0.2} ${bottom - height * 0.3}, ${width * 0.34} ${bottom - height * 0.05}, ${width * 0.55} ${bottom - height * 0.18} S ${width * 0.85} ${bottom - height * 0.08} ${width + 20} ${bottom - height * 0.22}`}
              stroke={colors.inkFaint}
              strokeWidth={7}
              strokeLinecap="round"
              fill="none"
              opacity={0.6}
            />
            <Path
              d={`M ${-20} ${bottom - height * 0.1} C ${width * 0.3} ${bottom - height * 0.2}, ${width * 0.5} ${bottom - height * 0.02}, ${width + 20} ${bottom - height * 0.14}`}
              stroke={colors.inkFaint}
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
            />
            <Rect x={width - 46} y={bottom - 40} width={16} height={16} rx={2} fill={colors.danger} opacity={0.8} />
          </>
        )}
        {spec.deco === "tree" && (
          <G opacity={0.85}>
            {/* a bare tree keeping watch by the stones */}
            <Path
              d={`M ${width * 0.82} ${bottom} C ${width * 0.82 - 4} ${bottom - 40}, ${width * 0.82 + 3} ${bottom - 58}, ${width * 0.82 - 6} ${bottom - 86}`}
              stroke={inkFaint}
              strokeWidth={5}
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d={`M ${width * 0.82 - 2} ${bottom - 48} C ${width * 0.82 + 18} ${bottom - 60}, ${width * 0.82 + 26} ${bottom - 76}, ${width * 0.82 + 38} ${bottom - 82}`}
              stroke={inkFaint}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d={`M ${width * 0.82 - 4} ${bottom - 66} C ${width * 0.82 - 22} ${bottom - 76}, ${width * 0.82 - 26} ${bottom - 92}, ${width * 0.82 - 40} ${bottom - 98}`}
              stroke={inkFaint}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          </G>
        )}
        {spec.fronds &&
          (() => {
            const f = spec.fronds!;
            const cols = f.colors(colors);
            return Array.from({ length: f.count }, (_, i) => {
              // clumped along the bottom, like real growth
              const clump = Math.floor(seeded(i, 40) * 3);
              const x = width * (0.08 + 0.36 * clump + 0.18 * seeded(i, 41));
              const h = f.height[0] + seeded(i, 42) * (f.height[1] - f.height[0]);
              return (
                <SceneFrond
                  key={i}
                  x={Math.min(x, width - 12)}
                  baseY={bottom}
                  h={h}
                  sway={f.sway * (0.7 + seeded(i, 43) * 0.6)}
                  width={f.width * (0.8 + seeded(i, 46) * 0.5)}
                  color={cols[i % cols.length]}
                  leafColor={cols[(i + 1) % cols.length]}
                  leaves={!!f.leaves}
                  tip={f.tip && seeded(i, 47) > 0.45 ? f.tip : undefined}
                  phase={seeded(i, 44) * Math.PI * 2}
                  speed={0.55 + seeded(i, 45) * 0.5}
                  clock={clock}
                  still={reducedMotion}
                />
              );
            });
          })()}
        {spec.orb && (
          <SceneOrb
            cx={width * spec.orb.xFrac}
            cy={height * spec.orb.yFrac}
            r={spec.orb.r}
            color={spec.orb.color(colors)}
            sunRays={spec.orb.sunRays}
            still={reducedMotion}
          />
        )}
        {spec.garlands &&
          Array.from({ length: spec.garlands }, (_, row) => {
            const gcols = (spec.garlandColors ?? ((c: SceneColors) => [c.accent, c.shimmer] as [string, string]))(colors);
            const y0 = 10 + row * 26;
            const sag = 30 + row * 10;
            const N = Math.max(6, Math.round(width / 90));
            const flags: React.JSX.Element[] = [];
            for (let i = 0; i < N; i++) {
              const t = i / N;
              const t2 = (i + 0.5) / N;
              const px = width * t;
              const py = y0 + sag * 4 * t * (1 - t);
              const qx = width * t2;
              const qy = y0 + sag * 4 * t2 * (1 - t2);
              flags.push(
                <Path
                  key={i}
                  d={`M ${px} ${py} L ${qx} ${qy} L ${(px + qx) / 2} ${py + 15} Z`}
                  fill={(i + row) % 2 === 0 ? gcols[0] : gcols[1]}
                />,
              );
            }
            return (
              <G key={row} opacity={row === 0 ? 1 : 0.6}>
                <Path
                  d={`M 0 ${y0} Q ${width / 2} ${y0 + sag * 2} ${width} ${y0}`}
                  stroke={gcols[0]}
                  strokeWidth={2}
                  fill="none"
                />
                {flags}
              </G>
            );
          })}
      </Svg>
    </Animated.View>
  );
}

// ─── Token drop ──────────────────────────────────────────────────────────────
// A genuine turn-down (or a charging bonk) can shake a token out of the
// thread: it pops off the line, hangs there flipping like the treasure it
// is, then flies into the bonk pill and becomes charge. Every theme drops
// its own kind of treasure — same pixel language as Pip.

/**
 * Pixel grids per theme. Letters: G base · H shine · S shade · D rim/dark ·
 * W white · '.' empty. All colors derive from the theme's shimmer gold, so
 * a token always looks native to its map.
 */
const DEFAULT_TOKEN = [
  // the gold coin
  "..DDDD..",
  ".DGGHGD.",
  "DGGHHSGD",
  "DGHHGSGD",
  "DGHHGSGD",
  "DGGHHSGD",
  ".DGGSGD.",
  "..DDDD..",
];

const TOKENS: Partial<Record<ThemeId, string[]>> = {
  midnight: [
    // four-point star
    "....G....",
    "....H....",
    "...GHG...",
    ".GGHWHGG.",
    "GHHWWWHHG",
    ".GGHWHGG.",
    "...GHG...",
    "....H....",
    "....G....",
  ],
  sunprint: [
    // little sun, rays out (solid core: white washes out on light maps)
    "G...G...G",
    ".G.GHG.G.",
    "..GHHHG..",
    ".GHHHHHG.",
    "GHHHWHHHG",
    ".GHHHHHG.",
    "..GHHHG..",
    ".G.GHG.G.",
    "G...G...G",
  ],
  duskwood: [
    // acorn from the dusk woods
    "...DDD...",
    "..DSSSD..",
    ".DSSSSSD.",
    "DSSSSSSSD",
    ".GGGGGGG.",
    ".GHHHHHG.",
    "..GHHHG..",
    "...GGG...",
  ],
  demonfire: [
    // a stray ember
    "....G....",
    "...GG....",
    "...GHG...",
    "..GHHG.G.",
    ".GHHHHGG.",
    ".GHWWHHG.",
    "GHWWWWHG.",
    ".GHWWHG..",
    "..GGGG...",
  ],
  koipond: [
    // a golden koi
    "..GGGG...",
    ".GHHHHG.G",
    "GHWDHHHGG",
    "GHHHHHHGG",
    ".GHHHHG.G",
    "..GGGG...",
  ],
  carnival: [
    // a ticket stub, perforation down the middle
    "GGGGGGGGG",
    "GHHHHHHHG",
    ".HHSHSHH.",
    ".HHSHSHH.",
    "GHHHHHHHG",
    "GGGGGGGGG",
  ],
  catnap: [
    // a ball of yarn, two strands sweeping around it
    "..DDDD..",
    ".DGGGSD.",
    "DGSSSGGD",
    "DSGGGGSD",
    "DGGSSSGD",
    ".DSGGGD.",
    "..DDDD..",
  ],
  abyss: [
    // an air bubble
    "..DDDD..",
    ".D....D.",
    "D.WW...D",
    "D.W....D",
    "D......D",
    "D....W.D",
    ".D....D.",
    "..DDDD..",
  ],
  gravemist: [
    // a will-o'-wisp
    "....G...",
    "...GH...",
    "...GHG..",
    "..GHHG..",
    "..GHWHG.",
    ".GHWWHG.",
    ".GHWWG..",
    "..GGG...",
  ],
  pompom: [
    // a pompom puff — solid fluff, ragged edge, a top shine
    ".G.GG.G.",
    "GGGHHGGG",
    ".GHHGGG.",
    "GGHGGGSG",
    "GGGGGGSG",
    ".GGGSSG.",
    "GGGGGGGG",
    ".G.GG.G.",
  ],
};

export function tokenRowsFor(theme: ThemeId): string[] {
  return TOKENS[theme] ?? DEFAULT_TOKEN;
}

const COIN_PX = 2.6;

/** The token's pixel body, centered on (0,0) so a flip can spin it in place. */
function TokenPixels({ rows, gold }: { rows: string[]; gold: string }) {
  const pal: Record<string, string> = {
    G: gold,
    H: mix(gold, "#ffffff", 55),
    S: mix(gold, "#000000", 30),
    D: mix(gold, "#000000", 58),
    W: "#ffffff",
  };
  const halfH = (rows.length * COIN_PX) / 2;
  const halfW = (rows[0].length * COIN_PX) / 2;
  const cells: { x: number; y: number; k: string }[] = [];
  rows.forEach((row, r) => {
    row.split("").forEach((k, c) => {
      if (k !== ".") cells.push({ x: c * COIN_PX - halfW, y: r * COIN_PX - halfH, k });
    });
  });
  return (
    <>
      {cells.map((p, i) => (
        <Rect key={i} x={p.x} y={p.y} width={COIN_PX - 0.12} height={COIN_PX - 0.12} fill={pal[p.k]} />
      ))}
    </>
  );
}

/** How high above the line a waiting token hovers — clear of Pip's hat, under the main line. */
export const COIN_HOVER = 30;
/** How far ahead of the line's endpoint the token lands (a step to Pip's right). */
export const COIN_LEAD = 24;

/**
 * `.coin-token` — a waiting token, anchored to its thread's endpoint
 * (x, y are world coords; re-render moves it with pans). Pops up off the
 * line and flips in place until the flight to the meter takes over
 * (the parent swaps this for a TokenFly). Transient FX: full-rate motion
 * is intentional.
 */
export function CoinToken({ x, y, gold, accent, theme, fade = 1, reducedMotion }: {
  x: number;
  y: number;
  gold: string;
  accent: string;
  theme: ThemeId;
  /** Canvas-edge fade, 0..1 (same math as Pip). */
  fade?: number;
  reducedMotion: boolean;
}) {
  const ty = useSharedValue(0);
  const spin = useSharedValue(0.25); // start face-on
  const bob = useSharedValue(0);
  const spawnT = useSharedValue(0);
  const appear = useSharedValue(0);
  const rows = tokenRowsFor(theme);

  useEffect(() => {
    appear.value = withTiming(1, { duration: reducedMotion ? 400 : 120 });
    if (reducedMotion) {
      ty.value = -COIN_HOVER;
      return () => cancelAnimation(appear);
    }
    // the block moment: launch past the hover point, then settle onto it
    ty.value = 0;
    ty.value = withSequence(
      withTiming(-COIN_HOVER - 16, { duration: 280, easing: Easing.out(Easing.quad) }),
      withTiming(-COIN_HOVER, { duration: 300, easing: Easing.bounce }),
    );
    spawnT.value = 0;
    spawnT.value = withTiming(1, { duration: 750, easing: Easing.out(Easing.quad) });
    // the idle flip — every treasure flips like the coin it stands in for
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: 760, easing: Easing.linear }), -1);
    bob.value = 0;
    bob.value = withDelay(
      580,
      withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
    return () => {
      cancelAnimation(ty);
      cancelAnimation(spin);
      cancelAnimation(bob);
      cancelAnimation(spawnT);
      cancelAnimation(appear);
    };
  }, [ty, spin, bob, spawnT, appear, reducedMotion]);

  const coinProps = useAnimatedProps(() => {
    const flip = reducedMotion ? 1 : Math.cos(spin.value * Math.PI * 2);
    return {
      translateX: x,
      translateY: y + ty.value + bob.value * 3,
      scaleX: Math.max(0.08, Math.abs(flip)),
      opacity: appear.value * fade,
    };
  });

  return (
    <G pointerEvents="none">
      <AnimatedGFx animatedProps={coinProps}>
        <TokenPixels rows={rows} gold={gold} />
      </AnimatedGFx>
      {/* spawn spray: the line letting go of it */}
      {!reducedMotion &&
        [0, 1, 2, 3, 4].map((i) => (
          <Fleck
            key={`s${i}`}
            x={x}
            y={y - 4}
            angle={-Math.PI / 2 + (i - 2) * 0.55}
            dist={16}
            size={1.7}
            color={i % 2 === 0 ? gold : accent}
            rise={6}
            delay={i * 0.06}
            t={spawnT}
          />
        ))}
    </G>
  );
}

/** Flight time of a token into the meter (the parent collects on this beat). */
export const COIN_FLY_MS = 650;

/**
 * `.token-fly` — the collect: the token leaves its thread and accelerates
 * into the bonk pill, spinning into a blur, NSMB-coin style. Screen-space
 * overlay (like ReclaimFly); the parent unmounts it after COIN_FLY_MS and
 * banks the charge.
 */
export function TokenFly({ x0, y0, x1, y1, gold, theme }: {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  gold: string;
  theme: ThemeId;
}) {
  const p = useSharedValue(0);
  const spin = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withTiming(1, { duration: COIN_FLY_MS, easing: Easing.in(Easing.quad) });
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: 180, easing: Easing.linear }), -1);
    return () => {
      cancelAnimation(p);
      cancelAnimation(spin);
    };
  }, [p, spin]);
  const style = useAnimatedStyle(() => {
    const t = p.value;
    return {
      opacity: t > 0.86 ? Math.max(0, 1 - (t - 0.86) / 0.14) : 1,
      transform: [
        { translateX: x0 + (x1 - x0) * t },
        // a light upward arc before the dive into the pill
        { translateY: y0 + (y1 - y0) * t - 30 * Math.sin(t * Math.PI) },
        { scale: 1 - 0.5 * t },
        { scaleX: Math.max(0.12, Math.abs(Math.cos(spin.value * Math.PI * 2))) },
      ],
    };
  });
  const rows = tokenRowsFor(theme);
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: -14, top: -14 }, style]}>
      <Svg width={28} height={28} viewBox="-14 -14 28 28">
        <TokenPixels rows={rows} gold={gold} />
      </Svg>
    </Animated.View>
  );
}

/**
 * `.charge-pop` — the "+10" that hops off the bonk pill as a token lands:
 * the reward, made visible where it now lives.
 */
export function ChargePop({ right, bottom, label, color }: {
  right: number;
  bottom: number;
  label: string;
  color: string;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) });
    return () => cancelAnimation(t);
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.12 ? t.value * 8 : Math.max(0, 1.2 - t.value * 1.2),
    transform: [{ translateY: -t.value * 30 }, { scale: 1 + t.value * 0.25 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", right, bottom }, style]}>
      <Animated.Text style={{ color, fontWeight: "800", fontSize: 15 }}>{label}</Animated.Text>
    </Animated.View>
  );
}

/**
 * `.pop-burst` — the release of a completed press-and-hold: one soft ring
 * and a few flecks where the thread just "popped" into its panel. Self-
 * driving; the parent mounts it keyed and clears it on a short timer.
 */
export function PopBurst({ x, y, color }: { x: number; y: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) });
    return () => cancelAnimation(t);
  }, [t]);
  return (
    <G pointerEvents="none">
      <Shockwave x={x} y={y} color={color} t={t} scale={0.55} />
      {[0, 1, 2, 3, 4].map((i) => (
        <Fleck
          key={i}
          x={x}
          y={y}
          angle={-Math.PI / 2 + (i - 2) * 0.62}
          dist={18}
          size={1.8}
          color={color}
          rise={7}
          delay={i * 0.05}
          t={t}
        />
      ))}
    </G>
  );
}
