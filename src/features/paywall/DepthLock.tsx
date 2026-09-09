import { useState, type ReactNode } from "react";
import { Pressable, View, type PressableStateCallbackType } from "react-native";
import { PaywallPrompt, useDepthGate } from "./PaywallPrompt";
import { useT } from "@/i18n/i18n";
import { T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

/**
 * Wraps one of the long-view readouts — a thread's curve, the fortnight trend,
 * the running totals — so a free account still *sees* it.
 *
 * The shape is the argument: an empty box says nothing about what Pro is for,
 * whereas the real curve, dimmed, says exactly what is being offered. So the
 * children render as they are, quieted and inert, with the same Pro pill the
 * rest of the app uses, and a press opens the upgrade sheet.
 *
 * This is only ever reached by someone who went looking for their own history,
 * which is the one moment an upgrade can be offered without landing on a bad
 * day. See the timing rule on PaywallReason.
 */
export function DepthLock({ children, label }: { children: ReactNode; label: string }) {
  const t = useT();
  const tk = useTheme();
  const isPro = useDepthGate();
  const [asking, setAsking] = useState(false);

  if (isPro) return <>{children}</>;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} · ${t("Pro")}`}
        onPress={() => setAsking(true)}
        style={({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => ({
          borderRadius: tk.radius,
          borderWidth: 1,
          borderColor: hovered ? alpha(tk.lineAxis, 0.55) : "transparent",
          padding: 4,
          gap: 4,
        })}
      >
        <View pointerEvents="none" style={{ opacity: 0.28 }}>
          {children}
        </View>
        <T
          style={{
            alignSelf: "flex-start",
            fontSize: 10.5,
            lineHeight: 14,
            color: tk.inkSoft,
            borderWidth: 1,
            borderColor: alpha(tk.lineAxis, 0.55),
            borderRadius: 999,
            paddingHorizontal: 6,
            overflow: "hidden",
          }}
        >
          {t("Pro")}
        </T>
      </Pressable>
      <PaywallPrompt reason={asking ? "depth" : null} onClose={() => setAsking(false)} />
    </>
  );
}
