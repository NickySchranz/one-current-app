import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  useWindowDimensions,
  View,
  type PressableStateCallbackType,
} from "react-native";
import Animated, {
  cancelAnimation,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { G, Path } from "react-native-svg";
import { useAppStore } from "@/stores/app-store";
import type { PsychologicalBranch } from "@/domain/branches/types";
import { effectiveLoudness } from "@/domain/branches/logic";
import { decidedToday, energySplit } from "@/domain/feelings/logic";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/ui/theme";
import { alpha, mix } from "@/ui/color";
import { Hint, shadow, T } from "@/ui/primitives";

const AnimatedG = Animated.createAnimatedComponent(G);
const easeInOut = Easing.inOut(Easing.ease);

/** One braid strand, swaying gently; neighbours drift out of phase. */
function Strand({
  d,
  stroke,
  opacity,
  swayPx,
  durationMs,
  delayMs,
  still,
}: {
  d: string;
  stroke: string;
  opacity: number;
  swayPx: number;
  durationMs: number;
  delayMs: number;
  still: boolean;
}) {
  const sway = useSharedValue(0);
  useEffect(() => {
    if (still) {
      cancelAnimation(sway);
      sway.value = 0;
      return;
    }
    sway.value = 0;
    sway.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(swayPx, { duration: durationMs / 2, easing: easeInOut }),
          withTiming(0, { duration: durationMs / 2, easing: easeInOut }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(sway);
  }, [still, swayPx, durationMs, delayMs, sway]);
  const props = useAnimatedProps(() => ({ y: sway.value }));
  return (
    <AnimatedG animatedProps={props}>
      <Path d={d} stroke={stroke} strokeWidth={1.6} fill="none" opacity={opacity} />
    </AnimatedG>
  );
}

/** The filled part of the wholeness track, easing to its new share (0.5s). */
function FillBar({ pct, color, track }: { pct: number; color: string; track: string }) {
  const [width, setWidth] = useState(0);
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming((pct / 100) * width, { duration: 500, easing: Easing.ease });
  }, [pct, width, w]);
  const style = useAnimatedStyle(() => ({ width: w.value }));
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: track }}
    >
      <Animated.View
        style={[{ height: 4, borderRadius: 2, backgroundColor: color }, style]}
      />
    </View>
  );
}

type Props = {
  /** Open lines currently on the timeline. */
  activeLines: PsychologicalBranch[];
  /** Reports the chip's height so the canvas keeps room above the top lane. */
  onChipHeight?: (h: number) => void;
};

/**
 * The wholeness chip: braid strands fan out per undecided thread and come home
 * as decisions are taken. Tapping it opens a small panel that says how the day
 * may feel and suggests where one decision would help most.
 */
