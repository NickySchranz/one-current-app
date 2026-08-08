/** The five moods the app can wear. Each is a complete look: colour, type,
 * shape, and the pace of every animation. */
export const THEMES = [
  {
    id: "riverbed",
    name: "Riverbed",
    hint: "Warm paper, moss green, a slow steady current.",
    mode: "light",
    paper: "#faf9f6",
    accent: "#3f6f5f",
  },
  {
    id: "midnight",
    name: "Midnight console",
    hint: "Dark glass and cyan signals, quick and precise.",
    mode: "dark",
    paper: "#0b0e15",
    accent: "#4fd6e3",
  },
  {
    id: "sunprint",
    name: "Sunprint",
    hint: "Cream and terracotta, round and unhurried.",
    mode: "light",
    paper: "#faf1e2",
    accent: "#c2653f",
  },
  {
    id: "duskwood",
    name: "Duskwood",
    hint: "Forest dark with amber fireflies.",
    mode: "dark",
    paper: "#131a14",
    accent: "#d9a14e",
  },
  {
    id: "porcelain",
    name: "Porcelain",
    hint: "Gallery white, ink lines, one touch of red.",
    mode: "light",
    paper: "#ffffff",
    accent: "#b23a2a",
  },
  {
    id: "demonfire",
    name: "Demonfire",
    hint: "Ember dark. Every open thread is a small dragon — face it kindly and it settles.",
    mode: "dark",
    paper: "#161013",
    accent: "#c65a33",
  },
  {
    id: "koipond",
    name: "Koi pond",
    hint: "Still water. Every open thread is a koi nosing at Now — feed it a decision and the pond settles.",
    mode: "light",
    paper: "#e9f3ee",
    accent: "#3d7ea6",
  },
  {
    id: "carnival",
    name: "Carnival",
    hint: "Cream and bunting. Every open thread is a balloon — the longer it waits, the tighter it swells.",
    mode: "light",
    paper: "#fbf0e0",
    accent: "#c65a8a",
  },
  {
    id: "catnap",
    name: "Catnap",
    hint: "Lavender and soft paws. Every open thread is a cat watching you — answer it and it curls up.",
    mode: "light",
    paper: "#f4f0f8",
    accent: "#7a5ba6",
  },
  {
    id: "abyss",
    name: "Abyss",
    hint: "Deep-sea black. Every open thread is an anglerfish — the louder it grows, the brighter its lure.",
    mode: "dark",
    paper: "#050a12",
    accent: "#52e3b8",
  },
  {
    id: "pompom",
    name: "Pompom",
    hint: "Peach fluff and button eyes. Every open thread is a pomeranian pup — leave it waiting and it barks.",
    mode: "light",
    paper: "#fdf3e7",
    accent: "#e0823f",
  },
  {
    id: "gravemist",
    name: "Gravemist",
    hint: "Fog and lantern light. Every open thread is a small ghost — its wail widens until you answer.",
    mode: "dark",
    paper: "#17161c",
    accent: "#8a86b5",
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export function isThemeId(value: string): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/** Whether a theme sits on dark ground — line colours pick their lightness from this. */
export function themeMode(id: ThemeId): "light" | "dark" {
  return THEMES.find((t) => t.id === id)?.mode ?? "light";
}
