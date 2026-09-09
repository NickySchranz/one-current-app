import type { ThemeId } from "@/visualization/theme";

/**
 * Why the paywall opened — picks the copy the prompt shows.
 *
 * **Timing rule: a paywall may never open at a moment of distress.** Someone
 * adding an eleventh thing that is pulling at them is having a bad day, and
 * refusing them is the worst thing this app could do — so open threads are not
 * gated, at any number. Someone opening a trend is curious, and curiosity is
 * where an upgrade can honestly be offered. Every reason below has to stay on
 * the curiosity side of that line.
 */
export type PaywallReason = "themes" | "share" | "depth";

/** The plain looks stay free; the creature themes are Pro. */
export const FREE_THEME_IDS: readonly ThemeId[] = [
  "riverbed",
  "midnight",
  "sunprint",
  "duskwood",
  "porcelain",
];

export function isProTheme(id: ThemeId): boolean {
  return !FREE_THEME_IDS.includes(id);
}
