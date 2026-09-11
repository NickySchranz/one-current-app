import { useMemo } from "react";
import {
  Canvas,
  DashPathEffect,
  Path as SkPath,
  Skia,
  type SkPath as SkPathType,
} from "@shopify/react-native-skia";
import { useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import { swayOffsetAt } from "../useSquiggle";
import { countPathBuildUI } from "@/dev/perf-counters";
import type { RopeSpec } from "./rope-spec";

/**
 * Every summit rope, on one canvas, driven entirely by shared values.
 *
 * The point is not that Skia draws faster — though the benchmark says about
 * five times cheaper in script, and flat in node count where SVG's climbs.
 * The point is what a redraw costs: nothing here touches the DOM, React, or
 * the layout memo. The camera (climb, turn, pan) lives in shared values, so
 * moving the world is a UI-thread recompute of a few hundred path points and
 * a repaint — no reconciliation of forty-four components across twelve
 * hundred SVG nodes, which is what a pan costs today.
 *
 * React's only job here is to say which ropes exist. It re-renders when the
 * world changes — a thread appears, is answered, the layout is rebuilt — and
 * never because a finger moved.
 */
export function SummitRopesCanvas({
  ropes,
  climb,
  rot,
  pan,
  clock,
  width,
  height,
  reducedMotion,
}: {
  ropes: RopeSpec[];
  /** The mountain's slide. Coiled ropes ride it; hanging ones do not. */
  climb: SharedValue<number>;
  /** The face's turn, in radians. */
  rot: SharedValue<number> | null;
  /** Transient pan, un-committed. Zero until the drag work lands. */
  pan: SharedValue<number> | null;
  clock: SharedValue<number>;
  width: number;
  height: number;
  reducedMotion: boolean;
}) {
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      {ropes.map((r) => (
        <Rope
          key={r.id}
          spec={r}
          climb={climb}
          rot={rot}
          pan={pan}
          clock={clock}
          height={height}
          reducedMotion={reducedMotion}
        />
      ))}
    </Canvas>
  );
}

/** How far past the canvas edge a rope keeps drawing, so it enters from off. */
const MARGIN = 120;
/** Knots per 900px wavelength. Four reproduces a sine to the pixel. */
const KNOTS_PER_WAVE = 4;
const WAVELENGTH = 900;

