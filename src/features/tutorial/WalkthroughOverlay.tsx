import { useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import Svg, { Rect } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useAppStore } from "@/stores/app-store";
import { T } from "@/ui/primitives";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/ui/theme";
import { mix } from "@/ui/color";
import type { ColorKey } from "@/features/life-timeline/mascot-frames";
import { CHARACTER_FRAMES, PX } from "@/features/life-timeline/mascot-frames";
import { WALKTHROUGH_STEPS, walkthroughIndex, walkthroughStep } from "./steps";
import { measureWalkthroughTarget, type TargetRect } from "./targets";

const TUT_PX = PX * 2.2;
const HALO_PAD = 10;
/** A point target (a spot on the SVG canvas) gets a circle this wide. */
const POINT_HALO = 44;
const CARD_MAX_W = 420;

function resolvePalette(accent: string): Record<ColorKey, string> {
  return {
    D: "#1a1a1a",
    A: accent,
    Ad: mix(accent, "#000000", 65),
    Ah: mix(accent, "#ffffff", 55),
    S: "#f5c38c",
    Sd: "#c4864e",
    Ss: "#fde6be",
    W: "#ffffff",
    P: "#1a1a1a",
    R: "#e8836a",
    G: "#f0c040",
    Gd: "#b88620",
    Bl: "#3a6ad4",
    Bd: "#1a3fa0",
    Bh: "#6e96f5",
    Sh2: "rgba(0,0,0,0.18)",
  };
}

/** The soft pulsing ring that rests on the step's target. */
function Halo({ rect, reduced, accent }: { rect: TargetRect; reduced: boolean; accent: string }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [reduced, pulse]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.16 }],
    opacity: 0.9 - pulse.value * 0.45,
  }));

  const isPoint = rect.w === 0 && rect.h === 0;
  const w = isPoint ? POINT_HALO : rect.w + HALO_PAD * 2;
  const h = isPoint ? POINT_HALO : rect.h + HALO_PAD * 2;
  const left = isPoint ? rect.x - POINT_HALO / 2 : rect.x - HALO_PAD;
  // Never let the ring reach into the header bar.
  const top = Math.max(4, isPoint ? rect.y - POINT_HALO / 2 : rect.y - HALO_PAD);
  const radius = Math.min(w, h) / 2 + 6;

  const ring = {
    position: "absolute" as const,
    left: 0,
    top: 0,
    width: w,
    height: h,
    borderRadius: radius,
    borderWidth: 2,
    borderColor: accent,
  };
  return (
    <View
      pointerEvents="none"
      // The walkthrough halo — the check scripts find it by this label.
      accessibilityLabel="walkthrough-halo"
      style={{ position: "absolute", left, top, width: w, height: h, zIndex: 99 }}
    >
      {reduced ? (
        <View style={[ring, { borderWidth: 2.5, opacity: 0.85 }]} />
      ) : (
        <>
          <View style={[ring, { opacity: 0.35 }]} />
          <Animated.View style={[ring, animated]} />
        </>
      )}
    </View>
  );
}

/**
 * The guided walkthrough's card + pointer. Reads everything from the store;
 * mounted once in the shell (it disappears with the shell during stages, and
 * simply picks up at the current step when the shell returns).
 *
 * Placement rule: the card never floats next to its target — it docks to the
 * screen edge OPPOSITE the target (clear of the header and the tab bar), and
 * the halo alone does the pointing. Cards near targets kept covering the very
 * things they pointed at: the main line, the new thread, Pip.
 */
