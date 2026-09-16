import { useEffect, useMemo } from "react";
import {
  Canvas,
  PaintStyle,
  Picture,
  Skia,
  StrokeCap,
  type SkColor,
  type SkPaint,
  type SkPicture,
} from "@shopify/react-native-skia";
import { useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import { swayOffsetAt } from "../useSquiggle";
import { countPathBuildUI, countPictureUI } from "@/dev/perf-counters";
import { SHOW_TESTING } from "@/config/flags";
import type { RopeSpec } from "./rope-spec";

/**
 * Every summit rope, recorded into one picture, on one canvas.
 *
 * Three things about this file are the scars of getting it wrong, and each is
 * the reason for a decision here.
 *
 * **It has to be able to say that something changed.** react-native-skia's web
 * renderer repaints when a value it is handed changes BY IDENTITY. The first
 * version kept one path per rope, rewound and refilled it every frame, and
 * handed back the same object — so nothing downstream could tell, and the
 * ropes only redrew when something made React re-render the tree. On a phone
 * they swayed while the mountain was being turned and stopped dead the moment
 * it settled. A picture is a value: recorded fresh when something moves,
 * handed back unchanged when nothing has.
 *
 * **A shared value the worklet both reads and writes re-triggers it.** A
 * mapper's inputs are what its worklet reads; writing one from inside is a
 * loop that records as fast as the frame clock allows. Measured at a hundred
 * and thirty-five recordings a second against the thirty the sway asks for.
 * So the guard state is a plain object, which is just memory.
 *
 * **Dashes are drawn as dashes.** A `DashPathEffect` over a long path is
 * re-measured and re-split on every draw: on the horizontal lines the same
 * construct cost 116ms a frame against 16.7ms once the dashes were emitted
 * directly (PERF.md). The knots here are already walked and evenly spaced, so
 * each rung is two points.
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
  /** The mountain's slide. Every rope hangs on the rock and rides it. */
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
  /**
   * Two paths and three paints, built once.
   *
   * The benchmark that chose this renderer was nearly read backwards because
   * of exactly this: a fresh `Skia.Path.Make()` inside the per-frame worklet
   * cost about twenty times the reused one, and made Skia look four times
   * slower than the SVG it replaced (PERF.md records the near miss).
   */
  const kit = useMemo(() => {
    const stroke = (cap: StrokeCap) => {
      const p = Skia.Paint();
      p.setStyle(PaintStyle.Stroke);
      p.setStrokeCap(cap);
      p.setAntiAlias(true);
      return p;
    };
    /**
     * The twist, as a dash on the rope's own stroke.
     *
     * It was ~146 two-point rungs per rope — against the ten cubics the rope
     * itself costs, which made the decoration fifteen times the thing it
     * decorates and the single largest block of work in the frame. The rungs
     * were written that way because a `DashPathEffect` on the horizontal
     * lines measured catastrophically (116ms a frame against 16.7, PERF.md).
     * But that path was twenty thousand pixels of sampled polyline carrying
     * sixteen hundred dashes; this one is eleven hundred pixels of six cubics
     * carrying about a hundred and fifty. The two are not the same measurement
     * and the second had never been taken. `RUNG_MODE` keeps both so it can be.
     *
     * The bars come out perpendicular to the rope rather than horizontal. The
     * rope's steepest slope is amp·KROPE = 14·2π/900, about 5.6° off vertical,
     * and the SVG rope this has to match draws its twist as a dash too — so
     * this is a step toward the reference, not away from it.
     */
    const twist = () => {
      const p = stroke(StrokeCap.Butt);
      if (RUNG_MODE === "dash") {
        p.setPathEffect(Skia.PathEffect.MakeDash([RUNG_W, RUNG_STEP - RUNG_W], 0));
      }
      return p;
    };
    return {
      /**
       * ONE recorder for the renderer's life, not one per frame.
       *
       * `createPicture` builds a `Skia.PictureRecorder()` and never disposes
       * it (`skia/core/Picture.js`) — the library's own `StaticContainer` and
       * `drawAsPicture` both call `recorder.dispose()`, and that helper is
       * the one place that does not. Recording thirty times a second, it
       * left thirty abandoned recorders a second in the WebAssembly heap,
       * which nothing collects. A recorder can begin again, so it does.
       */
      rec: Skia.PictureRecorder(),
      rope: Skia.Path.Make(),
      rungs: Skia.Path.Make(),
      xs: new Float64Array(KNOT_CAP),
      under: stroke(StrokeCap.Round),
      core: stroke(StrokeCap.Round),
      ridge: twist(),
      /** Parsed once. `Skia.Color` runs a full CSS parser and allocates a
       *  Float32Array every call (`skia/web/JsiSkColor.js`), and this one was
       *  running three times per visible rope per frame for a constant. */
      dark: Skia.Color(DARK),
      /** Something safe to hand back once the kit has been freed. Never
       *  disposed, and never drawn into. */
      empty: emptyPicture(),
    };
  }, []);

  /** The cull rect, built with the stage rather than per recording. */
  const bounds = useMemo(() => Skia.XYWHRect(0, 0, width, height), [width, height]);


  /**
   * One parsed colour per rope, rebuilt only when the rope list is.
   *
   * Same reason as `kit.dark`: the hex is already normalised at spec-build
   * time (`rope-spec.ts`), so parsing it again inside the frame loop was
   * pure waste — about eighteen hundred CSS parses and as many array
   * allocations a second at twenty visible ropes.
   */
  const colours = useMemo(() => ropes.map((r) => Skia.Color(r.colour)), [ropes]);

  /**
   * What the last recording was made from, and what it produced.
   *
   * The rope LIST is compared by identity, not by its length. A rope list
   * changes without changing length every time a thread is answered, rested
   * or renamed — the spec is rebuilt in place — and keying on `count` meant
   * the picture went on showing the ropes as they were. `keepUnchanged` in
   * `spec-cache.ts` hands back the previous array members whenever nothing
   * moved, so a new array here means something really did.
   */
  const seen = useMemo(
    () => ({
      t: Number.NaN,
      turn: Number.NaN,
      shift: Number.NaN,
      ropes: null as RopeSpec[] | null,
      picture: null as SkPicture | null,
      /** The one before it, kept a generation so nothing draws a freed object. */
      stale: null as SkPicture | null,
    }),
    [],
  );

  /**
   * A kill switch the DRAW worklet reads before it touches anything.
   *
   * Reanimated stops a mapper through `scheduleOnUI`, which is asynchronous,
   * so a worklet can and does run once more after React has torn the
   * component down. Disposing the recorder in the cleanup and hoping was
   * worth one `Cannot pass deleted object as a pointer of type
   * PictureRecorder` per unmount.
   *
   * A shared value rather than a field on `seen`, because on native the
   * worklet holds its own copy of a plain object and would never see the
   * write. This one is set from React and read on the UI thread, which is
   * exactly what a shared value is for.
   */
  const dead = useSharedValue(false);

  /**
   * Nothing here is garbage: a Skia handle owns memory on the other side of
   * the WebAssembly boundary, and dropping the JS wrapper does not free it.
   * The canvas is unmounted whenever the map leaves, the renderer is flipped
   * or the GL context is lost, and each of those used to strand a recorder,
   * four paths and two pictures.
   *
   * `seen.picture` is deliberately NOT freed: it is the one the renderer may
   * still be holding as it tears down. One small picture per unmount is a
   * fair price for never handing the compositor a dangling pointer.
   */
  useEffect(
    () => () => {
      dead.value = true;
      kit.rec.dispose();
      kit.rope.dispose();
      kit.rungs.dispose();
      kit.under.dispose();
      kit.core.dispose();
      kit.ridge.dispose();
      seen.stale?.dispose();
      seen.stale = null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all three are stable for the life of the component
    [],
  );

  const still = reducedMotion;
  const picture = useDerivedValue<SkPicture>(() => {
    // Read FIRST, before any Skia handle is touched: this worklet outlives the
    // component by one run, and by then the kit is freed.
    if (dead.value) return seen.picture ?? kit.empty;
    const turn = rot ? rot.value : 0;
    const shift = Math.round((climb.value + (pan ? pan.value : 0)) * 2) / 2;
    const t = still ? 0 : Math.round(clock.value * 30) / 30;

    const held = seen.picture;
    if (
      held !== null &&
      t === seen.t &&
      turn === seen.turn &&
      shift === seen.shift &&
      ropes === seen.ropes
    ) {
      // The SAME object, deliberately: `valueSetter` refuses an assignment
      // whose value is already there, so nothing downstream is told and
      // nothing repaints. That is the whole point of the guard.
      return held;
    }
    seen.t = t;
    seen.turn = turn;
    seen.shift = shift;
    seen.ropes = ropes;

    const canvas = kit.rec.beginRecording(bounds);
    {
      {
        const { rope, rungs, xs } = kit;
        for (let i = 0; i < ropes.length; i++) {
          const spec = ropes[i];
          // Round the back of the mountain the rope is gone, and not in the
          // way — and at rest that is half of them.
          const facing = Math.cos(spec.angle + turn);
          if (facing <= -0.12) continue;
          const alpha = spec.opacity * Math.min(1, (facing + 0.12) / 0.45);
          if (alpha <= 0.01) continue;

          // Its live column: the resting x plus how far the turn carries it.
          const dx =
            Math.sin(spec.angle + turn) * spec.radius - Math.sin(spec.angle) * spec.radius;
          const lift = spec.rides ? shift : 0;
          const total = spec.bottom - spec.top;
          const from = Math.max(spec.top, -MARGIN - lift);
          const to = Math.min(spec.bottom, height + MARGIN - lift);
          if (to <= from || total <= 0) continue;
          countPathBuildUI();

          const span = to - from;
          const knots = Math.min(
            KNOT_CAP,
            Math.max(3, Math.ceil((span / WAVELENGTH) * KNOTS_PER_WAVE) + 1),
          );
          const dy = span / (knots - 1);
          const quiet = still || !spec.trembles;
          for (let k = 0; k < knots; k++) {
            const y = from + k * dy;
            /**
             * `a` is arc distance below the ANCHOR, which is the top of a
             * hanging rope — the free end swings, the anchor does not.
             * Measuring it from the free end instead pins the wrong end and
             * the rope hangs dead straight. The SVG rope and the climber's
             * grip use this same argument, and all three have to agree
             * exactly or his hands come off the rope he is holding.
             */
            xs[k] = quiet
              ? spec.ax + dx
              : spec.ax + dx + swayOffsetAt(y - spec.top, total, spec.level, spec.phase, t, 1);
          }

          // Catmull-Rom through the knots as cubics: the curve passes through
          // every sample, so the sine is reproduced rather than chorded. Four
          // knots to a wavelength, against the fifty line segments the SVG
          // rope needs for the same span.
          rope.reset();
          rope.moveTo(xs[0], from + lift);
          for (let k = 0; k < knots - 1; k++) {
            const x0 = xs[Math.max(0, k - 1)];
            const x1 = xs[k];
            const x2 = xs[k + 1];
            const x3 = xs[Math.min(knots - 1, k + 2)];
            const y1 = from + k * dy + lift;
            const y2 = y1 + dy;
            rope.cubicTo(
              x1 + (x2 - x0) / 6,
              y1 + dy / 3,
              x2 - (x3 - x1) / 6,
              y2 - dy / 3,
              x2,
              y2,
            );
          }

          // The twist: either a dash carried by the paint, or rungs laid out
          // by hand. See `twist()` above for why both exist.
          if (RUNG_MODE === "segments") {
            rungs.reset();
            const half = (spec.thickness + 2.2) / 2;
            for (let y = from; y < to; y += RUNG_STEP) {
              const k = Math.min(knots - 1, Math.max(0, (y - from) / dy));
              const lo = Math.floor(k);
              const hi = Math.min(knots - 1, lo + 1);
              const x = xs[lo] + (xs[hi] - xs[lo]) * (k - lo);
              rungs.moveTo(x - half, y + lift);
              rungs.lineTo(x + half, y + lift);
            }
          }

          paint(kit.under, kit.dark, alpha * 0.5, spec.thickness + 2.8);
          canvas.drawPath(rope, kit.under);
          paint(kit.core, colours[i], alpha, spec.thickness + 1.2);
          canvas.drawPath(rope, kit.core);
          if (RUNG_MODE === "segments") {
            paint(kit.ridge, kit.dark, alpha * 0.38, RUNG_W);
            canvas.drawPath(rungs, kit.ridge);
          } else {
            paint(kit.ridge, kit.dark, alpha * 0.38, spec.thickness + 2.2);
            canvas.drawPath(rope, kit.ridge);
          }
        }
      }
    }
    countPictureUI();
    const next = kit.rec.finishRecordingAsPicture();

    /**
     * Every recording allocates in WebAssembly memory and nothing frees it
     * for us; left alone the canvas leaks one a frame. Disposal waits a
     * generation — the renderer may still be holding the picture that was on
     * screen when this one was recorded.
     */
    if (seen.stale) seen.stale.dispose();
    seen.stale = seen.picture;
    seen.picture = next;
    return next;
  }, [ropes, rot, pan, climb, clock, still, height, bounds, kit, colours, seen, dead]);

  useRopeProbes(ropes, seen, still);

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Picture picture={picture} />
    </Canvas>
  );
}

