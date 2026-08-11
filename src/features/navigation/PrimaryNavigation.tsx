import { useState } from "react";
import {
  Pressable,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppStore, type View as AppView } from "@/stores/app-store";
import { PaywallPrompt, useThreadGate } from "@/features/paywall/PaywallPrompt";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";
import { T } from "@/ui/primitives";

type PageId = "now" | "history" | "more";

/** Which destination a given view belongs to, for the active tab state. */
export function activePage(view: AppView): PageId {
  switch (view.kind) {
    case "history":
    case "merge-review":
      return "history";
    case "more":
      return "more";
    default:
      return "now";
  }
}

/**
 * The destinations. Now is where I work; Actions is what I decided to do;
 * History is where I review; More holds everything else. On touch, the round +
 * sits in the middle of the bar, half a step above it.
 */
export function PrimaryNavigation({ variant }: { variant: "header" | "bottom" }) {
  const view = useAppStore((s) => s.view);
  const operation = useAppStore((s) => s.operation);
  const setView = useAppStore((s) => s.setView);
  const setOperation = useAppStore((s) => s.setOperation);
  const current = activePage(view);
  const viewingActions = current === "now" && operation.kind === "viewing-actions";
  const t = useT();
  const tk = useTheme();
  const insets = useSafeAreaInsets();
  const canOpenThread = useThreadGate();
  const [paywalled, setPaywalled] = useState(false);

  const tab = (
    id: string,
    label: string,
    icon: string,
    active: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={id}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ hovered }: PressableStateCallbackType & { hovered?: boolean }):
        StyleProp<ViewStyle> =>
        variant === "header"
          ? {
              paddingVertical: 4.8,
              paddingHorizontal: 11.2,
              minHeight: 32,
              borderRadius: 6,
              justifyContent: "center",
              backgroundColor: active ? tk.accentSoft : hovered ? tk.bgSunken : "transparent",
            }
          : {
              flex: 1,
              alignItems: "center",
              gap: 1.6,
              paddingVertical: 5.6,
              paddingHorizontal: 3.2,
              borderRadius: tk.radius,
              backgroundColor: active ? tk.accentSoft : "transparent",
            }
      }
    >
      {variant === "bottom" && (
        <T style={{ fontSize: 15.2, lineHeight: 16, color: active ? tk.ink : tk.inkSoft }}>
          {icon}
        </T>
      )}
      <T
        style={{
          fontSize: variant === "header" ? 14.7 : 11.5,
          fontWeight: active ? "600" : "400",
          color: active ? tk.ink : tk.inkSoft,
        }}
      >
        {t(label)}
      </T>
    </Pressable>
  );

  const nowTab = tab("now", "Now", "●", current === "now" && !viewingActions, () =>
    setView({ kind: "now" }),
  );
  const actionsTab = tab("actions", "Actions", "→", viewingActions, () =>
    setOperation({ kind: "viewing-actions" }),
  );
  const historyTab = tab("history", "History", "◔", current === "history", () =>
    setView({ kind: "history" }),
  );
  const moreTab = tab("more", "More", "≡", current === "more", () =>
    setView({ kind: "more" }),
  );

  if (variant === "header") {
    return (
      <View
        accessibilityLabel={t("Main navigation")}
        style={{ flexDirection: "row", gap: 2.4, alignItems: "center" }}
      >
        {nowTab}
        {actionsTab}
        {historyTab}
        {moreTab}
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={t("Main navigation")}
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderTopWidth: 1,
        borderTopColor: alpha(tk.lineAxis, 0.55),
        backgroundColor: alpha(tk.bgRaised, 0.88),
        paddingTop: 4,
        paddingHorizontal: 4,
        paddingBottom: 12 + insets.bottom,
      }}
    >
      {nowTab}
      {actionsTab}
      {/* the one obvious control, in the middle of the bar and half a step above it */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("New thread")}
        onPress={() =>
          canOpenThread ? setOperation({ kind: "creating-branch" }) : setPaywalled(true)
        }
        style={({ pressed }) => ({
          width: 50,
          height: 50,
          marginTop: -20,
          marginHorizontal: 5.6,
          borderRadius: 25,
          backgroundColor: tk.accent,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: pressed ? 0.96 : 1 }],
        })}
      >
        <T style={{ color: tk.accentInk, fontSize: 25.6, lineHeight: 28 }}>+</T>
      </Pressable>
      {historyTab}
      {moreTab}
      <PaywallPrompt
        reason={paywalled ? "thread-limit" : null}
        onClose={() => setPaywalled(false)}
      />
    </View>
  );
}
