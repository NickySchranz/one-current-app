import { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useAppStore } from "@/stores/app-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useT } from "@/i18n/i18n";
import { Button, Prompt, T, rowStyles } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";

/**
 * The quick flows ask one question per screen. StepFrame is that screen's
 * chrome: the thread's name, the question, quiet dots for where you are,
 * and Back / one primary action. Nothing on it should ever need to scroll.
 */
export function StepFrame({
  title,
  prompt,
  stepIndex,
  totalSteps,
  onBack,
  backLabel,
  next,
  children,
}: {
  title: string;
  prompt: string;
  /** 0-based. Omit both step props for a single-step flow — no dots shown. */
  stepIndex?: number;
  totalSteps?: number;
  onBack: () => void;
  backLabel?: string;
  next: { label: string; onPress: () => void; disabled?: boolean; icon?: React.ReactNode };
  children?: React.ReactNode;
}) {
  const t = useT();
  const theme = useTheme();
  const dots = totalSteps != null && totalSteps > 1 && stepIndex != null;
  return (
    <View>
      <T style={{ fontSize: 16.8, fontWeight: "600" }}>{title}</T>
      <Prompt style={{ marginTop: 8 }}>{prompt}</Prompt>
      {children}
      <View style={rowStyles.stageNav}>
        <Button variant="quiet" label={backLabel ?? t("Back")} onPress={onBack} />
        {dots && (
          <View
            accessibilityLabel={t("Step {n} of {m}", {
              n: (stepIndex ?? 0) + 1,
              m: totalSteps ?? 0,
            })}
            style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
          >
            {Array.from({ length: totalSteps ?? 0 }, (_, i) => (
              <View
                key={i}
                style={{
                  width: i === stepIndex ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === stepIndex ? theme.accent : theme.inkFaint,
                }}
              />
            ))}
          </View>
        )}
        <Button
          variant="primary"
          label={next.label}
          icon={next.icon}
          disabled={next.disabled}
          onPress={next.onPress}
        />
      </View>
    </View>
  );
}

/**
 * A quiet slide-and-fade between steps: forward drifts left, Back drifts
 * right. Snaps instantly under reduced motion.
 */
export function StepTransition({
  stepKey,
  children,
}: {
  /** Changes when the step changes; higher = further along. */
  stepKey: number;
  children: React.ReactNode;
}) {
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const prev = useRef(stepKey);
  const dx = useSharedValue(0);
  const op = useSharedValue(1);
  useEffect(() => {
    const forward = stepKey >= prev.current;
    prev.current = stepKey;
    if (reducedMotion) return;
    dx.value = forward ? 12 : -12;
    op.value = 0.3;
    dx.value = withTiming(0, { duration: 160, easing: Easing.ease });
    op.value = withTiming(1, { duration: 160, easing: Easing.ease });
  }, [stepKey, reducedMotion, dx, op]);
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value }],
    opacity: op.value,
  }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}

/**
 * Declares "this step is for typing". On narrow screens the operation tray
 * then anchors to the top of the screen, where no keyboard can reach it.
 */
export function useFocusStep(active: boolean) {
  useEffect(() => {
    useLayoutStore.getState().setFocusStep(active);
    return () => useLayoutStore.getState().setFocusStep(false);
  }, [active]);
}