/** How far past the canvas edge a rope keeps drawing, so it enters from off. */
const MARGIN = 120;
/** Knots per 900px wavelength. Four reproduces a sine to the pixel. */
const KNOTS_PER_WAVE = 4;
const WAVELENGTH = 900;
/** A rope only ever spans the viewport and its margins; this is room to spare. */
const KNOT_CAP = 64;
/** Rung spacing and weight — the dash pattern the SVG rope wears. */
const RUNG_STEP = 7.8;
const RUNG_W = 2.8;
/**
 * How the twist is produced. "dash" lets the paint do it and builds no extra
 * geometry; "segments" lays out every rung by hand, which is what this file
 * did and what the horizontal lines still need. Kept switchable because the
 * measurement that justified "segments" was taken on a path two orders of
 * magnitude longer than this one.
 */
const RUNG_MODE: "dash" | "segments" = "dash";
/** The rope's shading: translucent black, so it darkens whatever colour the
 *  thread wears. `branchColor` speaks hsl(), which Skia cannot mix. */
const DARK = "#141b22";

/** One empty picture, recorded once, outliving everything that draws. */
function emptyPicture(): SkPicture {
  const rec = Skia.PictureRecorder();
  rec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  const p = rec.finishRecordingAsPicture();
  rec.dispose();
  return p;
}

