/**
 * The summit map is the same timeline turned on end: time flows UP, Now near
 * the top, the past below. Nothing here re-derives layout — the horizontal
 * builders stay the single source of geometry, and this module transposes
 * their output with one pure mapping:
 *
 *     tp(x, y) = { x: y,  y: timeLen − x }
 *
 * so lanes become columns beside the vertical route and every open thread's
 * fork→Now run becomes a rope hanging from the ledge down to its fork point.
 * The stroke machinery (samplePath + normals) is axis-agnostic, so the
 * transposed path strings feed it unchanged.
 */

import type { PsychologicalBranch } from "@/domain/branches/types";
import { buildTimelineLayout, type TimelineLayout } from "../main-line/layout";
import type { BranchGeometry } from "../branch-lines/paths";
import { dateToX, type TimeWindow } from "../zoom/time-scale";

export type SummitLayout = TimelineLayout & {
  orientation: "vertical";
  /** Screen x of the vertical route (the transposed main line). */
  routeX: number;
  /** Screen x anchor of the lane band (routeX equals it unless the route leans). */
  bandX: number;
  /** Screen y of Now — near the top; the ledge sits here. */
  nowScreenY: number;
  /** Length of the time axis in px (the stage height less the tray inset). */
  timeLen: number;
  /** Canvas width needed to hold every rope column; may exceed the stage. */
  laneSpan: number;
};

export function tp(x: number, y: number, timeLen: number): { x: number; y: number } {
  return { x: y, y: timeLen - x };
}

/**
 * Transpose an M/L/C path string (all buildBranchGeometry emits): every
 * coordinate pair (x, y) becomes (y, timeLen − x). Same token grammar as
 * path-sample's parser.
 */
export function transposePath(d: string, timeLen: number): string {
  const tokens = d.match(/[MLC]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let out = "";
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    const pairs = cmd === "C" ? 3 : 1;
    out += (out ? " " : "") + cmd;
    for (let p = 0; p < pairs; p++) {
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      out += ` ${y} ${round1(timeLen - x)}`;
    }
  }
  return out;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Map an ISO date to its screen y on the summit map (top = future). */
export function dateToScreenY(date: string, window: TimeWindow, timeLen: number): number {
  return timeLen - dateToX(date, window, timeLen);
}

export type SummitLayoutOptions = {
  stageWidth: number;
  stageHeight: number;
  /** Height claimed by a bottom sheet: the time axis compresses above it. */
  trayInset: number;
  window?: TimeWindow;
  compact?: boolean;
  now?: Date;
  /** Horizontal lean of the route toward a focused rope (base mainShift). */
  mainShift?: number;
  pinnedBranchIds?: readonly string[];
};

/** How many chars of a rope's title fit its ladder slot. */
export const SUMMIT_LABEL_CHARS = 22;
/** Vertical rhythm of the label ladder above the anchors. */
const LADDER_BASE = 12;
const LADDER_STEP = 14;
const LADDER_ROWS = 3;

/**
 * Pure composition of the summit scene: the untouched horizontal builder runs
 * with swapped stage dims (time axis = vertical extent, lane band = stage
 * width), then every geometry is transposed into screen coordinates.
 */
export function buildSummitLayout(
  branches: PsychologicalBranch[],
  opts: SummitLayoutOptions,
): SummitLayout {
  const timeLen = Math.max(240, opts.stageHeight - Math.round(opts.trayInset));
  const base = buildTimelineLayout(branches, {
    width: timeLen,
    height: opts.stageWidth,
    window: opts.window,
    compact: opts.compact,
    now: opts.now,
    mainShift: opts.mainShift,
    // In base coords "top" is the lane side that transposes to the left
    // edge; keep the outermost rope clear of it.
    topPad: 48,
    pinnedBranchIds: opts.pinnedBranchIds,
  });

  const routeX = base.mainY;
  const bandX = base.bandY;
  const nowScreenY = timeLen - base.nowX;

  // The label ladder: rope titles are horizontal text and cannot ride
  // 34–56px columns, so open ropes stack their labels in three rows above
  // their anchors, cycling by left-to-right order so neighbours never share
  // a row.
  const openOrder = base.geometries
    .filter((g) => g.reachesNow && g.inWindow)
    .sort((a, b) => a.laneY - b.laneY)
    .map((g) => g.branchId);
  const ordinalOf = new Map(openOrder.map((id, i) => [id, i]));

  const geometries: BranchGeometry[] = base.geometries.map((g) => {
    const fork = tp(g.forkX, g.forkY, timeLen);
    const end = tp(g.endX, g.endY, timeLen);
    const laneX = g.laneY;
    let labelX: number;
    let labelY: number;
    if (g.reachesNow) {
      const ordinal = ordinalOf.get(g.branchId) ?? 0;
      labelX = laneX;
      labelY = end.y - LADDER_BASE - (ordinal % LADDER_ROWS) * LADDER_STEP;
    } else {
      const p = tp(g.labelX, g.labelY, timeLen);
      labelX = p.x;
      labelY = p.y;
    }
    return {
      ...g,
      path: transposePath(g.path, timeLen),
      forkX: fork.x,
      forkY: fork.y,
      endX: end.x,
      endY: end.y,
      laneX,
      labelX,
      labelY,
      labelAnchor: "middle",
      momentPoints: g.momentPoints.map((m) => {
        const p = tp(m.x, m.y, timeLen);
        return { ...m, x: p.x, y: p.y };
      }),
    };
  });

  return {
    ...base,
    geometries,
    orientation: "vertical",
    routeX,
    bandX,
    nowScreenY,
    timeLen,
    laneSpan: base.height,
  };
}
