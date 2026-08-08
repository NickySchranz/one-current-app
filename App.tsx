import { useEffect } from "react";
import { AppState, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useAppStore } from "@/stores/app-store";
import { PrimaryNavigation } from "@/features/navigation/PrimaryNavigation";
import { Logo } from "@/features/navigation/Logo";
import { LifeTimeline } from "@/features/life-timeline/LifeTimeline";
import { OperationTray } from "@/features/timeline-shell/OperationTray";
import { HistoryView } from "@/features/history/HistoryView";
import { MergeReview } from "@/features/history/MergeReview";
import { MorePage } from "@/features/more/MorePage";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";
import { T } from "@/ui/primitives";

function AppShell() {
  const ready = useAppStore((s) => s.ready);
  const view = useAppStore((s) => s.view);
  const init = useAppStore((s) => s.init);
  const refreshNow = useAppStore((s) => s.refreshNow);
  const timeRate = useAppStore((s) => s.timeRate);
  const tk = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const compactNav = winW <= 760;

  useEffect(() => {
    void init();
  }, [init]);

  // The timeline lives: Now keeps moving while the app stays open.
  // When the Testing clock runs fast, tick fast enough to watch it flow.
  useEffect(() => {
    const id = setInterval(refreshNow, timeRate > 1 ? 250 : 30_000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshNow();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [refreshNow, timeRate]);

  if (!ready) {
    return <View accessibilityState={{ busy: true }} style={{ flex: 1, backgroundColor: tk.bg }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: tk.bg }}>
      <StatusBar style={tk.mode === "dark" ? "light" : "dark"} />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          paddingTop: 8 + insets.top,
          paddingBottom: 8,
          paddingHorizontal: winW <= 640 ? 9.6 : 16,
          borderBottomWidth: 1,
          borderBottomColor: alpha(tk.lineAxis, 0.55),
          backgroundColor: alpha(tk.bgRaised, 0.82),
        }}
      >
        <Logo />
        <T
          style={{
            fontSize: 16.8,
            fontWeight: "600",
            letterSpacing: 0.17,
            marginRight: "auto",
          }}
        >
          One Current
        </T>
        {!compactNav && <PrimaryNavigation variant="header" />}
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {view.kind === "now" && (
          <View style={{ flex: 1, minHeight: 0 }}>
            <LifeTimeline />
            <OperationTray />
          </View>
        )}
        {view.kind === "history" && <HistoryView />}
        {view.kind === "merge-review" && <MergeReview mergeId={view.mergeId} />}
        {view.kind === "more" && <MorePage />}
      </View>
      {compactNav && <PrimaryNavigation variant="bottom" />}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}
