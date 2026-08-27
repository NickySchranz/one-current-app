import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, View, useWindowDimensions } from "react-native";
import Svg, { Path, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { stageBranchId, useAppStore, type TimelineOperation } from "@/stores/app-store";
import { buildTimelineLayout } from "@/visualization/main-line/layout";
import { defaultWindow, weekWindow } from "@/visualization/zoom/time-scale";
import { BranchLine } from "@/features/life-timeline/BranchLine";
import { Mascot } from "@/features/life-timeline/Mascot";
import { useMascot } from "@/features/life-timeline/useMascot";
import { QuickAct } from "@/features/branch-quick-actions/QuickAct";
import { QuickMerge } from "@/features/branch-quick-actions/QuickMerge";
import { QuickNote } from "@/features/branch-quick-actions/QuickNote";
import { MergeWizard } from "@/features/branch-merge/MergeWizard";
import { InTrayContext, Tag } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";
import { useKeyboard } from "@/ui/keyboard";
import { useT } from "@/i18n/i18n";

/** The stage's own landmark, so the panel is still announced as the tray was. */
function stageLabel(op: TimelineOperation): string {
  switch (op.kind) {
    case "quick-act":
      return "One small step";
    case "quick-merge":
      return "What is true now";
    case "quick-note":
      return "A note";
    case "confirming-merge":
      return "Integrate into Now";
    default:
      return "";
  }
}

function stageBody(op: TimelineOperation) {
  switch (op.kind) {
    case "quick-act":
      return <QuickAct key={op.branchId} branchId={op.branchId} />;
    case "quick-merge":
      return <QuickMerge key={op.branchId} branchId={op.branchId} />;
    case "quick-note":
      return <QuickNote key={op.branchId} branchId={op.branchId} />;
    case "confirming-merge":
      return <MergeWizard branchIds={op.branchIds} />;
    default:
      return null;
  }
}

/**
 * Answering a thread happens on a screen of its own, the same way creating one
 * does: a bare stage holding the main line, Now, and only the thread being
 * answered — so the line stays in view while the keyboard is up and you can
 * see where it sits in relation to today. Finishing closes this screen; the
 * map animates the answer in as it comes back.
 */
export function ReflectionScreen() {
  const operation = useAppStore((s) => s.operation);
  const branches = useAppStore((s) => s.branches);
  const nowTick = useAppStore((s) => s.nowTick);
  const theme = useAppStore((s) => s.theme);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const mascotTypePref = useAppStore((s) => s.mascotType);
  const language = useAppStore((s) => s.language);
  const setOperation = useAppStore((s) => s.setOperation);
  const t = useT();
  const tk = useTheme();
  const insets = useSafeAreaInsets();
  const { inset: kbInset, open: kbOpen, offsetTop } = useKeyboard();
  // On web winH is the visual viewport — already minus the keyboard.
  const { height: winH } = useWindowDimensions();
  // On web winH already excludes the keyboard; native trims it by the inset.
  const visibleH = Platform.OS === "web" ? winH : winH - kbInset;
  const [size, setSize] = useState({ width: 390, height: 320 });

  const branchId = stageBranchId(operation);
  const branch = branches.find((b) => b.id === branchId);
  const subjects = useMemo(() => (branch ? [branch] : []), [branch]);
  const now = useMemo(() => new Date(nowTick), [nowTick]);

  // This stage keeps its own window, so the map's pan is never disturbed. A
  // week around Now is the tight, readable default; a thread that forked
  // further back widens it just enough to hold its fork and Now together.
  const window_ = useMemo(() => {
    const week = weekWindow(now);
    if (!branch) return week;
    return branch.forkDate >= week.start ? week : defaultWindow([branch.forkDate], now);
  }, [branch, now]);

  const layout = useMemo(
    () =>
      buildTimelineLayout(subjects, {
        width: size.width,
        height: size.height,
        window: window_,
        compact: size.width < 640,
        now,
        mainShift: 0,
        pinnedBranchIds: branch ? [branch.id] : [],
      }),
    [subjects, size, window_, now, branch],
  );
  const g = layout.geometries[0];

  // Pip stands at the line being talked about, quietly — no speech here.
  const showMascot = !reducedMotion;
  const mascot = useMascot(
    subjects,
    layout.geometries,
    layout.nowX,
    () => {},
    mascotTypePref,
    false,
    false,
    language,
    branch?.id ?? null,
    null,
  );

  const noop = () => {};

  // A burn removes the thread from under its own stage: step back to the map
  // rather than leaving an empty screen up.
  useEffect(() => {
    if (branchId && !branch) setOperation({ kind: "idle" });
  }, [branchId, branch, setOperation]);

  // The tray isn't mounted on this screen, so Escape lives here: it leaves a
  // focused field first, and only then steps back to the thread's own menu —
  // where the user came from (web only).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) {
        el.blur();
        return;
      }
      const id = stageBranchId(useAppStore.getState().operation);
      setOperation(
        id ? { kind: "quick-touch", branchId: id, expanded: true } : { kind: "idle" },
      );
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [setOperation]);

  return (
    <View
      // A stable hook for the harness: the accessibility label is translated,
      // so it cannot be what identifies this screen.
      testID="reflection-stage"
      style={{
        // Pinned to the VISIBLE screen, exactly as the creation stage is: on
        // web the container starts where the visual viewport starts and is as
        // tall as it, so stage + questions always fit above the keyboard.
        // Native iOS overlays instead — there the keyboard inset trims it.
        position: "absolute",
        left: 0,
        right: 0,
        ...(Platform.OS === "web"
          ? { top: offsetTop, height: winH }
          : { top: 0, bottom: kbInset }),
        zIndex: 50,
        backgroundColor: tk.bg,
        paddingTop: kbOpen ? 0 : insets.top,
      }}
    >
      <View
        style={{ flex: 1, minHeight: 0 }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize({ width: Math.max(320, width), height: Math.max(200, height) });
        }}
      >
        {branch && g && (
          <>
            <Svg
              width={size.width}
              height={size.height}
              accessibilityLabel={t("The thread you are answering")}
            >
              {/* the one current, on its own: the line this thread rejoins */}
              <Path
                d={`M 0 ${layout.mainY} L ${layout.nowX} ${layout.mainY}`}
                stroke={tk.lineMain}
                strokeWidth={3.25}
                fill="none"
              />
              <Path
                d={`M ${layout.nowX - 12} ${layout.mainY - 6} L ${layout.nowX} ${layout.mainY} L ${layout.nowX - 12} ${layout.mainY + 6}`}
                stroke={tk.lineMain}
                strokeWidth={3.25}
                fill="none"
              />
              {size.width - layout.nowX > 4 && (
                <Path
                  d={`M ${layout.nowX} ${layout.mainY} L ${size.width} ${layout.mainY}`}
                  stroke={tk.lineMain}
                  strokeWidth={2}
                  fill="none"
                  strokeDasharray={[2, 6]}
                  opacity={0.4}
                />
              )}
              <SvgText
                x={layout.nowX - 8}
                y={layout.mainY - 12}
                textAnchor="end"
                fontSize={12.8}
                fontWeight="600"
                fontFamily={tk.fontBody}
                fill={tk.ink}
              >
                {t("Now")}
              </SvgText>
              <BranchLine
                branch={branch}
                geometry={g}
                theme={theme}
                nowMs={nowTick}
                focused={false}
                highlighted
                born={false}
                reducedMotion={reducedMotion}
                onSelect={noop}
                onSelectMoment={noop}
                onSelectMergePoint={noop}
              />
              {showMascot && mascot.visible && (
                <Mascot
                  posX={mascot.posX}
                  posY={mascot.posY}
                  frame={mascot.frame}
                  flip={mascot.flip}
                  mascotType={mascot.mascotType}
                  bubbleText=""
                  showTapHint={false}
                  theme={tk}
                  onPress={noop}
                />
              )}
            </Svg>
            {/* what the thread is holding sits beneath its line */}
            {(branch.occupies?.length ?? 0) > 0 && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: Math.max(12, g.forkVisible ? g.forkX : 12),
                  top: Math.min(size.height - 40, g.laneY + 16),
                  right: 12,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 4.8,
                }}
              >
                {(branch.occupies ?? []).map((f) => (
                  <Tag key={f} label={t(f)} quality />
                ))}
              </View>
            )}
          </>
        )}
      </View>
      {/* the questions, flush to the container's bottom — which is the
          keyboard's top edge while typing. Capped and scrolling inside: a long
          panel (the integration wizard) would otherwise grow until the thread
          it is about had left the screen, which is the whole point of a stage. */}
      <View
        accessibilityLabel={t(stageLabel(operation))}
        style={{
          maxHeight: Math.max(200, visibleH * (kbOpen ? 0.74 : 0.62)),
          borderTopWidth: 1,
          borderTopColor: alpha(tk.lineAxis, 0.55),
          backgroundColor: tk.bgRaised,
          paddingTop: 10,
          paddingHorizontal: 16,
          paddingBottom: 13.6 + (kbOpen ? 0 : insets.bottom),
        }}
      >
        <InTrayContext.Provider value={true}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {/* A lone text input has no business being 1200px wide: hold the
                questions to a readable column, as the tray does. */}
            <View style={{ width: "100%", maxWidth: 640, alignSelf: "center" }}>
              {stageBody(operation)}
            </View>
          </ScrollView>
        </InTrayContext.Provider>
      </View>
    </View>
  );
}
