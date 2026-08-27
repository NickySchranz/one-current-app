import { useEffect, useRef } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import {
  operationDepth,
  useAppStore,
  type TimelineOperation,
} from "@/stores/app-store";
import { useLayoutStore } from "@/stores/layout-store";
import { CreateBranch } from "@/features/branch-creation/CreateBranch";
import { RecurrenceCheck } from "@/features/branch-creation/RecurrenceCheck";
import { QuickBranchMenu } from "@/features/branch-quick-actions/QuickBranchMenu";
import { ActionsPanel } from "@/features/branch-quick-actions/ActionsPanel";
import { SupportPanel } from "@/features/branch-quick-actions/SupportPanel";
import { BranchView } from "@/features/branch-inspection/BranchView";
import { IntegratedThreadsPanel } from "@/features/integrated-threads/IntegratedThreadsPanel";
import { useT } from "@/i18n/i18n";
import { useTheme, type ThemeTokens } from "@/ui/theme";
import { alpha } from "@/ui/color";
import { useKeyboard } from "@/ui/keyboard";
import { InTrayContext } from "@/ui/primitives";

// Flows that ask the user to type are not here: operationDepth sends them to
// ReflectionScreen, which holds their panels instead.
function trayLabel(op: TimelineOperation): string {
  switch (op.kind) {
    case "creating-branch":
      return "New thread";
    case "checking-recurrence":
      return "This has returned before";
    case "quick-touch":
      return "This thread";
    case "viewing-integrated":
      return "Integrated threads";
    case "viewing-actions":
      return "Actions";
    case "understanding":
      return "Understand this thread";
    case "seeking-support":
      return "More support";
    default:
      return "";
  }
}

function operationBody(op: TimelineOperation) {
  switch (op.kind) {
    case "creating-branch":
      return <CreateBranch />;
    case "checking-recurrence":
      return <RecurrenceCheck matchedBranchId={op.matchedBranchId} pending={op.pending} />;
    case "quick-touch":
      return (
        <QuickBranchMenu
          key={op.branchId}
          branchId={op.branchId}
          startExpanded={op.expanded}
          dialOnly={op.dialOnly}
        />
      );
    case "viewing-integrated":
      return <IntegratedThreadsPanel selectedBranchId={op.branchId} />;
    case "viewing-actions":
      return <ActionsPanel />;
    case "understanding":
      return <BranchView key={op.branchId} branchId={op.branchId} />;
    case "seeking-support":
      return <SupportPanel key={op.branchId} branchId={op.branchId} />;
    default:
      return null;
  }
}

/** Entrance: `sheet-up` / `quick-in` — a short rise with a fade. */
function TrayShell({
  fromY,
  durationMs,
  reducedMotion,
  onHeight,
  style,
  label,
  children,
  innerRef,
}: {
  fromY: number;
  durationMs: number;
  reducedMotion: boolean;
  onHeight: (h: number) => void;
  style: object;
  label: string;
  children: React.ReactNode;
  innerRef?: React.Ref<View>;
}) {
  const ty = useSharedValue(reducedMotion ? 0 : fromY);
  const op = useSharedValue(reducedMotion ? 1 : 0.6);
  useEffect(() => {
    ty.value = withTiming(0, { duration: durationMs, easing: Easing.ease });
    op.value = withTiming(1, { duration: durationMs, easing: Easing.ease });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entrance runs once
  }, []);
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity: op.value,
  }));
  return (
    <Animated.View
      ref={innerRef}
      accessibilityLabel={label}
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      style={[style, anim]}
    >
      {children}
    </Animated.View>
  );
}

function trayShadow(t: ThemeTokens, up: number) {
  if (!t.shadows) return null;
  return {
    shadowColor: "#000",
    shadowOpacity: 0.09,
    shadowRadius: up,
    shadowOffset: { width: 0, height: -up / 3.5 },
    elevation: 8,
  };
}

