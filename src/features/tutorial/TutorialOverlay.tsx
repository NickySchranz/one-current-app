import { View, Pressable } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { T } from '@/ui/primitives';
import { useT } from '@/i18n/i18n';
import { useTheme } from '@/ui/theme';
import { mix } from '@/ui/color';
import type { MascotType, ColorKey } from '@/features/life-timeline/mascot-frames';
import { CHARACTER_FRAMES, PX } from '@/features/life-timeline/mascot-frames';
import type { TutorialStep } from './useTutorial';

type Props = {
  step: TutorialStep;
  stepIndex: number;
  totalSteps: number;
  mascotType: MascotType;
  onNext: () => void;
  onSkip: () => void;
};

const TUT_PX = PX * 2.5;

function resolvePalette(accent: string): Record<ColorKey, string> {
  return {
    D:   '#1a1a1a',
    A:   accent,
    Ad:  mix(accent, '#000000', 65),
    Ah:  mix(accent, '#ffffff', 55),
    S:   '#f5c38c',
    Sd:  '#c4864e',
    Ss:  '#fde6be',
    W:   '#ffffff',
    P:   '#1a1a1a',
    R:   '#e8836a',
    G:   '#f0c040',
    Gd:  '#b88620',
    Bl:  '#3a6ad4',
    Bd:  '#1a3fa0',
    Bh:  '#6e96f5',
    Sh2: 'rgba(0,0,0,0.18)',
  };
}

export function TutorialOverlay({
  step,
  stepIndex,
  totalSteps,
  mascotType,
  onNext,
  onSkip,
}: Props) {
  const tk = useTheme();
  const t = useT();
  const frames = CHARACTER_FRAMES[mascotType];
  const pixels = frames[step.frame] ?? frames['IDLE_A'];
  const palette = resolvePalette(tk.accent);

  const svgW = 10 * TUT_PX + 4;
  const svgH = 12 * TUT_PX + 4;

  const isLast = stepIndex >= totalSteps - 1;

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: tk.bgRaised,
        borderTopWidth: 1,
        borderTopColor: tk.accent,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 8,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        zIndex: 100,
      }}
    >
      {/* Mascot sprite */}
      <Svg width={svgW} height={svgH}>
        {pixels.map((p, i) => (
          <Rect
            key={i}
            x={p.c * TUT_PX + 2}
            y={p.r * TUT_PX + 2}
            width={TUT_PX - 0.2}
            height={TUT_PX - 0.2}
            fill={palette[p.k]}
          />
        ))}
      </Svg>

      {/* Text + controls */}
      <View style={{ flex: 1, gap: 6 }}>
        {/* Skip button */}
        <Pressable onPress={onSkip} style={{ alignSelf: 'flex-end' }}>
          <T style={{ fontSize: 12, color: tk.inkSoft }}>{t("Skip tour")}</T>
        </Pressable>

        <T
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: tk.ink,
            fontFamily: tk.fontDisplay,
          }}
        >
          {t(step.text)}
        </T>
        {step.subtext ? (
          <T style={{ fontSize: 13.5, color: tk.inkSoft, lineHeight: 19 }}>
            {t(step.subtext)}
          </T>
        ) : null}

        {/* Step dots */}
        <View style={{ flexDirection: 'row', gap: 5, marginTop: 4 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={{
                width: i === stepIndex ? 16 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === stepIndex ? tk.accent : tk.inkFaint,
              }}
            />
          ))}
        </View>

        {/* Next / Done button */}
        <Pressable
          onPress={onNext}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            marginTop: 4,
            paddingVertical: 8,
            paddingHorizontal: 20,
            borderRadius: tk.btnRadius,
            backgroundColor: pressed
              ? mix(tk.accent, '#000000', 85)
              : tk.accent,
          })}
        >
          <T
            style={{
              color: tk.accentInk,
              fontWeight: '700',
              fontSize: 14,
            }}
          >
            {isLast ? t("Let's go!") : t("Next →")}
          </T>
        </Pressable>
      </View>
    </View>
  );
}
