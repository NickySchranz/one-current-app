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
import { AuthGate } from "@/features/auth/AuthGate";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";
import { T } from "@/ui/primitives";
import { useTutorial } from "@/features/tutorial/useTutorial";
import { TutorialOverlay } from "@/features/tutorial/TutorialOverlay";

function AppShell() {
  const ready = useAppStore((s) => s.ready);
  const authUser = useAppStore((s) => s.authUser);
  const view = useAppStore((s) => s.view);
  const init = useAppStore((s) => s.init);
  const refreshNow = useAppStore((s) => s.refreshNow);
  const timeRate = useAppStore((s) => s.timeRate);
  const mascotType = useAppStore((s) => s.mascotType);
  const tk = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const compactNav = winW <= 760;
  const tutorial = useTutorial();

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

  if (!authUser) {
    return (
      <View style={{ flex: 1, backgroundColor: tk.bg }}>
        <StatusBar style={tk.mode === "dark" ? "light" : "dark"} />
        <AuthGate />
      </View>
    );
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
      {ready && authUser && tutorial.active && tutorial.currentStep && (
        <TutorialOverlay
          step={tutorial.currentStep}
          stepIndex={tutorial.stepIndex}
          totalSteps={tutorial.totalSteps}
          mascotType={mascotType}
          onNext={tutorial.next}
          onSkip={tutorial.skip}
        />
      )}
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
