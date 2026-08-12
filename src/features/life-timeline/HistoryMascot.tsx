/**
 * History-page mascot: large animated companion on the right side of the
 * energy card, with cycling motivational sayings that update every few seconds.
 */

import { useMemo, useState, useEffect, useRef } from "react";
import { View } from "react-native";
import Svg, { G, Rect, Text as SvgText, Polygon } from "react-native-svg";
import type { ThemeTokens } from "@/ui/theme";
import { mix } from "@/ui/color";
import type { ColorKey, FrameName, MascotType, Pixel } from "./mascot-frames";
import { CHARACTER_FRAMES, PX } from "./mascot-frames";

// ─── Wellness ────────────────────────────────────────────────────────────────

export type WellnessLevel = 'thriving' | 'moving' | 'quiet' | 'struggling';

export function wellnessLevel(
  mergesCount: number,
  actionsCount: number,
  momentsCount: number,
  openLoudLines: number,
  totalOpenLines: number,
): WellnessLevel {
  const activity = mergesCount * 3 + actionsCount + momentsCount;
  if (activity >= 4 && openLoudLines <= 1) return 'thriving';
  if (activity >= 1 || openLoudLines <= 2) return 'moving';
  if (openLoudLines >= 3) return 'struggling';
  return 'quiet';
}

// ─── Sayings — buddy-style, cycle every few seconds ──────────────────────────

const SAYINGS: Record<WellnessLevel, string[]> = {
  thriving: [
    "That's what I'm talking about!",
    "Look at you smashing it!",
    "You moved things today. Big.",
    "This is what progress looks like.",
    "CLEARED! You're on fire!",
    "I love a productive day, boss.",
    "Threads handled. That's the work.",
  ],
  moving: [
    "Steady. Every step counts.",
    "You're working through it, boss.",
    "I got these threads. Keep going.",
    "One thing at a time. We got this.",
    "Small moves matter. Trust it.",
    "Solid day. I see you showing up.",
    "Progress is progress. Don't stop.",
  ],
  quiet: [
    "Even rest is progress.",
    "Some days are just observation.",
    "It's okay to sit with things.",
    "Tomorrow's a fresh start, boss.",
    "I'm watching the threads for you.",
    "Quiet days have their own value.",
    "Rest is part of the work too.",
  ],
  struggling: [
    "Heavy load today. I see you.",
    "Loud threads are tough. Go easy.",
    "You're still here. That's enough.",
    "These things take time, boss.",
    "I've got my eye on the loud ones.",
    "Be gentle with yourself today.",
    "You don't have to solve it all now.",
  ],
};

const ANIM_SEQUENCES: Record<WellnessLevel, FrameName[]> = {
  thriving:   ['REACT','IDLE_A','REACT','IDLE_B','INSPECT_B','REACT','IDLE_A','REACT'],
  moving:     ['INSPECT_A','IDLE_A','INSPECT_B','IDLE_B','TALK_A','IDLE_A','TALK_B','IDLE_B'],
  quiet:      ['IDLE_A','IDLE_B','IDLE_A','IDLE_B','INSPECT_A','IDLE_A','IDLE_B'],
  struggling: ['INSPECT_A','IDLE_A','TALK_A','IDLE_B','INSPECT_A','IDLE_A'],
};

const ANIM_MS: Record<WellnessLevel, number> = {
  thriving: 260, moving: 400, quiet: 500, struggling: 520,
};

const SAY_INTERVAL_MS = 3800; // cycle sayings every ~4s

// ─── Color palette ────────────────────────────────────────────────────────────

function resolveColors(accent: string): Record<ColorKey, string> {
  return {
    D: "#1a1a1a", A: accent, Ad: mix(accent,"#000000",65), Ah: mix(accent,"#ffffff",55),
    S: "#f5c38c", Sd: "#c4864e", Ss: "#fde6be", W: "#ffffff", P: "#1a1a1a", R: "#e8836a",
    G: "#f0c040", Gd: "#b88620", Bl: "#3a6ad4", Bd: "#1a3fa0", Bh: "#6e96f5",
    Sh2: "rgba(0,0,0,0.18)",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

// Display scale: 3× the base PX so the mascot is large and prominent
const HIST_PX = PX * 3.2;

type Props = {
  wellness: WellnessLevel;
  mascotType: MascotType;
  theme: ThemeTokens;
};

export function HistoryMascot({ wellness, mascotType, theme }: Props) {
  const palette = useMemo(() => resolveColors(theme.accent), [theme.accent]);
  const frames = CHARACTER_FRAMES[mascotType];

  // Animated sprite frame
  const [activeFrame, setActiveFrame] = useState<FrameName>(ANIM_SEQUENCES[wellness][0]);
  const seqIdx = useRef(0);
  useEffect(() => {
    seqIdx.current = 0;
    const seq = ANIM_SEQUENCES[wellness];
    const speed = ANIM_MS[wellness];
    const id = setInterval(() => {
      seqIdx.current = (seqIdx.current + 1) % seq.length;
      setActiveFrame(seq[seqIdx.current]);
    }, speed);
    return () => clearInterval(id);
  }, [wellness]);

  // Cycling sayings — rotate through the pool
  const pool = SAYINGS[wellness];
  const sayIdx = useRef(Math.floor(Math.random() * pool.length));
  const [saying, setSaying] = useState(pool[sayIdx.current]);
  useEffect(() => {
    const id = setInterval(() => {
      sayIdx.current = (sayIdx.current + 1) % pool.length;
      setSaying(pool[sayIdx.current]);
    }, SAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pool]);

  const activePixels = frames[activeFrame] ?? frames['IDLE_A'];

  // Sprite SVG size at 3x scale
  const spriteW = HIST_PX * 12;
  const spriteH = HIST_PX * 16;

  // Bubble above sprite — auto-size to text
  const bubbleW = Math.min(180, Math.max(100, saying.length * 6 + 20));
  const bubbleH = 30;
  const bubbleMid = spriteW / 2;
  const bubbleX = bubbleMid - bubbleW / 2;

  const totalH = bubbleH + 10 + spriteH + 4;

  return (
    <View style={{ alignItems: "flex-end", paddingRight: 8, marginTop: 8, marginBottom: 4 }}>
      <Svg width={spriteW + 4} height={totalH}>
        {/* Bubble */}
        <G>
          <Rect x={bubbleX} y={0} width={bubbleW} height={bubbleH} rx={8}
            fill={theme.bgRaised} stroke={theme.accent} strokeWidth={1.6} />
          <Polygon
            points={`${bubbleMid - 6},${bubbleH} ${bubbleMid},${bubbleH + 9} ${bubbleMid + 6},${bubbleH}`}
            fill={theme.accent}
          />
          <Rect x={bubbleMid - 7} y={bubbleH - 2} width={14} height={4} fill={theme.bgRaised} />
          <SvgText
            x={bubbleMid} y={bubbleH - 9}
            textAnchor="middle"
            fontSize={11.5}
            fontFamily={theme.fontBody}
            fontWeight="700"
            fill={theme.ink}
          >
            {saying}
          </SvgText>
        </G>

        {/* Large mascot sprite */}
        <G transform={`translate(2, ${bubbleH + 10})`}>
          {activePixels.map((p, i) => (
            <Rect
              key={i}
              x={p.c * HIST_PX}
              y={p.r * HIST_PX}
              width={HIST_PX - 0.3}
              height={HIST_PX - 0.3}
              fill={palette[p.k]}
            />
          ))}
        </G>
      </Svg>
    </View>
  );
}
