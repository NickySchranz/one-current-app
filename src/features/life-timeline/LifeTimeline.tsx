import { useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type PressableStateCallbackType,
} from "react-native";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { filterBranches, useAppStore } from "@/stores/app-store";
import { useLayoutStore } from "@/stores/layout-store";
import { buildTimelineLayout } from "@/visualization/main-line/layout";
import { generateTicks, dateToX } from "@/visualization/zoom/time-scale";
import { describeTimeline } from "@/visualization/a11y/describe";
import { effectiveLoudness, isClosed, mostActivated } from "@/domain/branches/logic";
import { decidedToday } from "@/domain/feelings/logic";
import type { PsychologicalBranch, Loudness } from "@/domain/branches/types";
import { BranchLine } from "./BranchLine";
import { TimelineHelp } from "@/features/timeline-help/TimelineHelp";
import { WholenessIndicator } from "./WholenessIndicator";
import { branchColor } from "@/visualization/branch-lines/style";
import { mergePreviewPath } from "@/visualization/branch-lines/paths";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";
import { Button, Hint, Prompt, shadow, T, Tag } from "@/ui/primitives";
import { AnimatedPath, MergePreviewTarget, NowGlow, ReclaimFly, useDashFlow } from "./timeline-fx";

const DAY = 24 * 60 * 60 * 1000;

/** Movement below this is still a tap; beyond it the gesture picks an axis. */
const DECIDE_PX = 8;
/** Vertical pixels per loudness step — up is louder, down is quieter. */
const STEP_PX = 36;

function clampLevel(level: number): number {
  return Math.max(1, Math.min(5, level));
}

/** Works on native handles and raw DOM nodes alike. */
function measureNode(
  node: unknown,
  cb: (x: number, y: number, w: number, h: number) => void,
) {
  const n = node as {
    measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    getBoundingClientRect?: () => { left: number; top: number; width: number; height: number };
  } | null;
  if (!n) return;
  if (typeof n.measureInWindow === "function") {
    n.measureInWindow(cb);
  } else if (typeof n.getBoundingClientRect === "function") {
    const r = n.getBoundingClientRect();
    cb(r.left, r.top, r.width, r.height);
  }
}

/**
 * A number that glides to its target over ~a third of a second (ease-out
 * cubic, like the web app's rAF tweens). Instant when motion is reduced.
 */
function useEased(target: number, reducedMotion: boolean): number {
  const [value, setValue] = useState(target);
  const sv = useSharedValue(target);
  useEffect(() => {
    cancelAnimation(sv);
    if (reducedMotion) {
      sv.value = target;
      return;
    }
    sv.value = withTiming(target, { duration: 300, easing: Easing.out(Easing.cubic) });
  }, [target, reducedMotion, sv]);
  useAnimatedReaction(
    () => sv.value,
    (v, prev) => {
      if (v !== prev) runOnJS(setValue)(v);
    },
    [],
  );
  return value;
}

type LoudnessPreview = { branchId: string; level: number };