export function WalkthroughOverlay() {
  const t = useT();
  const tk = useTheme();
  const stepId = useAppStore((s) => s.tutorialStep);
  const mascotType = useAppStore((s) => s.mascotType);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const tutorialNext = useAppStore((s) => s.tutorialNext);
  const tutorialSkip = useAppStore((s) => s.tutorialSkip);
  const { width: winW, height: winH } = useWindowDimensions();

  const step = stepId ? walkthroughStep(stepId) : null;
  const [rect, setRect] = useState<TargetRect | null>(null);
  // The birth moment belongs to the timeline: entering meet-thread holds the
  // card back so the draw-in and Pip's reaction play unobstructed.
  const [held, setHeld] = useState(false);

  // Follow the target: on step entry, on resize, and on a slow tick while a
  // targeted step is up (layout drifts — panning, keyboard, Pip's walk).
  useEffect(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    let alive = true;
    const measure = () =>
      measureWalkthroughTarget(step.target!, (r) => {
        if (alive) setRect(r);
      });
    measure();
    const timer = setInterval(measure, 500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [step?.target, stepId, winW, winH]);

  useEffect(() => {
    if (stepId !== "meet-thread" || reducedMotion) {
      setHeld(false);
      return;
    }
    setHeld(true);
    const timer = setTimeout(() => setHeld(false), 1800);
    return () => clearTimeout(timer);
  }, [stepId, reducedMotion]);

  if (!step || stepId === "creating" || held) return null;

  const frames = CHARACTER_FRAMES[mascotType];
  const pixels = frames[step.frame] ?? frames["IDLE_A"];
  const palette = resolvePalette(tk.accent);
  const svgW = 10 * TUT_PX + 4;
  const svgH = 12 * TUT_PX + 4;
  const stepIndex = walkthroughIndex(step.id);

  // Dock to the edge opposite the target: the halo points, the card stays out
  // of the way. Compact screens keep the header and the tab bar (with its
  // raised +) fully visible.
  const compact = winW <= 760;
  const side: "top" | "bottom" = rect
    ? rect.y + rect.h / 2 >= winH / 2
      ? "top"
      : "bottom"
    : stepId === "menu"
      ? "top"
      : "bottom";
  const dock =
    side === "top"
      ? { top: compact ? 48 : 12 }
      : { bottom: compact ? 96 : 12 };

  return (
    <>
      {rect && <Halo rect={rect} reduced={reducedMotion} accent={tk.accent} />}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          ...dock,
          alignItems: "center",
          zIndex: 100,
        }}
      >
      <View
        // The walkthrough card — the check scripts measure it by this label.
        accessibilityLabel="walkthrough-card"
        style={{
          width: "100%",
          maxWidth: CARD_MAX_W,
          backgroundColor: tk.bgRaised,
          padding: 16,
          borderWidth: 1,
          borderColor: tk.accent,
          borderRadius: tk.radiusLg,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: side === "top" ? 2 : -2 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
          elevation: 8,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
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

        <View style={{ flex: 1, gap: 6 }}>
          <Pressable accessibilityRole="button" onPress={tutorialSkip} style={{ alignSelf: "flex-end" }}>
            <T style={{ fontSize: 12, color: tk.inkSoft }}>{t("Skip tour")}</T>
          </Pressable>

          <T style={{ fontSize: 16, fontWeight: "700", color: tk.ink, fontFamily: tk.fontDisplay }}>
            {t(step.text)}
          </T>
          <T style={{ fontSize: 13.5, color: tk.inkSoft, lineHeight: 19 }}>{t(step.subtext)}</T>

          <View style={{ flexDirection: "row", gap: 5, marginTop: 4 }}>
            {WALKTHROUGH_STEPS.map((s, i) => (
              <View
                key={s.id}
                style={{
                  width: i === stepIndex ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === stepIndex ? tk.accent : tk.inkFaint,
                }}
              />
            ))}
          </View>

          {step.advance !== "auto" && (
            <Pressable
              accessibilityRole="button"
              onPress={tutorialNext}
              style={({ pressed }) => ({
                alignSelf: "flex-start",
                marginTop: 4,
                paddingVertical: 8,
                paddingHorizontal: 20,
                borderRadius: tk.btnRadius,
                backgroundColor: pressed ? mix(tk.accent, "#000000", 85) : tk.accent,
              })}
            >
              <T style={{ color: tk.accentInk, fontWeight: "700", fontSize: 14 }}>
                {step.advance === "finish" ? t("Let's go!") : t("Next →")}
              </T>
            </Pressable>
          )}
        </View>
      </View>
      </View>
    </>
  );
}
