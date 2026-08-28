/**
 * Mascot SVG renderer — 12×16 grid pixel-art character.
 * Driven by plain JS state from useMascot (web + native compatible).
 */

import { useMemo } from "react";
import { Platform } from "react-native";
import Animated, { useAnimatedProps, type SharedValue } from "react-native-reanimated";
import { G, Rect, Text as SvgText, Circle, Polygon } from "react-native-svg";
import type { ThemeTokens } from "@/ui/theme";
import { mix } from "@/ui/color";
import type { ColorKey, FrameName, MascotType, Pixel } from "./mascot-frames";
import { CHARACTER_FRAMES, PX } from "./mascot-frames";

// ─── Color palette ────────────────────────────────────────────────────────────

function resolveColors(accent: string): Record<ColorKey, string> {
  return {
    D:   "#1a1a1a",
    A:   accent,
    Ad:  mix(accent, "#000000", 65),
    Ah:  mix(accent, "#ffffff", 55),
    S:   "#f5c38c",
    Sd:  "#c4864e",
    Ss:  "#fde6be",
    W:   "#ffffff",
    P:   "#1a1a1a",
    R:   "#e8836a",
    G:   "#f0c040",
    Gd:  "#b88620",
    Bl:  "#3a6ad4",
    Bd:  "#1a3fa0",
    Bh:  "#6e96f5",
    Sh2: "rgba(0,0,0,0.18)",
  };
}

// ─── Pixel grid ───────────────────────────────────────────────────────────────

function PixelGrid({ pixels, palette }: { pixels: Pixel[]; palette: Record<ColorKey, string> }) {
  return (
    <>
      {pixels.map((p, i) => (
        <Rect key={i} x={p.c * PX} y={p.r * PX} width={PX - 0.15} height={PX - 0.15} fill={palette[p.k]} />
      ))}
    </>
  );
}

// ─── Text wrapping ────────────────────────────────────────────────────────────

const FONT_SIZE = 9.5;
const LINE_H    = 13;
const MAX_BUBBLE_W = 180;
const MIN_BUBBLE_W = 60;
const H_PAD = 20;        // horizontal padding (both sides total)
const V_PAD_TOP = 5;
const V_PAD_BOT = 6;
const MAX_LINES = 4;

// ── Width estimation ──
// react-native-svg cannot measure text before rendering, so the bubble is
// sized from a per-glyph estimate instead of one average. The table errs
// wide on purpose (plus a safety margin): a bubble a few px roomy is
// invisible; a line poking out of the border is not.
const GLYPH_NARROW = new Set([..."ijl!.,;:'’|¡· "]);
const GLYPH_SLIM = new Set([..."ftr()[]\"-"]);
/** A full em wide — the dash and the ellipsis are as wide as an M. */
const GLYPH_EM = new Set([..."—…"]);
const GLYPH_EN = new Set([..."–"]);
const GLYPH_WIDE = new Set([..."mwMW@%"]);
const CAP_RE = /[A-ZÁÉÍÓÚÑÜÀ-Þ]/;

function glyphW(ch: string): number {
  if (ch === " ") return 2.8;
  if (GLYPH_EM.has(ch)) return 9.8;
  if (GLYPH_EN.has(ch)) return 5.2;
  if (GLYPH_NARROW.has(ch)) return 3.0;
  if (GLYPH_SLIM.has(ch)) return 4.0;
  if (GLYPH_WIDE.has(ch)) return 8.6;
  if (CAP_RE.test(ch)) return 6.9;
  if (ch >= "0" && ch <= "9") return 5.6;
  return 5.1; // lowercase and everything else
}

/** Monospace faces give every glyph the same box: count, never classify. */
function isMono(f: string): boolean {
  return (
    f.includes("mono") || f.includes("courier") || f.includes("consol") || f.includes("menlo")
  );
}
/** Widest common monospace advance, as a share of the font size. */
const MONO_ADVANCE = 0.63;

/** How much wider than the reference sans a theme's body face runs. */
export function fontWidthFactor(fontBody = ""): number {
  const f = fontBody.toLowerCase();
  if (f.includes("courier") || f.includes("mono")) return 1.12;
  if (f.includes("futura") || f.includes("century") || f.includes("rounded") || f.includes("avenir"))
    return 1.16;
  if (f.includes("helvetica") || f.includes("arial")) return 1.1;
  if (f.includes("georgia") || f.includes("palatino") || f.includes("times") || f.includes("serif"))
    return 1.09;
  // The base stack can resolve all the way down to DejaVu Sans, which is at
  // the wide end of the humanist sans faces — leave it a little slack.
  return 1.05;
}

const SAFETY = 1.08;

