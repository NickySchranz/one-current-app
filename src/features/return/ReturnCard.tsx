import { useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useAppStore } from "@/stores/app-store";
import { isOpen } from "@/domain/branches/logic";
import { CHARACTER_FRAMES, PX, resolvePalette } from "@/features/life-timeline/mascot-frames";
import { Button, Hint, T, shadow } from "@/ui/primitives";
import { loudnessWord } from "@/ui/LoudnessSlider";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/ui/theme";

const CARD_PX = PX * 2.2;
const CARD_MAX_W = 420;
/** Enough threads to show the load was held; more than this becomes a list to read. */
const SHOWN = 4;

/**
 * What Pip says when the app has been closed for a while.
 *
 * Loudness no longer climbs on days the app was shut (see domain/time/presence),
 * so coming back is no longer punished — but the user cannot know that unless
 * they are told. This card is the telling: it names the gap, says the threads
 * were held rather than left to rot, and offers the cheapest possible honest
 * answer ("Still true") so an absence costs one tap instead of a full round.
 *
 * Deliberately not a warning: no counts of anything missed, no red, no
 * blocking. The wholeness chip also stays neutral until this is answered —
 * nobody should be told their day will be hard before being asked.
 */
export function ReturnCard() {
  const t = useT();
  const tk = useTheme();
  const branches = useAppStore((s) => s.branches);
  const daysAway = useAppStore((s) => s.daysAway);
  const greeted = useAppStore((s) => s.returnGreeted);
  const mascotType = useAppStore((s) => s.mascotType);
  const greetReturn = useAppStore((s) => s.greetReturn);
  const holdOpenThreads = useAppStore((s) => s.holdOpenThreads);
  const closeAsNoLongerRelevant = useAppStore((s) => s.closeAsNoLongerRelevant);
  const { width: winW } = useWindowDimensions();

  // What was left open, loudest first — and at the level it was LEFT at, not
  // as felt today. "As you left them" has to be literally true.
  const held = useMemo(
    () => branches.filter(isOpen).sort((a, b) => b.loudness - a.loudness),
    [branches],
  );

  // Nothing was waiting, so there is nothing to be reassured about.
  if (greeted || daysAway < 2 || held.length === 0) return null;

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
        // The check scripts measure the card by this label.
        accessibilityLabel="return-card"
        style={[
          {
            width: "100%",
            maxWidth: CARD_MAX_W,
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
            <T style={{ fontWeight: "700", color: tk.ink }}>
              {t("You were away {n} days.", { n: daysAway })}
            </T>
            <Hint style={{ margin: 0 }}>{t("I kept them as you left them.")}</Hint>
          </View>
        </View>

        <View style={{ gap: 4 }}>
          {held.slice(0, SHOWN).map((b) => (
            <View
              key={b.id}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <T style={{ flex: 1, fontSize: 13.6 }} numberOfLines={1}>
                {b.title}
              </T>
              <Hint style={{ margin: 0 }}>
                {t("was {level}", { level: t(loudnessWord(b.loudness)) })}
              </Hint>
              {/* Some of what was waiting simply stopped mattering while the
                  person was away, and that has to be one tap — otherwise the
                  only way to clear it is to claim it was worked through. */}
              <Button
                variant="quiet"
                label={t("Not any more")}
                onPress={() => void closeAsNoLongerRelevant(b.id)}
              />
            </View>
          ))}
          {held.length > SHOWN && (
            <Hint style={{ margin: 0 }}>
              {t("and {n} more, all as they were", { n: held.length - SHOWN })}
            </Hint>
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant="primary"
            label={t("All still the same")}
            onPress={() => void holdOpenThreads()}
          />
          <Button variant="quiet" label={t("Something changed")} onPress={greetReturn} />
        </View>
      </View>
    </View>
  );
}
