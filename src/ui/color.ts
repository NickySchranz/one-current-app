/** Colour helpers replicating CSS `color-mix(in srgb, ...)` for plain hex colours. */

function parseHex(color: string): [number, number, number, number] {
  let h = color.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}

function toHex(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
}

/** color-mix(in srgb, a pct%, b): blend two hex colours. */
export function mix(a: string, b: string, pct: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const t = pct / 100;
  return `#${toHex(ar * t + br * (1 - t))}${toHex(ag * t + bg * (1 - t))}${toHex(ab * t + bb * (1 - t))}`;
}

/** color-mix(in srgb, color pct%, transparent): a colour at partial opacity. */
export function alpha(color: string, opacity: number): string {
  const [r, g, b] = parseHex(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}