export function WholenessIndicator({ activeLines, onChipHeight }: Props) {
  const t = useT();
  const tk = useTheme();
  const branches = useAppStore((s) => s.branches);
  const setOperation = useAppStore((s) => s.setOperation);
  const nowTick = useAppStore((s) => s.nowTick);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const { width: screenW } = useWindowDimensions();
  const now = useMemo(() => new Date(nowTick), [nowTick]);
  const [open, setOpen] = useState(false);

  // How much of you moves with your main line right now — the wholeness score.
  // Every decision (an action or "nothing can be done") raises it.
  const wholeness = energySplit(branches, now).mainShare;
  const undecided = activeLines
    .filter((b) => !decidedToday(b, now))
    .sort((a, b) => effectiveLoudness(b, now) - effectiveLoudness(a, now));

  const word =
    wholeness >= 0.85
      ? t("whole")
      : wholeness >= 0.65
        ? t("gathered")
        : wholeness >= 0.45
          ? t("pulled apart")
          : t("scattered");
  const tone = wholeness >= 0.65 ? "good" : wholeness >= 0.45 ? "mid" : "low";
  const forecast =
    wholeness >= 0.85
      ? t("Nothing is pulling you apart. Expect a steady, present day — protect it.")
      : wholeness >= 0.65
        ? t("You may feel an occasional tug today, but the day should hold steady.")
        : wholeness >= 0.45
          ? t(
              "You might feel restless today, or find it hard to settle into one thing. That is the split — not you.",
            )
          : t(
              "Today can feel foggy and tiring, like living several days at once. One small decision starts bringing you back.",
            );

  const summary =
    t("You are {word} — about {pct} percent of you moves with your main line.", {
      word,
      pct: Math.round(wholeness * 100),
    }) +
    (activeLines.length > 0
      ? " " +
        t("{undecided} of {active} open threads still undecided today.", {
          undecided: undecided.length,
          active: activeLines.length,
        })
      : "");

  // `.fragmentation-indicator.low` pulses its border, quietly insistent.
  const urgent = useSharedValue(0);
  useEffect(() => {
    if (tone !== "low" || reducedMotion) {
      cancelAnimation(urgent);
      urgent.value = 0;
      return;
    }
    urgent.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: easeInOut }),
        withTiming(0, { duration: 900, easing: easeInOut }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(urgent);
  }, [tone, reducedMotion, urgent]);
  const borderLo = mix(tk.danger, tk.bgSunken, 25);
  const borderHi = mix(tk.danger, tk.bgSunken, 55);
  const urgentStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(urgent.value, [0, 1], [borderLo, borderHi]),
  }));

  // strand sway phases, echoing the CSS nth-of-type delays
  const DELAYS = [0, 2600, 1200, 2600, 0, 1200];
  const swayPx = tone === "low" ? 2.6 : tone === "mid" ? 1.8 : 1.1;
  const swayDur = tone === "low" ? 1800 : tone === "mid" ? 3600 : 7000;

  const fillColor =
    tone === "low" ? tk.danger : tone === "mid" ? mix(tk.accent, tk.danger, 45) : tk.accent;

  return (
    <View style={{ position: "absolute", top: 9.6, left: 14.4, zIndex: 10 }}>
      {open && (
        <Pressable
          onPress={() => setOpen(false)}
          style={{ position: "absolute", left: -9999, top: -9999, width: 20000, height: 20000 }}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={summary}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        onLayout={(e) => onChipHeight?.(e.nativeEvent.layout.height)}
      >
        {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
          <Animated.View
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 4.8,
                paddingHorizontal: 8.8,
                borderRadius: 6,
                borderWidth: 1,
                backgroundColor: open ? tk.bgRaised : mix(tk.bgSunken, tk.bg, 55),
                borderColor: hovered
                  ? mix(tk.accent, alpha(tk.lineAxis, 0.55), 45)
                  : tk.bgSunken,
              },
              tone === "low" ? urgentStyle : null,
              tk.shadows ? shadow(tk) : null,
            ]}
          >
            <Svg width={56} height={20} viewBox="0 0 56 20">
              <Path d="M 2 10 L 20 10" stroke={tk.lineMain} strokeWidth={2} fill="none" />
              {activeLines.length === 0 && (
                <Path d="M 20 10 L 54 10" stroke={tk.lineMain} strokeWidth={2} fill="none" />
              )}
              {activeLines.slice(0, 6).map((b, i) => {
                const isUndecided = !decidedToday(b, now);
                const side = i % 2 === 0 ? 1 : -1;
                const fan = isUndecided ? side * (3 + i * 2.2) : side * 1.2;
                const y = Math.max(2, Math.min(18, 10 + fan));
                return (
                  <Strand
                    key={b.id}
                    d={`M 20 10 C 30 10, 38 ${y}, 54 ${y}`}
                    stroke={
                      !isUndecided ? tk.accent : tone === "low" ? tk.danger : tk.inkSoft
                    }
                    opacity={!isUndecided ? 0.5 : tone === "low" ? 0.75 : 0.9}
                    swayPx={swayPx}
                    durationMs={swayDur}
                    delayMs={DELAYS[i] ?? 0}
                    still={reducedMotion}
                  />
                );
              })}
            </Svg>
            <View style={{ gap: 3.2, minWidth: 62 }}>
              <T
                style={{
                  fontSize: 10.9,
                  lineHeight: 11,
                  color: tone === "low" ? tk.danger : tk.inkSoft,
                  letterSpacing: 0.2,
                }}
              >
                {word}
              </T>
              <FillBar
                pct={Math.round(wholeness * 100)}
                color={fillColor}
                track={tk.bgSunken}
              />
            </View>
            <T
              style={{
                fontSize: 9.6,
                color: tk.inkFaint,
                transform: [{ rotate: open ? "180deg" : "0deg" }],
              }}
            >
              ▾
            </T>
          </Animated.View>
        )}
      </Pressable>

      {open && (
        <View
          accessibilityLabel={t("How you are doing")}
          style={[
            {
              position: "absolute",
              top: "100%",
              marginTop: 6.4,
              left: 0,
              zIndex: 15,
              gap: 9.6,
              width: Math.min(320, screenW - 32),
              paddingVertical: 11.2,
              paddingHorizontal: 12.8,
              backgroundColor: tk.bg,
              borderWidth: 1,
              borderColor: alpha(tk.lineAxis, 0.55),
              borderRadius: tk.radius,
            },
            tk.shadows ? shadow(tk) : null,
          ]}
        >
          <Hint style={{ margin: 0 }}>
            <T
              style={{
                fontWeight: "700",
                color: tone === "low" ? tk.danger : tk.ink,
              }}
            >
              {t("You are {word}.", { word })}
            </T>
            {"\n"}
            {forecast}
          </Hint>

          {undecided.length > 0 ? (
            <>
              <Hint style={{ margin: 0 }}>{t("One decision would gather you most here:")}</Hint>
              {undecided.slice(0, 3).map((b, i) => (
                <Pressable
                  key={b.id}
                  onPress={() => {
                    setOpen(false);
                    setOperation({ kind: "quick-touch", branchId: b.id });
                  }}
                  style={({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => ({
                    gap: 1.6,
                    paddingVertical: 7.2,
                    paddingHorizontal: 8.8,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: tk.bgSunken,
                    backgroundColor: hovered ? tk.bgRaised : mix(tk.bgSunken, tk.bg, 55),
                  })}
                >
                  <T style={{ fontWeight: "700" }}>{b.title}</T>
                  <Hint style={{ margin: 0 }}>
                    {i === 0 ? t("pulling hardest right now") : t("still undecided today")}
                  </Hint>
                </Pressable>
              ))}
              <Hint style={{ margin: 0 }}>
                {t("An action counts. So does deciding that nothing can be done.")}
              </Hint>
            </>
          ) : (
            <Hint style={{ margin: 0 }}>
              {activeLines.length > 0
                ? t("Every open thread has its decision for today. Nothing more is asked of you.")
                : t("Nothing is open right now. Your whole current is moving as one.")}
            </Hint>
          )}
        </View>
      )}
    </View>
  );
}
