import type { BranchGeometry } from "@/visualization/branch-lines/paths";
import { samplePath } from "@/visualization/path-sample";
import { cssToHex } from "./rope-spec";

/**
 * Everything the canvas needs about one horizontal thread line.
 *
 * The sibling of `RopeSpec`, and built on the same rule: plain numbers, no
 * React identity, and every value read from the place `BranchLine` reads it.
 *
 * The difference is the geometry. A summit rope is a straight line displaced
 * by a sine, so the canvas can build it analytically from four numbers. A
 * thread line is a fork curve into a run into an optional merge curve — an
 * arbitrary path — so its points have to be sampled. That sampling depends
 * only on the path string, which changes when the layout is rebuilt and never
 * because time passed, so it happens once here rather than thirty times a
 * second in the renderer.
 *
 * Points are packed flat (x, y, nx, ny, s per sample) rather than kept as an
 * array of objects: the draw loop walks them on the UI thread every frame, and
 * a typed array is one allocation instead of one per point.
 */
export type LineSpec = {
  id: string;
  /** The resting geometry, verbatim. Used when the line never moves. */
  d: string;
  /** x, y, normal x, normal y, arc length — five floats per sample. */
  pts: Float32Array;
  /** 0 when the line is still: there is nothing to displace, so nothing to
   *  sample, and the path is built from `d` once and kept. */
  count: number;
  /** Arc length of the whole line. */
  total: number;
  /** The band this line occupies, so an off-screen one is never drawn. */
  minY: number;
  maxY: number;
  /** 1..5 — drives slither amplitude, wavelength and speed. */
  level: number;
  /** Loud enough to slither at all. */
  trembles: boolean;
  /** The fork end sits on the main line, so it rides the calm wave. */
  attachStart: boolean;
  /** The merge end does too. */
  attachEnd: boolean;
  /** Directional dashes toward the present. */
  flows: boolean;
  /** `--flow-duration`: emphasized lines run faster. */
  flowMs: number;
  /** The dash pattern the theme gives the flow layer. */
  flowDash: readonly [number, number];
  colour: string;
  opacity: number;
  width: number;
  /** The soft wide glow behind the thread being looked at. */
  haloed: boolean;
};

export const PT_STRIDE = 5;

/** Sampling pitch, the same 6px the SVG squiggle uses. */
const STEP = 6;

/**
 * How far above and below its lane a line may actually reach: the fork curve
 * rising out of the main line, the slither, the halo's width. Generous on
 * purpose — this decides when a line is skipped entirely, and a band that is
 * too tight would clip one just off the top of the screen.
 */
const LANE_SLACK = 90;

export function toLineSpec(
  g: BranchGeometry,
  colour: string,
  opts: {
    trembles: boolean;
    attachStart: boolean;
    attachEnd: boolean;
    flows: boolean;
    flowMs: number;
    flowDash: readonly [number, number];
    haloed: boolean;
    emphasized: boolean;
  },
): LineSpec | null {
  // A line that neither slithers nor rides the main wave never changes
  // shape, so there is nothing to sample: it is its own path string, built
  // once. This is what the SVG hook does too — it only calls samplePath when
  // something is actually going to move.
  const moves = opts.trembles || opts.attachStart || opts.attachEnd;
  const sampled = moves ? samplePath(g.path, STEP) : [];
  if (moves && sampled.length < 2) return null;
  const pts = new Float32Array(sampled.length * PT_STRIDE);
  for (let i = 0; i < sampled.length; i++) {
    const p = sampled[i];
    const o = i * PT_STRIDE;
    pts[o] = p.x;
    pts[o + 1] = p.y;
    pts[o + 2] = p.nx;
    pts[o + 3] = p.ny;
    pts[o + 4] = p.s;
  }
  return {
    id: g.branchId,
    d: g.path,
    pts,
    count: sampled.length,
    total: sampled.length > 0 ? sampled[sampled.length - 1].s : 0,
    minY: g.laneY - LANE_SLACK,
    maxY: g.laneY + LANE_SLACK,
    level: Math.max(1, Math.min(5, g.loudness)),
    trembles: opts.trembles,
    attachStart: opts.attachStart,
    attachEnd: opts.attachEnd,
    flows: opts.flows,
    flowMs: opts.flowMs,
    flowDash: opts.flowDash,
    colour: cssToHex(colour),
    opacity: g.style.opacity,
    // The same widths BranchLine paints: a focused or highlighted line gains
    // a little, and the flow dashes run a pixel thinner than the core.
    width: g.thickness + (opts.emphasized ? 1.25 : 0),
    haloed: opts.haloed,
  };
}
