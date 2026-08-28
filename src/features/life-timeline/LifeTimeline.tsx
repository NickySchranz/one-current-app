import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { filterBranches, useAppStore } from "@/stores/app-store";
import { useLayoutStore } from "@/stores/layout-store";
import { buildTimelineLayout } from "@/visualization/main-line/layout";
import { generateTicks, dateToX, addDays } from "@/visualization/zoom/time-scale";
import { describeTimeline } from "@/visualization/a11y/describe";
import { effectiveLoudness, isClosed, mostActivated } from "@/domain/branches/logic";
import { decidedToday, energySplit } from "@/domain/feelings/logic";
import type { PsychologicalBranch, Loudness } from "@/domain/branches/types";
import { BranchLine } from "./BranchLine";
import { PaywallPrompt, useThreadGate } from "@/features/paywall/PaywallPrompt";
import { TimelineHelp } from "@/features/timeline-help/TimelineHelp";
import { WholenessIndicator } from "./WholenessIndicator";
import { branchColor, restingToday } from "@/visualization/branch-lines/style";
import { mergePreviewPath } from "@/visualization/branch-lines/paths";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/ui/theme";
import { alpha, mix } from "@/ui/color";
import { Button, Hint, Prompt, shadow, T, Tag } from "@/ui/primitives";
import { loudnessWord } from "@/ui/LoudnessSlider";
import { AnimatedPath, AttackFx, attackVariantFor, BurnAway, CelebrationBurst, ChargePop, CoinToken, COIN_FLY_MS, COIN_HOVER, COIN_LEAD, LungeG, MergePreviewTarget, NowGlow, PopBurst, ReclaimFly, SmokeFly, ThemeBackdrop, ThemeScenery, TokenFly, useDashFlow } from "./timeline-fx";
import { Mascot, estTextWidth } from "./Mascot";
import { PX } from "./mascot-frames";
import { useMascot, randomFrom } from "./useMascot";
import { useCalmCurrent } from "./useSquiggle";

const DAY = 24 * 60 * 60 * 1000;

const AnimatedOptionG = Animated.createAnimatedComponent(G);

/**
 * One line in the day's record beside Now. A step that has just landed slides
 * in from the right and fades up, so placing it is something you watch happen
 * rather than something you find already there. Everything else renders still.
 */
function DayRow({
  arriving,
  reducedMotion,
  children,
}: {
  arriving: boolean;
  reducedMotion: boolean;
  children: React.ReactNode;
}) {
  const play = arriving && !reducedMotion;
  const op = useSharedValue(1);
  const dx = useSharedValue(0);
  // `arriving` turns true one render after mount — the event that sets it is
  // read in an effect — so the entrance has to start when it flips, not on
  // mount, or it would be over before there was anything to move.
  useEffect(() => {
    if (!play) return;
    op.value = 0;
    dx.value = 14;
    op.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) });
    dx.value = withTiming(0, { duration: 460, easing: Easing.out(Easing.cubic) });
  }, [play, op, dx]);
  const animatedProps = useAnimatedProps(() => ({
    opacity: op.value,
    translateX: dx.value,
  }));
  if (!play) return <G>{children}</G>;
  return (
    // testID so the harness can watch this one row rather than guess which
    // group on a busy map is the arriving step.
    <AnimatedOptionG testID="day-row-arriving" animatedProps={animatedProps}>
      {children}
    </AnimatedOptionG>
  );
}

// Pip's offer bubble: one padded speech bubble holding two rounded rows —
// kept compact so it fits to his right almost anywhere on the map. Row
// width follows the labels (Spanish runs longer than English) but stays
// within a thumb-friendly clamp.
const BUBBLE_PAD = 4;
const ROW_H = 27;
const ROW_GAP = 3;
const BUBBLE_H = ROW_H * 2 + ROW_GAP + BUBBLE_PAD * 2;
const BUBBLE_R = 15;
const ROW_FONT = 11.5;
/** Icon (28) + text + right breathing room, clamped. */
function pillRowW(labels: string[], fontBody?: string): number {
  const text = Math.max(...labels.map((l) => estTextWidth(l, fontBody, ROW_FONT)));
  return Math.max(100, Math.min(154, Math.ceil(28 + text + 13)));
}

/**
 * The offer Pip makes when he reaches a thread: ONE speech bubble with a
 * tail pointing back at him, holding two rows of the same gesture — reflect
 * fully (accent row) or just dial the loudness (quiet row). It springs out
 * of his side, growing from the tail with a soft overshoot.
 */
