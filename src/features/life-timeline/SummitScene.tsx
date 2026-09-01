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
/**
 * The rock's surface, poking in or out at a given angle around it and depth
 * down it. The silhouette's edge is this function sampled at the angle facing
 * the edge — so when the mountain is turned, the edge changes shape: that is
 * what makes it read as a solid being turned rather than a flat cut-out.
 */
function surfaceBulge(theta: number, y: number): number {
  return (
    0.6 * Math.sin(3 * theta + y / 230) +
    0.4 * Math.sin(5 * theta - y / 370 + 1.7)
  );
}

function flank(
  routeX: number,
  /** The summit tip — the profile's origin, wherever the band starts. */
  peakY: number,
  fromY: number,
  toY: number,
  /** The rock's maximum half-width (faceHalf). */
  faceHalf: number,
  side: 1 | -1,
  salt: number,
  scale: number,
  /** How far the mountain is turned (radians). */
  rot: number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  // Sampled on an ABSOLUTE altitude grid (not `span / steps`): when the drawn
  // band changes, the vertices must land on the same altitudes as before or
  // the whole silhouette re-shapes itself in one frame.
  const GRID = 46;
  const first = Math.ceil(fromY / GRID) * GRID;
  for (let y = first; y < toY; y += GRID) {
    const hw = mountainHalfWidth(y - peakY, faceHalf, scale);
    // seeded by ALTITUDE, so the same rock keeps the same edge for ever…
    const k = Math.round(y / GRID);
    const jy = (seeded(k, salt + 1) - 0.5) * 16;
    // …and shaped by the rock's surface at the angle now facing this edge, so
    // turning the mountain turns its outline with it
    const edgeAngle = rot + (side === 1 ? Math.PI / 2 : -Math.PI / 2);
    const jx =
      (seeded(k, salt) - 0.5) * Math.min(10, hw * 0.08) +
      surfaceBulge(edgeAngle + k * 0.21, y) * Math.min(26, hw * 0.09);
    pts.push({
      x: Math.round(routeX + side * (hw + jx)),
      y: Math.round(y + jy),
    });
  }
  // the band always closes exactly on its lower edge
  pts.push({
    x: Math.round(routeX + side * mountainHalfWidth(toY - peakY, faceHalf, scale)),
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
  faceHalf,
  faceLeft,
  timeLen,
  rot,
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
  /** How far the rock reaches right / left (see faceHalfFor). */
  faceHalf: number;
  faceLeft: number;
  /** How far the mountain is turned (radians, quantized by the stage). */
  rot: number;
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
      const hwR = mountainHalfWidth(y - peakY, faceHalf, timeLen) * 0.82 - 12;
      const hwL = mountainHalfWidth(y - peakY, faceLeft, timeLen) * 0.82 - 12;
      const hw = hwR;
      if (hwR < 14) continue;
      // Marks sit at an ANGLE around the rock, so turning slides them across
      // the face and bunches them toward the edge — the same mapping the ropes
      // use, which is what makes the face itself read as turning.
      const span = (t: number) => {
        const theta = (t - 0.5) * 2.4 + rot;
        const reach = Math.sin(theta) >= 0 ? hwR : hwL;
        return routeX + Math.sin(theta) * reach;
      };
      for (let k = 0; k < 2; k++) {
        const j = i + k;
        const cx = span(seeded(j, 71));
        const yy = Math.round(y + (seeded(j, 72) - 0.5) * 26);
        // A seam runs rightward from where it starts, so it has to be cut to
        // the rock remaining at that altitude — otherwise strata stick out
        // into the sky, which is invisible only while the rock is a wall.
        const room = routeX + hwR - cx;
        const len = Math.round(Math.min(34 + seeded(j, 73) * 96, Math.max(0, room)));
        if (len < 12) continue;
        const tilt = Math.round((seeded(j, 74) - 0.5) * 14);
        seams += `M ${Math.round(cx)} ${yy} l ${len} ${tilt} `;
      }
      for (let k = 0; k < 3; k++) {
        const j = i + 3 + k;
        const cx = Math.round(span(seeded(j, 75)));
        const yy = Math.round(y + seeded(j, 76) * step);
        grit += `M ${cx} ${yy} l ${1 + Math.round(seeded(j, 77) * 3)} 0 `;
      }
    }
    return { seams, grit };
  }, [routeX, peakY, start, end, faceHalf, faceLeft, timeLen, rot]);
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

/**
 * The mountains BEYOND this one: jagged cliff edges standing in the sky on
 * either side of the near rock. They are what make the face read as a mountain
 * seen from the side rather than a wall with an edge, and — drifting at a
 * fraction of the climb — they are also the depth cue that says he is gaining
 * height. Deterministic and periodic in altitude, so every band of the climb
 * has ridges in it.
 */
