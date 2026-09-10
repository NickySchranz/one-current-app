/**
 * A pixel sprite as one path per colour, instead of one node per pixel.
 *
 * Every pixel used to be its own SVG node, and on native each SVG node is a
 * real view the platform lays out, composites and carries through every
 * commit. One frame of Pip is around seventy of them, both gait frames are
 * mounted at once, and the whole group is transformed on every frame while he
 * moves. Measured on a loaded timeline, sprites were 138 of the scene's 323
 * SVG nodes — the largest single block in the map.
 *
 * A pixel is a square, and squares of the same colour can share one path:
 * `M x y h w v w h -w z` per pixel, concatenated. The drawing is identical to
 * the rects it replaces — same positions, same size, same inter-pixel gap —
 * and the fill rule never comes into play because the squares never overlap.
 * It collapses ~70 nodes into the handful of colours a frame actually uses.
 *
 * The result depends only on the frame's pixels and the geometry, never on
 * time, so it is built once and cached against the frame's own array. There
 * is no per-animation-frame cost.
 */
import type { ColorKey, Pixel } from "./mascot-frames";

type SizeKey = string;
const CACHE = new WeakMap<Pixel[], Map<SizeKey, Map<ColorKey, string>>>();

/**
 * @param pixels the frame, used as the cache identity — frame arrays are
 *               module constants, so this is stable for the app's lifetime
 * @param px     grid pitch
 * @param gap    shrink applied to each square, preserving the original seam
 */
export function spritePaths(
  pixels: Pixel[],
  px: number,
  gap: number,
): Map<ColorKey, string> {
  let bySize = CACHE.get(pixels);
  if (!bySize) {
    bySize = new Map();
    CACHE.set(pixels, bySize);
  }
  const key = `${px}:${gap}`;
  const hit = bySize.get(key);
  if (hit) return hit;

  const out = new Map<ColorKey, string>();
  const size = Math.round((px - gap) * 1000) / 1000;
  for (const p of pixels) {
    const x = Math.round(p.c * px * 100) / 100;
    const y = Math.round(p.r * px * 100) / 100;
    out.set(p.k, (out.get(p.k) ?? "") + `M${x} ${y}h${size}v${size}h-${size}z`);
  }
  bySize.set(key, out);
  return out;
}