function MascotOptionsBubble({
  originX,
  cy,
  dir,
  tailDy,
  labels,
  onReflect,
  onDial,
  tk,
  reducedMotion,
}: {
  /** Where the tail's tip sits — right at Pip's side. */
  originX: number;
  /** Vertical center of the TOP row (his shoulder line). */
  cy: number;
  /** 1 = bubble extends to Pip's right, -1 = to his left (near the edge). */
  dir: 1 | -1;
  /** Vertical offset of the tail's tip, aimed at Pip's middle. */
  tailDy: number;
  labels: { reflect: string; dial: string };
  onReflect: () => void;
  onDial: () => void;
  tk: ReturnType<typeof useTheme>;
  reducedMotion: boolean;
}) {
  const p = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) {
      p.value = 1;
      return;
    }
    p.value = 0;
    p.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.back(1.6)) });
  }, [p, reducedMotion]);
  // Scale grows from the group origin — the tail tip at Pip's side — so the
  // whole bubble visibly emerges from him with a fluid overshoot.
  const animatedProps = useAnimatedProps(() => ({
    opacity: Math.min(1, Math.max(0, p.value * 1.5)),
    scale: 0.4 + 0.6 * p.value,
  }));
  const ROW_W = pillRowW([labels.reflect, labels.dial], tk.fontBody);
  const BUBBLE_W = ROW_W + BUBBLE_PAD * 2;
  const left = dir === 1 ? 8 : -8 - BUBBLE_W;
  const rowLeft = left + BUBBLE_PAD;
  // Local origin (0,0) stays at the TOP row's center.
  const top = -(BUBBLE_PAD + ROW_H / 2);
  const row2C = ROW_H + ROW_GAP; // second row's vertical center
  const midY = top + BUBBLE_H / 2; // the bubble's own middle — where the tail roots
  const stroke = alpha(tk.lineAxis, 0.9);
  // A whisper of accent, not a shout — the row stays clearly the fuller move.
  const softAccent = mix(tk.accent, tk.bgRaised, 20);
  const strokeOn = (color: string) => ({
    stroke: color,
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none" as const,
  });
  return (
    <G x={originX} y={cy}>
      <AnimatedOptionG animatedProps={animatedProps}>
        {/* the shared tail first: neutral (neither row's color) and rooted at
            the bubble's own middle, so it reads as the bubble's voice — not
            a header for either option. The card drawn after hides its base. */}
        <Path
          d={`M 0 ${tailDy} L ${dir * 10.5} ${midY - 5.5} L ${dir * 10.5} ${midY + 5.5} Z`}
          fill={alpha(tk.bgRaised, 0.97)}
          stroke={stroke}
          strokeWidth={1}
        />
        {/* the padded card that holds both options */}
        <Rect
          x={left}
          y={top}
          width={BUBBLE_W}
          height={BUBBLE_H}
          rx={BUBBLE_R}
          fill={alpha(tk.bgRaised, 0.97)}
          stroke={stroke}
          strokeWidth={1}
        />
        {/* row 1: Reflect — its own rounded pill inside the card */}
        <G onPress={onReflect}>
          <Rect x={left - 8} y={top - 6} width={BUBBLE_W + 16} height={BUBBLE_PAD + ROW_H + 6 + ROW_GAP / 2} fill="transparent" />
          <Rect
            x={rowLeft}
            y={-ROW_H / 2}
            width={ROW_W}
            height={ROW_H}
            rx={ROW_H / 2}
            fill={softAccent}
          />
          <G x={rowLeft + 9} y={-7.5} scale={15 / 24}>
            <Path
              d="M3 12 C6.5 6.8, 17.5 6.6, 21 12 C17.5 17.3, 6.5 17.4, 3 12 Z"
              {...strokeOn(tk.accent)}
            />
            <Circle cx={12} cy={12} r={2.6} {...strokeOn(tk.accent)} />
          </G>
          <SvgText x={rowLeft + 28} y={4.1} fontSize={11.5} fontWeight="600" fill={tk.ink}>
            {labels.reflect}
          </SvgText>
        </G>
        {/* row 2: the loudness dial — its own rounded pill, quieter tint */}
        <G onPress={onDial}>
          <Rect x={left - 8} y={ROW_H / 2 + ROW_GAP / 2} width={BUBBLE_W + 16} height={ROW_H + BUBBLE_PAD + 6 + ROW_GAP / 2} fill="transparent" />
          <Rect
            x={rowLeft}
            y={row2C - ROW_H / 2}
            width={ROW_W}
            height={ROW_H}
            rx={ROW_H / 2}
            fill={mix(tk.bgSunken, tk.bgRaised, 55)}
          />
          <G x={rowLeft + 9} y={row2C - 7.5} scale={15 / 24}>
            <Circle cx={5} cy={12} r={1.9} fill={tk.accent} />
            <Path d="M9.5 8 C11.8 10, 11.8 14, 9.5 16" {...strokeOn(tk.accent)} />
            <Path d="M13.5 5.5 C17.3 8.6, 17.3 15.4, 13.5 18.5" {...strokeOn(tk.accent)} />
          </G>
          <SvgText x={rowLeft + 28} y={row2C + 4.1} fontSize={11.5} fontWeight="600" fill={tk.ink}>
            {labels.dial}
          </SvgText>
        </G>
      </AnimatedOptionG>
    </G>
  );
}


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
  const setWindow = useAppStore((s) => s.setWindow);
  const allBranches = useAppStore((s) => s.branches);
  const returnToNow = useAppStore((s) => s.returnToNow);
  const theme = useAppStore((s) => s.theme);
  const operation = useAppStore((s) => s.operation);
  const reclaim = useAppStore((s) => s.reclaim);
  const clearReclaim = useAppStore((s) => s.clearReclaim);
  const canOpenThread = useThreadGate();
  const [paywalled, setPaywalled] = useState(false);
  const born = useAppStore((s) => s.born);
  const clearBorn = useAppStore((s) => s.clearBorn);
  const added = useAppStore((s) => s.added);
  const clearAdded = useAppStore((s) => s.clearAdded);
  const answered = useAppStore((s) => s.answered);
  const clearAnswered = useAppStore((s) => s.clearAnswered);
  const integrated = useAppStore((s) => s.integrated);
  const clearIntegrated = useAppStore((s) => s.clearIntegrated);
  const burn = useAppStore((s) => s.burn);
  const hit = useAppStore((s) => s.hit);
  const clearHit = useAppStore((s) => s.clearHit);
  const attackBranch = useAppStore((s) => s.attackBranch);
  const bonkCharge = useAppStore((s) => s.bonkCharge);
  const consumeSuperBonk = useAppStore((s) => s.consumeSuperBonk);
  const finalizeBurn = useAppStore((s) => s.finalizeBurn);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const mascotTypePref = useAppStore((s) => s.mascotType);
  const draftBranchId = useAppStore((s) => s.draftBranchId);
  const dialLoudness = useAppStore((s) => s.dialLoudness);
  const maybeDropCoin = useAppStore((s) => s.maybeDropCoin);
  const coins = useAppStore((s) => s.coins);
  const actions = useAppStore((s) => s.actions);
  const language = useAppStore((s) => s.language);
  const t = useT();
  const tk = useTheme();

  // The line the current operation concerns stays lit; everything else steps back.
  const focusedBranchId =
    operation.kind === "viewing-integrated" && operation.branchId
      ? operation.branchId
      : "branchId" in operation
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

  // Mascot reactions (wired after mascot is declared below — use ref so the
  // effects can safely reference the function without re-running).
  const mascotReactionRef = useRef<((text: string) => void) | null>(null);

  // Pip just struck a thread: let the impact play, then rest the event.
  useEffect(() => {
    if (!hit) return;
    const pool = hit.calm ? mascot.phrases.attackCalm : mascot.phrases.attack;
    const say = setTimeout(() => mascotReactionRef.current?.(randomFrom(pool)), 520);
    const timer = setTimeout(clearHit, reducedMotion ? 0 : 1400);
    return () => {
      clearTimeout(say);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit, clearHit, reducedMotion]);

  // A worry is burning: when the fire has consumed everything, the thread is
  // removed from the app for good — only the lesson walks out.
  const [lessonFlying, setLessonFlying] = useState(false);
  const [attackCooldownUntil, setAttackCooldownUntil] = useState(0);
  /** The thread Pip has been sent to: first tap arms it, the bar acts on it. */
  const [armedBranchId, setArmedBranchId] = useState<string | null>(null);
  useEffect(() => {
    if (!burn) {
      setLessonFlying(false);
      return;
    }
    const fly = setTimeout(() => setLessonFlying(true), reducedMotion ? 0 : 1900);
    const timer = setTimeout(() => void finalizeBurn(), reducedMotion ? 0 : 3200);
    return () => {
      clearTimeout(fly);
      clearTimeout(timer);
    };
  }, [burn, finalizeBurn, reducedMotion]);

  // A just-created line draws itself in, then settles like the others.
  useEffect(() => {
    if (!born) return;
    const timer = setTimeout(clearBorn, reducedMotion ? 0 : 1600);
    return () => clearTimeout(timer);
  }, [born, clearBorn, reducedMotion]);

  // A thread that just came home does the same, along its merged path — so the
  // fold onto the main line is watched rather than arrived at.
  useEffect(() => {
    if (!integrated) return;
    const timer = setTimeout(clearIntegrated, reducedMotion ? 0 : 1600);
    return () => clearTimeout(timer);
  }, [integrated, clearIntegrated, reducedMotion]);

  // The added event only sends Pip to the new thread now (no popup): consume
  // it shortly after so it never refires.
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(clearAdded, 800);
    return () => clearTimeout(timer);
  }, [added, clearAdded]);

  const stageRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const [scrollH, setScrollH] = useState(0);
  const scrollHRef = useRef(0);
  scrollHRef.current = scrollH;
  const [size, setSize] = useState({ width: 960, height: 480 });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // When the quick tray rises over the stage as a bottom sheet, the view
  // scrolls so the selected line and Now stay visible together above it —
  // the lanes themselves keep their places. The tray reports its own height
  // (layout store); a side panel leaves Now clear.
  const trayHeight = useLayoutStore((s) => s.trayHeight);
  const traySide = useLayoutStore((s) => s.traySide);
  const insetTarget =
    trayHeight > 0 && !traySide ? Math.min(trayHeight, size.height - 130) : 0;
  const bottomInset = useEased(insetTarget, reducedMotion);

  // The draft being created lives on its own screen (CreationScreen) — the
  // map never shows it and never moves for it. It appears here only once
  // committed, as a real branch with its born draw-in.
  const visible = useMemo(() => {
    const base = draftBranchId ? branches.filter((b) => b.id !== draftBranchId) : branches;
    return filterBranches(base, typeFilter, statusFilter);
  }, [branches, draftBranchId, typeFilter, statusFilter]);

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
        // Room above the top lane for its label, clear of the pinned chip —
        // and always enough headroom for Pip's speech bubble when he stands
        // at the highest thread (sprite ~22px above the lane, bubble above).
        topPad: Math.max(88, topInset > 0 ? topInset + 18 : 0),
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
    const anchorId = focusedBranchId;
    if (!anchorId && bottomInset <= 0) return;
    const usable = Math.max(130, scrollH - bottomInset);
    const maxScroll = Math.max(0, layout.height + Math.round(bottomInset) - scrollH);
    let anchor = layout.mainY;
    let scrollCap = maxScroll;
    if (anchorId) {
      const g = layout.geometries.find((geo) => geo.branchId === anchorId);
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

  // ── Press-and-hold: the Facebook-emoji move. Holding a line makes it
  // swell (holdP drives the BranchLine scale + bulge); at HOLD_MS it pops
  // straight into the loudness dial sheet. Any drag or early release
  // cancels through resetGesture, the single gesture funnel.
  const HOLD_MS = 380;
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holdBranchId, setHoldBranchId] = useState<string | null>(null);
  const holdBranchRef = useRef<string | null>(null);
  const holdP = useSharedValue(0);
  const [holdPop, setHoldPop] = useState<{ key: number; branchId: string } | null>(null);
  const cancelHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdBranchRef.current) {
      holdBranchRef.current = null;
      setHoldBranchId(null);
      cancelAnimation(holdP);
      holdP.value = 0;
    }
  };

  /** A hold already consumed this touch: its release must not read as a tap. */
  const holdFiredRef = useRef(false);

  const resetGesture = () => {
    modeRef.current = "idle";
    candidateRef.current = null;
    if (previewRef.current) setPreview(null);
    setScrollLocked(false);
    cancelHold();
  };

  /** The touch ended: swallow the release-click of a fired hold, then reset. */
  const endGesture = () => {
    if (holdFiredRef.current) {
      holdFiredRef.current = false;
      blockTapsUntilRef.current = Date.now() + 350;
    }
    resetGesture();
  };

  // Web mice never fire the wrapper's onTouchEnd, so a plain click on a line
  // (which arms the dial and locks scrolling) would leave the stage
  // unscrollable. A pointerup that ends as a tap unlocks it.
  useEffect(() => {
    if (!scrollLocked || Platform.OS !== "web") return;
    const up = () => {
      if (modeRef.current === "idle") endGesture();
    };
    window.addEventListener("pointerup", up, true);
    return () => window.removeEventListener("pointerup", up, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetGesture is stable in spirit
  }, [scrollLocked]);

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
              // Rolled before the commit: the loudness log is the coin's
              // anti-farm memory and must still end at the old level here.
              maybeDropCoin(c.branchId, c.startLevel, dialLevelRef.current);
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

  // Latest values behind stable refs, so the id-keyed handlers below never
  // need to change identity as data flows.
  const branchesRef = useRef(branches);
  branchesRef.current = branches;
  const nowRef = useRef(now);
  nowRef.current = now;

  // Stable, id-keyed handlers for BranchLine: fresh closures per render
  // defeat its memo, and Pip's 9Hz sprite frames would re-render every
  // branch. These change identity only when their rare inputs change.
  const selectBranch = useCallback(
    (branchId: string) => {
      if (Date.now() < blockTapsUntilRef.current) return;
      const b = branchesRef.current.find((x) => x.id === branchId);
      if (!b) return;
      // A tap sends Pip over and holds the thread — it opens nothing. The
      // panels have their own gestures: press-and-hold pops the loudness
      // dial, a second tap opens the full decisions. Pip makes no offer
      // either way; the user already said which thread they mean.
      if (isClosed(b) || armedBranchId === branchId) {
        setArmedBranchId(null);
        setOperation({ kind: "quick-touch", branchId });
        return;
      }
      setArmedBranchId(branchId);
      mascot.focusBranch(branchId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focusBranch is stable
    [armedBranchId, setOperation],
  );
  const selectBranchMoment = useCallback(
    (branchId: string, _momentId: string) => selectBranch(branchId),
    [selectBranch],
  );
  const selectMergePoint = useCallback(
    (branchId: string) => {
      if (Date.now() < blockTapsUntilRef.current) return;
      const b = branchesRef.current.find((x) => x.id === branchId);
      const mergeId = b?.mergeIds[b.mergeIds.length - 1];
      if (mergeId) setView({ kind: "merge-review", mergeId });
    },
    [setView],
  );
  const dialTouchStart = useCallback(
    (branchId: string, _e: GestureResponderEvent) => {
      const b = branchesRef.current.find((x) => x.id === branchId);
      if (!b) return;
      candidateRef.current = {
        branchId,
        startLevel: Math.round(effectiveLoudness(b, nowRef.current)),
      };
      setScrollLocked(true);
      // Arm the hold: if the finger stays put past HOLD_MS, the line pops
      // open its loudness dial. Any drag or early release cancels it.
      cancelHold();
      const reduced = useAppStore.getState().reducedMotion;
      if (!reduced) {
        holdBranchRef.current = branchId;
        setHoldBranchId(branchId);
        holdP.value = 0;
        holdP.value = withTiming(1, { duration: HOLD_MS, easing: Easing.out(Easing.quad) });
      }
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        if (modeRef.current !== "idle") return;
        if (candidateRef.current?.branchId !== branchId) return;
        // The pop. The finger may stay down a while longer — endGesture
        // swallows the eventual release-click via holdFiredRef.
        holdFiredRef.current = true;
        blockTapsUntilRef.current = Date.now() + 450;
        if (!reduced) {
          const key = Date.now();
          setHoldPop({ key, branchId });
          setTimeout(() => setHoldPop((p) => (p?.key === key ? null : p)), 750);
        }
        // The open sheet holds Pip by itself; arming as well would leave the
        // thread armed after the sheet closes, so the next plain tap would
        // spring the panel open with no hold at all.
        setArmedBranchId(null);
        setOperation({ kind: "quick-touch", branchId, dialOnly: true });
        // partial reset: scroll stays locked so the web pointerup listener
        // survives to see the release; cancelHold ends the swell.
        modeRef.current = "idle";
        candidateRef.current = null;
        cancelHold();
      }, HOLD_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and stable setters
    [],
  );

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
    const items: {
      id: string;
      label: string;
      done: boolean;
      color: string;
      /** The thread this row belongs to, so a fresh step can be spotted. */
      ownerId?: string;
    }[] = [];
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
        ownerId: owner?.id,
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

  // How much of today is answered: each Act / rest / integration nudges the
  // main line toward its full strength (an empty current is a whole one).
  // A planned step still ahead counts as answered — same as the Actions panel.
  const hasPendingStep = (b: PsychologicalBranch) =>
    actions.some((a) => !a.completedAt && a.branchesIntegrated[0]?.branchId === b.id);
  const calmProgress =
    activeLines.length === 0
      ? 1
      : activeLines.filter(
          (b) => decidedToday(b, now) || restingToday(b, now) || hasPendingStep(b),
        ).length / activeLines.length;

  // How scattered the day is, 0..1 — the same wholeness score as the chip.
  // The backdrop weather warms and settles as it rises.
  const wholeness = useMemo(() => energySplit(branches, now).mainShare, [branches, now]);

  // Each time progress rises (an answer landed, a thread integrated), one
  // shimmer streak sweeps the main line; crossing into completion also
  // blooms gold motes off it. A new thread lowering progress fires nothing.
  const [pulseKey, setPulseKey] = useState(0);
  const [bloom, setBloom] = useState({ key: 0, count: 0 });
  const [celebration, setCelebration] = useState(0);
  const prevProgressRef = useRef(calmProgress);
  useEffect(() => {
    const prev = prevProgressRef.current;
    prevProgressRef.current = calmProgress;
    if (calmProgress <= prev + 0.001) return;
    setPulseKey((k) => k + 1);
    // Every answer releases gold motes; finishing the day earns the full
    // themed spectacle — rings from Now, a flight of particles, the works.
    if (!reducedMotion) {
      const crossing = calmProgress >= 0.999 && prev < 0.999;
      setBloom((b) => ({ key: b.key + 1, count: crossing ? 12 : 4 }));
      if (crossing) setCelebration((k) => k + 1);
    }
  }, [calmProgress, reducedMotion]);
  useEffect(() => {
    if (celebration === 0) return;
    const id = setTimeout(() => setCelebration(0), 3200);
    return () => clearTimeout(id);
  }, [celebration]);
  useEffect(() => {
    if (bloom.count === 0) return;
    const id = setTimeout(() => setBloom((b) => ({ key: b.key, count: 0 })), 2600);
    return () => clearTimeout(id);
  }, [bloom]);
  // While sacred, a little golden dust keeps drifting off the line.
  useEffect(() => {
    if (calmProgress < 0.999 || reducedMotion) return;
    const id = setInterval(
      () => setBloom((b) => ({ key: b.key + 1, count: 2 })),
      6500,
    );
    return () => clearInterval(id);
  }, [calmProgress, reducedMotion]);

  // The thread the user is holding: the one an open panel concerns, or the
  // one armed for a bonk. While held, its line stays lit and Pip stays
  // planted at it — bonks land on it until the panel closes or another
  // interaction moves the focus.
  const heldBranchId = focusedBranchId ?? armedBranchId ?? null;

  // An armed thread whose line vanished (burned away, closed) releases its
  // hold; so does opening a panel about a different thread.
  useEffect(() => {
    if (!armedBranchId) return;
    const b = branches.find((x) => x.id === armedBranchId);
    if (!b || isClosed(b)) setArmedBranchId(null);
    else if (focusedBranchId && focusedBranchId !== armedBranchId) setArmedBranchId(null);
  }, [branches, armedBranchId, focusedBranchId]);

  // Mascot: visible always unless reduced motion (hides when no open branches).
  const showMascot = !reducedMotion;
  // The camera follows Pip: whenever he sets off for a lane outside the
  // visible band (a super bonk hop, a focus run, a patrol jump), the
  // vertical scroll pans along with his dash. Once per run, never per frame.
  const followPip = useCallback((_x: number, destY: number) => {
    const vh = scrollHRef.current;
    if (vh <= 0) return;
    const sy = scrollYRef.current;
    if (destY > sy + 70 && destY < sy + vh - 90) return;
    const maxScroll = Math.max(0, layoutRef.current.height + 84 - vh);
    const y = Math.max(0, Math.min(maxScroll, destY - vh / 2));
    scrollRef.current?.scrollTo({ y, animated: true });
  }, []);
  const mascot = useMascot(
    visible,
    layout.geometries,
    layout.nowX,
    (branchId) => setOperation({ kind: "quick-touch", branchId }),
    mascotTypePref,
    operation.kind === "idle",
    operation.kind === "viewing-integrated",
    language,
    heldBranchId,
    burn?.branchId ?? null,
    layout.mainY,
    followPip,
  );

  // Keep reaction ref current so effects below can call it
  mascotReactionRef.current = mascot.showReaction;
  const mascotRef = useRef(mascot);
  mascotRef.current = mascot;

  // ── Token drops: they pop off their threads, then fly into the meter ──
  // Each store coin becomes a waiting token (SVG, over its thread), then a
  // flight (screen overlay, into the bonk pill), then charge. Pip never
  // fetches — a super bonk can rain several at once while he sweeps.
  const [coinFlash, setCoinFlash] = useState(0);
  const [flights, setFlights] = useState<{ key: number; branchId: string; x0: number; y0: number }[]>([]);
  const [chargePops, setChargePops] = useState<number[]>([]);
  const scheduledCoinsRef = useRef(new Set<number>());
  const coinTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const lastCheerRef = useRef(0);
  const finishCoin = useCallback((key: number) => {
    coinTimersRef.current.delete(key);
    scheduledCoinsRef.current.delete(key);
    setFlights((f) => f.filter((x) => x.key !== key));
    useAppStore.getState().collectCoin(key);
    setCoinFlash((k) => k + 1);
    setChargePops((p) => [...p, key]);
    setTimeout(() => setChargePops((p) => p.filter((k) => k !== key)), 950);
    // Pip cheers a landing when he is free — a sweep never gets bubble spam.
    const now = Date.now();
    if (now - lastCheerRef.current > 3000 && mascotRef.current?.visible) {
      lastCheerRef.current = now;
      mascotRef.current.showReaction(randomFrom(mascotRef.current.phrases.coinGrab));
    }
  }, []);
  useEffect(() => {
    // While a sheet is up (the pill is hidden) tokens just flip in place —
    // the wait is the anticipation. Once idle, each schedules its flight.
    if (operation.kind !== "idle") return;
    for (const c of coins) {
      if (scheduledCoinsRef.current.has(c.key)) continue;
      scheduledCoinsRef.current.add(c.key);
      const hoverBeat = reducedMotion ? 900 : 800;
      coinTimersRef.current.set(
        c.key,
        setTimeout(() => {
          if (!useAppStore.getState().coins.some((x) => x.key === c.key)) return;
          const g = layoutRef.current.geometries.find((x) => x.branchId === c.branchId);
          if (reducedMotion || !g || !g.inWindow) {
            // no flight to draw — the reward still lands
            finishCoin(c.key);
            return;
          }
          setFlights((f) => [
            ...f,
            { key: c.key, branchId: c.branchId, x0: g.endX + COIN_LEAD, y0: g.endY - COIN_HOVER - scrollYRef.current },
          ]);
          coinTimersRef.current.set(c.key, setTimeout(() => finishCoin(c.key), COIN_FLY_MS));
        }, hoverBeat),
      );
    }
  }, [coins, operation.kind, reducedMotion, finishCoin]);
  // Never lose a token to an edge case: anything still uncollected after 12s
  // banks itself.
  useEffect(() => {
    if (coins.length === 0) return;
    const id = setTimeout(() => {
      const stale = Date.now() - 12000;
      for (const c of useAppStore.getState().coins) {
        if (c.key / 100 < stale) finishCoin(c.key);
      }
    }, 12500);
    return () => clearTimeout(id);
  }, [coins, finishCoin]);
  useEffect(() => {
    const timers = coinTimersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);
  // The meter's little gulp: the pill fill glows for a beat after a token.
  useEffect(() => {
    if (coinFlash === 0) return;
    const id = setTimeout(() => setCoinFlash(0), 700);
    return () => clearTimeout(id);
  }, [coinFlash]);

  // Running Pip to the held thread (op focus, armed bonk, or the draft being
  // created) now lives inside useMascot's hold — no per-source effects here.

  // Fire mascot reaction on merge (reclaim event). An answered event on the
  // same thread speaks for itself below — placing a step frees feelings too,
  // and two reactions at once would talk over each other.
  const reclaimKey = reclaim?.key;
  useEffect(() => {
    if (!reclaimKey || !showMascot) return;
    if (answered && answered.branchId === reclaim?.branchId) return;
    const pool = (reclaim?.feelings?.length ?? 0) >= 3 ? mascot.phrases.mergeDeep : mascot.phrases.merge;
    setTimeout(() => mascotReactionRef.current?.(randomFrom(pool)), 600);
  }, [reclaimKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire mascot reaction on new branch (born event)
  const bornKey = born?.key;
  useEffect(() => {
    if (!bornKey || !showMascot) return;
    setTimeout(() => mascotReactionRef.current?.(randomFrom(mascot.phrases.born)), 800);
  }, [bornKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A thread just committed from the create flow: Pip walks over and stands
  // at it, so one tap on him opens its decisions. (After the tray closed,
  // nothing else re-sends him — the id survived from the draft.)
  const addedKey = added?.key;
  useEffect(() => {
    if (!addedKey || !added || !showMascot || !mascot.visible) return;
    mascot.focusBranch(added.branchId);
  }, [addedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A step or a note just landed on its own stage. This map was unmounted
  // while that stage was up, so the reaction cannot be read from an operation
  // change — the store held it here until now. Pip walks to the thread and
  // says it, then the event is spent.
  const answeredKey = answered?.key;
  // Which thread just had a step placed — the row for it arrives visibly. Held
  // locally because the event itself is spent as soon as it is read.
  const [arrivedFor, setArrivedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!answeredKey || !answered) return;
    const { branchId, kind } = answered;
    clearAnswered();
    if (kind === "act") {
      setArrivedFor(branchId);
      setTimeout(() => setArrivedFor(null), 1400);
    }
    if (!showMascot || !mascot.visible) return;
    mascot.focusBranch(branchId);
    const pool = kind === "act" ? mascot.phrases.action : mascot.phrases.note;
    setTimeout(() => mascotReactionRef.current?.(randomFrom(pool)), 500);
  }, [answeredKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the user selects a merged thread from the integrated list, pan the
  // timeline so its merge date is centred in an 8-day window.
  // Use a primitive derived value as dependency so setWindow doesn't re-trigger.
  const viewingIntegratedId =
    operation.kind === "viewing-integrated" ? (operation.branchId ?? null) : null;
  useEffect(() => {
    if (!viewingIntegratedId) return;
    const branch = allBranches.find((b) => b.id === viewingIntegratedId);
    const mergeDate = branch?.mergeDate;
    if (!mergeDate) return;
    setWindow({ start: addDays(mergeDate, -4), end: addDays(mergeDate, 4) });
  }, [viewingIntegratedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The slow current on the main line, and the merge preview's leaning dashes.
  // The main line's strokes: it gathers strength as the day gets answered.
  // Every fork dot, merge dot and branch end rides the same wave (see
  // BranchLine), so nothing sits flat against a moving line.
  const wavePeriodMs = tk.mainFlowDuration * 1.4;
  // One world clock: the wave, weather and scenery all share a single
  // continuous animation instead of three identical ramps.
  const worldClock = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(worldClock);
      worldClock.value = 0;
      return;
    }
    worldClock.value = 0;
    worldClock.value = withRepeat(
      withTiming(3600, { duration: 3600_000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(worldClock);
  }, [reducedMotion, worldClock]);

  const calmCurrent = useCalmCurrent({
    progress: calmProgress,
    pulseKey,
    worldClock,
    mainY: layout.mainY,
    nowX: layout.nowX,
    periodMs: wavePeriodMs,
    dashDurationMs: tk.mainFlowDuration,
    reducedMotion,
    accentColor: tk.accent,
    shimmerColor: tk.shimmer,
    lineColor: tk.lineMain,
    sacredLineColor: mix(tk.shimmer, tk.lineMain, 70),
  });

  const mergeFlowProps = useDashFlow(
    operation.kind === "confirming-merge" && !reducedMotion,
    0,
    -26,
    1100,
  );

  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: chipX.value }, { translateY: chipY.value }],
  }));

  // +84: breathing room below the lanes, so the lowest one can be pulled up
  // clear of the pinned date strip and the bonk bar. Inside the canvas (not a
  // spacer view) so the day dividers run through it.
  const svgHeight = layout.height + Math.round(bottomInset) + 84;
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
        {/* the theme's ambient weather, behind the transparent canvas: it
            warms, brightens and settles as the day gathers itself */}
        <View
          pointerEvents="none"
          testID="backdrop"
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        >
          <ThemeScenery
            theme={theme}
            width={size.width}
            height={size.height}
            mood={wholeness}
            shimmer={tk.shimmer}
            accent={tk.accent}
            inkFaint={tk.inkFaint}
            bg={tk.bg}
            danger={tk.danger}
            reducedMotion={reducedMotion}
            worldClock={worldClock}
          />
          <ThemeBackdrop
            theme={theme}
            width={size.width}
            height={size.height}
            mood={wholeness}
            shimmer={tk.shimmer}
            accent={tk.accent}
            inkFaint={tk.inkFaint}
            reducedMotion={reducedMotion}
            worldClock={worldClock}
          />
        </View>

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
              // a candidate that never picked an axis stays a tap — unless a
              // fired hold already consumed this touch
              if (modeRef.current === "idle") endGesture();
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
                  height={svgHeight}
                  fill={tk.accent}
                  opacity={0.05}
                />
              )}

              {/* axis gridlines — full canvas height, including the scroll
                  headroom; their date labels live on the pinned strip at the
                  stage bottom, so they never scroll out of view */}
              {ticks.map((tick) => {
                const x = dateToX(tick.date, layout.window, layout.metrics.width);
                return (
                  <Line key={tick.date} x1={x} y1={0} x2={x} y2={svgHeight} stroke={tk.lineAxis} />
                );
              })}

              {/* main life line, with a slow current flowing toward Now.
                  As the day's threads get their answers it gathers strength —
                  wave rising, stroke thickening — until it breathes as one
                  calm, sacred current under a soft shimmer halo. Each answer
                  sends a shimmer streak sweeping down the line. */}
              <AnimatedPath
                animatedProps={calmCurrent.haloOuter}
                d={`M 0 ${layout.mainY} L ${layout.nowX} ${layout.mainY}`}
                stroke={tk.shimmer}
                strokeWidth={18}
                strokeLinecap="round"
                fill="none"
                opacity={0}
              />
              <AnimatedPath
                animatedProps={calmCurrent.halo}
                d={`M 0 ${layout.mainY} L ${layout.nowX} ${layout.mainY}`}
                stroke={tk.shimmer}
                strokeWidth={9}
                strokeLinecap="round"
                fill="none"
                opacity={0}
              />
              <AnimatedPath
                animatedProps={calmCurrent.line}
                d={`M 0 ${layout.mainY} L ${layout.nowX} ${layout.mainY}`}
                stroke={tk.lineMain}
                strokeWidth={3.25}
                fill="none"
              />
              <AnimatedPath
                animatedProps={calmCurrent.flow}
                d={`M 0 ${layout.mainY} L ${layout.nowX} ${layout.mainY}`}
                stroke={tk.accent}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={tk.mainFlowDash}
                opacity={0.7}
              />
              {/* the per-answer flourish: wide soft glow + bright core */}
              <AnimatedPath
                animatedProps={calmCurrent.shimmerWide}
                d={`M 0 ${layout.mainY} L ${layout.nowX} ${layout.mainY}`}
                stroke={alpha(tk.shimmer, 0.45)}
                strokeWidth={11}
                strokeLinecap="round"
                fill="none"
                opacity={0}
              />
              <AnimatedPath
                animatedProps={calmCurrent.shimmer}
                d={`M 0 ${layout.mainY} L ${layout.nowX} ${layout.mainY}`}
                stroke={tk.shimmer}
                strokeWidth={3.5}
                strokeLinecap="round"
                fill="none"
                opacity={0}
              />
              <Path
                d={`M ${layout.nowX - 12} ${layout.mainY - 6} L ${layout.nowX} ${layout.mainY} L ${layout.nowX - 12} ${layout.mainY + 6}`}
                stroke={tk.lineMain}
                strokeWidth={3.25 + calmProgress}
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
                    height={svgHeight}
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
                      <DayRow
                        key={it.id}
                        arriving={!!it.ownerId && it.ownerId === arrivedFor && !it.done}
                        reducedMotion={reducedMotion}
                      >
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
                      </DayRow>
                    );
                  })}
                </G>
              )}

              {/* branch lines */}
              {layout.geometries.map((g) => {
                const branch = byId.get(g.branchId);
                if (!branch) return null;
                // Pending = about to jump there (highlight before moving).
                // Inspected = currently sitting on it.
                const mascotActive = showMascot && mascot.visible && mascot.pos.x > -900 &&
                  operation.kind !== "viewing-integrated";
                const mascotFocusId = mascot.pendingBranchId ?? mascot.inspectedBranchId;
                // User-focused thread always stays at full opacity regardless of mascot position
                const isUserFocused =
                  branch.id === focusedBranchId || branch.id === armedBranchId;
                const lineOpacity = isUserFocused
                  ? 1
                  : mascotActive && mascotFocusId !== null && branch.id !== mascotFocusId
                    ? 0.38
                    : 1;
                const mascotHighlight = mascotActive && branch.id === mascot.pendingBranchId;
                return (
                  <G key={g.branchId} opacity={lineOpacity}>
                  <BranchLine
                    burning={burn?.branchId === g.branchId && !reducedMotion}
                    key={undefined}
                    branch={branch}
                    geometry={g}
                    theme={theme}
                    nowMs={nowTick}
                    wave={calmCurrent.wave}
                    waveNowX={layout.nowX}
                    wavePeriodMs={wavePeriodMs}
                    loudnessPreview={
                      preview?.branchId === branch.id ? preview.level : undefined
                    }
                    // A decision today settles the loudness too: the dial
                    // rests with the line until tomorrow (or until it reopens).
                    dialEnabled={!isClosed(branch) && !decidedToday(branch, now)}
                    onDialTouchStart={dialTouchStart}
                    holding={holdBranchId === branch.id}
                    holdP={holdP}
                    focused={false}
                    emphasizedId={top?.id}
                    highlighted={isUserFocused || mascotHighlight}
                    dimmed={!!focusedBranchId && branch.id !== focusedBranchId}
                    // Draws itself in: newly created, or just folded home.
                    born={
                      !reducedMotion &&
                      (born?.branchId === branch.id || integrated?.branchId === branch.id)
                    }
                    reducedMotion={reducedMotion}
                    onSelect={selectBranch}
                    onSelectMoment={selectBranchMoment}
                    onSelectMergePoint={selectMergePoint}
                  />
                  </G>
                );
              })}

              {/* fire consuming a burned thread */}
              {burn &&
                !reducedMotion &&
                (() => {
                  const g = layout.geometries.find((x) => x.branchId === burn.branchId);
                  if (!g || !g.inWindow) return null;
                  return <BurnAway key={burn.key} path={g.path} />;
                })()}

              {/* the impact of Pip's strike */}
              {hit &&
                !reducedMotion &&
                (() => {
                  const g = layout.geometries.find((x) => x.branchId === hit.branchId);
                  if (!g || !g.inWindow) return null;
                  return (
                    <AttackFx
                      key={hit.key}
                      x={g.endX}
                      y={g.endY}
                      path={g.path}
                      variant={attackVariantFor(theme)}
                      accent={tk.accent}
                      calm={hit.calm}
                    />
                  );
                })()}

              {/* the pop at the end of a press-and-hold: the dial's arrival */}
              {holdPop &&
                (() => {
                  const g = layout.geometries.find((x) => x.branchId === holdPop.branchId);
                  if (!g || !g.inWindow) return null;
                  return <PopBurst key={holdPop.key} x={g.endX - 3} y={g.endY} color={tk.accent} />;
                })()}

              {/* dropped tokens, flipping over their threads until they fly */}
              {coins.map((c) => {
                if (flights.some((f) => f.key === c.key)) return null;
                const g = layout.geometries.find((x) => x.branchId === c.branchId);
                if (!g || !g.inWindow) return null;
                const cx = g.endX + COIN_LEAD;
                const fade = Math.max(
                  0,
                  Math.min(1, (layout.metrics.width - 40 - cx) / 45, (cx + 20) / 45),
                );
                if (fade <= 0) return null;
                return (
                  <CoinToken
                    key={c.key}
                    x={cx}
                    y={g.endY}
                    gold={tk.shimmer}
                    accent={tk.accent}
                    theme={theme}
                    fade={fade}
                    reducedMotion={reducedMotion}
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
                onPress={guarded(() =>
                  operation.kind === "viewing-integrated"
                    ? returnToNow()
                    : setOperation({ kind: "viewing-integrated" })
                )}
                accessible
                accessibilityLabel={t("Now. Select to see integrated threads.")}
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

              {/* Mascot: 8-bit hero that jumps between branches and nudges the user */}
              {showMascot && mascot.visible && mascot.pos.x > -900 &&
               operation.kind !== "viewing-integrated" && (
                <LungeG
                  active={Boolean(hit && !hit.calm && !reducedMotion)}
                  dx={(() => {
                    if (!hit) return 0;
                    const g = layout.geometries.find((x) => x.branchId === hit.branchId);
                    return g ? Math.max(-70, Math.min(70, g.endX - mascot.pos.x)) * 0.85 : 0;
                  })()}
                  dy={(() => {
                    if (!hit) return 0;
                    const g = layout.geometries.find((x) => x.branchId === hit.branchId);
                    return g ? Math.max(-44, Math.min(44, g.endY - mascot.pos.y)) * 0.85 : 0;
                  })()}
                >
                <Mascot
                  posX={mascot.posX}
                  posY={mascot.posY}
                  viewW={layout.metrics.width}
                  runPhase={mascot.runPhase}
                  frame={hit && !hit.calm ? "LAND_A" : mascot.frame}
                  flip={mascot.flip}
                  mascotType={mascot.mascotType}
                  bubbleO={mascot.bubbleO}
                  bubbleText={mascot.bubbleText}
                  showTapHint={mascot.frame === 'IDLE_A' || mascot.frame === 'IDLE_B'}
                  theme={tk}
                  onPress={mascot.onPress}
                />
                </LungeG>
              )}

              {/* Once Pip is standing at a thread — never while he travels —
                  his two offers spring out of his side as little speech
                  pills: reflect (the full decision sheet) or the loudness
                  dial. They start under his head, so his real speech bubble
                  (which lives above him) never collides with them. */}
              {showMascot && mascot.visible && operation.kind === "idle" &&
                (() => {
                  const optId = mascot.arrivedBranchId;
                  if (!optId) return null;
                  // Offers only when Pip walked here on his own patrol — a
                  // thread the user opened themselves needs no suggestion.
                  if (mascot.arrivedVia !== "patrol") return null;
                  const b = branches.find((x) => x.id === optId);
                  if (!b || isClosed(b)) return null;
                  // Patrol only ever lands where an answer is still open.
                  if (decidedToday(b, now) || restingToday(b, now)) return null;
                  const spriteW = PX * 12;
                  const spriteH = PX * 16;
                  // Pip fades out at the canvas edges (viewing the past);
                  // his offers must never linger there half-clipped either.
                  if (
                    mascot.pos.x > layout.metrics.width - 70 ||
                    mascot.pos.x < -10
                  ) {
                    return null;
                  }
                  // To his right; near the right edge it comes out his left —
                  // but only while he's actually on screen. Once he scrolls
                  // out of view, the bubble scrolls out with him (it belongs
                  // to him, never pinned to the viewport).
                  const optionLabels = { reflect: t("Reflect"), dial: t("How loud?") };
                  const bubbleW = pillRowW([optionLabels.reflect, optionLabels.dial], tk.fontBody) + BUBBLE_PAD * 2;
                  const wouldOverflowRight =
                    mascot.pos.x + spriteW + 14 + bubbleW + 10 > layout.metrics.width;
                  const pipOnScreen =
                    mascot.pos.x > -spriteW && mascot.pos.x < layout.metrics.width - spriteW / 2;
                  const dir: 1 | -1 = wouldOverflowRight && pipOnScreen ? -1 : 1;
                  const originX = dir === 1 ? mascot.pos.x + spriteW + 5 : mascot.pos.x - 5;
                  // On his right the bubble's top row sits at his shoulder
                  // line — under his head, clear of the speech bubble above.
                  // On his LEFT it tucks just under the thread's line — the
                  // title stays readable, but the bubble never strays far.
                  const desired =
                    dir === 1
                      ? mascot.pos.y + spriteH * 0.55
                      : mascot.pos.y + PX * 10 + 4 + BUBBLE_PAD + ROW_H / 2;
                  const maxCy =
                    layout.height - 26 - (ROW_H * 1.5 + ROW_GAP + BUBBLE_PAD);
                  const cy = Math.max(20, Math.min(desired, maxCy));
                  // The tail aims back at Pip's middle (capped to stay a beak).
                  const pipMidY = mascot.pos.y + spriteH / 2;
                  const tailDy = Math.max(-12, Math.min(12, pipMidY - cy));
                  const open = (dialOnly: boolean) => {
                    setArmedBranchId(null);
                    setOperation(
                      dialOnly
                        ? { kind: "quick-touch", branchId: optId, dialOnly: true }
                        : { kind: "quick-touch", branchId: optId, expanded: true },
                    );
                  };
                  return (
                    <MascotOptionsBubble
                      key={optId}
                      originX={originX}
                      cy={cy}
                      dir={dir}
                      tailDy={tailDy}
                      labels={optionLabels}
                      onReflect={() => open(false)}
                      onDial={() => open(true)}
                      tk={tk}
                      reducedMotion={reducedMotion}
                    />
                  );
                })()}
            </Svg>
          </View>
        </ScrollView>

        {/* tokens in flight to the meter, and the +10s that pop off it */}
        {(flights.length > 0 || chargePops.length > 0) && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              overflow: "hidden",
              zIndex: 11,
            }}
          >
            {flights.map((f) => (
              <TokenFly
                key={f.key}
                x0={f.x0}
                y0={f.y0}
                x1={size.width - (showFab ? 92 : 8) - 44}
                y1={size.height - 26}
                gold={tk.shimmer}
                theme={theme}
              />
            ))}
            {chargePops.map((k, i) => (
              <ChargePop
                key={k}
                right={(showFab ? 92 : 8) + 12 + (i % 3) * 16}
                bottom={44}
                label="+10"
                color={mix(tk.shimmer, "#000000", 22)}
              />
            ))}
          </View>
        )}

        {/* reaching the sacred state: the themed completion spectacle */}
        {celebration > 0 && (
          <View
            key={`celebration-${celebration}`}
            pointerEvents="none"
            testID="celebration"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              overflow: "hidden",
              zIndex: 7,
            }}
          >
            <CelebrationBurst
              theme={theme}
              nowX={layout.nowX}
              mainY={layout.mainY}
              shimmer={tk.shimmer}
              accent={tk.accent}
              danger={tk.danger}
            />
          </View>
        )}

        {/* every answer releases gold motes off the line; completion bursts */}
        {bloom.count > 0 && (
          <View
            key={bloom.key}
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
            {Array.from({ length: bloom.count }, (_, i) => (
              <SmokeFly
                key={i}
                index={i}
                x0={layout.nowX * (0.1 + (0.8 * i) / Math.max(1, bloom.count - 1))}
                y0={layout.mainY - 3}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: tk.shimmer,
                  }}
                />
              </SmokeFly>
            ))}
          </View>
        )}

        {/* the dates, pinned: lanes scroll behind them, they never move */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 22,
            zIndex: 5,
            backgroundColor: alpha(tk.bg, 0.88),
          }}
        >
          {ticks.map((tick) => {
            const x = dateToX(tick.date, layout.window, layout.metrics.width);
            if (x < -40 || x > size.width + 8) return null;
            return (
              <T
                key={tick.date}
                style={{
                  position: "absolute",
                  left: x + 4,
                  bottom: 4,
                  fontSize: 11,
                  lineHeight: 13,
                  fontWeight: tick.major ? "600" : "400",
                  color: tick.major ? tk.inkSoft : tk.inkFaint,
                }}
              >
                {tick.label === "Today" ? t("Today") : tick.label}
              </T>
            );
          })}
        </View>

        {/* One round +, unmistakable and wordless, floating on the water. */}
        {showFab && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("New thread")}
          onPress={() =>
            canOpenThread ? setOperation({ kind: "creating-branch" }) : setPaywalled(true)
          }
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

        <PaywallPrompt
          reason={paywalled ? "thread-limit" : null}
          onClose={() => setPaywalled(false)}
        />

        <TimelineHelp />

        {/* First tap on a thread sends Pip over and arms this bar: Bonk fires
            instantly (and again, and again). Reflect and the dial live under
            Pip himself. It rests on the date strip — the one band no thread
            can enter. */}
        {(() => {
          // Bonk always has a target: the thread you armed, or wherever Pip
          // is right now on his own patrol.
          const focusId =
            armedBranchId ?? mascot.pendingBranchId ?? mascot.inspectedBranchId ?? undefined;
          const target = focusId ? branches.find((b) => b.id === focusId) : undefined;
          const usable = target && !isClosed(target);
          if (operation.kind !== "idle") return null;
          const cooling = Date.now() < attackCooldownUntil || !usable;
          const VERBS: Partial<Record<typeof theme, string>> = {
            demonfire: "Douse!",
            koipond: "Splash!",
            carnival: "Whoosh!",
            catnap: "Boop!",
            abyss: "Dim it!",
            gravemist: "Shoo!",
            pompom: "Ruffle!",
          };
          const verb = VERBS[theme] ?? "Bonk!";
          // Dealing with threads charges the meter; full = SUPER BONK.
          const openTargets = activeLines
            .map((b) => ({ b, g: layout.geometries.find((x) => x.branchId === b.id) }))
            .filter((x) => x.g && x.g.inWindow)
            .sort((a, bx) => (a.g!.endY ?? 0) - (bx.g!.endY ?? 0));
          const superReady = bonkCharge >= 100 && openTargets.length > 0;
          const fireSuperBonk = () => {
            if (!superReady) return;
            consumeSuperBonk();
            const ids = openTargets.map((x) => x.b.id);
            if (reducedMotion) {
              // No run — the bonks land one after another on their own.
              ids.forEach((id, i) => setTimeout(() => void attackBranch(id), i * 160));
              return;
            }
            mascot.superBonk(ids, (id) => void attackBranch(id));
          };
          return (
            <View
              style={{
                // Rests on the date strip (the one band threads never enter),
                // on the right — stopping short of the + button's corner.
                // Above the pinned strip (zIndex 5): the buttons stay tappable.
                position: "absolute",
                right: showFab ? 92 : 8,
                bottom: 0,
                zIndex: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: alpha(tk.bgRaised, 0.97),
                borderTopWidth: 1,
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderColor: alpha(tk.lineAxis, 0.9),
                borderTopLeftRadius: tk.radiusLg,
                borderTopRightRadius: tk.radiusLg,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  superReady
                    ? t("Super bonk: Pip calms every thread")
                    : t("Have Pip calm this thread")
                }
                disabled={superReady ? false : cooling}
                onPress={() => {
                  if (superReady) {
                    fireSuperBonk();
                    return;
                  }
                  if (!target) return;
                  setAttackCooldownUntil(Date.now() + 500);
                  void attackBranch(target.id);
                }}
                style={{
                  backgroundColor: superReady
                    ? tk.shimmer
                    : cooling
                      ? alpha(tk.accent, 0.5)
                      : tk.accent,
                  borderRadius: 999,
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  overflow: "hidden",
                }}
              >
                {/* the meter: charge creeps across the pill toward SUPER BONK */}
                {!superReady && bonkCharge > 0 && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${Math.min(100, bonkCharge)}%`,
                      // a fresh token makes the fill gulp visibly brighter
                      backgroundColor: alpha(tk.shimmer, coinFlash > 0 ? 0.9 : 0.45),
                    }}
                  />
                )}
                <T
                  style={{
                    color: superReady ? "#3a2c10" : tk.accentInk,
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  {superReady ? t("SUPER BONK!") : t(verb)}
                </T>
              </Pressable>
            </View>
          );
        })()}
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
            <T style={{ fontSize: 11, color: tk.inkSoft }}>
              {t(loudnessWord(preview.level))}
            </T>
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

        {/* burned words rising as smoke */}
        {burn &&
          !reducedMotion &&
          (() => {
            const g = layout.geometries.find((x) => x.branchId === burn.branchId);
            if (!g) return null;
            const x0 = Math.min(g.labelX, layout.metrics.width - 80);
            const y0 = g.labelY;
            return (
              <View
                key={burn.key}
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
                {burn.items.map((item, i) => (
                  <SmokeFly key={item} index={i} x0={x0} y0={y0}>
                    <View style={{ opacity: 0.75 }}>
                      <Tag label={item} />
                    </View>
                  </SmokeFly>
                ))}
                {/* the thread's own name leaves last */}
                {(() => {
                  const title = branches.find((b) => b.id === burn.branchId)?.title;
                  return title ? (
                    <SmokeFly key="title" index={burn.items.length + 1} x0={x0} y0={y0}>
                      <View style={{ opacity: 0.6 }}>
                        <Tag label={title} />
                      </View>
                    </SmokeFly>
                  ) : null;
                })()}
                {/* the one thing that survives flies home to Now */}
                {lessonFlying && (
                  <ReclaimFly
                    key="lesson"
                    index={0}
                    x0={x0}
                    y0={y0}
                    dx={layout.nowX - 24 - x0}
                    dy={layout.mainY - y0}
                  >
                    <Tag label={burn.lesson} quality />
                  </ReclaimFly>
                )}
              </View>
            );
          })()}

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
