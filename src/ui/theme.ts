import { Platform } from "react-native";
import { useAppStore } from "@/stores/app-store";
import type { ThemeId } from "@/visualization/theme";

/**
 * The design tokens from the web app's global.css, one complete set per
 * theme. Colours are plain hex so they work in react-native-svg and
 * StyleSheet alike; durations are milliseconds; dash patterns are arrays.
 */
export type ThemeTokens = {
  id: ThemeId;
  mode: "light" | "dark";
  bg: string;
  bgRaised: string;
  bgSunken: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  lineMain: string;
  lineAxis: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  danger: string;
  focus: string;
  radius: number;
  radiusLg: number;
  btnRadius: number;
  /** Font stacks: full CSS stacks on web, closest single family on native. */
  fontBody: string | undefined;
  fontDisplay: string | undefined;
  /** Branch-line current animation: duration (ms) and dash pattern. */
  flowDuration: number;
  flowDash: [number, number];
  /** Main-line current animation. */
  mainFlowDuration: number;
  mainFlowDash: [number, number];
  /** Whether surfaces cast shadows (Porcelain casts none). */
  shadows: boolean;
  /**
   * The celebration color: the flourish that sweeps the main line when a
   * thread gets its answer, and the halo of the fully-answered sacred line.
   * Gold by default; each theme tunes it to its own light source.
   */
  shimmer: string;
};

const webFont = (stack: string) => (Platform.OS === "web" ? stack : undefined);

const FONT_SANS = webFont(
  '"Seravek", "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, -apple-system, sans-serif',
);
const FONT_MONO = webFont(
  '"JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, Menlo, Consolas, monospace',
);
const FONT_SERIF = webFont('Georgia, "Iowan Old Style", "Times New Roman", serif');
const FONT_ROUNDED = webFont(
  'ui-rounded, "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif',
);
const FONT_HELVETICA = webFont('"Helvetica Neue", Helvetica, Arial, sans-serif');
const FONT_DIDOT = webFont('"Didot", "Bodoni MT", "Playfair Display", "Times New Roman", serif');
const FONT_PALATINO = webFont(
  '"Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", serif',
);
const FONT_AVENIR = webFont('"Avenir Next", "Segoe UI", Seravek, "Gill Sans Nova", sans-serif');
const FONT_FUTURA = webFont('Futura, "Century Gothic", "Trebuchet MS", "URW Gothic", sans-serif');

type PartialTokens = Omit<ThemeTokens, "id" | "mode">;

// Each theme's celebration light, matched to its palette's own imagery:
// riverbed's warm gold, duskwood's fireflies, abyss's anglerfish lure,
// demonfire's embers, gravemist's lantern, koi pond's sun on water…
const SHIMMER: Record<ThemeId, string> = {
  riverbed: "#d9a94a",
  midnight: "#f2ce6b",
  sunprint: "#d98a3d",
  duskwood: "#ffc966",
  porcelain: "#c8a24b",
  demonfire: "#ff9d4d",
  koipond: "#ffd166",
  carnival: "#f0b429",
  catnap: "#e8b96b",
  abyss: "#9fe8ff",
  pompom: "#f4a95c",
  gravemist: "#ffd98a",
};

const base: Omit<PartialTokens, "shimmer"> = {
  bg: "#faf9f6",
  bgRaised: "#ffffff",
  bgSunken: "#f1efe9",
  ink: "#26251f",
  inkSoft: "#6b6a61",
  inkFaint: "#a3a196",
  lineMain: "#3d3c35",
  lineAxis: "#dedbd2",
  accent: "#3f6f5f",
  accentInk: "#ffffff",
  accentSoft: "#e4ede9",
  danger: "#9c4a3c",
  focus: "#2f5fa8",
  radius: 10,
  radiusLg: 16,
  btnRadius: 6,
  fontBody: FONT_SANS,
  fontDisplay: FONT_SANS,
  flowDuration: 2400,
  flowDash: [1, 14],
  mainFlowDuration: 3200,
  mainFlowDash: [2, 26],
  shadows: true,
};

function theme(id: ThemeId, mode: "light" | "dark", overrides: Partial<PartialTokens>): ThemeTokens {
  const t = { ...base, shimmer: SHIMMER[id], ...overrides };
  if (overrides.fontBody !== undefined && overrides.fontDisplay === undefined) {
    t.fontDisplay = overrides.fontBody;
  }
  return { id, mode, ...t };
}

