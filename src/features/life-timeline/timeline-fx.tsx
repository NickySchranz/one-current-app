import { useEffect } from "react";
import Animated, {
  cancelAnimation,
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
import { Circle, G, Path, Text as SvgText } from "react-native-svg";
import type { PathProps } from "react-native-svg";
import type { ThemeId } from "@/visualization/theme";
import { pathLength, samplePath } from "@/visualization/path-sample";

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

  const props = useAnimatedProps(
    () => ({ opacity: opacity.value, r: 14 * scale.value, cy: cy + ty.value }),
    [cy],
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
  return useAnimatedProps(() => ({ strokeDashoffset: sv.value }));
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
  | "pompom";

export function attackVariantFor(theme: ThemeId): AttackVariant {
  switch (theme) {
    case "demonfire":
    case "koipond":
    case "carnival":
    case "catnap":
    case "abyss":
    case "gravemist":
    case "pompom":
      return theme;
    default:
      return "generic";
  }
}

/** One flying particle of an impact: shoots outward, arcs, fades. */
function Fleck({ x, y, angle, dist, size, color, rise, delay, t }: {
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
function Shockwave({ x, y, color, t, scale = 1 }: {
  x: number;
  y: number;
  color: string;
  t: SharedValue<number>;
  scale?: number;
}) {
  const props = useAnimatedProps(() => ({
    r: Math.max(0.1, 5 + t.value * 40 * scale),
    opacity: (1 - t.value) * 0.55,
    strokeWidth: Math.max(0.2, 2.4 * (1 - t.value)),
  }));
  return <AnimatedCircleFx cx={x} cy={y} fill="none" stroke={color} animatedProps={props} />;
}

/**
 * `.attack-fx` — the moment Pip's strike lands on a thread. A shockwave, a
 * spray of theme-true particles at the creature's spot, and the line itself
 * flashing and shaking. Purely visual; the loudness already dropped.
 */
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

export function AttackFx({ x, y, path, variant, accent, calm }: {
  x: number;
  y: number;
  path: string;
  variant: AttackVariant;
  accent: string;
  calm: boolean;
}) {
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

  const P: Record<AttackVariant, { colors: string[]; n: number; rise: number; spread: number; extra?: "slash" | "ripple" | "whoosh" | "bang" | "wisp" }> = {
    generic: { colors: [accent, "#ffffff"], n: 16, rise: 8, spread: 44, extra: "slash" },
    demonfire: { colors: ["#8a8a8a", "#bdbdbd", EMBER], n: 12, rise: 22, spread: 22 },
    koipond: { colors: ["#9fd4e8", "#d7f0fa", "#6db8d6"], n: 12, rise: 14, spread: 26, extra: "ripple" },
    carnival: { colors: ["#ffd166", "#ef66a6", "#7bdff2"], n: 14, rise: 10, spread: 32, extra: "whoosh" },
    catnap: { colors: ["#cfc3b8", "#9c8f83"], n: 8, rise: 16, spread: 18, extra: "bang" },
    abyss: { colors: ["#7fe0d6", "#3f8f88"], n: 10, rise: -14, spread: 20 },
    gravemist: { colors: ["#cdd6dd", "#93a1ac"], n: 9, rise: 10, spread: 34, extra: "wisp" },
    pompom: { colors: ["#f2c9a0", "#e8b184", "#fff1df"], n: 13, rise: 12, spread: 24 },
  };
  const cfg = P[variant];

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

const AnimatedGFx = Animated.createAnimatedComponent(G);

/**
 * Pip's strike: windup squash, a leap at the line, a jolt on landing, and a
 * little hop back — all as one transform burst around the sprite.
 */
export function LungeG({ active, dx, dy, children }: {
  active: boolean;
  dx: number;
  dy: number;
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
      translateY: dy * leap - Math.sin(leap * Math.PI) * 10,
      scaleY: squash,
      rotation: leap * (dx >= 0 ? 9 : -9),
    };
  });
  return <AnimatedGFx animatedProps={props}>{children}</AnimatedGFx>;
}

/** The "−1" that floats off a struck thread: the mechanic, made visible. */
function MinusOne({ x, y, color, t }: {
  x: number;
  y: number;
  color: string;
  t: SharedValue<number>;
}) {
  const props = useAnimatedProps(() => ({
    y: y - 16 - t.value * 26,
    opacity: t.value < 0.12 ? t.value * 8 : Math.max(0, 1.15 - t.value * 1.15),
    fontSize: 15 + t.value * 4,
  }));
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
