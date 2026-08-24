import { useEffect } from "react";
import { ActivityIndicator, AppState, Platform, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useAppStore } from "@/stores/app-store";
import { hasTokens } from "@/api/client";
import { useT } from "@/i18n/i18n";
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
import { useKeyboard } from "@/ui/keyboard";
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
  const apiOnline = useAppStore((s) => s.apiOnline);
  const t = useT();
  const tk = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const compactNav = winW <= 760;
  // The tab bar must never ride up with the software keyboard — while the
  // keyboard is open it simply steps away (the sheet above has Back/Next).
  const keyboard = useKeyboard();
  const tutorial = useTutorial();

  useEffect(() => {
    void init();
  }, [init]);

  // Returning from Stripe Checkout on web: ?billing=success means the plan
  // may have flipped to Pro — ask the server, once more after a beat in case
  // the webhook is still in flight. Either way the query param is cleaned up.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (!billing) return;
    params.delete("billing");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash,
    );
    if (billing !== "success") return;
    void (async () => {
      const { syncMe } = useAppStore.getState();
      await syncMe();
      if (useAppStore.getState().serverPro !== true) {
        await new Promise((r) => setTimeout(r, 2000));
        await syncMe();
      }
    })();
  }, []);

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
    return (
      <View
        accessibilityState={{ busy: true }}
        style={{
          flex: 1,
          backgroundColor: tk.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={tk.accent} />
      </View>
    );
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
        {apiOnline === false && hasTokens() && (
          <T
            style={{
              fontSize: 11.5,
              color: tk.inkSoft,
              borderWidth: 1,
              borderColor: alpha(tk.lineAxis, 0.55),
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 2,
              overflow: "hidden",
            }}
          >
            {t("Offline")}
          </T>
        )}
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
      {compactNav && !keyboard.open && <PrimaryNavigation variant="bottom" />}
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