/** Estimated rendered width of `text` at `fontSize`, in the given face. */
export function estTextWidth(text: string, fontBody = "", fontSize = FONT_SIZE): number {
  if (isMono(fontBody.toLowerCase())) {
    return [...text].length * MONO_ADVANCE * fontSize * SAFETY;
  }
  let w = 0;
  for (const ch of text) w += glyphW(ch);
  return w * fontWidthFactor(fontBody) * SAFETY * (fontSize / FONT_SIZE);
}

function wrapText(text: string, budgetPx: number, fontBody?: string): string[] {
  const fits = (s: string) => estTextWidth(s, fontBody) <= budgetPx;
  const lines: string[] = [];
  let cur = "";
  const push = (s: string) => { if (s) lines.push(s); };
  for (const word of text.split(" ")) {
    const next = cur ? cur + " " + word : word;
    if (fits(next)) {
      cur = next;
      continue;
    }
    push(cur);
    if (fits(word)) {
      cur = word;
    } else {
      // A single word wider than the bubble: break it by characters.
      let piece = "";
      for (const ch of word) {
        if (fits(piece + ch)) piece += ch;
        else { push(piece); piece = ch; }
      }
      cur = piece;
    }
  }
  push(cur);
  if (lines.length > MAX_LINES) {
    const kept = lines.slice(0, MAX_LINES);
    kept[MAX_LINES - 1] = kept[MAX_LINES - 1].replace(/.{2}$/, "") + "…";
    return kept;
  }
  return lines;
}

function measureBubble(text: string, fontBody?: string): { lines: string[]; w: number; h: number } {
  const budget = MAX_BUBBLE_W - H_PAD;
  const single = estTextWidth(text, fontBody);
  if (single <= budget) {
    const w = Math.max(MIN_BUBBLE_W, single + H_PAD);
    return { lines: [text], w, h: V_PAD_TOP + LINE_H + V_PAD_BOT };
  }
  const lines = wrapText(text, budget, fontBody);
  const longest = Math.max(...lines.map((l) => estTextWidth(l, fontBody)));
  const w = Math.max(MIN_BUBBLE_W, Math.min(MAX_BUBBLE_W, longest + H_PAD));
  const h = V_PAD_TOP + lines.length * LINE_H + V_PAD_BOT;
  return { lines, w, h };
}

// ─── Speech bubble ────────────────────────────────────────────────────────────

function SpeechBubble({
  spriteX, spriteY, opacity, text, theme, posX, viewW,
}: {
  spriteX: number; spriteY: number;
  opacity: SharedValue<number>; text: string;
  theme: ThemeTokens;
  /** Sprite anchor on the UI thread + canvas width: a wide bubble fades as
   * its own edge (not just the sprite) starts to overhang the canvas. */
  posX?: SharedValue<number>;
  viewW?: number;
}) {
  const { lines, w: bubbleW, h: bubbleH } = measureBubble(text || " ", theme.fontBody);
  const half = bubbleW / 2;
  const fade = useAnimatedProps(() => {
    let edge = 1;
    if (posX && viewW && viewW > 0) {
      const cx = posX.value + (PX * 12) / 2;
      const fr = Math.max(0, Math.min(1, (viewW - (cx + half)) / 40 + 1));
      const fl = Math.max(0, Math.min(1, (cx - half) / 40 + 1));
      edge = Math.min(fr, fl);
    }
    return { opacity: opacity.value * edge };
  }, [opacity, posX, viewW, half]);
  if (!text) return null;

  const spriteW = PX * 12;
  const bx = spriteX + spriteW / 2 - bubbleW / 2;
  const by = spriteY - bubbleH - 10;
  const mid = bx + bubbleW / 2;

  return (
    <AnimatedG animatedProps={fade} pointerEvents="none">
      <Rect x={bx} y={by} width={bubbleW} height={bubbleH} rx={5}
        fill={theme.bgRaised} stroke={theme.accent} strokeWidth={1.3} />
      <Polygon
        points={`${mid - 5},${by + bubbleH} ${mid},${by + bubbleH + 7} ${mid + 5},${by + bubbleH}`}
        fill={theme.accent}
      />
      <Rect x={mid - 6} y={by + bubbleH - 1} width={12} height={3} fill={theme.bgRaised} />
      {lines.map((line, i) => (
        <SvgText
          key={i}
          x={mid}
          y={by + V_PAD_TOP + (i + 0.85) * LINE_H}
          textAnchor="middle"
          fontSize={FONT_SIZE}
          fontFamily={theme.fontBody}
          fontWeight="600"
          fill={theme.ink}
        >
          {line}
        </SvgText>
      ))}
    </AnimatedG>
  );
}

// ─── Tap-me indicator ─────────────────────────────────────────────────────────
// Small pulsing ring that appears above the mascot's head when idle,
// making it clear you can click/tap.

