import { View, useWindowDimensions } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useAppStore } from "@/stores/app-store";
import { CHARACTER_FRAMES, PX, resolvePalette } from "./mascot-frames";
import { Button, Hint, T, shadow } from "@/ui/primitives";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/ui/theme";

const CARD_PX = PX * 2.2;

/**
 * The first time every open thread has its answer for the day.
 *
 * The walkthrough ends at step ten with "That's everything!", which is the end
 * of a tour, not the end of anything the user did. This is the real ending:
 * the app's entire claim — that a day can be finished — delivered at the one
 * moment it is demonstrably true, which may be days after the tour.
 *
 * Once, ever. It is a promise being kept, and a promise kept twice is a habit
 * loop, which is the thing this app exists not to be.
 */
export function WholenessMoment() {
  const t = useT();
  const tk = useTheme();
  const showing = useAppStore((s) => s.showWholenessMoment);
  const dismiss = useAppStore((s) => s.dismissWholenessMoment);
  const mascotType = useAppStore((s) => s.mascotType);
  const { width: winW } = useWindowDimensions();

  if (!showing) return null;

  const frames = CHARACTER_FRAMES[mascotType];
  const pixels = frames["REACT"] ?? frames["IDLE_A"];
  const palette = resolvePalette(tk.accent);
  const compact = winW <= 760;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: compact ? 96 : 12,
        alignItems: "center",
        zIndex: 100,
      }}
    >
      <View
        accessibilityLabel="wholeness-moment"
        style={[
          {
            width: "100%",
            maxWidth: 420,
            gap: 10,
            backgroundColor: tk.bgRaised,
            padding: 16,
            borderWidth: 1,
            borderColor: tk.accent,
            borderRadius: tk.radiusLg,
          },
          tk.shadows ? shadow(tk) : null,
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <Svg width={10 * CARD_PX + 4} height={12 * CARD_PX + 4}>
            {pixels.map((p, i) => (
              <Rect
                key={i}
                x={p.c * CARD_PX + 2}
                y={p.r * CARD_PX + 2}
                width={CARD_PX - 0.2}
                height={CARD_PX - 0.2}
                fill={palette[p.k]}
              />
            ))}
          </Svg>
          <View style={{ flex: 1, gap: 2 }}>
            <T style={{ fontWeight: "700", color: tk.ink }}>{t("That's it.")}</T>
            <Hint style={{ margin: 0 }}>
              {t(
                "Everything open has its answer for today. Nothing more is asked of you. I'll be here tomorrow.",
              )}
            </Hint>
          </View>
        </View>
        <View style={{ flexDirection: "row" }}>
          <Button variant="primary" label={t("Thank you, Pip")} onPress={dismiss} />
        </View>
      </View>
    </View>
  );
}