export function LifeTimeline() {
  const branches = useAppStore((s) => s.branches);
  const pinnedBranchIds = useAppStore((s) => s.pinnedBranchIds);
  const window_ = useAppStore((s) => s.window);
  const nowTick = useAppStore((s) => s.nowTick);
  const typeFilter = useAppStore((s) => s.typeFilter);
  const statusFilter = useAppStore((s) => s.statusFilter);
  const setView = useAppStore((s) => s.setView);
  const setOperation = useAppStore((s) => s.setOperation);
  const panBy = useAppStore((s) => s.panBy);
  const returnToNow = useAppStore((s) => s.returnToNow);
  const theme = useAppStore((s) => s.theme);
  const operation = useAppStore((s) => s.operation);
  const reclaim = useAppStore((s) => s.reclaim);
  const clearReclaim = useAppStore((s) => s.clearReclaim);
  const born = useAppStore((s) => s.born);
  const clearBorn = useAppStore((s) => s.clearBorn);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const dialLoudness = useAppStore((s) => s.dialLoudness);
  const actions = useAppStore((s) => s.actions);
  const language = useAppStore((s) => s.language);
  const t = useT();
  const tk = useTheme();

  // The line the current operation concerns stays lit; everything else steps back.
  const focusedBranchId =
    "branchId" in operation
      ? operation.branchId
      : operation.kind === "confirming-merge" && operation.branchIds.length === 1
        ? operation.branchIds[0]
        : undefined;

  // A decision just released feelings: let them drift home, then forget the event.
  useEffect(() => {
    if (!reclaim) return;
    const timer = setTimeout(clearReclaim, reducedMotion ? 0 : 2200);
    return () => clearTimeout(timer);
  }, [reclaim, clearReclaim, reducedMotion]);

  // A just-created line draws itself in, then settles like the others.
  useEffect(() => {
    if (!born) return;
    const timer = setTimeout(clearBorn, reducedMotion ? 0 : 1600);
    return () => clearTimeout(timer);
  }, [born, clearBorn, reducedMotion]);

  const stageRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const [scrollH, setScrollH] = useState(0);
  const [size, setSize] = useState({ width: 960, height: 480 });

  // When the quick tray rises over the stage as a bottom sheet, the view
  // scrolls so the selected line and Now stay visible together above it —
  // the lanes themselves keep their places. The tray reports its own height
  // (layout store); a side panel leaves Now clear.
  const trayHeight = useLayoutStore((s) => s.trayHeight);
  const traySide = useLayoutStore((s) => s.traySide);
  const insetTarget =
    trayHeight > 0 && !traySide ? Math.min(trayHeight, size.height - 130) : 0;
  const bottomInset = useEased(insetTarget, reducedMotion);

  const visible = useMemo(
    () => filterBranches(branches, typeFilter, statusFilter),
    [branches, typeFilter, statusFilter],
  );

  const compact = size.width < 640;
  // When the bottom nav shows, its central + takes over — no second one here.
  const { width: winW } = useWindowDimensions();
  const showFab = winW > 760;
  // The app's sense of the present: ticks forward every half minute, jumps
  // when the Testing controls fast-forward time.
  const now = useMemo(() => new Date(nowTick), [nowTick]);

  // The wholeness chip is pinned over the stage's top corner. The canvas
  // keeps that much room above the top lane, so scrolling to the top always
  // brings the highest thread out from underneath it.
  const [topInset, setTopInset] = useState(0);

  // While a thread is in focus the main line leans toward its lane so the two
  // read together; everything else stays put.
  const [shiftTarget, setShiftTarget] = useState(0);
  const mainShift = useEased(shiftTarget, reducedMotion);
  const layout = useMemo(
    () =>
      buildTimelineLayout(visible, {
        width: size.width,
        height: size.height,
        window: window_,
        compact,
        now,
        mainShift,
        // Room above the top lane for its label, clear of the pinned chip.
        topPad: topInset > 0 ? topInset + 18 : undefined,
        // Lines created this session keep their lane — through "since when?"
        // changes and past the save, while the quick menu is still open.
        pinnedBranchIds,
      }),
    [visible, size, window_, compact, now, mainShift, topInset, pinnedBranchIds],
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // The lean glides in over about a third of a second and glides back to rest
  // when the panel closes. Lanes are anchored to bandY, so the target does not
  // move while the main line travels.
  useEffect(() => {
    let target = 0;
    if (focusedBranchId) {
      const g = layout.geometries.find((geo) => geo.branchId === focusedBranchId);
      if (g && g.inWindow) {
        const delta = g.laneY - layout.bandY;
        const gap = compact ? 36 : 44;
        target = Math.abs(delta) > gap ? delta - Math.sign(delta) * gap : 0;
      }
    }
    setShiftTarget(target);
  }, [focusedBranchId, layout, compact]);

  // With many threads the canvas grows taller than the stage and scrolls.
  // Whenever its shape changes, settle the view around the main line so Now
  // is what you see first; from there you scroll to the outer lanes.
  useEffect(() => {
    if (scrollH <= 0) return;
    const overflow = layout.height - scrollH;
    if (overflow > 0) {
      const y = Math.max(0, Math.min(overflow, layout.bandY - scrollH / 2));
      scrollRef.current?.scrollTo({ y, animated: false });
    }
  }, [layout.height, layout.bandY, scrollH]);

  // The tapped thread stays in sight: when a panel opens, scroll so the pair —
  // its lane and the leaning main line — sits centered in the space the panel
  // leaves free. Runs while the inset and the lean animate, so the view
  // follows the sheet as it slides in.
  useEffect(() => {
    if (scrollH <= 0) return;
    if (!focusedBranchId && bottomInset <= 0) return;
    const usable = Math.max(130, scrollH - bottomInset);
    const maxScroll = Math.max(0, layout.height + Math.round(bottomInset) - scrollH);
    let anchor = layout.mainY;
    let scrollCap = maxScroll;
    if (focusedBranchId) {
      const g = layout.geometries.find((geo) => geo.branchId === focusedBranchId);
      if (g && g.inWindow) {
        anchor = (g.laneY + layout.mainY) / 2;
        // A focused lane comes to rest below the pinned chip, never underneath.
        scrollCap = Math.min(scrollCap, Math.min(g.laneY, g.labelY) - 14 - topInset);
      }
    }
    const y = Math.max(0, Math.min(scrollCap, anchor - usable / 2));
    scrollRef.current?.scrollTo({ y, animated: false });
  }, [focusedBranchId, layout, bottomInset, topInset, scrollH]);

  // ---- gestures: tap / horizontal time-pan / vertical loudness dial --------

  const candidateRef = useRef<{ branchId: string; startLevel: number } | null>(null);
  const modeRef = useRef<"idle" | "dial" | "pan">("idle");
  const dialLevelRef = useRef(0);
  const lastXRef = useRef(0);
  const stagePosRef = useRef({ x: 0, y: 0 });
  const blockTapsUntilRef = useRef(0);
  const previewRef = useRef<LoudnessPreview | null>(null);
  const [preview, setPreviewState] = useState<LoudnessPreview | null>(null);
  const [scrollLocked, setScrollLocked] = useState(false);
  const chipX = useSharedValue(0);
  const chipY = useSharedValue(0);

  const setPreview = (p: LoudnessPreview | null) => {
    previewRef.current = p;
    setPreviewState(p);
  };

  const resetGesture = () => {
    modeRef.current = "idle";
    candidateRef.current = null;
    if (previewRef.current) setPreview(null);
    setScrollLocked(false);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, gs) => {
          if (Math.hypot(gs.dx, gs.dy) <= DECIDE_PX) return false;
          if (candidateRef.current && Math.abs(gs.dy) >= Math.abs(gs.dx)) {
            // Vertical wins: the thumb is dialing loudness now.
            modeRef.current = "dial";
            return true;
          }
          if (Math.abs(gs.dx) > Math.abs(gs.dy)) {
            // Horizontal wins: one finger drags through time.
            modeRef.current = "pan";
            candidateRef.current = null;
            return true;
          }
          // Plain vertical drag off any thread: the stage scrolls natively.
          return false;
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (_e, gs) => {
          lastXRef.current = gs.moveX || gs.x0;
          measureNode(stageRef.current, (x, y) => {
            stagePosRef.current = { x, y };
          });
          if (modeRef.current === "dial" && candidateRef.current) {
            const c = candidateRef.current;
            const level = clampLevel(c.startLevel + Math.round(-gs.dy / STEP_PX));
            dialLevelRef.current = level;
            setPreview({ branchId: c.branchId, level });
          }
        },
        onPanResponderMove: (_e, gs) => {
          if (modeRef.current === "dial") {
            const c = candidateRef.current;
            if (!c) return;
            const level = clampLevel(c.startLevel + Math.round(-gs.dy / STEP_PX));
            if (level !== dialLevelRef.current) {
              dialLevelRef.current = level;
              setPreview({ branchId: c.branchId, level });
            }
            // The chip floats up-left of the thumb, never underneath it.
            chipX.value = Math.max(8, gs.moveX - stagePosRef.current.x - 48);
            chipY.value = Math.max(8, gs.moveY - stagePosRef.current.y - 48);
            return;
          }
          if (modeRef.current === "pan") {
            const dx = gs.moveX - lastXRef.current;
            if (dx === 0) return;
            lastXRef.current = gs.moveX;
            // Dragging along the date labels scrubs faster than dragging the lanes.
            const svgY = gs.moveY - stagePosRef.current.y + scrollYRef.current;
            const nearDates = svgY > layoutRef.current.height - 56;
            panBy((-dx / Math.max(1, layoutRef.current.metrics.width)) * (nearDates ? 4 : 1));
          }
        },
        onPanResponderRelease: () => {
          if (modeRef.current === "dial" && candidateRef.current) {
            // The drag ends here — whatever happens, the tap must not follow.
            blockTapsUntilRef.current = Date.now() + 350;
            const c = candidateRef.current;
            if (dialLevelRef.current !== c.startLevel) {
              void dialLoudness(c.branchId, dialLevelRef.current as Loudness);
            }
          } else if (modeRef.current === "pan") {
            blockTapsUntilRef.current = Date.now() + 350;
          }
          resetGesture();
        },
        onPanResponderTerminate: () => {
          // Taken away by the system: revert the dial, commit nothing.
          if (modeRef.current !== "idle") blockTapsUntilRef.current = Date.now() + 350;
          resetGesture();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store actions are stable
    [],
  );

  /** A finished drag must not fire the tap that follows it. */
  const guarded = (fn: () => void) => () => {
    if (Date.now() < blockTapsUntilRef.current) return;
    fn();
  };

  // Wheel / trackpad (web only): sideways scrolling moves through time —
  // faster down by the date labels. Vertical wheel stays native: it scrolls
  // the stage when the threads have grown taller than it.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = stageRef.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== "function") return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const svgY = e.clientY - rect.top + scrollYRef.current;
      const nearDates = svgY > layoutRef.current.height - 56;
      panBy((e.deltaX / Math.max(1, rect.width)) * (nearDates ? 4 : 1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [panBy]);

  // ---- derived view data ---------------------------------------------------

  const ticks = useMemo(() => generateTicks(layout.window, now), [layout.window, now]);
  const summary = useMemo(
    () => describeTimeline(visible, layout.window, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable per language
    [visible, layout.window, language],
  );
  const top = mostActivated(visible);
  const byId = useMemo(() => new Map(visible.map((b) => [b.id, b])), [visible]);

  // "Return to Now" appears once you have moved away from the default view:
  // the recent week with the right edge at the furthest future we extend.
  const today = now.toISOString().slice(0, 10);
  const span = Date.parse(layout.window.end) - Date.parse(layout.window.start);
  const restingEnd = Date.parse(today) + span / 2;
  const awayFromNow =
    Math.abs(restingEnd - Date.parse(layout.window.end)) > 0.25 * DAY ||
    Math.abs(span - 8 * DAY) > 0.75 * DAY;

  const todayX = dateToX(today, layout.window, layout.metrics.width);

  // Every decision gathers around the main line past Now — steps still ahead,
  // steps already done today (✓), and even "nothing can be done", which is a
  // decision too. Decisions of integrated lines leave with them.
  const futureItems = useMemo(() => {
    const items: { id: string; label: string; done: boolean; color: string }[] = [];
    const short = (s: string, n = 26) => (s.length > n ? s.slice(0, n - 2) + "…" : s);
    for (const a of actions) {
      const owner = branches.find((b) => b.id === a.branchesIntegrated[0]?.branchId);
      if (owner && isClosed(owner)) continue;
      const doneToday = a.completedAt?.slice(0, 10) === today;
      if (a.completedAt && !doneToday) continue;
      items.push({
        id: a.id,
        label: doneToday ? `✓ ${short(a.title)}` : short(a.title),
        done: !!doneToday,
        color: owner ? branchColor(owner, theme) : tk.accent,
      });
    }
    for (const b of branches) {
      if (isClosed(b) || b.leftOn !== today) continue;
      items.push({
        id: b.id,
        label: `✓ ${t("resting · {title}", { title: short(b.title, 22) })}`,
        done: true,
        color: branchColor(b, theme, "muted"),
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable per language
  }, [actions, branches, theme, today, language, tk.accent]);

  // How split the present is: open lines pull apart, decisions gather them.
  const activeLines = visible.filter((b) => !isClosed(b));

  // The slow current on the main line, and the merge preview's leaning dashes.
  const mainFlowProps = useDashFlow(!reducedMotion, 15, 0, tk.mainFlowDuration);
  const mergeFlowProps = useDashFlow(
    operation.kind === "confirming-merge" && !reducedMotion,
    0,
    -26,
    1100,
  );

  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: chipX.value }, { translateY: chipY.value }],
  }));

  const svgHeight = layout.height + Math.round(bottomInset);
  const previewBranch = preview ? byId.get(preview.branchId) : undefined;

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View
        ref={stageRef}
        style={{ position: "relative", flex: 1, minHeight: 260, overflow: "hidden" }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize({ width: Math.max(320, width), height: Math.max(240, height) });
        }}
      >
        {/* the canvas may be taller than the stage: this container scrolls it,
            while the +, help and wholeness chip stay pinned to the stage */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, minHeight: 0 }}
          scrollEnabled={!scrollLocked}
          onLayout={(e) => setScrollH(e.nativeEvent.layout.height)}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator
          overScrollMode="never"
        >
          <View
            {...panResponder.panHandlers}
            onTouchEnd={() => {
              // a candidate that never picked an axis stays a tap
              if (modeRef.current === "idle") resetGesture();
            }}
          >
            <Svg
              width={size.width}
              height={svgHeight}
              accessibilityLabel={summary}
              accessibilityRole="image"
              // .timeline-svg parity: drags must never select label text, and
              // the browser keeps vertical panning while we own horizontal.
              {...(Platform.OS === "web"
                ? { style: { userSelect: "none", touchAction: "pan-y" } as object }
                : null)}
            >
              {/* today softly glows: where life is happening */}
              {layout.nowX - todayX > 0 && (
                <Rect
                  x={todayX}
                  y={0}
                  width={layout.nowX - todayX}
                  height={layout.height}
                  fill={tk.accent}
                  opacity={0.05}
                />
              )}

              {/* axis ticks */}
              {ticks.map((tick) => {
                const x = dateToX(tick.date, layout.window, layout.metrics.width);
                return (
                  <G key={tick.date}>
                    <Line x1={x} y1={16} x2={x} y2={layout.height - 20} stroke={tk.lineAxis} />
                    <SvgText
                      x={x + 4}
                      y={layout.height - 8}
                      fontSize={11}
                      fontFamily={tk.fontBody}
                      fontWeight={tick.major ? "600" : "400"}
                      fill={tick.major ? tk.inkSoft : tk.inkFaint}
                    >
                      {tick.label}
                    </SvgText>
                  </G>
                );
              })}

              {/* main life line, with a slow current flowing toward Now */}
              <Path
                d={`M 0 ${layout.mainY} L ${layout.nowX} ${layout.mainY}`}
                stroke={tk.lineMain}
                strokeWidth={3.25}
                fill="none"
              />
              <AnimatedPath
                animatedProps={mainFlowProps}
                d={`M 0 ${layout.mainY} L ${layout.nowX} ${layout.mainY}`}
                stroke={tk.accent}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={tk.mainFlowDash}
                opacity={0.7}
              />
              <Path
                d={`M ${layout.nowX - 12} ${layout.mainY - 6} L ${layout.nowX} ${layout.mainY} L ${layout.nowX - 12} ${layout.mainY + 6}`}
                stroke={tk.lineMain}
                strokeWidth={3.25}
                fill="none"
              />

              {/* the future stays one line: the main line continues faded,
                  nothing branches ahead of Now */}
              {layout.fullWidth - layout.nowX > 4 && (
                <G>
                  <Rect
                    x={layout.nowX}
                    y={0}
                    width={Math.max(0, layout.fullWidth - layout.nowX)}
                    height={layout.height}
                    fill={tk.inkFaint}
                    opacity={0.05}
                  />
                  <Path
                    d={`M ${layout.nowX} ${layout.mainY} L ${layout.fullWidth} ${layout.mainY}`}
                    stroke={tk.lineMain}
                    strokeWidth={2}
                    fill="none"
                    strokeDasharray={[2, 6]}
                    opacity={0.4}
                  />
                </G>
              )}

              {/* every decision gathers around the main line past Now — a calm
                  record of the day. Tapping it opens the actions panel. */}
              {futureItems.length > 0 && layout.fullWidth - layout.nowX > 40 && (
                <G onPress={guarded(() => setOperation({ kind: "viewing-actions" }))}>
                  <Rect
                    x={layout.nowX + 4}
                    y={layout.mainY + 2}
                    width={170}
                    height={futureItems.length * 16 + 16}
                    fill="transparent"
                  />
                  <Path
                    d={`M ${layout.nowX} ${layout.mainY} L ${Math.min(
                      layout.nowX + 150,
                      layout.fullWidth - 6,
                    )} ${layout.mainY}`}
                    stroke={tk.accent}
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                    opacity={0.55}
                  />
                  {futureItems.map((it, i) => {
                    const y = layout.mainY + 16 + i * 16;
                    return (
                      <G key={it.id}>
                        <Circle
                          cx={layout.nowX + 16}
                          cy={y - 4}
                          r={3}
                          fill={it.color}
                          opacity={it.done ? 0.35 : 0.55}
                        />
                        <SvgText
                          x={layout.nowX + 24}
                          y={y}
                          fontSize={11}
                          fontFamily={tk.fontBody}
                          letterSpacing={0.11}
                          fill={it.done ? tk.inkFaint : tk.inkSoft}
                        >
                          {it.label}
                        </SvgText>
                      </G>
                    );
                  })}
                </G>
              )}

              {/* branch lines */}
              {layout.geometries.map((g, i) => {
                const branch = byId.get(g.branchId);
                if (!branch) return null;
                return (
                  <BranchLine
                    key={g.branchId}
                    branch={branch}
                    geometry={g}
                    theme={theme}
                    nowMs={nowTick}
                    loudnessPreview={
                      preview?.branchId === branch.id ? preview.level : undefined
                    }
                    onDialTouchStart={
                      // A decision today settles the loudness too: the dial rests
                      // with the line until tomorrow (or until it reopens).
                      isClosed(branch) || decidedToday(branch, now)
                        ? undefined
                        : // The drag moves in whole levels, starting from the
                          // loudness as felt today (drift included).
                          (_e: GestureResponderEvent) => {
                            candidateRef.current = {
                              branchId: branch.id,
                              startLevel: Math.round(effectiveLoudness(branch, now)),
                            };
                            setScrollLocked(true);
                          }
                    }
                    focused={false}
                    emphasizedId={top?.id}
                    highlighted={branch.id === focusedBranchId}
                    dimmed={!!focusedBranchId && branch.id !== focusedBranchId}
                    born={!reducedMotion && born?.branchId === branch.id}
                    reducedMotion={reducedMotion}
                    onSelect={guarded(() =>
                      setOperation({ kind: "quick-touch", branchId: branch.id }),
                    )}
                    onSelectMoment={guarded(() =>
                      setOperation({ kind: "quick-touch", branchId: branch.id }),
                    )}
                    onSelectMergePoint={guarded(() => {
                      const mergeId = branch.mergeIds[branch.mergeIds.length - 1];
                      if (mergeId) setView({ kind: "merge-review", mergeId });
                    })}
                  />
                );
              })}

              {/* a merge being considered: the lines curve toward Now, reversibly */}
              {operation.kind === "confirming-merge" && (
                <G>
                  {operation.branchIds.map((id) => {
                    const g = layout.geometries.find((x) => x.branchId === id);
                    const branch = byId.get(id);
                    if (!g || !branch || g.endsOnMain || !g.inWindow) return null;
                    return (
                      <AnimatedPath
                        key={id}
                        animatedProps={mergeFlowProps}
                        d={mergePreviewPath(g, layout.metrics)}
                        stroke={branchColor(branch, theme)}
                        strokeWidth={2.25}
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={[6, 7]}
                        opacity={0.75}
                      />
                    );
                  })}
                  {operation.branchIds.length > 0 && (
                    <MergePreviewTarget
                      cx={layout.nowX - 2}
                      cy={layout.mainY}
                      stroke={tk.accent}
                      reducedMotion={reducedMotion}
                    />
                  )}
                </G>
              )}

              {/* Now marker: alive, breathing */}
              {/* No accessibilityRole="button" here: react-native-svg web turns
                  the G into an HTML <button> inside <svg>, which never paints. */}
              <G
                onPress={guarded(returnToNow)}
                accessible
                accessibilityLabel={t("Now. Select to return the view to the present.")}
              >
                <NowGlow
                  cx={layout.nowX - 2}
                  cy={layout.mainY}
                  fill={tk.accent}
                  theme={theme}
                  reducedMotion={reducedMotion}
                />
                <Circle cx={layout.nowX - 2} cy={layout.mainY} r={7} fill={tk.accent} />
                <SvgText
                  x={layout.nowX - 8}
                  y={layout.mainY - 18}
                  textAnchor="end"
                  fontSize={13}
                  fontWeight="600"
                  fontFamily={tk.fontBody}
                  fill={tk.ink}
                >
                  {t("Now")}
                </SvgText>
              </G>
            </Svg>
          </View>
        </ScrollView>

        {/* One round +, unmistakable and wordless, floating on the water. */}
        {showFab && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("New thread")}
          onPress={() => setOperation({ kind: "creating-branch" })}
          style={({ pressed, hovered }: PressableStateCallbackType & {
            hovered?: boolean;
          }) => [
            {
              position: "absolute",
              right: 16,
              bottom: 20,
              zIndex: 20,
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: tk.accent,
              alignItems: "center",
              justifyContent: "center",
              transform: [{ scale: pressed ? 0.96 : 1 }],
              opacity: hovered ? 0.93 : 1,
            },
            tk.shadows ? shadow(tk) : null,
          ]}
        >
          <T style={{ color: tk.accentInk, fontSize: 24, lineHeight: 28 }}>+</T>
        </Pressable>
        )}

        <TimelineHelp />
        {/* how split the present is: strands fan out per undecided line and
            come home as decisions are taken — tap it for the day's forecast */}
        <WholenessIndicator
          activeLines={activeLines}
          onChipHeight={(h) => setTopInset(Math.max(0, Math.round(9.6 + h) + 8))}
        />

        {/* while the thumb dials a thread's loudness: its name and level, live */}
        {preview && previewBranch && (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: 0,
                top: 0,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: 6,
                backgroundColor: tk.bgRaised,
                borderWidth: 1,
                borderColor: alpha(tk.lineAxis, 0.55),
              },
              tk.shadows ? shadow(tk) : null,
              chipStyle,
            ]}
          >
            <T style={{ fontSize: 12 }}>
              {previewBranch.title.length > 22
                ? previewBranch.title.slice(0, 20) + "…"
                : previewBranch.title}
            </T>
            <View style={{ flexDirection: "row", gap: 3 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <View
                  key={n}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor:
                      n <= preview.level ? tk.accent : alpha(tk.lineAxis, 0.55),
                  }}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {branches.length === 0 && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <View
              style={{
                alignItems: "center",
                gap: 8,
                padding: 24,
                borderRadius: 24,
                backgroundColor: alpha(tk.bg, 0.78),
              }}
            >
              <Prompt style={{ fontSize: 19.2, textAlign: "center" }}>
                {t("Your life continues on one main line.")}
              </Prompt>
              <Hint style={{ maxWidth: 480, textAlign: "center" }}>
                {t(
                  "When something begins pulling part of your attention away from the present, add it as a thread with the + button. You can integrate it when it has given you what it carries.",
                )}
              </Hint>
            </View>
          </View>
        )}

        {awayFromNow && (
          <View style={{ position: "absolute", top: 12, right: 14.4, zIndex: 5 }}>
            <Button
              label={`⇥ ${t("Return to Now")}`}
              onPress={returnToNow}
              textStyle={{ color: tk.accent }}
            />
          </View>
        )}

        {/* feelings returning to the main line after a decision */}
        {reclaim &&
          !reducedMotion &&
          (() => {
            const g = layout.geometries.find((x) => x.branchId === reclaim.branchId);
            if (!g) return null;
            const x0 = Math.min(g.labelX, layout.metrics.width - 60);
            const y0 = g.labelY;
            return (
              <View
                key={reclaim.key}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  overflow: "hidden",
                  zIndex: 6,
                }}
              >
                {reclaim.feelings.map((f, i) => (
                  <ReclaimFly
                    key={f}
                    index={i}
                    x0={x0}
                    y0={y0}
                    dx={layout.nowX - 24 - x0}
                    dy={layout.mainY - y0}
                  >
                    <Tag label={t(f)} quality />
                  </ReclaimFly>
                ))}
              </View>
            );
          })()}
      </View>
    </View>
  );
}
