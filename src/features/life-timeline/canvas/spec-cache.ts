/**
 * Keep the spec objects the canvas already has, when nothing about them moved.
 *
 * The specs are rebuilt whenever the layout is — which, since the pan became a
 * transform, is once per rebase rather than once per frame, but still often
 * enough to matter. Each rope's draw worklet closes over its spec, so a fresh
 * object means Reanimated builds a fresh worklet for every rope on the map to
 * draw exactly what it was drawing before.
 *
 * Handing back the previous object when every field matches costs one shallow
 * comparison per rope and saves all of that. It also keeps React's own
 * reconciliation cheap, for the same reason.
 *
 * Typed arrays are compared by identity and then forgiven: the sampled points
 * of a line are a pure function of its path string, which is compared like
 * everything else.
 *
 * Numbers are compared with a tolerance, and that is not a nicety. The
 * geometry is built out of `Date.parse` arithmetic, so a coordinate that has
 * not moved still arrives a ten-billionth of a pixel away from where it was —
 * enough for an exact comparison to declare every rope changed on every build,
 * which is the same as having no cache at all. Measured: the summit's drag
 * went from a 50ms p95 to 133ms, with stalls approaching 400ms, purely from
 * rebuilding forty-four draw worklets that had nothing new to draw.
 */
const EPSILON = 1e-3;
export function keepUnchanged<T extends { id: string }>(prev: readonly T[], next: T[]): T[] {
  if (prev.length === 0) return next;
  const byId = new Map(prev.map((s) => [s.id, s]));
  // The ARRAY is new every time and that is fine — the children are keyed by
  // id, so React moves them rather than remounting. What matters is that each
  // one keeps the object its worklet closed over.
  return next.map((spec) => {
    const old = byId.get(spec.id);
    return old && sameSpec(old, spec) ? old : spec;
  });
}

function sameSpec(a: object, b: object): boolean {
  for (const k of Object.keys(a) as (keyof typeof a)[]) {
    const x: unknown = a[k];
    const y: unknown = b[k];
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") {
      if (Math.abs(x - y) <= EPSILON) continue;
      return false;
    }
    // A line's sampled points: derived from its path string, which is one of
    // the fields this loop already compares.
    if (ArrayBuffer.isView(x) && ArrayBuffer.isView(y)) continue;
    if (
      Array.isArray(x) &&
      Array.isArray(y) &&
      x.length === y.length &&
      x.every((v, i) => v === y[i])
    ) {
      continue;
    }
    return false;
  }
  return true;
}