export const THEME_TOKENS: Record<ThemeId, ThemeTokens> = {
  riverbed: theme("riverbed", "light", {}),
  midnight: theme("midnight", "dark", {
    bg: "#0b0e15",
    bgRaised: "#131826",
    bgSunken: "#070a10",
    ink: "#d2deef",
    inkSoft: "#8b98ad",
    inkFaint: "#56617a",
    lineMain: "#a8c4dd",
    lineAxis: "#232c40",
    accent: "#4fd6e3",
    accentInk: "#05191d",
    accentSoft: "#10333c",
    danger: "#e0705f",
    focus: "#7fb1ff",
    fontBody: FONT_MONO,
    radius: 3,
    radiusLg: 5,
    btnRadius: 2,
    flowDuration: 1100,
    flowDash: [2, 6],
    mainFlowDuration: 1600,
    mainFlowDash: [3, 12],
  }),
  sunprint: theme("sunprint", "light", {
    bg: "#faf1e2",
    bgRaised: "#fffaf1",
    bgSunken: "#f2e6d2",
    ink: "#43301f",
    inkSoft: "#85705c",
    inkFaint: "#b5a189",
    lineMain: "#5c4632",
    lineAxis: "#e6d7c0",
    accent: "#c2653f",
    accentInk: "#fff6ee",
    accentSoft: "#f4dfd2",
    danger: "#a83c32",
    focus: "#b4622d",
    fontBody: FONT_SERIF,
    radius: 16,
    radiusLg: 24,
    btnRadius: 999,
    flowDuration: 4500,
    flowDash: [1, 18],
    mainFlowDuration: 5000,
    mainFlowDash: [2, 30],
  }),
  duskwood: theme("duskwood", "dark", {
    bg: "#131a14",
    bgRaised: "#1b241c",
    bgSunken: "#0d120e",
    ink: "#e3e4d3",
    inkSoft: "#9aa38c",
    inkFaint: "#626b58",
    lineMain: "#cfd3b8",
    lineAxis: "#2a352b",
    accent: "#d9a14e",
    accentInk: "#221703",
    accentSoft: "#33301c",
    danger: "#cd7a5f",
    focus: "#9ec37a",
    fontBody: FONT_ROUNDED,
    radius: 12,
    radiusLg: 20,
    btnRadius: 10,
    flowDuration: 3600,
    flowDash: [1, 10],
    mainFlowDuration: 4200,
    mainFlowDash: [2, 20],
  }),
  porcelain: theme("porcelain", "light", {
    bg: "#ffffff",
    bgRaised: "#ffffff",
    bgSunken: "#f3f3f1",
    ink: "#171715",
    inkSoft: "#5c5c58",
    inkFaint: "#a9a9a3",
    lineMain: "#1a1a18",
    lineAxis: "#e7e7e3",
    accent: "#b23a2a",
    accentInk: "#ffffff",
    accentSoft: "#f6e4e0",
    danger: "#b23a2a",
    focus: "#171715",
    fontBody: FONT_HELVETICA,
    fontDisplay: FONT_DIDOT,
    radius: 0,
    radiusLg: 0,
    btnRadius: 0,
    flowDuration: 2000,
    flowDash: [1, 22],
    mainFlowDuration: 2800,
    mainFlowDash: [1, 30],
    shadows: false,
  }),
  demonfire: theme("demonfire", "dark", {
    bg: "#161013",
    bgRaised: "#221317",
    bgSunken: "#100a0d",
    ink: "#ecd9cd",
    inkSoft: "#a98d7e",
    inkFaint: "#6d5850",
    lineMain: "#e0b9a0",
    lineAxis: "#3a2620",
    accent: "#c65a33",
    accentInk: "#fff1e8",
    accentSoft: "#3d2018",
    danger: "#d3543e",
    focus: "#e08a4e",
    fontBody: FONT_PALATINO,
    radius: 8,
    radiusLg: 14,
    btnRadius: 6,
    flowDuration: 1600,
    flowDash: [2, 8],
    mainFlowDuration: 2200,
    mainFlowDash: [2, 16],
  }),
  koipond: theme("koipond", "light", {
    bg: "#e9f3ee",
    bgRaised: "#f7fbf9",
    bgSunken: "#dcebe3",
    ink: "#21332c",
    inkSoft: "#5c7268",
    inkFaint: "#92a89d",
    lineMain: "#33544a",
    lineAxis: "#c8ddd2",
    accent: "#3d7ea6",
    accentInk: "#f2f9fc",
    accentSoft: "#d8e8f0",
    danger: "#b05147",
    focus: "#2f6f92",
    fontBody: FONT_AVENIR,
    radius: 14,
    radiusLg: 22,
    btnRadius: 12,
    flowDuration: 3800,
    flowDash: [1, 12],
    mainFlowDuration: 4600,
    mainFlowDash: [2, 24],
  }),
  carnival: theme("carnival", "light", {
    bg: "#fbf0e0",
    bgRaised: "#fffaf0",
    bgSunken: "#f3e3cc",
    ink: "#40323a",
    inkSoft: "#83707a",
    inkFaint: "#b3a2ab",
    lineMain: "#5a4550",
    lineAxis: "#e8d8c4",
    accent: "#c65a8a",
    accentInk: "#fff3f8",
    accentSoft: "#f5dce8",
    danger: "#b0473f",
    focus: "#a84b7b",
    fontBody: FONT_FUTURA,
    radius: 18,
    radiusLg: 26,
    btnRadius: 999,
    flowDuration: 2000,
    flowDash: [2, 10],
    mainFlowDuration: 2600,
    mainFlowDash: [2, 20],
  }),
  catnap: theme("catnap", "light", {
    bg: "#f4f0f8",
    bgRaised: "#fcfaff",
    bgSunken: "#eae4f1",
    ink: "#2e2837",
    inkSoft: "#6f6680",
    inkFaint: "#a79dbb",
    lineMain: "#4a4058",
    lineAxis: "#ded5e9",
    accent: "#7a5ba6",
    accentInk: "#f7f2ff",
    accentSoft: "#e8def3",
    danger: "#a8544e",
    focus: "#6a4e93",
    fontBody: FONT_ROUNDED,
    radius: 14,
    radiusLg: 20,
    btnRadius: 12,
    flowDuration: 5000,
    flowDash: [1, 16],
    mainFlowDuration: 5600,
    mainFlowDash: [2, 28],
  }),
  abyss: theme("abyss", "dark", {
    bg: "#050a12",
    bgRaised: "#0b1420",
    bgSunken: "#02060c",
    ink: "#cfe4e2",
    inkSoft: "#7f9a9c",
    inkFaint: "#48606a",
    lineMain: "#9fc4c4",
    lineAxis: "#14222e",
    accent: "#52e3b8",
    accentInk: "#04241a",
    accentSoft: "#0b3328",
    danger: "#d96a5a",
    focus: "#52e3b8",
    radius: 6,
    radiusLg: 10,
    btnRadius: 4,
    flowDuration: 5500,
    flowDash: [1, 20],
    mainFlowDuration: 6000,
    mainFlowDash: [2, 34],
  }),
  pompom: theme("pompom", "light", {
    bg: "#fdf3e7",
    bgRaised: "#fffbf4",
    bgSunken: "#f5e6d2",
    ink: "#46362a",
    inkSoft: "#8b7460",
    inkFaint: "#c0a68d",
    lineMain: "#5f4832",
    lineAxis: "#efdec8",
    accent: "#e0823f",
    accentInk: "#fff7ec",
    accentSoft: "#f9e5cc",
    danger: "#c14f43",
    focus: "#cf7430",
    fontBody: FONT_ROUNDED,
    radius: 16,
    radiusLg: 24,
    btnRadius: 14,
    flowDuration: 2200,
    flowDash: [2, 8],
    mainFlowDuration: 2800,
    mainFlowDash: [2, 18],
  }),
  gravemist: theme("gravemist", "dark", {
    bg: "#17161c",
    bgRaised: "#211f28",
    bgSunken: "#100f14",
    ink: "#d9d6e4",
    inkSoft: "#928da3",
    inkFaint: "#5d5969",
    lineMain: "#bcb7cc",
    lineAxis: "#2d2a38",
    accent: "#8a86b5",
    accentInk: "#14121c",
    accentSoft: "#2a2740",
    danger: "#c26558",
    focus: "#a29ecf",
    fontBody: FONT_SERIF,
    radius: 8,
    radiusLg: 14,
    btnRadius: 6,
    flowDuration: 4200,
    flowDash: [1, 14],
    mainFlowDuration: 5000,
    mainFlowDash: [2, 24],
  }),
};

/** The active theme's tokens, reactive to the theme picked in settings. */
export function useTheme(): ThemeTokens {
  const id = useAppStore((s) => s.theme);
  return THEME_TOKENS[id];
}
