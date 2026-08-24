import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useT } from "@/i18n/i18n";
import { Hint, shadow } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

/** The legend and keyboard map, folded away until asked for. */
export function TimelineHelp() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<View>(null);
  const t = useT();
  const tokens = useTheme();
  const { width } = useWindowDimensions();

  // Close on a press anywhere outside (web only; native closes via the button).
  useEffect(() => {
    if (!open || Platform.OS !== "web" || typeof document === "undefined") return;
    const onDown = (e: Event) => {
      const root = rootRef.current as unknown as {
        contains?: (node: unknown) => boolean;
      } | null;
      if (root?.contains && !root.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <View
      ref={rootRef}
      style={{ position: "absolute", left: 14.4, bottom: 20, zIndex: 10 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Help")}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={(s) => {
          const hovered = !!(s as { hovered?: boolean }).hovered;
          return {
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: 1,
            borderColor: tokens.lineAxis,
            backgroundColor:
              hovered || open ? tokens.bgRaised : alpha(tokens.bg, 0.8),
            alignItems: "center",
            justifyContent: "center",
            opacity: hovered || open ? 1 : 0.65,
          };
        }}
      >
        <Text
          style={{
            color: tokens.inkSoft,
            fontSize: 12.8,
            lineHeight: 13,
            fontStyle: "italic",
            fontFamily: Platform.select({
              web: "Georgia, serif",
              ios: "Georgia",
              default: "serif",
            }),
          }}
        >
          i
        </Text>
      </Pressable>
      {open && (
        <View
          accessibilityLabel={t("Reading the timeline")}
          style={{
            position: "absolute",
            bottom: 26 + 6.4,
            left: 0,
            zIndex: 15,
            gap: 9.6,
            width: Math.min(320, width - 32),
            paddingVertical: 11.2,
            paddingHorizontal: 12.8,
            backgroundColor: tokens.bg,
            borderWidth: 1,
            borderColor: alpha(tokens.lineAxis, 0.55),
            borderRadius: tokens.radius,
            ...(tokens.shadows ? shadow(tokens) : null),
          }}
        >
          <Hint style={{ marginBottom: 0 }}>
            <Text style={{ fontWeight: "600" }}>{t("Reading the lines")}</Text>
            {"\n"}
            {t(
              "solid = active · curved back = integrated · thicker = louder · faint ✓ = decided today",
            )}
          </Hint>
          <Hint style={{ marginBottom: 0 }}>
            <Text style={{ fontWeight: "600" }}>{t("Moving around")}</Text>
            {"\n"}
            {t("drag or scroll sideways = move through time · along the dates = move faster")}
          </Hint>
          <Hint style={{ marginBottom: 0 }}>
            {t("bonk = Pip soothes a thread, easing its loudness for today")}
          </Hint>
        </View>
      )}
    </View>
  );
}