function TapRing({ spriteW, theme }: { spriteW: number; theme: ThemeTokens }) {
  // A small hand-pointer icon made of simple shapes
  return (
    <G pointerEvents="none" opacity={0.7}>
      {/* small arrow/caret above head */}
      <Polygon
        points={`${spriteW / 2 - 4},${-2} ${spriteW / 2 + 4},${-2} ${spriteW / 2},${-8}`}
        fill={theme.accent}
        opacity={0.8}
      />
      {/* subtle glow ring around whole sprite */}
      <Rect
        x={-3} y={-3}
        width={spriteW + 6} height={PX * 12}
        rx={6}
        fill="none"
        stroke={theme.accent}
        strokeWidth={1.2}
        opacity={0.35}
        strokeDasharray={[3, 3]}
      />
    </G>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  /** Per-frame position on the UI thread — the sprite never re-renders to move. */
  posX: SharedValue<number>;
  posY: SharedValue<number>;
  /** Visible canvas width: he fades out as his anchor nears the edges, so
   * no half-clipped sprite or bubble ever lingers at the boundary. */
  viewW?: number;
  frame: FrameName;
  flip: number;
  mascotType: MascotType;
  /** Bubble fade on the UI thread; omit for a mascot that never speaks. */
  bubbleO?: SharedValue<number>;
  /** 0/1 gait phase while `frame` is a RUN frame — swapped without renders. */
  runPhase?: SharedValue<number>;
  bubbleText: string;
  showTapHint: boolean;
  theme: ThemeTokens;
  onPress: () => void;
};

const AnimatedG = Animated.createAnimatedComponent(G);

export function Mascot({
  posX, posY, frame, flip, mascotType,
  bubbleO, bubbleText, showTapHint, theme, onPress, runPhase,
  viewW = 0,
}: Props) {
  const palette = useMemo(() => resolveColors(theme.accent), [theme.accent]);
  const frames = CHARACTER_FRAMES[mascotType];
  const pixels = frames[frame] ?? frames['IDLE_A'];
  const spriteW = PX * 12;
  // While running, both gait frames are mounted and the UI thread swaps
  // their opacity — the 9Hz gait never re-renders React.
  const running = (frame === 'RUN_A' || frame === 'RUN_B') && !!runPhase;
  const gaitA = useAnimatedProps(
    () => ({ opacity: runPhase ? (runPhase.value === 0 ? 1 : 0) : 1 }),
    [runPhase],
  );
  const gaitB = useAnimatedProps(
    () => ({ opacity: runPhase ? (runPhase.value === 1 ? 1 : 0) : 0 }),
    [runPhase],
  );

  // The whole group (bubble included) rides the shared position; everything
  // inside is drawn relative to (0,0) = the sprite's top-left. Near the
  // canvas edges the group fades out — when the view sits in the past, Pip
  // belongs to Now, and no half-bubble should hover at the boundary.
  const rideProps = useAnimatedProps(() => {
    const x = posX.value;
    let o = 1;
    if (viewW > 0) {
      const rightFade = Math.max(0, Math.min(1, (viewW - 60 - x) / 45));
      const leftFade = Math.max(0, Math.min(1, (x + 20) / 45));
      o = Math.min(rightFade, leftFade);
    }
    return { x, y: posY.value, opacity: o };
  }, [posX, posY, viewW]);

  const transform = flip === -1 ? `translate(${spriteW}, 0) scale(-1, 1)` : undefined;

  return (
    <AnimatedG animatedProps={rideProps}>
      {bubbleO && (
        <SpeechBubble
          spriteX={0}
          spriteY={0}
          opacity={bubbleO}
          text={bubbleText}
          theme={theme}
          posX={posX}
          viewW={viewW}
        />
      )}
      {/* Plain G on purpose: any accessibility role on an SVG group makes
          react-native-svg (web) emit an HTML <button> inside the <svg>,
          which renders nothing — Pip vanishes entirely. */}
      <G
        transform={transform}
        onPress={onPress}
        // pointer cursor on web makes it obvious it's clickable
        {...(Platform.OS === 'web' ? { style: { cursor: 'pointer' } as object } : null)}
      >
        {showTapHint && <TapRing spriteW={spriteW} theme={theme} />}
        {running ? (
          <>
            <AnimatedG animatedProps={gaitA}>
              <PixelGrid pixels={frames['RUN_A'] ?? pixels} palette={palette} />
            </AnimatedG>
            <AnimatedG animatedProps={gaitB}>
              <PixelGrid pixels={frames['RUN_B'] ?? pixels} palette={palette} />
            </AnimatedG>
          </>
        ) : (
          <PixelGrid pixels={pixels} palette={palette} />
        )}
        {/* Generous transparent hit area */}
        <Rect x={-4} y={-8} width={spriteW + 8} height={PX * 16 + 8} fill="transparent" onPress={onPress} />
      </G>
    </AnimatedG>
  );
}