/**
 * The panel where the current operation happens, in two weights. Quick: a
 * light tray beside the timeline — no backdrop, the timeline stays interactive
 * and a tap outside only sets it down. Focused: a dialog over it, only for
 * deeper looking, final confirmations, and support.
 */
export function OperationTray() {
  const operation = useAppStore((s) => s.operation);
  const setOperation = useAppStore((s) => s.setOperation);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const depth = operationDepth(operation);
  const t = useT();
  const tk = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const trayRef = useRef<View>(null);
  const touchStartY = useRef<number | null>(null);
  // Desktop: the quick tray docks to the right, beside the timeline — never over Now.
  const side = depth === "quick" && winW >= 900;
  // The sheet stays at the bottom; while the keyboard is up it rides
  // directly above it and may use the whole visible space if it needs to.
  // (On web, winH is the visual viewport — already minus the keyboard.)
  const { inset: kbInset, open: kbOpen } = useKeyboard();
  const visibleH = Platform.OS === "web" ? winH : winH - kbInset;
  const sheetMax = (frac: number) => (kbOpen ? Math.max(180, visibleH - 12) : frac * winH);

  // The timeline reads the tray's height to keep the selected line in view.
  useEffect(() => {
    if (depth === "none") useLayoutStore.getState().clearTray();
  }, [depth, operation]);
  useEffect(() => () => useLayoutStore.getState().clearTray(), []);
  // The timeline scrolls clear of everything covering its bottom: the sheet
  // itself plus the keyboard it rides on.
  const lastHeightRef = useRef(0);
  const reportHeight = (h: number) => {
    lastHeightRef.current = h;
    useLayoutStore.getState().setTray(h + (side ? 0 : kbInset), side);
  };
  useEffect(() => {
    if (depth !== "none" && lastHeightRef.current > 0) reportHeight(lastHeightRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-report on keyboard moves
  }, [kbInset, side]);

  // Escape sets the operation down; the timeline is still right there.
  // While typing, Escape only leaves the field — it never discards the tray.
  useEffect(() => {
    if (Platform.OS !== "web" || operation.kind === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) {
        el.blur();
        return;
      }
      setOperation({ kind: "idle" });
    };
    // Capture phase: RN Web's TextInput stops keydown propagation, so a
    // bubbling window listener (what the web app used) never hears Escape
    // while typing.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [operation.kind, setOperation]);

  // Creating a thread, and every flow that asks the user to type, live on a
  // screen of their own (CreationScreen / ReflectionScreen). This tray renders
  // nothing then, and its outside-tap dismissal below must stay off — there is
  // no tray for a tap to be inside of.

  // A tap anywhere outside the quick tray only sets it down — nothing
  // underneath activates on that same tap. A drag is a pan, not a dismissal.
  // (Web: window listeners with a click swallow, exactly like the source app.)
  useEffect(() => {
    if (Platform.OS !== "web" || depth !== "quick") return;
    let start: { x: number; y: number } | null = null;
    const inTray = (target: EventTarget | null) => {
      const node = trayRef.current as unknown as HTMLElement | null;
      return !!node && typeof node.contains === "function" && node.contains(target as Node);
    };
    const onDown = (e: PointerEvent) => {
      start = inTray(e.target) ? null : { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!start) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      start = null;
      if (moved > 8) return;
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, true), 150);
      setOperation({ kind: "idle" });
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, [depth, operation.kind, setOperation]);

  if (depth === "none" || depth === "stage") return null;

  const grip = (
    <View
      // Swipe the grip down to set the tray down.
      onTouchStart={(e) => {
        touchStartY.current = e.nativeEvent.pageY;
      }}
      onTouchEnd={(e) => {
        const start = touchStartY.current;
        touchStartY.current = null;
        if (start != null && e.nativeEvent.pageY - start > 40) {
          setOperation({ kind: "idle" });
        }
      }}
      style={{ alignSelf: "center", paddingVertical: 6.4, paddingHorizontal: 32 }}
    >
      <View
        style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: tk.lineAxis }}
      />
    </View>
  );

  const body = (
    <InTrayContext.Provider value={true}>
      <ScrollView keyboardShouldPersistTaps="handled">{operationBody(operation)}</ScrollView>
    </InTrayContext.Provider>
  );

  if (depth === "quick") {
    return (
      <>
        {/* Native: a tap outside sets the tray down (web handles this above). */}
        {Platform.OS !== "web" && (
          <Pressable
            onPress={() => setOperation({ kind: "idle" })}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 38 }}
          />
        )}
        {side ? (
          <TrayShell
            key={`side-${operation.kind}`}
            innerRef={trayRef}
            fromY={8}
            durationMs={180}
            reducedMotion={reducedMotion}
            onHeight={reportHeight}
            label={t(trayLabel(operation))}
            style={{
              position: "absolute",
              right: 14.4,
              bottom: 14.4,
              zIndex: 40,
              width: 340,
              maxHeight: Math.min(0.7 * winH, 576),
              backgroundColor: tk.bgRaised,
              borderWidth: 1,
              borderColor: alpha(tk.lineAxis, 0.55),
              borderRadius: tk.radiusLg,
              paddingTop: 5.6,
              paddingHorizontal: 16,
              paddingBottom: 13.6,
              ...trayShadow(tk, 24),
            }}
          >
            {body}
          </TrayShell>
        ) : (
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: kbInset,
              zIndex: 40,
              alignItems: "center",
            }}
          >
            <TrayShell
              key={`sheet-${operation.kind}`}
              innerRef={trayRef}
              fromY={40}
              durationMs={220}
              reducedMotion={reducedMotion}
              onHeight={reportHeight}
              label={t(trayLabel(operation))}
              style={{
                width: Math.min(560, winW),
                // 0.52: the choice lists fit unscrolled with the timeline
                // still holding the upper half of the screen.
                maxHeight: sheetMax(0.52),
                backgroundColor: tk.bgRaised,
                borderWidth: 1,
                borderBottomWidth: 0,
                borderColor: alpha(tk.lineAxis, 0.55),
                borderTopLeftRadius: tk.radiusLg,
                borderTopRightRadius: tk.radiusLg,
                paddingTop: 5.6,
                paddingHorizontal: 16,
                paddingBottom: 13.6 + (kbOpen ? 0 : insets.bottom),
                ...trayShadow(tk, 24),
              }}
            >
              {grip}
              {body}
            </TrayShell>
          </View>
        )}
      </>
    );
  }

  // Focused: a sheet over the timeline, with a soft backdrop that closes it.
  const wideSheet = winW >= 960;
  return (
    <>
      <Pressable
        onPress={() => setOperation({ kind: "idle" })}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 38,
          backgroundColor: alpha(tk.bg, 0.35),
        }}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: kbInset,
          zIndex: 40,
          alignItems: "center",
        }}
      >
        <TrayShell
          key={`focused-${operation.kind}`}
          innerRef={trayRef}
          fromY={40}
          durationMs={220}
          reducedMotion={reducedMotion}
          onHeight={reportHeight}
          label={t(trayLabel(operation))}
          style={{
            width: wideSheet ? Math.min(720, 0.92 * winW) : Math.min(640, winW),
            maxHeight: wideSheet ? 0.46 * winH : Math.min(sheetMax(0.72), 544),
            backgroundColor: tk.bgRaised,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: alpha(tk.lineAxis, 0.55),
            borderTopLeftRadius: tk.radiusLg,
            borderTopRightRadius: tk.radiusLg,
            paddingTop: 13.6,
            paddingHorizontal: 16,
            paddingBottom: 16 + insets.bottom,
            ...trayShadow(tk, 30),
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: tk.lineAxis,
              marginBottom: 9.6,
            }}
          />
          {body}
        </TrayShell>
      </View>
    </>
  );
}
