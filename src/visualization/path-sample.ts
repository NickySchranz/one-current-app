/**
 * Pure-JS path sampling for the branch geometry paths (M/L/C commands only —
 * exactly what buildBranchGeometry emits). Replaces the DOM's
 * getTotalLength/getPointAtLength so the slither works on every platform
 * and never touches the DOM.
 */

export type SamplePoint = {
  x: number;
  y: number;
  /** Arc length from the path start. */
  s: number;
  /** Unit normal (perpendicular to travel direction). */
  nx: number;
  ny: number;
};

type Seg =
  | { kind: "L"; x0: number; y0: number; x1: number; y1: number; len: number }
  | {
      kind: "C";
      x0: number;
      y0: number;
      c1x: number;
      c1y: number;
      c2x: number;
      c2y: number;
      x1: number;
      y1: number;
      len: number;
      /** Cumulative arc length lookup for even sampling. */
      lut: { t: number; s: number }[];
    };

function cubic(x0: number, c1: number, c2: number, x1: number, t: number): number {
  const u = 1 - t;
  return u * u * u * x0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * x1;
}

function parse(d: string): Seg[] {
  const tokens = d.match(/[MLC]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const segs: Seg[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M") {
      cx = num();
      cy = num();
    } else if (cmd === "L") {
      const x = num();
      const y = num();
      segs.push({ kind: "L", x0: cx, y0: cy, x1: x, y1: y, len: Math.hypot(x - cx, y - cy) });
      cx = x;
      cy = y;
    } else if (cmd === "C") {
      const c1x = num();
      const c1y = num();
      const c2x = num();
      const c2y = num();
      const x = num();
      const y = num();
      // Arc-length table over 24 slices — plenty for these gentle curves.
      const lut: { t: number; s: number }[] = [{ t: 0, s: 0 }];
      let px = cx;
      let py = cy;
      let acc = 0;
      for (let k = 1; k <= 24; k++) {
        const t = k / 24;
        const qx = cubic(cx, c1x, c2x, x, t);
        const qy = cubic(cy, c1y, c2y, y, t);
        acc += Math.hypot(qx - px, qy - py);
        lut.push({ t, s: acc });
        px = qx;
        py = qy;
      }
      segs.push({ kind: "C", x0: cx, y0: cy, c1x, c1y, c2x, c2y, x1: x, y1: y, len: acc, lut });
      cx = x;
      cy = y;
    }
  }
  return segs;
}

function pointAt(seg: Seg, sIntoSeg: number): { x: number; y: number } {
  if (seg.kind === "L") {
    const t = seg.len > 0 ? sIntoSeg / seg.len : 0;
    return { x: seg.x0 + (seg.x1 - seg.x0) * t, y: seg.y0 + (seg.y1 - seg.y0) * t };
  }
  // Invert the arc-length table.
  const lut = seg.lut;
  let t = 1;
  for (let k = 1; k < lut.length; k++) {
    if (lut[k].s >= sIntoSeg) {
      const a = lut[k - 1];
      const b = lut[k];
      const f = b.s > a.s ? (sIntoSeg - a.s) / (b.s - a.s) : 0;
      t = a.t + (b.t - a.t) * f;
      break;
    }
  }
  return {
    x: cubic(seg.x0, seg.c1x, seg.c2x, seg.x1, t),
    y: cubic(seg.y0, seg.c1y, seg.c2y, seg.y1, t),
  };
}

export function pathLength(d: string): number {
  return parse(d).reduce((sum, seg) => sum + seg.len, 0);
}

/** Sample the path at ~`step`px intervals, with arc length and unit normals. */
export function samplePath(d: string, step = 6): SamplePoint[] {
  const segs = parse(d);
  const total = segs.reduce((sum, seg) => sum + seg.len, 0);
  if (total <= 0) return [];
  const count = Math.max(2, Math.ceil(total / step) + 1);
  const pts: SamplePoint[] = [];
  let segIdx = 0;
  let segStart = 0;
  for (let i = 0; i < count; i++) {
    const s = (i / (count - 1)) * total;
    while (segIdx < segs.length - 1 && s > segStart + segs[segIdx].len) {
      segStart += segs[segIdx].len;
      segIdx++;
    }
    const p = pointAt(segs[segIdx], Math.max(0, Math.min(segs[segIdx].len, s - segStart)));
    pts.push({ x: p.x, y: p.y, s, nx: 0, ny: 0 });
  }
  for (let i = 0; i < count; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(count - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    pts[i].nx = -(b.y - a.y) / len;
    pts[i].ny = (b.x - a.x) / len;
  }
  return pts;
}