export function DistantCliffs({
  routeX,
  faceHalf,
  width,
  timeLen,
  bandAnchor,
  /** 0 = pinned, 1 = travels with the rock. Two layers, two rates. */
  rate,
  salt,
  tone,
  opacity,
  tk,
}: {
  routeX: number;
  faceHalf: number;
  width: number;
  timeLen: number;
  bandAnchor: number;
  rate: number;
  salt: number;
  tone: string;
  opacity: number;
  tk: ThemeTokens;
}) {
  const paths = useMemo(() => {
    // The sky each side of the near rock is where these live.
    const skyL = Math.max(0, routeX - faceHalf);
    const skyR = Math.max(0, width - (routeX + faceHalf));
    const STEP = 88;
    const top = bandAnchor - 1.3 * timeLen;
    const bottom = bandAnchor + 2.3 * timeLen;
    const first = Math.ceil(top / STEP) * STEP;
    const side = (edgeX: number, room: number, inward: 1 | -1, sSalt: number) => {
      if (room < 18) return "";
      // crest sits partway out into the sky, jagging as it descends
      const base = edgeX + inward * room * 0.52;
      let d = `M ${Math.round(edgeX)} ${Math.round(top)}`;
      for (let y = first; y < bottom; y += STEP) {
        const k = Math.round(y / STEP);
        const j = seeded(k, sSalt);
        const j2 = seeded(k, sSalt + 3);
        const x = base + inward * room * (0.34 * j - 0.1);
        // a notch every few steps reads as a cliff edge rather than a hill
        const notch = j2 > 0.72 ? inward * room * 0.22 : 0;
        d += ` L ${Math.round(x)} ${Math.round(y - STEP * 0.34)}`;
        d += ` L ${Math.round(x + notch)} ${Math.round(y)}`;
      }
      d += ` L ${Math.round(edgeX)} ${Math.round(bottom)} Z`;
      return d;
    };
    // Only the right: the rock runs off the left edge, so there is no sky
    // there to stand a range in.
    void skyL;
    return [side(width, skyR, -1, salt + 7)].filter(Boolean);
  }, [routeX, faceHalf, width, timeLen, bandAnchor, salt]);
  return (
    <G pointerEvents="none">
      {paths.map((d, i) => (
        <Path key={i} d={d} fill={tone} opacity={opacity} />
      ))}
      {paths.map((d, i) => (
        <Path
          key={`e${i}`}
          d={d}
          fill="none"
          stroke={tk.inkSoft}
          strokeWidth={1.2}
          opacity={opacity * 0.5}
        />
      ))}
    </G>
  );
}

export function MountainFace({
  routeX,
  peakY,
  faceHalf,
  faceLeft,
  timeLen,
  depth,
  bandAnchor,
  rot,
  tk,
}: {
  routeX: number;
  /** The summit's tip. */
  peakY: number;
  /** How far the rock reaches right — the side whose edge is in frame. */
  faceHalf: number;
  /** How far it reaches left — off the screen. */
  faceLeft: number;
  timeLen: number;
  /** How far below the dated canvas the rock keeps going. */
  depth: number;
  /** The layer coordinate that the top of the viewport currently sits at —
   * i.e. minus how far this layer has been translated down (the climb). */
  bandAnchor?: number;
  /** How far the mountain is turned (radians, quantized by the stage). */
  rot: number;
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
    const left = flank(routeX, peakY, top, drawBottom, faceLeft, -1, 31, timeLen, rot);
    const right = flank(routeX, peakY, top, drawBottom, faceHalf, 1, 33, timeLen, rot);
    let d = `M ${left[left.length - 1].x} ${drawBottom}`;
    for (let i = left.length - 1; i >= 0; i--) d += ` L ${left[i].x} ${left[i].y}`;
    if (apex) {
      d += ` L ${routeX} ${Math.round(peakY)}`;
    } else {
      // a straight seam across the band's top, off-screen either way
      d += ` L ${Math.round(routeX - mountainHalfWidth(top - peakY, faceLeft, timeLen))} ${Math.round(top)}`;
      d += ` L ${Math.round(routeX + mountainHalfWidth(top - peakY, faceHalf, timeLen))} ${Math.round(top)}`;
    }
    for (const p of right) d += ` L ${p.x} ${p.y}`;
    return d + ` L ${right[right.length - 1].x} ${drawBottom} Z`;
  }, [routeX, peakY, drawTop, drawBottom, faceHalf, faceLeft, timeLen, rot]);
  // the snow cap: the top ~110px of both flanks, closed with a ragged hem
  const cap = useMemo(() => {
    // a fifth of the stage: a cap you can see, at any stage size
    const drop = Math.round(0.22 * timeLen);
    const capBottom = peakY + drop;
    const left = flank(routeX, peakY, peakY, capBottom, faceLeft, -1, 31, timeLen, rot);
    const right = flank(routeX, peakY, peakY, capBottom, faceHalf, 1, 33, timeLen, rot);
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
  }, [routeX, peakY, faceHalf, faceLeft, timeLen, rot]);
  // The rock has to read AGAINST the sky now that its flanks are in frame: a
  // near-background fill made the silhouette invisible except as a hairline.
  const rock = mix(tk.inkFaint, tk.bg, 34);
  return (
    <G pointerEvents="none">
      <Path d={body} fill={rock} opacity={0.66} />
      <Path d={body} fill="none" stroke={tk.inkSoft} strokeWidth={2} opacity={0.5} />
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
export function RopeCut({
  path,
  /** Where along the rope the cut lands (world y). Defaults to just under the
   * anchor, which is right for a short rope — but a summit rope's anchor is
   * thousands of px above the viewport, so the caller passes the height the
   * climber is actually working at, or the cut and its fray play off-screen. */
  cutY,
  durationMs = 2800,
}: {
  path: string;
  cutY?: number;
  durationMs?: number;
}) {
  const pts = useMemo(() => samplePath(path, 8), [path]);
  const total = pts.length > 0 ? pts[pts.length - 1].s : 0;
  const cutS = useMemo(() => {
    if (cutY === undefined || pts.length === 0) return Math.max(0, total - 34);
    let best = pts[0];
    for (const pt of pts) if (Math.abs(pt.y - cutY) < Math.abs(best.y - cutY)) best = pt;
    return Math.max(0, Math.min(total, best.s));
  }, [cutY, pts, total]);

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