function Rope({
  spec,
  climb,
  rot,
  pan,
  clock,
  height,
  reducedMotion,
}: {
  spec: RopeSpec;
  climb: SharedValue<number>;
  rot: SharedValue<number> | null;
  pan: SharedValue<number> | null;
  clock: SharedValue<number>;
  height: number;
  reducedMotion: boolean;
}) {
  // One path for this rope's lifetime, rewound and refilled each frame. A
  // fresh Skia.Path.Make() per frame costs about twenty times this — it is
  // what made the first run of the benchmark say Skia was the slower of the
  // two.
  const path = useMemo(() => Skia.Path.Make(), []);
  const tick = useDerivedValue(
    () => (reducedMotion ? 0 : Math.round(clock.value * 30) / 30),
    [clock, reducedMotion],
  );

  /**
   * What the path was last built from.
   *
   * A derived value re-runs whenever anything it reads is written, and the
   * world clock is written on every displayed frame — so without this, all
   * forty-four ropes rebuilt sixty times a second at idle, including the
   * twenty-odd hidden round the back of the mountain. The sway is quantized
   * to 30Hz and the camera to a half pixel (as everything else on this map
   * is), so most of those frames asked for a path identical to the one
   * already in hand. Now they get it.
   */
  const lastT = useSharedValue(Number.NaN);
  const lastTurn = useSharedValue(Number.NaN);
  const lastShift = useSharedValue(Number.NaN);

  const drawn = useDerivedValue<SkPathType>(() => {
    const t = tick.value;
    const turn = rot ? rot.value : 0;
    // A coiled rope is fixed to the rock and travels with it; a hanging one
    // is in the climber's own frame and does not.
    const shift =
      Math.round(((spec.coiled ? climb.value : 0) + (pan ? pan.value : 0)) * 2) / 2;

    // Round the back of the mountain nothing of this rope is drawn, so
    // nothing of it needs building either — and at rest that is half of them.
    if (Math.cos(spec.angle + turn) <= -0.12) {
      if (!path.isEmpty()) path.reset();
      lastT.value = Number.NaN;
      return path;
    }
    if (t === lastT.value && turn === lastTurn.value && shift === lastShift.value) {
      return path;
    }
    lastT.value = t;
    lastTurn.value = turn;
    lastShift.value = shift;
    countPathBuildUI();

    // The rope's live column: its resting x plus how far the turn carries it.
    const dx = Math.sin(spec.angle + turn) * spec.radius - Math.sin(spec.angle) * spec.radius;

    const total = spec.bottom - spec.top;
    const from = Math.max(spec.top, -MARGIN - shift);
    const to = Math.min(spec.bottom, height + MARGIN - shift);

    path.reset();
    if (to <= from || total <= 0) return path;

    const span = to - from;
    const knots = Math.max(3, Math.ceil((span / WAVELENGTH) * KNOTS_PER_WAVE) + 1);
    const dy = span / (knots - 1);
    const xs: number[] = [];
    for (let i = 0; i < knots; i++) {
      const y = from + i * dy;
      // `a` is arc distance below the ANCHOR, which is the top of a hanging
      // rope — the free end swings, the anchor does not. Measuring it from
      // the free end instead pins the wrong end and the rope hangs dead
      // straight. The SVG rope and the climber's grip both use this same
      // argument and all three have to agree exactly, or his hands come off
      // the rope he is holding.
      const off = swayOffsetAt(y - spec.top, total, spec.level, spec.phase, t, 1);
      xs.push(spec.ax + dx + off);
    }
    // Catmull-Rom through the knots as cubics: the curve passes through every
    // sample, so the sine is reproduced rather than chorded. Four knots per
    // wavelength against the ~50 line segments the SVG rope needs for the
    // same span.
    path.moveTo(xs[0], from + shift);
    for (let i = 0; i < knots - 1; i++) {
      const x0 = xs[Math.max(0, i - 1)];
      const x1 = xs[i];
      const x2 = xs[i + 1];
      const x3 = xs[Math.min(knots - 1, i + 2)];
      const y1 = from + i * dy + shift;
      const y2 = y1 + dy;
      path.cubicTo(x1 + (x2 - x0) / 6, y1 + dy / 3, x2 - (x3 - x1) / 6, y2 - dy / 3, x2, y2);
    }
    return path;
  }, [tick, rot, pan, climb, path, lastT, lastTurn, lastShift]);

  // Round the back of the mountain the rope is gone, and not in the way.
  const faded = useDerivedValue(() => {
    const turn = rot ? rot.value : 0;
    const facing = Math.cos(spec.angle + turn);
    const seen = facing <= -0.12 ? 0 : Math.min(1, (facing + 0.12) / 0.45);
    return spec.opacity * seen;
  }, [rot]);

  // One geometry, three paints — the underlay, the core and the highlight
  // were three SVG nodes each carrying their own copy of the same string.
  // The same three layers BranchLine paints, off one geometry instead of
  // three copies of one string: a dark round under-stroke for the cylinder,
  // the coloured core, and the dashed twist ridges over it.
  const underlay = useDerivedValue(() => faded.value * 0.5, [faded]);
  const ridges = useDerivedValue(() => faded.value * 0.38, [faded]);

  return (
    <>
      <SkPath
        path={drawn}
        style="stroke"
        strokeWidth={spec.thickness + 2.8}
        color="#141b22"
        opacity={underlay}
        strokeCap="round"
      />
      <SkPath
        path={drawn}
        style="stroke"
        strokeWidth={spec.thickness + 1.2}
        color={spec.colour}
        opacity={faded}
        strokeCap="round"
      />
      <SkPath
        path={drawn}
        style="stroke"
        strokeWidth={spec.thickness + 2.2}
        color="#141b22"
        opacity={ridges}
        strokeCap="butt"
      >
        <DashPathEffect intervals={[2.8, 5]} />
      </SkPath>
    </>
  );
}
