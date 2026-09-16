/** Shared between the two renderers so the scene is identical. */
export type Rope = { x: number; phase: number; top: number; bottom: number };

/** Overridable from the URL so the bench can be pushed until one breaks. */
export function ropeCount(): number {
  if (typeof window === "undefined") return 20;
  const n = Number(new URLSearchParams(window.location.search).get("ropes"));
  return Number.isFinite(n) && n > 0 ? n : 20;
}
/**
 * How many of the three strokes to lay down. `?layers=1` keeps the geometry
 * identical and cuts the fill to a third, which is the only clean way to ask
 * whether a renderer is bound by building paths or by filling pixels.
 */
export function layers(): number {
  if (typeof window === "undefined") return 3;
  const n = Number(new URLSearchParams(window.location.search).get("layers"));
  return n === 1 || n === 2 ? n : 3;
}
export const STEP_PX = 20;
export const LEVEL = 4;
/** Knots per wavelength for the cubic fit. Four is visually exact for a sine. */
export const KNOTS_PER_WAVE = 4;
export const WAVELENGTH = 900;

export function makeRopes(width: number, height: number): Rope[] {
  const ROPES = ropeCount();
  return Array.from({ length: ROPES }, (_, i) => ({
    x: Math.round(((i + 0.5) / ROPES) * width),
    phase: (i * 2.39996) % (Math.PI * 2),
    // The real thing hangs from far above the summit and runs off below.
    top: -4000,
    bottom: height + 600,
  }));
}
