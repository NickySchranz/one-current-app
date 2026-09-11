import type { BranchGeometry } from "@/visualization/branch-lines/paths";
import type { PsychologicalBranch } from "@/domain/branches/types";
import { effectiveLoudness } from "@/domain/branches/logic";

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
  /** Answered today: coiled at its ledge, and it rides the mountain. */
  coiled: boolean;
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

/** Stable per-rope phase, matching the SVG path's own seeded offset. */
export function ropePhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 628) / 100) % (Math.PI * 2);
}

export function toRopeSpec(
  g: BranchGeometry & { angle?: number; radius?: number; coiled?: boolean },
  branch: PsychologicalBranch | undefined,
  colour: string,
  opacity: number,
  now: Date,
): RopeSpec {
  return {
    id: g.branchId,
    ax: g.forkX,
    angle: g.angle ?? 0,
    radius: g.radius ?? 0,
    bottom: g.forkY,
    top: g.endY,
    level: branch ? effectiveLoudness(branch, now) : 3,
    phase: ropePhase(g.branchId),
    coiled: !!g.coiled,
    colour: cssToHex(colour),
    opacity,
    thickness: g.thickness,
  };
}