function paint(p: SkPaint, colour: SkColor, alpha: number, width: number): void {
  "worklet";
  p.setColor(colour);
  p.setAlphaf(Math.max(0, Math.min(1, alpha)));
  p.setStrokeWidth(width);
}

/**
 * Where each rope is, for the checks — the canvas has no DOM.
 *
 * summit-check measures the swing by reading a rope's SVG path geometry at the
 * climber's hands, and once Skia draws them there is nothing to read: the
 * assertions came back "-Infinity px of travel" against an app whose ropes
 * were swaying perfectly well. So the scene answers for itself, reporting the
 * frame that was DRAWN rather than the live clock — a check compares this
 * against the climber's rendered box, which is a painted frame.
 *
 * Testing builds only; shipped bundles register nothing.
 */
type RopeProbe = (clientY: number) => number | null;

function useRopeProbes(
  ropes: RopeSpec[],
  seen: { t: number; turn: number; shift: number },
  still: boolean,
): void {
  useEffect(() => {
    if (!SHOW_TESTING || typeof window === "undefined") return;
    const w = window as unknown as {
      __ocRopes?: Map<string, RopeProbe>;
      __ocRopeSpec?: Record<string, unknown>;
    };
    const reg = (w.__ocRopes ??= new Map<string, RopeProbe>());
    const info = (w.__ocRopeSpec ??= {});
    const box = () => {
      const el = typeof document === "undefined" ? null : document.querySelector("canvas");
      return el ? el.getBoundingClientRect() : { left: 0, top: 0 };
    };
    for (const spec of ropes) {
      /** The rope's column: the turn applied, the sway taken off. */
      const column = () => {
        if (Number.isNaN(seen.turn)) return null;
        const dx =
          Math.sin(spec.angle + seen.turn) * spec.radius - Math.sin(spec.angle) * spec.radius;
        return box().left + spec.ax + dx;
      };
      reg.set(spec.id, (clientY: number) => {
        // The check speaks the viewport's coordinates and the scene speaks the
        // stage's; the canvas sits exactly over the stage, so its own box is
        // the conversion. It has to be applied, because the swing tapers with
        // altitude: sampling a header's height out reads the wrong amplitude.
        const { turn, shift, t } = seen;
        if (Number.isNaN(turn) || Number.isNaN(shift) || Number.isNaN(t)) return null;
        if (Math.cos(spec.angle + turn) <= -0.12) return null;
        const world = clientY - box().top - (spec.rides ? shift : 0);
        if (world < spec.top || world > spec.bottom) return null;
        const c = column();
        if (c === null) return null;
        if (still || !spec.trembles) return c;
        return (
          c + swayOffsetAt(world - spec.top, spec.bottom - spec.top, spec.level, spec.phase, t, 1)
        );
      });
      info[spec.id] = {
        coiled: spec.coiled,
        trembles: spec.trembles,
        level: spec.level,
        angle: Math.round(((spec.angle * 180) / Math.PI) * 10) / 10,
        column,
        /** How legible it is right now, on the ramp the paint uses. */
        seen: () => {
          if (Number.isNaN(seen.turn)) return 0;
          const facing = Math.cos(spec.angle + seen.turn);
          return facing <= -0.12 ? 0 : Math.min(1, (facing + 0.12) / 0.45);
        },
      };
    }
    return () => {
      for (const spec of ropes) {
        reg.delete(spec.id);
        delete info[spec.id];
      }
    };
  }, [ropes, seen, still]);
}
