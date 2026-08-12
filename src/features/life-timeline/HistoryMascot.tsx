/**
 * History-page mascot: animated sprite only, no speech bubble.
 * Sits at the far right of the day-header row.
 */

import { View } from "react-native";
import Svg, { G, Rect } from "react-native-svg";
import { useMemo, useState, useEffect, useRef } from "react";
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
  _total: number,
): WellnessLevel {
  const activity = mergesCount * 3 + actionsCount + momentsCount;
  if (activity >= 4 && openLoudLines <= 1) return 'thriving';
  if (activity >= 1 || openLoudLines <= 2) return 'moving';
  if (openLoudLines >= 3) return 'struggling';
  return 'quiet';
}

// ─── Animation sequences ──────────────────────────────────────────────────────

const ANIM_SEQ: Record<WellnessLevel, FrameName[]> = {
  thriving:   ['REACT','IDLE_A','REACT','IDLE_B','INSPECT_B','REACT'],
  moving:     ['INSPECT_A','IDLE_A','INSPECT_B','IDLE_B','TALK_A','IDLE_B'],
  quiet:      ['IDLE_A','IDLE_B','IDLE_A','IDLE_B','INSPECT_A','IDLE_A'],
  struggling: ['INSPECT_A','IDLE_A','TALK_A','IDLE_B','INSPECT_A','IDLE_B'],
};

const ANIM_MS: Record<WellnessLevel, number> = {
  thriving: 270, moving: 420, quiet: 520, struggling: 540,
};

// ─── Color palette ────────────────────────────────────────────────────────────

function resolveColors(accent: string): Record<ColorKey, string> {
  return {
    D:"#1a1a1a", A:accent, Ad:mix(accent,"#000000",65), Ah:mix(accent,"#ffffff",55),
    S:"#f5c38c", Sd:"#c4864e", Ss:"#fde6be", W:"#ffffff", P:"#1a1a1a", R:"#e8836a",
    G:"#f0c040", Gd:"#b88620", Bl:"#3a6ad4", Bd:"#1a3fa0", Bh:"#6e96f5",
    Sh2:"rgba(0,0,0,0.18)",
  };
}

const HIST_PX = PX * 2.2;

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  wellness: WellnessLevel;
  mascotType: MascotType;
  theme: ThemeTokens;
};

export function HistoryMascot({ wellness, mascotType, theme }: Props) {
  const palette = useMemo(() => resolveColors(theme.accent), [theme.accent]);
  const frames = CHARACTER_FRAMES[mascotType];

  const [activeFrame, setActiveFrame] = useState<FrameName>(ANIM_SEQ[wellness][0]);
  const seqIdx = useRef(0);
  useEffect(() => {
    seqIdx.current = 0;
    const seq = ANIM_SEQ[wellness];
    const id = setInterval(() => {
      seqIdx.current = (seqIdx.current + 1) % seq.length;
      setActiveFrame(seq[seqIdx.current]);
    }, ANIM_MS[wellness]);
    return () => clearInterval(id);
  }, [wellness]);

  const pixels = frames[activeFrame] ?? frames['IDLE_A'];
  const spriteW = HIST_PX * 12;
  const spriteH = HIST_PX * 16;

  return (
    <View style={{ marginLeft: "auto" }}>
      <Svg width={spriteW} height={spriteH}>
        <G>
          {pixels.map((p: Pixel, i: number) => (
            <Rect
              key={i}
              x={p.c * HIST_PX}
              y={p.r * HIST_PX}
              width={HIST_PX - 0.2}
              height={HIST_PX - 0.2}
              fill={palette[p.k]}
            />
          ))}
        </G>
      </Svg>
    </View>
  );
}
