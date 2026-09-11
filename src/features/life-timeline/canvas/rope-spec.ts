import type { BranchGeometry } from "@/visualization/branch-lines/paths";
import type { PsychologicalBranch } from "@/domain/branches/types";
import { lineTrembles, phaseFromId } from "../BranchLine";

/**
 * Everything the canvas needs about one rope, flattened to numbers.
 *
 * Deliberately plain data with no React identity in it: the canvas rebuilds
 * paths from shared values on the UI thread, and the only reason to hand it a
 * new array is that the WORLD changed — a thread appeared, was answered, or
 * the layout was rebuilt. Panning, turning and swaying must never produce a
 * new one of these.
 */
export type RopeSpec = {
  id: string;
  /** Resting x on the ring; the turn is added on the UI thread. */
  ax: number;
  /** Its place on the ring, un-turned. */
  angle: number;
  radius: number;
  /** The free, dangling end (larger y) and the anchor above (smaller y). */
  bottom: number;
  top: number;
  /** 1..5 — drives sway amplitude and speed. */
  level: number;
  /** Per-rope offset so a face of ropes never sways in sync. */
  phase: number;
  /** Loud enough to move at all. A quiet rope hangs dead straight. */
  trembles: boolean;
  /** The rope hangs on the rock, so it travels with the climb. */
  rides: boolean;
  colour: string;
  /** Base opacity before the turn fades it round the back. */
  opacity: number;
  /** Loudness thickness, as the SVG rope uses it. */
  thickness: number;
};

/**
 * Skia cannot read `hsl()`.
 *
 * CanvasKit's colour parser takes `#hex`, `rgb()`/`rgba()` and the named
 * colours, and `branchColor` speaks `hsl(h s% l%)`. An unparseable string does
 * not throw — it comes back as opaque black, so every rope drew as a heavy
 * black cord with a black under-stroke beneath it and looked twice its weight.
 * The colour is converted once here, when the spec is built, rather than on
 * the UI thread where it would run per rope per frame.
 */
export function cssToHex(colour: string): string {
  const m = /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/.exec(colour);
  if (!m) return colour;
  const h = parseFloat(m[1]) / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m0 = l - c / 2;
  const seg = Math.floor(h * 6) % 6;
  const [r, g, b] =
    seg === 0 ? [c, x, 0]
    : seg === 1 ? [x, c, 0]
    : seg === 2 ? [0, c, x]
    : seg === 3 ? [0, x, c]
    : seg === 4 ? [x, 0, c]
    : [c, 0, x];
  const hex = (v: number) =>
    Math.round((v + m0) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Every number here is read from the SAME place BranchLine and the climber's
 * grip read it.
 *
 * Three of them were not, and the checks caught it: a phase of my own
 * invention instead of `phaseFromId`, `effectiveLoudness` instead of the
 * geometry's own clamped loudness, and the climb applied only to coiled
 * ropes when in fact every rope hangs on the rock and travels with it. The
 * rope swayed beautifully and the climber held a rope that was somewhere
 * else — 23px adrift at the widest. The sway formula agreeing is not enough;
 * its arguments have to agree too.
 */
export function toRopeSpec(
  g: BranchGeometry & { angle?: number; radius?: number; coiled?: boolean },
  branch: PsychologicalBranch | undefined,
  colour: string,
  opacity: number,
  now: Date,
  reducedMotion: boolean,
): RopeSpec {
  const level = Math.max(1, Math.min(5, g.loudness));
  return {
    id: g.branchId,
    ax: g.forkX,
    angle: g.angle ?? 0,
    radius: g.radius ?? 0,
    bottom: g.forkY,
    top: g.endY,
    level,
    phase: phaseFromId(g.branchId),
    trembles:
      !!branch &&
      lineTrembles({ branch, inWindow: g.inWindow, level, reducedMotion, now, born: false }),
    rides: g.reachesNow,
    colour: cssToHex(colour),
    opacity,
    thickness: g.thickness,
  };
}
