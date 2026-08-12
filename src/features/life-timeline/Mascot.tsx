/**
 * Mascot SVG renderer — 12×16 grid pixel-art character.
 * Driven by plain JS state from useMascot (web + native compatible).
 */

import { useMemo } from "react";
import { Platform } from "react-native";
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
const CHAR_W    = 5.2;   // average pixel-width per char at FONT_SIZE
const LINE_H    = 13;
const MAX_BUBBLE_W = 165;
const MIN_BUBBLE_W = 60;
const H_PAD = 14;        // horizontal padding (both sides total)
const V_PAD_TOP = 5;
const V_PAD_BOT = 6;

function wrapText(text: string, maxW: number): string[] {
  const maxChars = Math.floor((maxW - H_PAD) / CHAR_W);
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function measureBubble(text: string): { lines: string[]; w: number; h: number } {
  // First try single line
  const singleLen = text.length * CHAR_W + H_PAD;
  if (singleLen <= MAX_BUBBLE_W) {
    const w = Math.max(MIN_BUBBLE_W, singleLen);
    return { lines: [text], w, h: V_PAD_TOP + LINE_H + V_PAD_BOT };
  }
  // Multi-line wrap
  const lines = wrapText(text, MAX_BUBBLE_W);
  const longestLen = Math.max(...lines.map(l => l.length)) * CHAR_W + H_PAD;
  const w = Math.max(MIN_BUBBLE_W, Math.min(MAX_BUBBLE_W, longestLen));
  const h = V_PAD_TOP + lines.length * LINE_H + V_PAD_BOT;
  return { lines, w, h };
}

// ─── Speech bubble ────────────────────────────────────────────────────────────

function SpeechBubble({
  spriteX, spriteY, opacity, text, theme,
}: {
  spriteX: number; spriteY: number;
  opacity: number; text: string;
  theme: ThemeTokens;
}) {
  if (opacity <= 0.01 || !text) return null;

  const { lines, w: bubbleW, h: bubbleH } = measureBubble(text);
  const spriteW = PX * 12;
  const bx = spriteX + spriteW / 2 - bubbleW / 2;
  const by = spriteY - bubbleH - 10;
  const mid = bx + bubbleW / 2;

  return (
    <G opacity={opacity} pointerEvents="none">
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
    </G>
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
  x: number;
  y: number;
  frame: FrameName;
  flip: number;
  mascotType: MascotType;
  bubbleOpacity: number;
  bubbleText: string;
  showTapHint: boolean;
  theme: ThemeTokens;
  onPress: () => void;
};

export function Mascot({
  x, y, frame, flip, mascotType,
  bubbleOpacity, bubbleText, showTapHint, theme, onPress,
}: Props) {
  const palette = useMemo(() => resolveColors(theme.accent), [theme.accent]);
  const frames = CHARACTER_FRAMES[mascotType];
  const pixels = frames[frame] ?? frames['IDLE_A'];
  const spriteW = PX * 12;

  const transform = flip === -1
    ? `translate(${x + spriteW}, ${y}) scale(-1, 1)`
    : `translate(${x}, ${y})`;

  return (
    <>
      <SpeechBubble spriteX={x} spriteY={y} opacity={bubbleOpacity} text={bubbleText} theme={theme} />
      <G
        transform={transform}
        onPress={onPress}
        // pointer cursor on web makes it obvious it's clickable
        {...(Platform.OS === 'web' ? { style: { cursor: 'pointer' } as object } : null)}
      >
        {showTapHint && <TapRing spriteW={spriteW} theme={theme} />}
        <PixelGrid pixels={pixels} palette={palette} />
        {/* Generous transparent hit area */}
        <Rect x={-4} y={-8} width={spriteW + 8} height={PX * 16 + 8} fill="transparent" onPress={onPress} />
      </G>
    </>
  );
}
