import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
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
  useDerivedValue,
  useFrameCallback,
  type SharedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { filterBranches, useAppStore, operationDepth } from "@/stores/app-store";
import { useLayoutStore } from "@/stores/layout-store";
import { measureNode } from "@/ui/measure";
import { setWalkthroughPoint, useWalkthroughTarget } from "@/features/tutorial/targets";
import { buildTimelineLayout } from "@/visualization/main-line/layout";
import { buildSummitLayout, dateToScreenY, daySeedOrder, ringOffset, SUMMIT_RAIL_W, type SummitLayout } from "@/visualization/vertical/transpose";
import { themeOrientation } from "@/visualization/theme";
import { generateTicks, dateToX, addDays } from "@/visualization/zoom/time-scale";
import { describeTimeline } from "@/visualization/a11y/describe";
import { effectiveLoudness, isClosed, mostActivated } from "@/domain/branches/logic";
import { decidedToday, energySplit, handledToday } from "@/domain/feelings/logic";
import type { PsychologicalBranch, Loudness } from "@/domain/branches/types";
import { BranchLine, lineTrembles, phaseFromId } from "./BranchLine";
import { PaywallPrompt, useThreadGate } from "@/features/paywall/PaywallPrompt";
import { TimelineHelp } from "@/features/timeline-help/TimelineHelp";
import { WholenessIndicator } from "./WholenessIndicator";
import { branchColor, restingToday } from "@/visualization/branch-lines/style";
import { mergePreviewPath } from "@/visualization/branch-lines/paths";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/ui/theme";
import { alpha, mix } from "@/ui/color";
import { Button, Hint, Prompt, shadow, T, Tag } from "@/ui/primitives";
import { AnimatedPath, AttackFx, attackVariantFor, BurnAway, CelebrationBurst, ChargePop, CoinToken, COIN_FLY_MS, COIN_HOVER, COIN_LEAD, LungeG, MergePreviewTarget, NowGlow, PopBurst, ReclaimFly, SmokeFly, ThemeBackdrop, ThemeScenery, TokenFly, useDashFlow } from "./timeline-fx";
import { Mascot, estTextWidth } from "./Mascot";
import { PX } from "./mascot-frames";
import { useMascot, randomFrom } from "./useMascot";
import { useCalmCurrent, type GripRide, type SwayRide } from "./useSquiggle";
import { useSummitCurrent } from "./useSummit";
import { DistantCliffs, FaceTexture, Ledge, MountainFace, RopeCut, SkyParallax, SummitRoute } from "./SummitScene";

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
        {/* row 1: Reflect — its own rounded pill inside the card. Plain G on
            purpose: a11y roles turn SVG groups into invisible HTML buttons. */}
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


/** The rope prompts: one pops on each rope as it takes focus — tapping it
 * opens the full reflect panel. Random per rope per day. */
/**
 * One rope's place on the turning mountain. The ropes hang AROUND the rock, so
 * a rope's x is `sin(angle + turn) · radius` from the route and it fades as it
 * goes round the back — which is what lets a busy day hold its threads without
 * squashing them together. Horizontal maps pass `rot: null` and get a plain
 * group with no per-frame work at all.
 */
function RingG({
  opacity,
  rot,
  angle,
  radius,
  children,
}: {
  opacity: number;
  rot: SharedValue<number> | null;
  angle: number;
  radius: number;
  children: React.ReactNode;
}) {
  const props = useAnimatedProps(() => {
    if (!rot) return { translateX: 0, opacity };
    const facing = Math.cos(angle + rot.value);
    // behind the mountain: gone, and not in the way of a tap
    const seen = facing <= -0.12 ? 0 : Math.min(1, (facing + 0.12) / 0.45);
    const live = ringOffset(angle, rot.value, radius);
    const rest = ringOffset(angle, 0, radius);
    return {
      translateX: Math.round((live - rest) * 2) / 2,
      opacity: opacity * seen,
    };
  }, [rot, angle, radius, opacity]);
  if (!rot) return <G opacity={opacity}>{children}</G>;
  return <AnimatedOptionG animatedProps={props}>{children}</AnimatedOptionG>;
}

/** Where the day's record starts below Now: clear of the five rows of rope
 * names that live between Now and it (see LADDER_* in transpose.ts). */
const SUMMIT_RECORD_TOP = 140;

const GRAB_PROMPTS = [
  "Grab on!",
  "Take hold!",
  "This one's swaying — grab on.",
  "Ready? Grab the rope.",
] as const;

function promptHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * The little call-out that pops on a focused rope. Springs out like Pip's
 * old offer pills did; tapping it opens the reflect panel. Plain G on
 * purpose — a11y roles on SVG groups render invisible HTML buttons on web.
 */
function GrabPrompt({
  x,
  y,
  text,
  onPress,
  tk,
  reducedMotion,
}: {
  x: number;
  y: number;
  text: string;
  onPress: () => void;
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
    p.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.back(1.7)) });
    return () => cancelAnimation(p);
  }, [p, reducedMotion, text]);
  const animatedProps = useAnimatedProps(() => ({
    opacity: Math.min(1, Math.max(0, p.value * 1.4)),
    scale: 0.5 + 0.5 * p.value,
  }));
  const w = Math.max(64, Math.ceil(estTextWidth(text, tk.fontBody, 11.5)) + 24);
  const h = 26;
  return (
    <G x={x} y={y}>
      <AnimatedOptionG animatedProps={animatedProps}>
        <G onPress={onPress}>
          <Rect x={-w / 2 - 6} y={-h / 2 - 6} width={w + 12} height={h + 18} fill="transparent" />
          <Rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            rx={h / 2}
            fill={tk.accent}
            stroke={alpha(tk.accentInk, 0.4)}
            strokeWidth={1}
          />
          {/* the tail points down at the rope's grab zone */}
          <Path d={`M -5 ${h / 2 - 1} L 0 ${h / 2 + 7} L 5 ${h / 2 - 1} Z`} fill={tk.accent} />
          <SvgText
            x={0}
            y={4}
            textAnchor="middle"
            fontSize={11.5}
            fontWeight="700"
            fontFamily={tk.fontBody}
            fill={tk.accentInk}
          >
            {text}
          </SvgText>
        </G>
      </AnimatedOptionG>
    </G>
  );
}

/** Movement below this is still a tap; beyond it the gesture picks an axis. */
const DECIDE_PX = 8;

/**
 * Summit: how far up the rope one step of quiet carries him, and how many
 * steps he can climb before he is level with the rope's own name band. His
 * height on a rope is how much of it he has quieted since taking hold.
 */
const SHIN_PX = 26;
const SHIN_STEPS = 4;

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


/**
 * What the mountain last had on screen, kept outside the component because
 * Act, Note and Merge are "stage" flows (operationDepth): they take a screen
 * of their own and the map UNMOUNTS behind them. Without this, coming back
 * re-initialised every climb ref to the answered state, so the ascent was
 * never "earned" — you returned to a mountain that had already moved, which
 * is the snap you see instead of a climb. Deliberately module-level and not
 * persisted: a fresh load should open settled, never replay yesterday.
 */
let shownClimb: { sig: string; dist: number } | null = null;
/** The rope he had hold of when the map went away, so he climbs from it. */
let lastGripRope: string | null = null;

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
  const coins = useAppStore((s) => s.coins);
  const actions = useAppStore((s) => s.actions);
  const language = useAppStore((s) => s.language);
  const t = useT();
  const tk = useTheme();

  // Summit turns the whole map on end: time flows up, ropes hang, gestures
  // swap axes. The PanResponder is memoized once, so it reads this via a ref.
  const vertical = themeOrientation(theme) === "vertical";
  const verticalRef = useRef(vertical);
  verticalRef.current = vertical;

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

  /**
   * The store holds ONE hit at a time, but a full send lands one every couple
   * of hundred ms while each impact plays for over a second — so each is
   * queued here and expires on its own. Without this the sweep would cut every
   * puff off at a fifth of its life and you would never see the chalk fly.
   * The thrower's position is captured with the puff: he has moved on by the
   * time the dust settles.
   */
  const [puffs, setPuffs] = useState<
    { key: number; branchId: string; calm: boolean; fromX: number; fromY: number }[]
  >([]);
  useEffect(() => {
    if (!hit || reducedMotion) return;
    // His LIVE position, not the coarse React one: mid-sweep he lands and
    // throws between renders, and the chalk has to leave the hand he has now.
    const m = mascotRef.current;
    const p = {
      key: hit.key,
      branchId: hit.branchId,
      calm: hit.calm,
      fromX: m ? m.posX.value : 0,
      fromY: m ? m.posY.value : 0,
    };
    setPuffs((q) => (q.some((x) => x.key === p.key) ? q : [...q, p]));
    const id = setTimeout(() => setPuffs((q) => q.filter((x) => x.key !== p.key)), 1250);
    return () => clearTimeout(id);
  }, [hit, reducedMotion]);

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
  /** Summit scrolls sideways: the lane columns overflow the stage width. */
  const scrollXRef = useRef(0);
  const [scrollH, setScrollH] = useState(0);
  const scrollHRef = useRef(0);
  scrollHRef.current = scrollH;
  // First guess from the window, not a fixed placeholder: the summit derives
  // its whole ladder from the stage height, and a wrong first guess would move
  // the mountain once the real measurement lands.
  const win = Dimensions.get("window");
  const [size, setSize] = useState({
    width: Math.max(320, win.width),
    height: Math.max(320, win.height - 128),
  });
  /** The summit derives its whole ladder — and so the mountain's resting
   * position — from the stage height, so its first paint waits for the real
   * measurement instead of showing a guess and then correcting it. */
  const [measured, setMeasured] = useState(false);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // Walkthrough anchors: the controls register themselves; the first thread's
  // tip is published as a point in window coordinates (it lives in SVG space).
  const tutorialStep = useAppStore((s) => s.tutorialStep);
  const tutorialBranchId = useAppStore((s) => s.tutorialBranchId);
  const fabTarget = useWalkthroughTarget("new-thread");
  const bonkTarget = useWalkthroughTarget("bonk");

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
  const { width: winW, height: winH } = useWindowDimensions();
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

  // How split the present is: open lines pull apart, decisions gather them.
  const activeLines = visible.filter((b) => !isClosed(b));

  // How much of today is answered: each Act / rest / integration nudges the
  // main line toward its full strength (an empty current is a whole one).
  // A planned step still ahead counts as answered — same as the Actions panel.
  // NOTE the one accepted divergence from the summit climb: a pending step
  // raises calmProgress (sacred current, celebration) but does NOT coil the
  // rope or earn a ledge — the climb counts handledToday only.
  const hasPendingStep = (b: PsychologicalBranch) =>
    actions.some((a) => !a.completedAt && a.branchesIntegrated[0]?.branchId === b.id);
  const calmProgress =
    activeLines.length === 0
      ? 1
      : activeLines.filter((b) => handledToday(b, now) || hasPendingStep(b)).length /
        activeLines.length;

  // The day's climb order: ropes already handled at boot take a day-seeded
  // order inside the layout builder; each rope handled DURING the session
  // appends — so a fresh climb always earns the next rung UP the ladder.
  const handledSig = vertical
    ? activeLines
        .filter((b) => handledToday(b, now))
        .map((b) => b.id)
        .sort()
        .join("|")
    : "";
  const handledCount = handledSig ? handledSig.split("|").length : 0;
  /** The height the ladder is measured in — the WINDOW, never the canvas: a
   * canvas height settles in after the first render and eases with an opening
   * sheet, and the ladder is what decides where the mountain rests. */
  const ladderHeight = Math.max(240, Math.round(winH / 40) * 40);
  const climbOrderRef = useRef<string[]>([]);
  const climbRanks = useMemo(() => {
    const handled = new Set(handledSig ? handledSig.split("|") : []);
    const order = climbOrderRef.current.filter((id) => handled.has(id));
    // Ropes handled before we were watching (boot, day flip) take the same
    // day-seeded order the layout builder would fall back to.
    const fresh = daySeedOrder(
      [...handled].filter((id) => !order.includes(id)),
      now,
    );
    order.push(...fresh);
    climbOrderRef.current = order;
    return Object.fromEntries(order.map((id, i) => [id, i]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- now: rank flips ride the signature
  }, [handledSig]);

  // An answered rope leaves the face only once he has TOPPED IT OUT and is
  // standing on its cliff edge. Ropes already answered when the map mounts
  // are retired straight away — that climb happened in an earlier session.
  const [retiredIds, setRetiredIds] = useState<string[]>(() =>
    handledSig ? handledSig.split("|") : [],
  );
  const retireAllRef = useRef<() => void>(() => {});
  retireAllRef.current = () => setRetiredIds(handledSig ? handledSig.split("|") : []);
  useEffect(() => {
    if (!vertical) return;
    // A rope that stops being handled (day flip, reopened) drops out; the
    // pending ones wait for his climb — with a backstop in case no climb
    // ever runs (mascot hidden, reduced motion, a jump interrupted).
    const handled = new Set(handledSig ? handledSig.split("|") : []);
    setRetiredIds((prev) => prev.filter((id) => handled.has(id)));
    // Safety net only: the climb itself retires on landing (see the climb
    // effect). This catches a climb that never ran at all — mascot hidden,
    // reduced motion, an interrupted glide.
    const t = setTimeout(() => retireAllRef.current(), reducedMotion ? 120 : 5200);
    return () => clearTimeout(t);
  }, [vertical, handledSig, reducedMotion]);

  const layout = useMemo(
    () =>
      vertical
        ? buildSummitLayout(visible, {
            stageWidth: size.width,
            stageHeight: size.height,
            // The summit canvas does NOT shrink for the tray. Now, the ladder
            // and every rope column are derived from the canvas height, so an
            // easing inset would drift the whole scene 150px sideways-and-down
            // exactly while a climb is running. The sheet simply covers the
            // past below him.
            trayInset: 0,
            window: window_,
            compact,
            now,
            mainShift,
            pinnedBranchIds,
            climbRanks,
            retiredIds,
            ladderHeight,
            // Now sits mid-canvas: the climber stands there all day, the
            // mountain rises above him and the past falls away below. (The
            // builder clamps this to half the canvas, which is the point.)
            ledgeY: Number.MAX_SAFE_INTEGER,
          })
        : buildTimelineLayout(visible, {
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
    [vertical, visible, size, window_, compact, now, mainShift, topInset, pinnedBranchIds, bottomInset, climbRanks, retiredIds],
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // Summit's extra anchors; null on every horizontal theme.
  const sm = vertical ? (layout as SummitLayout) : null;
  // The Now point in canvas coordinates, whichever way the map runs.
  const nowPt = sm
    ? { x: sm.routeX, y: sm.nowScreenY }
    : { x: layout.nowX, y: layout.mainY };

  // ── The climb ──────────────────────────────────────────────────────────
  // The climber does not move. He and the Now point hold their place on
  // screen; the MOUNTAIN slides down past them, and that is what reads as
  // climbing. So there is no camera to follow him: there is one number, how
  // far the mountain has travelled, and it grows by one rung per rope
  // answered (plus the final headroom when the summit is earned).
  //
  // One truth for "handled": the same predicate that coils a rope onto its
  // cliff ledge marks it conquered — the summit only comes when every rope
  // has left the face.
  const unattended = activeLines.filter((b) => !handledToday(b, now)).length;
  const allDone = unattended === 0 && activeLines.length > 0;
  const ledgeWorldY = sm ? sm.nowScreenY : 0;
  /** How far the mountain has already travelled down today, from the layout's
   * own ladder — one source of truth, so the rock's rest position and its
   * geometry can never disagree about where a rung is. */
  const climbDist = sm
    ? handledCount * sm.ladderStep +
      (handledCount > 0 && handledCount === activeLines.length ? sm.ladderHeadroom : 0)
    : 0;
  /** What that distance is a function of. A change in THIS is a climb (or a
   * rope arriving/leaving); a change in `climbDist` with the same signature is
   * the stage measuring itself, and must never animate. */
  const climbSig = vertical ? `${handledCount}/${activeLines.length}` : "";

  /**
   * Where a rope can actually be SEEN and handled. On the summit a rope's
   * `endY` is its anchor — deliberately far above the viewport — so every
   * effect that belongs to the act of handling it (the dial's pop, a token
   * popping off, the tutorial's halo, the cut) has to happen down here at the
   * climber's level instead, or it plays off-screen where nobody sees it.
   */
  const workedY = (g: { endY: number; forkY: number; labelY: number }): number =>
    vertical && sm
      ? Math.max(sm.nowScreenY - 60, Math.min(g.forkY - 10, g.labelY - 18))
      : g.endY;
  const workedYRef = useRef(workedY);
  workedYRef.current = workedY;

  /** The summit in the mountain layer's own (resting) coordinates. The layer's
   * transform adds the climb, so on screen it sits at
   * `ledgeWorldY − peakAbove + climbDist` — at Now once the last rope is in. */
  const peakY = ledgeWorldY - (sm?.peakAbove ?? 0);
  const geoById = useMemo(
    () => new Map(layout.geometries.map((g) => [g.branchId, g])),
    [layout.geometries],
  );
  // He stands at the Now point, every day, all day.
  const restSpot = sm ? { x: sm.routeX, y: ledgeWorldY - 4 } : { x: 0, y: 0 };
  const restPipY = restSpot.y;

  /** How far the mountain has travelled today, on the UI thread. This is the
   * ONE truth: geometry is the mountain at rest, and this transform is the
   * climb. It starts at its resting value, so a load — or a stage measuring
   * itself, or a sheet, or the clock ticking — shows no motion whatsoever;
   * only an answer moves it, and then it GLIDES: the cliff edge above comes
   * down into frame and settles under his feet, and the rock, its texture,
   * the ropes and the sky travel with it. */
  /** A climb that landed while a stage screen held the map: resume from where
   * the mountain was, so the ascent still plays on the way back. */
  const resumed = useRef(
    shownClimb && shownClimb.sig !== climbSig ? shownClimb : null,
  ).current;
  const climbSV = useSharedValue(resumed ? resumed.dist : climbDist);
  // One world clock: the wave, the weather, the scenery and the summit's ropes
  // all share a single continuous animation instead of four identical ramps —
  // and sharing it is what lets the climber swing in step with his rope.
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
  const climbSigRef = useRef(resumed ? resumed.sig : climbSig);
  const climbDistRef = useRef(resumed ? resumed.dist : climbDist);
  const retireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The climb is the answer's reward, and it should not play out behind the
   * sheet that was used to give it. While a panel is open the climb waits —
   * the refs are left untouched, so when the panel closes this effect runs
   * again with the same numbers and the ascent is still "earned". Integrating
   * and letting go close their panel at once, so for them nothing waits.
   */
  /**
   * The rope a panel is currently about — whichever panel. Every step of a
   * decision (the peek, the choices, Act, Note, the merge) carries the same
   * branch, and while any of them is up that rope is the one he belongs on.
   */
  const operationBranchId =
    operation.kind === "quick-touch" ||
    operation.kind === "quick-act" ||
    operation.kind === "quick-merge" ||
    operation.kind === "quick-note" ||
    operation.kind === "understanding"
      ? operation.branchId
      : null;
  /**
   * The map is not on screen: Act, Note and the merge take a screen of their
   * own (operationDepth "stage"/"focused"). That — not "a panel is open" — is
   * the reason a climb has to wait: nobody can watch an ascent that is
   * happening behind another screen. A quick tray leaves the mountain in
   * view, so letting a rope rest climbs at once, as it should.
   */
  const mapHidden =
    operationDepth(operation) === "stage" || operationDepth(operation) === "focused";
  /** An answer has landed but its climb has not started yet: the effect below
   * leaves `climbDistRef` alone while it waits, so the two disagreeing IS the
   * fact that a climb is owed. */
  const climbOwed = vertical && mapHidden && climbDist !== climbDistRef.current;
  useEffect(() => {
    if (!vertical) return;
    if (mapHidden) return;
    const fromDist = climbDistRef.current;
    const fromSig = climbSigRef.current;
    climbDistRef.current = climbDist;
    climbSigRef.current = climbSig;
    shownClimb = { sig: climbSig, dist: climbDist };
    if (climbDist === fromDist) return;
    const rise = climbDist - fromDist;
    // Only a change in the ROPES is a climb. Everything else that moves this
    // number — the stage settling on its real size at mount, a resize, a
    // filter — must land instantly, or the map climbs itself for no reason.
    const earned = climbSig !== fromSig && rise > 0 && handledCount > 0;
    if (!earned || reducedMotion) {
      cancelAnimation(climbSV);
      climbSV.value = climbDist;
      retireAllRef.current();
      return;
    }
    const dur = Math.max(700, Math.min(2100, 380 + rise * 1.6));
    // Continue from wherever the mountain IS — a second answer landing while
    // the first climb is still running must carry on down, not rewind to the
    // previous rung and slide up on the way.
    cancelAnimation(climbSV);
    climbSV.value = withTiming(climbDist, {
      duration: dur,
      easing: Easing.inOut(Easing.quad),
    });
    // The rope leaves the face when the rock it hangs from has arrived. Timed
    // from JS, not from the timing callback: a worklet closes over a SNAPSHOT
    // of the retire function, so a second answer mid-climb would retire only
    // the first one's ropes.
    if (retireTimerRef.current !== null) clearTimeout(retireTimerRef.current);
    retireTimerRef.current = setTimeout(() => {
      retireTimerRef.current = null;
      retireAllRef.current();
    }, dur + 40);
    // He climbs in place for exactly as long as the mountain moves.
    mascotRef.current?.climbInPlace(dur);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
  }, [vertical, climbDist, climbSig, reducedMotion, mapHidden]);
  useEffect(
    () => () => {
      if (retireTimerRef.current !== null) clearTimeout(retireTimerRef.current);
    },
    [],
  );
  // Quantized to a half pixel, like every other per-frame value on this map:
  // an unquantized transform lets the rasterizer wobble the rock by a pixel,
  // and the one thing this layer must never do is move up.
  const climbProps = useAnimatedProps(
    () => ({ translateY: Math.round(climbSV.value * 2) / 2 }),
    [climbSV],
  );
  /** The sky drifts at a fraction of the rock — parallax, so height reads. */
  const skyProps = useAnimatedProps(
    () => ({ translateY: Math.round(climbSV.value * 0.42 * 2) / 2 }),
    [climbSV],
  );
  /**
   * How far the mountain has been TURNED (radians). The ropes hang around it
   * rather than across a flat face, so turning is what brings the ones round
   * the back into view — and it is why they never have to squash together.
   * Lives on the UI thread; `rotRef` mirrors it for the JS side (which rope is
   * where, where the climber walks to).
   */
  const rotSV = useSharedValue(0);
  const rotRef = useRef(0);
  const rotQRef = useRef(0);
  /** The turn, quantized, for the parts of the ROCK that are rebuilt in React:
   * its edge shape and the marks on its face. ~25 rebuilds per full turn keeps
   * the silhouette turning with the ropes without rebuilding it per frame. */
  const [rotQ, setRotQ] = useState(0);
  const rockRot = rotQ * 0.25;
  /** Which ropes are in front, for the indicator (JS side, coarse updates). */
  const [rotTick, setRotTick] = useState(0);
  const commitRot = useCallback(() => {
    rotRef.current = rotSV.value;
    setRotQ(Math.round(rotSV.value / 0.25));
    setRotTick((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared value is stable
  }, []);
  /**
   * Where a rope sits on screen with the face turned as it is — the JS-side
   * twin of RingG's worklet, for anything that has to walk or point there.
   * It reads the LIVE turn, not the committed one: a climber sent to a rope
   * while the face is still turning must aim at where the rope IS, or he
   * walks past it and gets snapped back when the turn lands.
   */
  const ringX = useCallback(
    (g: { endX: number; angle?: number; radius?: number }): number => {
      if (!vertical || g.angle === undefined || !g.radius) return g.endX;
      return (
        g.endX +
        ringOffset(g.angle, rotSV.value, g.radius) -
        ringOffset(g.angle, 0, g.radius)
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared value is stable
    [vertical],
  );
  const ringXRef = useRef(ringX);
  ringXRef.current = ringX;

  /** Angles of the ropes on the ring, so a turn can settle on one of them. */
  const ropeAngles = useMemo(
    () =>
      vertical
        ? layout.geometries
            .filter((g) => g.reachesNow && g.inWindow && g.angle !== undefined)
            .map((g) => ({ id: g.branchId, angle: g.angle as number }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometry identity is enough
    [vertical, layout.geometries],
  );
  /**
   * Where "facing the viewer" puts a rope: beside the route, not on it. Dead
   * centre would lay the rope over the main line, the Now marker and the
   * climber all at once.
   */
  const FRONT_ANGLE = 0.36;

  /** The turn that brings `angle` to the front, taken the short way round. */
  const frontTarget = (angle: number, rot: number): number => {
    const want = FRONT_ANGLE - angle;
    return want + Math.round((rot - want) / (2 * Math.PI)) * 2 * Math.PI;
  };
  /**
   * Where a rope will BE once it has been turned to the front. Every waiting
   * rope shares one radius, so this is the same column for all of them — which
   * is why the chalk sweep can take one station and let the mountain bring it
   * rope after rope instead of running back and forth across the face.
   */
  const frontXOf = (g: { endX: number; angle?: number; radius?: number }): number => {
    if (!vertical || g.angle === undefined || !g.radius) return g.endX;
    return (
      g.endX + ringOffset(0, FRONT_ANGLE, g.radius) - ringOffset(g.angle, 0, g.radius)
    );
  };

  /** Bring a rope round to the front; returns how many ms that will take. */
  const turnToRef = useRef<(id: string, force?: boolean, sweep?: boolean) => number>(() => 0);
  turnToRef.current = (id: string, force = false, sweep = false) => {
    const r = ropeAngles.find((x) => x.id === id);
    if (!r) return 0;
    // A rope you can already see stays where it is: turning one out from under
    // the finger that just tapped it would make the map fight the user. Only a
    // rope round the side gets brought to the front.
    if (!force && Math.cos(r.angle + rotSV.value) > 0.55) return 0;
    const target = frontTarget(r.angle, rotSV.value);
    const delta = Math.abs(target - rotSV.value);
    if (delta < 0.03) return 0;
    if (reducedMotion) {
      rotSV.value = target;
      setTimeout(commitRot, 0);
      return 0;
    }
    // A focus turn is one fixed beat. A sweep turn is PACED by how far the
    // face has to come round: a neighbour arrives briskly, while the far side
    // still reads as a turn rather than a jump cut.
    const dur = sweep
      ? Math.round(Math.max(240, Math.min(560, 120 + delta * 180)))
      : 420;
    rotSV.value = withTiming(target, { duration: dur, easing: Easing.inOut(Easing.quad) });
    // JS's notion of the ring jumps to the DESTINATION at once. Everything on
    // this side reasons about which ropes are reachable — `interactive`,
    // `ringVisible`, the auto-turn — and it used to keep the pre-turn angle
    // until `commitRot`, so for the whole animation a rope you could plainly
    // see coming round still had its taps switched off. The rock's own shape
    // (`rotQ`) still steps at the end; only the reachability leads.
    rotRef.current = target;
    setRotTick((k) => k + 1);
    setTimeout(commitRot, dur + 20);
    return dur;
  };

  const turnSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTurnRef = useRef<() => void>(() => {});
  settleTurnRef.current = () => {
    if (ropeAngles.length === 0) {
      commitRot();
      return;
    }
    const rot = rotSV.value;
    // the rope whose face is squarest to the viewer wins the settle
    let best = rot;
    let bestGap = Infinity;
    for (const r of ropeAngles) {
      const target = frontTarget(r.angle, rot);
      const gap = Math.abs(rot - target);
      if (gap < bestGap) { bestGap = gap; best = target; }
    }
    rotSV.value = reducedMotion
      ? best
      : withTiming(best, { duration: 320, easing: Easing.out(Easing.quad) });
    rotRef.current = best;
    setRotTick((k) => k + 1);
    setTimeout(commitRot, reducedMotion ? 0 : 340);
  };

  /** The mountains beyond this one: the further away, the slower they pass. */
  const farProps = useAnimatedProps(
    () => ({ translateY: Math.round(climbSV.value * 0.2 * 2) / 2 }),
    [climbSV],
  );
  const midProps = useAnimatedProps(
    () => ({ translateY: Math.round(climbSV.value * 0.36 * 2) / 2 }),
    [climbSV],
  );
  const anchorRestY = vertical && sm ? Math.round(restPipY) : 0;

  // The LAST rope earns the summit party: the mountain's final glide brings
  // the peak under his feet, with a burst, a banner and his own cheer.
  const prevUnattendedRef = useRef(unattended);
  const [summitParty, setSummitParty] = useState(0);
  useEffect(() => {
    if (!vertical) return;
    const prev = prevUnattendedRef.current;
    prevUnattendedRef.current = unattended;
    if (unattended >= prev) return;
    if (unattended === 0 && activeLines.length > 0) {
      setSummitParty((k) => k + 1);
      const say = setTimeout(
        () => mascotRef.current?.showReaction(t("You did it!")),
        reducedMotion ? 400 : 2600,
      );
      const t2 = setTimeout(() => setSummitParty(0), 7000);
      return () => {
        clearTimeout(say);
        clearTimeout(t2);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t stable per language
  }, [vertical, unattended, reducedMotion]);

  useEffect(() => {
    const wantsThread = tutorialStep === "meet-thread" || tutorialStep === "pip-arrives";
    if (!wantsThread || !tutorialBranchId) {
      setWalkthroughPoint("thread", null);
      return;
    }
    const g = layout.geometries.find((geo) => geo.branchId === tutorialBranchId);
    if (!g || !g.inWindow) {
      setWalkthroughPoint("thread", null);
      return;
    }
    measureNode(stageRef.current, (sx, sy) => {
      // A little back from the tip, so the halo rests on the line itself.
      // On the summit map the rope hangs below its anchor, and the canvas
      // scrolls sideways instead of down.
      if (verticalRef.current) {
        setWalkthroughPoint("thread", {
          // the rope's visible stretch, not its off-screen anchor
          x: sx + g.endX - scrollXRef.current,
          y: sy + workedYRef.current(g),
        });
      } else {
        setWalkthroughPoint("thread", { x: sx + g.endX - 24, y: sy + g.endY });
      }
    });
    return () => setWalkthroughPoint("thread", null);
  }, [tutorialStep, tutorialBranchId, layout]);

  // The lean glides in over about a third of a second and glides back to rest
  // when the panel closes. Lanes are anchored to bandY, so the target does not
  // move while the main line travels.
  useEffect(() => {
    let target = 0;
    if (focusedBranchId) {
      const g = layout.geometries.find((geo) => geo.branchId === focusedBranchId);
      if (g && g.inWindow) {
        // Base-coordinate delta either way: summit's mainShift feeds the same
        // underlying builder, so the route leans toward the rope's column.
        const delta = vertical && sm
          ? (g.laneX ?? sm.bandX) - sm.bandX
          : g.laneY - layout.bandY;
        const gap = compact ? 36 : 44;
        target = Math.abs(delta) > gap ? delta - Math.sign(delta) * gap : 0;
        // The summit does not lean at all: `routeX` positions the rock, its
        // texture, the summit dashes and every rope column, so leaning the
        // route drags the entire mountain sideways. The focused rope already
        // reads through its own emphasis and its grab prompt.
        if (vertical) target = 0;
      }
    }
    setShiftTarget(target);
  }, [focusedBranchId, layout, compact, vertical, sm]);

  // With many threads the canvas grows taller than the stage and scrolls.
  // Whenever its shape changes, settle the view around the main line so Now
  // is what you see first; from there you scroll to the outer lanes.
  // (On the summit map the columns overflow sideways instead: settle around
  // the route so the face is centered.)
  useEffect(() => {
    if (vertical) return;
    if (scrollH <= 0) return;
    const overflow = layout.height - scrollH;
    if (overflow > 0) {
      const y = Math.max(0, Math.min(overflow, layout.bandY - scrollH / 2));
      scrollRef.current?.scrollTo({ y, animated: false });
    }
  }, [vertical, layout.height, layout.bandY, scrollH]);
  const laneSpan = sm?.laneSpan ?? 0;
  const bandX = sm?.bandX ?? 0;
  useEffect(() => {
    if (!vertical) return;
    const overflow = laneSpan + 84 - size.width;
    if (overflow > 0) {
      const x = Math.max(0, Math.min(overflow, bandX - size.width / 2));
      scrollRef.current?.scrollTo({ x, animated: false });
    }
  }, [vertical, laneSpan, bandX, size.width]);

  // The tapped thread stays in sight: when a panel opens, scroll so the pair —
  // its lane and the leaning main line — sits centered in the space the panel
  // leaves free. Runs while the inset and the lean animate, so the view
  // follows the sheet as it slides in.
  useEffect(() => {
    if (vertical) {
      // The tray inset already compresses the time axis in the layout; here
      // only the focused rope's column needs to come on screen sideways.
      const anchorId = focusedBranchId;
      if (!anchorId || !sm) return;
      const g = layout.geometries.find((geo) => geo.branchId === anchorId);
      if (!g || !g.inWindow) return;
      const maxScroll = Math.max(0, sm.laneSpan + 84 - size.width);
      const anchor = ((g.laneX ?? sm.routeX) + sm.routeX) / 2;
      const x = Math.max(0, Math.min(maxScroll, anchor - size.width / 2));
      scrollRef.current?.scrollTo({ x, animated: false });
      return;
    }
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
  }, [vertical, sm, size.width, focusedBranchId, layout, bottomInset, topInset, scrollH]);

  // ---- gestures: tap / horizontal time-pan / vertical loudness dial --------

  /** The thread under the finger, for the press-and-hold that opens its panel. */
  const candidateRef = useRef<{ branchId: string } | null>(null);
  const modeRef = useRef<"idle" | "pan">("idle");
  /** Face-drag anchor: scroll events lag the finger, so the drag offsets
   * from the position captured at its start, not the live one. */
  const hscrollStartRef = useRef(0);
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);
  const stagePosRef = useRef({ x: 0, y: 0 });
  const blockTapsUntilRef = useRef(0);
  const [scrollLocked, setScrollLocked] = useState(false);


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
          // A drag on a thread never changes its loudness: that is the
          // panel's job alone (press-and-hold pops it, a second tap opens
          // it). A dial hidden in a drag made every pan a risk, and on the
          // summit it fought the one gesture that map is built on — turning
          // the mountain. So a drag anywhere means the same thing whether it
          // began on a thread or on bare ground.
          if (verticalRef.current) {
            // Summit: one 2D drag — up/down climbs through time while
            // sideways turns the face (RN-web ScrollViews can't drag-scroll
            // with a mouse, so the map owns both axes).
            modeRef.current = "pan";
            candidateRef.current = null;
            return true;
          }
          if (Math.abs(gs.dx) > Math.abs(gs.dy)) {
            // Horizontal wins: one finger drags through time.
            modeRef.current = "pan";
            candidateRef.current = null;
            return true;
          }
          // Plain vertical drag: the stage scrolls natively.
          candidateRef.current = null;
          return false;
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (_e, gs) => {
          lastXRef.current = gs.moveX || gs.x0;
          lastYRef.current = gs.moveY || gs.y0;
          hscrollStartRef.current = verticalRef.current ? rotSV.value : scrollXRef.current;
          measureNode(stageRef.current, (x, y) => {
            stagePosRef.current = { x, y };
          });
        },
        onPanResponderMove: (_e, gs) => {
          if (modeRef.current === "pan") {
            if (verticalRef.current) {
              // sideways: TURN the face. A drag across the stage is about a
              // half-turn, so every rope can be brought round without lifting
              // the finger.
              rotSV.value =
                hscrollStartRef.current +
                (gs.dx / Math.max(1, sizeRef.current.width)) * Math.PI;
              // step the rock's own shape along with the finger
              const q = Math.round(rotSV.value / 0.25);
              if (q !== rotQRef.current) {
                rotQRef.current = q;
                rotRef.current = rotSV.value;
                setRotQ(q);
              }
              const dy = gs.moveY - lastYRef.current;
              if (dy === 0) return;
              lastYRef.current = gs.moveY;
              // Dragging beside the date rail scrubs faster than the face.
              const stageX = gs.moveX - stagePosRef.current.x;
              const nearDates = stageX > sizeRef.current.width - SUMMIT_RAIL_W - 24;
              const summit = layoutRef.current as SummitLayout;
              const timeLen = summit.timeLen ?? 1;
              // panBy takes a fraction of the STORE window; scale so a px of
              // finger moves a px of the (shorter) display window.
              const scale = summit.panScale ?? 1;
              panBy((dy / Math.max(1, timeLen)) * scale * (nearDates ? 4 : 1));
              return;
            }
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
          if (verticalRef.current && modeRef.current === "pan") {
            // Settle so a rope ends up facing the viewer, not half round the
            // side — and let the JS side know which ropes are in front now.
            settleTurnRef.current();
          }
          if (modeRef.current === "pan") {
            blockTapsUntilRef.current = Date.now() + 350;
          }
          resetGesture();
        },
        onPanResponderTerminate: () => {
          // Taken away by the system: commit nothing.
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
        // Summit: he already has this rope. A tap sends him a little way UP
        // it, and that climb IS the act — one step quieter, no sheet, no
        // chalk fx, no charge. The sideways drag still makes bigger moves,
        // and the sheet is a tap on Pip (or the rope's own prompt) away.
        if (verticalRef.current && !isClosed(b) && !handledToday(b, nowRef.current)) {
          const felt = Math.round(effectiveLoudness(b, nowRef.current));
          if (felt > 1) {
            const store = useAppStore.getState();
            // Rolled before the commit: the loudness log is the token's
            // anti-farm memory and must still end at the old level here.
            store.maybeDropCoin(branchId, felt, felt - 1);
            void store.dialLoudness(branchId, Math.max(1, felt - 1) as Loudness);
            return; // armed STAYS set — the next tap climbs again
          }
          // As quiet as it goes: he shrugs instead of climbing.
          const m = mascotRef.current;
          if (m) m.showReaction(randomFrom(m.phrases.attackCalm));
          return;
        }
        setArmedBranchId(null);
        setOperation({ kind: "quick-touch", branchId });
        return;
      }
      setArmedBranchId(branchId);
      mascot.focusBranch(branchId);
      // Arming is local state by design; the walkthrough hears about it here.
      useAppStore.getState().noteTutorialEvent("thread-armed");
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
  const holdTouchStart = useCallback(
    (branchId: string, _e: GestureResponderEvent) => {
      const b = branchesRef.current.find((x) => x.id === branchId);
      if (!b) return;
      candidateRef.current = { branchId };
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
    const rect0 = () => el.getBoundingClientRect();
    const onWheel = (e: WheelEvent) => {
      if (verticalRef.current) {
        // Summit: the vertical wheel climbs through time; a sideways one TURNS
        // the mountain, bringing the ropes round the back into view.
        if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) {
          e.preventDefault();
          rotSV.value =
            rotSV.value - (e.deltaX / Math.max(1, rect0().width)) * Math.PI * 0.6;
          if (turnSettleRef.current !== null) clearTimeout(turnSettleRef.current);
          turnSettleRef.current = setTimeout(() => {
            turnSettleRef.current = null;
            settleTurnRef.current();
          }, 160);
          return;
        }
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const nearDates = e.clientX - rect.left > rect.width - SUMMIT_RAIL_W - 24;
        const summit = layoutRef.current as SummitLayout;
        const timeLen = summit.timeLen ?? rect.height;
        const scale = summit.panScale ?? 1;
        panBy((-e.deltaY / Math.max(1, timeLen)) * scale * (nearDates ? 4 : 1));
        return;
      }
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
  // Summit trims the DISPLAY window (Now pinned near the top), so being
  // "away" is judged against the untrimmed store window.
  const navWindow = sm?.baseWindow ?? layout.window;
  const today = now.toISOString().slice(0, 10);
  const span = Date.parse(navWindow.end) - Date.parse(navWindow.start);
  const restingEnd = Date.parse(today) + span / 2;
  const awayFromNow =
    Math.abs(restingEnd - Date.parse(navWindow.end)) > 0.25 * DAY ||
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
  // The summit's whole premise is a climber holding his place while the
  // mountain moves past him, so hiding him under reduced motion left a scene
  // that slid for no visible reason. He stays; he just does not animate.
  const showMascot = !reducedMotion || vertical;
  // The camera follows Pip: whenever he sets off for a lane outside the
  // visible band (a super bonk hop, a focus run, a patrol jump), the
  // vertical scroll pans along with his dash. Once per run, never per frame.
  const followPip = useCallback((destX: number, destY: number) => {
    // The summit does not scroll sideways at all: the face turns, and a rope
    // that takes focus is turned to the front before he walks to it.
    if (verticalRef.current) return;
    const vh = scrollHRef.current;
    if (vh <= 0) return;
    const sy = scrollYRef.current;
    if (destY > sy + 70 && destY < sy + vh - 90) return;
    const maxScroll = Math.max(0, layoutRef.current.height + 84 - vh);
    const y = Math.max(0, Math.min(maxScroll, destY - vh / 2));
    scrollRef.current?.scrollTo({ y, animated: true });
  }, []);
  // On the summit map the climber's rest point is his current cliff ledge
  // (base camp on an unclimbed day, the peak once every rope is coiled).
  // The hook's chill spot is (nowX − 36, nowY − 22) with feet at
  // (nowX − 23, nowY + 13): offset the params so his feet land on the spot.
  const mascotNowX = vertical && sm ? restSpot.x + 23 : nowPt.x;
  const mascotNowY = vertical && sm ? restSpot.y - 13 : layout.mainY;
  const mascot = useMascot(
    visible,
    layout.geometries,
    mascotNowX,
    (branchId) => setOperation({ kind: "quick-touch", branchId }),
    mascotTypePref,
    operation.kind === "idle",
    operation.kind === "viewing-integrated",
    language,
    heldBranchId,
    burn?.branchId ?? null,
    mascotNowY,
    followPip,
    {
      vertical,
      reducedMotion,
      ringX: (g) => ringXRef.current(g),
      turnKey: rotTick,
      ringVisible: (g) =>
        g.angle === undefined || Math.cos(g.angle + rotRef.current) > 0.25,
      /** The chalk sweep turns the face to every rope in turn — including the
       * ones round the back, which is the whole point of it. */
      // An answer is in and its climb is still waiting on the panel: he keeps
      // the rope's column until the mountain actually moves.
      holdPlace: climbOwed || !!operationBranchId,
      sweepTurn: (id) => turnToRef.current(id, true, true),
      /** His station at a rope brought to the front, backed off it so the
       * chalk has an arc to fly — never so far back that he crosses the route. */
      sweepStandX: (g) => {
        const fx = frontXOf(g);
        const back = Math.min(34, Math.max(8, fx - (sm ? sm.routeX : fx) - 18));
        return fx - PX * 6 - back;
      },
      onClimbEnd: () => retireAllRef.current(),
    },
  );

  // Keep reaction ref current so effects below can call it
  mascotReactionRef.current = mascot.showReaction;
  const mascotRef = useRef(mascot);
  mascotRef.current = mascot;

  const heldRopeId = mascot.inspectedBranchId ?? mascot.arrivedBranchId ?? null;
  /**
   * A turn can carry the rope he is holding round the back of the mountain.
   * He does not ride it out of sight: he lets go and takes the nearest rope
   * still facing the viewer, or goes back to Now if the face has none left.
   * Called the moment his rope stops facing us, not when the turn commits.
   */
  const handOff = useCallback(() => {
    const rot = rotSV.value;
    const held = heldRopeRef.current;
    // A panel open on a rope means the user is working THAT one: the map does
    // not get to reassign him mid-decision, and the rope is on its way round
    // to the front anyway (see the reveal turn below).
    if (operationBranchRef.current) return;
    const next = ropeAnglesRef.current
      .filter((r) => r.id !== held)
      .filter((r) => {
        const b = branchesRef.current.find((x) => x.id === r.id);
        return b && !isClosed(b) && !handledToday(b, nowRef.current);
      })
      .map((r) => ({ id: r.id, facing: Math.cos(r.angle + rot) }))
      .filter((r) => r.facing > 0.55)
      .sort((a, b) => b.facing - a.facing)[0];
    setArmedBranchId(null);
    if (next) mascotRef.current?.focusBranch(next.id);
    else mascotRef.current?.goHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and shared values are stable
  }, []);
  const heldRopeRef = useRef(heldRopeId);
  heldRopeRef.current = heldRopeId;
  const ropeAnglesRef = useRef(ropeAngles);
  ropeAnglesRef.current = ropeAngles;
  /**
   * Timed off the LIVE turn, not off its commit: the handover happens as his
   * rope goes round the shoulder of the rock, which is the moment it stops
   * being something he could be holding.
   */
  const heldAngle = vertical
    ? ropeAngles.find((x) => x.id === heldRopeId)?.angle
    : undefined;
  useAnimatedReaction(
    () => (heldAngle === undefined ? 1 : Math.cos(heldAngle + rotSV.value)),
    (facing, prev) => {
      if (prev === null || heldAngle === undefined) return;
      if (prev > 0.34 && facing <= 0.34) runOnJS(handOff)();
    },
    [heldAngle, handOff],
  );

  /**
   * He actually HAS the rope — arrived at it, not still travelling and not
   * mid-sweep. `arrivedBranchId` is the right test: it survives a reaction (a
   * token cheer must not drop him back down the rope) but is null through
   * every run and every full send.
   */
  const gripId =
    vertical && mascot.arrivedBranchId && mascot.arrivedBranchId === heldRopeId
      ? heldRopeId
      : null;
  const gripGeo = gripId ? layout.geometries.find((x) => x.branchId === gripId) : undefined;
  const gripBranch = gripId ? branches.find((x) => x.id === gripId) : undefined;
  /** The level under his hands right now. */
  const gripLevelNow =
    gripBranch && gripGeo ? Math.max(1, Math.min(5, gripGeo.loudness)) : 1;
  const gripTrembles =
    !!gripBranch &&
    !!gripGeo &&
    lineTrembles({
      branch: gripBranch,
      inWindow: gripGeo.inWindow,
      level: gripLevelNow,
      reducedMotion,
      now,
      born: false,
    });
  /**
   * What he needs to swing with the rope he is holding: the rope's own
   * formula, its own clock, its own phase. Memoized on primitives only, so
   * the ticking clock cannot churn its identity.
   */
  const swayRide = useMemo<SwayRide | null>(() => {
    if (!vertical || !gripTrembles || !gripGeo) return null;
    if (gripGeo.coiled || !gripGeo.reachesNow) return null;
    return {
      clock: worldClock,
      climb: climbSV,
      anchorY: gripGeo.endY,
      total: gripGeo.forkY - gripGeo.endY,
      level: gripLevelNow,
      phase: phaseFromId(gripGeo.branchId),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable
  }, [
    vertical,
    gripTrembles,
    gripId,
    gripGeo?.endY,
    gripGeo?.forkY,
    gripGeo?.coiled,
    gripGeo?.reachesNow,
    gripLevelNow,
  ]);

  /**
   * How high he is on a rope is how far he has quieted it since he took hold.
   * The level he grabbed at is snapshotted ONCE — re-reading it as the level
   * falls would leave the rise permanently zero — so he always starts at his
   * station, rises as it quiets, and slides back down if it gets louder again.
   */
  const gripAtRef = useRef<{ id: string; level: number } | null>(null);
  const [gripAt, setGripAt] = useState<number | null>(null);
  useEffect(() => {
    if (!vertical || !gripId) {
      gripAtRef.current = null;
      setGripAt(null);
      return;
    }
    if (gripAtRef.current?.id === gripId) return; // same rope: keep the anchor
    const b = branchesRef.current.find((x) => x.id === gripId);
    const lvl = b ? Math.round(effectiveLoudness(b, nowRef.current)) : null;
    gripAtRef.current = lvl == null ? null : { id: gripId, level: lvl };
    setGripAt(lvl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately not `branches`
  }, [vertical, gripId]);

  const shinSteps =
    gripAt != null && gripBranch && !handledToday(gripBranch, now)
      ? Math.max(0, Math.min(SHIN_STEPS, gripAt - gripLevelNow))
      : 0;
  useEffect(() => {
    mascotRef.current?.shinUp(shinSteps * SHIN_PX);
  }, [shinSteps]);

  /** Remember the rope in his hands, so a stage screen cannot lose it. */
  useEffect(() => {
    if (gripId) lastGripRope = gripId;
  }, [gripId]);

  /**
   * Back from a stage screen with a climb still to play: put him on the rope
   * he was holding before the ascent starts, so it is climbed from the column
   * he was standing on rather than from the route.
   */
  const resumedRope = useRef(resumed ? lastGripRope : null).current;
  useEffect(() => {
    if (!vertical || !resumedRope) return;
    const g = layoutRef.current.geometries.find((x) => x.branchId === resumedRope);
    if (!g) return;
    mascotRef.current?.focusBranch(resumedRope);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on the way back
  }, [vertical, resumedRope]);

  /** His hands stay on the rope for every frame of a turn (see GripRide). */
  const gripRide = useMemo<GripRide | null>(() => {
    if (!gripId || !gripGeo || gripGeo.angle === undefined || !gripGeo.radius) return null;
    return {
      baseX: gripGeo.endX - PX * 6,
      angle: gripGeo.angle,
      radius: gripGeo.radius,
      rot: rotSV,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable
  }, [gripId, gripGeo?.endX, gripGeo?.angle, gripGeo?.radius]);

  /**
   * About to act on a rope — picked from the wholeness panel, say — that is
   * round the back of the mountain: bring it round so it can be seen, then
   * put the climber on it. Only turn when it genuinely cannot be seen: a rope
   * anywhere on the visible face stays exactly where it is, so the map never
   * shifts under a finger that is already on it.
   */
  const operationBranchRef = useRef(operationBranchId);
  operationBranchRef.current = operationBranchId;
  useEffect(() => {
    if (!vertical || !operationBranchId) return;
    const r = ropeAnglesRef.current.find((x) => x.id === operationBranchId);
    if (!r) return;
    // Turn only when it genuinely cannot be seen.
    const hidden = Math.cos(r.angle + rotSV.value) <= 0.25;
    const ms = hidden ? turnToRef.current(operationBranchId, true) : 0;
    // Then he belongs ON it. Sending him again once the rope has come round
    // is what makes a thread picked from the wholeness panel put him in the
    // right place: the panel's own focus fires before the turn does, so
    // without this he walks to where the rope was hiding and stays there.
    const tm = setTimeout(() => mascotRef.current?.focusBranch(operationBranchId), ms + 40);
    return () => clearTimeout(tm);
    // Re-asserted on every step of the decision, not just when the rope
    // changes: each panel that opens over the map dropped his focus, and a
    // climber who has let go is a climber the map is free to send home.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
  }, [vertical, operationBranchId, operation.kind]);

  /** On the summit the ROPE does the asking, so the prompt is decided here:
   * it also silences Pip's own bubble while it is up — two pills saying
   * different things over one climber is noise. */
  const grabPrompt = (() => {
    if (!vertical || !sm || operation.kind !== "idle") return null;
    const id = mascot.pendingBranchId ?? armedBranchId ?? mascot.inspectedBranchId;
    if (!id) return null;
    const b = branches.find((x) => x.id === id);
    if (!b || isClosed(b) || handledToday(b, now)) return null;
    const g = layout.geometries.find((x) => x.branchId === id);
    if (!g || !g.inWindow) return null;
    // The pill sits just above his head, so it climbs with him — hiding it
    // once he had shinned up took away the only route to a rope's decisions.
    const rise = id === gripId ? shinSteps * SHIN_PX : 0;
    return { id, g, rise };
  })();

  // The mountain turns by itself at ONE moment only: when every rope facing
  // the viewer has been handled, it brings the next one round — the day's work
  // arriving rather than having to be hunted for. (It must never turn at any
  // other time: a rope that moves under the finger makes every tap a miss,
  // which is what the climber's own patrol used to cause.)
  useEffect(() => {
    if (!vertical || ropeAngles.length === 0) return;
    const unhandled = ropeAngles.filter((r) => {
      const b = byId.get(r.id);
      return b && !isClosed(b) && !handledToday(b, now);
    });
    if (unhandled.length === 0) return;
    const facing = (r: { angle: number }) => Math.cos(r.angle + rotRef.current);
    if (unhandled.some((r) => facing(r) > 0.25)) return; // still work in view
    // the nearest one round the side, so the turn is the short way
    const next = unhandled.slice().sort((a, b) => facing(b) - facing(a))[0];
    const t = setTimeout(() => turnToRef.current(next.id, true), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handledSig covers the branches
  }, [vertical, handledSig, rotTick, ropeAngles]);

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
            verticalRef.current
              // Where the rope actually is with the face turned as it is: a
              // sweep can rain several tokens, and they all launched from the
              // un-turned column before.
              ? { key: c.key, branchId: c.branchId, x0: ringXRef.current(g) + COIN_LEAD - scrollXRef.current, y0: workedYRef.current(g) - COIN_HOVER }
              : { key: c.key, branchId: c.branchId, x0: g.endX + COIN_LEAD, y0: g.endY - COIN_HOVER - scrollYRef.current },
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
    if (vertical) {
      // Summit: the perch model handles it — the map remounts with him
      // already on the conquered rope's cliff ledge.
      return;
    }
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
  // Hooks can't be conditional: both currents are always mounted, and the
  // inactive one gets dormant inputs (zero progress and a zero-length line),
  // so its breathing gate keeps every clock cancelled.
  const calmCurrent = useCalmCurrent({
    progress: vertical ? 0 : calmProgress,
    pulseKey: vertical ? 0 : pulseKey,
    worldClock,
    mainY: layout.mainY,
    nowX: vertical ? 0 : layout.nowX,
    periodMs: wavePeriodMs,
    dashDurationMs: tk.mainFlowDuration,
    reducedMotion,
    accentColor: tk.accent,
    shimmerColor: tk.shimmer,
    lineColor: tk.lineMain,
    sacredLineColor: mix(tk.shimmer, tk.lineMain, 70),
  });
  const summitCurrent = useSummitCurrent({
    progress: vertical ? calmProgress : 0,
    pulseKey: vertical ? pulseKey : 0,
    routeX: sm?.routeX ?? 0,
    nowScreenY: sm?.nowScreenY ?? 0,
    timeLen: sm?.timeLen ?? 0,
    periodMs: wavePeriodMs,
    dashDurationMs: tk.mainFlowDuration,
    reducedMotion,
    accentColor: tk.accent,
    shimmerColor: tk.shimmer,
    lineColor: tk.lineMain,
    sacredLineColor: mix(tk.shimmer, tk.lineMain, 70),
  });
  const routeLen = sm ? Math.max(0, sm.timeLen - sm.nowScreenY) : 0;

  const mergeFlowProps = useDashFlow(
    operation.kind === "confirming-merge" && !reducedMotion,
    0,
    -26,
    1100,
  );


  // +84: breathing room below the lanes, so the lowest one can be pulled up
  // clear of the pinned date strip and the bonk bar. Inside the canvas (not a
  // spacer view) so the day dividers run through it. Summit overflows
  // sideways instead: the canvas widens with the rope columns.
  const svgHeight = vertical ? size.height : layout.height + Math.round(bottomInset) + 84;
  // The summit turns instead of scrolling sideways, so its canvas is exactly
  // the stage: the old `laneSpan + 84` left 84px of phantom horizontal travel.
  const svgWidth = size.width;

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View
        ref={stageRef}
        style={{ position: "relative", flex: 1, minHeight: 260, overflow: "hidden" }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize({ width: Math.max(320, width), height: Math.max(240, height) });
          if (!measured) setMeasured(true);
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
          horizontal={vertical}
          style={{
            flex: 1,
            minHeight: 0,
            // the summit's first paint waits for the stage measurement (see
            // `measured`) — otherwise the mountain settles into place in view
            opacity: vertical && !measured ? 0 : 1,
          }}
          // Summit: the 2D pan gesture owns both axes (a scroll-enabled
          // ScrollView steals horizontally-initiated drags before the
          // responder can claim them); programmatic scrollTo still works.
          scrollEnabled={vertical ? false : !scrollLocked}
          onLayout={(e) => setScrollH(e.nativeEvent.layout.height)}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
            scrollXRef.current = e.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator
          showsHorizontalScrollIndicator
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
              width={svgWidth}
              height={svgHeight}
              accessibilityLabel={summary}
              accessibilityRole="image"
              // .timeline-svg parity: drags must never select label text.
              // Horizontal themes keep native vertical panning; the summit's
              // one 2D gesture owns both axes (time up/down, face sideways),
              // so the browser gets none — pan-x would make the platform
              // skip responder negotiation for sideways drags entirely.
              {...(Platform.OS === "web"
                ? {
                    style: {
                      userSelect: "none",
                      touchAction: vertical ? "none" : "pan-y",
                    } as object,
                  }
                : null)}
            >
              {/* the sky, on its own slower rail behind the mountain: clouds
                  drifting by low down, stars once the summit is near. The
                  parallax is what sells the height — the rock rushes past,
                  the sky only drifts. */}
              {/* the range this mountain belongs to: two ranks of cliff edges
                  standing in the sky either side of it, each on its own slower
                  rail so the height reads as height */}
              {vertical && sm && (
                <>
                  <AnimatedOptionG animatedProps={farProps}>
                    <DistantCliffs
                      routeX={sm.routeX}
                      faceHalf={sm.faceHalf}
                      width={svgWidth}
                      timeLen={sm.timeLen}
                      bandAnchor={-climbDist * 0.2}
                      rate={0.2}
                      salt={41}
                      tone={mix(tk.inkFaint, tk.bg, 72)}
                      opacity={0.5}
                      tk={tk}
                    />
                  </AnimatedOptionG>
                  <AnimatedOptionG animatedProps={midProps}>
                    <DistantCliffs
                      routeX={sm.routeX}
                      faceHalf={sm.faceHalf}
                      width={svgWidth}
                      timeLen={sm.timeLen}
                      bandAnchor={-climbDist * 0.36}
                      rate={0.36}
                      salt={53}
                      tone={mix(tk.inkFaint, tk.bg, 52)}
                      opacity={0.62}
                      tk={tk}
                    />
                  </AnimatedOptionG>
                </>
              )}
              {vertical && sm && (
                <AnimatedOptionG animatedProps={skyProps}>
                  <SkyParallax
                    peakY={peakY}
                    // the sky spans the whole mountain, so clouds and stars
                    // populate the frame at every altitude
                    bottomY={sm.timeLen + climbDist}
                    width={svgWidth}
                    tk={tk}
                  />
                </AnimatedOptionG>
              )}
              {/* No camera here. On the summit the TIME frame — main line,
                  Now, its dates, the climber — holds its place on screen; only
                  the mountain layer below moves (climbProps). */}
              <G>
              {/* today softly glows: where life is happening */}
              {!vertical && layout.nowX - todayX > 0 && (
                <Rect
                  x={todayX}
                  y={0}
                  width={layout.nowX - todayX}
                  height={svgHeight}
                  fill={tk.accent}
                  opacity={0.05}
                />
              )}
              {vertical &&
                sm &&
                (() => {
                  const todayY = dateToScreenY(today, layout.window, sm.timeLen, sm.axisLen);
                  if (todayY - sm.nowScreenY <= 0) return null;
                  return (
                    <Rect
                      x={0}
                      y={sm.nowScreenY}
                      width={svgWidth}
                      height={todayY - sm.nowScreenY}
                      fill={tk.accent}
                      opacity={0.05}
                    />
                  );
                })()}

              {/* axis gridlines — full canvas, including the scroll headroom;
                  their date labels live on the pinned strip (bottom edge, or
                  the right-hand rail on the summit map) */}
              {ticks.map((tick) => {
                if (vertical && sm) {
                  const y = dateToScreenY(tick.date, layout.window, sm.timeLen, sm.axisLen);
                  return (
                    <Line key={tick.date} x1={0} y1={y} x2={svgWidth} y2={y} stroke={tk.lineAxis} />
                  );
                }
                const x = dateToX(tick.date, layout.window, layout.metrics.width);
                return (
                  <Line key={tick.date} x1={x} y1={0} x2={x} y2={svgHeight} stroke={tk.lineAxis} />
                );
              })}

              {/* the summit route: the same gathering current, standing up.
                  The ledge marks Now; the pennant climbs with the day. */}
              {vertical && sm && (
                <>
                  {/* THE MOUNTAIN LAYER: rock, its texture and the route to
                      the summit all travel down as he climbs. Everything
                      outside this group stays with him. */}
                  <AnimatedOptionG animatedProps={climbProps}>
                  <MountainFace
                    routeX={sm.routeX}
                    peakY={peakY}
                    faceHalf={sm.faceHalf}
                    faceLeft={sm.faceLeft}
                    timeLen={sm.timeLen}
                    // the rock has to reach below the viewport at every offset
                    depth={900 + climbDist}
                    // this layer is translated DOWN by the climb, so the
                    // viewport's top edge sits at −climbDist in its coords
                    bandAnchor={-climbDist}
                    rot={rockRot}
                    tk={tk}
                  />
                  {/* marks on the rock: without them the world can slide all
                      it likes and the climb still looks still */}
                  <FaceTexture
                    routeX={sm.routeX}
                    peakY={peakY}
                    faceHalf={sm.faceHalf}
                    faceLeft={sm.faceLeft}
                    bandTop={-climbDist - 2.6 * sm.timeLen}
                    bandBottom={-climbDist + 2.6 * sm.timeLen}
                    bottomY={sm.timeLen + 900 + climbDist}
                    timeLen={sm.timeLen}
                    rot={rockRot}
                    tk={tk}
                  />
                  {/* the way still to go, drawn on the rock. It stops where he
                      has climbed to, so that once the transform is applied it
                      ends at Now and never spills over the timeline. */}
                  {ledgeWorldY - climbDist - peakY > 4 && (
                    <Path
                      d={`M ${sm.routeX} ${ledgeWorldY - climbDist} L ${sm.routeX} ${peakY}`}
                      stroke={tk.lineMain}
                      strokeWidth={2}
                      fill="none"
                      strokeDasharray={[2, 6]}
                      opacity={0.4}
                    />
                  )}
                  </AnimatedOptionG>
                  <SummitRoute
                    current={summitCurrent}
                    routeX={sm.routeX}
                    nowScreenY={sm.nowScreenY}
                    timeLen={sm.timeLen}
                    tk={tk}
                    calmProgress={calmProgress}
                    depth={900}
                  />
                  <Ledge routeX={sm.routeX} nowScreenY={sm.nowScreenY} tk={tk} />
                </>
              )}

              {/* main life line, with a slow current flowing toward Now.
                  As the day's threads get their answers it gathers strength —
                  wave rising, stroke thickening — until it breathes as one
                  calm, sacred current under a soft shimmer halo. Each answer
                  sends a shimmer streak sweeping down the line. */}
              {!vertical && (
              <>
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
              </>
              )}

              {/* the future stays one line: the main line continues faded,
                  nothing branches ahead of Now */}
              {!vertical && layout.fullWidth - layout.nowX > 4 && (
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

              {/* summit's day record: the decisions carved into the face just
                  below the ledge. Tapping them opens the actions panel. */}
              {/* the day's record, carved into the face BELOW the rope-name
                  ladder (five rows of names sit between Now and here) — and
                  only where the rock is wide enough to hold it; on a phone the
                  Actions tab carries the same list */}
              {vertical &&
                sm &&
                futureItems.length > 0 &&
                sm.faceHalf >= 200 &&
                sm.timeLen - sm.nowScreenY > 260 && (
                <G onPress={guarded(() => setOperation({ kind: "viewing-actions" }))}>
                  <Rect
                    x={sm.routeX + 4}
                    y={sm.nowScreenY + SUMMIT_RECORD_TOP - 18}
                    width={Math.min(190, sm.faceHalf - 14)}
                    height={futureItems.length * 16 + 18}
                    fill="transparent"
                  />
                  {futureItems.map((it, i) => {
                    const y = sm.nowScreenY + SUMMIT_RECORD_TOP + i * 16;
                    return (
                      <DayRow
                        key={it.id}
                        arriving={!!it.ownerId && it.ownerId === arrivedFor && !it.done}
                        reducedMotion={reducedMotion}
                      >
                        <Circle
                          cx={sm.routeX + 30}
                          cy={y - 4}
                          r={3}
                          fill={it.color}
                          opacity={it.done ? 0.35 : 0.55}
                        />
                        <SvgText
                          x={sm.routeX + 38}
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

              {/* every decision gathers around the main line past Now — a calm
                  record of the day. Tapping it opens the actions panel. */}
              {!vertical && futureItems.length > 0 && layout.fullWidth - layout.nowX > 40 && (
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
                  <RingG
                    key={g.branchId}
                    opacity={lineOpacity}
                    rot={vertical && g.reachesNow ? rotSV : null}
                    angle={g.angle ?? 0}
                    radius={g.radius ?? 0}
                  >
                  <BranchLine
                    burning={burn?.branchId === g.branchId && !reducedMotion}
                    key={undefined}
                    branch={branch}
                    geometry={g}
                    theme={theme}
                    nowMs={nowTick}
                    orientation={vertical ? "vertical" : "horizontal"}
                    // Only a rope on the rock rides the rock. An integrated
                    // thread's merge point sits on the main line, which does
                    // not move — so neither may its curve.
                    climbOffset={vertical && g.reachesNow ? climbSV : null}
                    // Summit shares the world's clock with the climber so he
                    // swings in step with the rope he is holding.
                    clock={vertical ? worldClock : null}
                    // round the back of the mountain: not there to be tapped
                    interactive={
                      !vertical ||
                      g.angle === undefined ||
                      Math.cos(g.angle + rotRef.current) > -0.05
                    }
                    timeLen={sm?.timeLen ?? 0}
                    wave={vertical ? null : calmCurrent.wave}
                    // No wave on the summit: the route is straight and still,
                    // so the dots that sit on it must be too (they compute
                    // their own offset from these handles).
                    routeWave={null}
                    waveNowX={vertical ? routeLen : layout.nowX}
                    wavePeriodMs={wavePeriodMs}
                    // A decision today settles the loudness too: the line
                    // rests until tomorrow (or until it reopens), so it takes
                    // no press-and-hold either.
                    holdEnabled={!isClosed(branch) && !decidedToday(branch, now)}
                    onHoldStart={holdTouchStart}
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
                  </RingG>
                );
              })}

              {/* fire consuming a burned thread — or, on the summit, the cut */}
              {burn &&
                !reducedMotion &&
                (() => {
                  const g = layout.geometries.find((x) => x.branchId === burn.branchId);
                  if (!g || !g.inWindow) return null;
                  return vertical ? (
                    // the rope being cut is ON the rock, so the cut travels
                    // with it; and it is cut where he is holding it
                    <AnimatedOptionG animatedProps={climbProps} key={burn.key}>
                      <RopeCut path={g.path} cutY={workedY(g)} />
                    </AnimatedOptionG>
                  ) : (
                    <BurnAway key={burn.key} path={g.path} />
                  );
                })()}

              {/* the impact of Pip's strike — on the summit it lands on the
                  rope where HE holds it, at his altitude, not at the anchor */}
              {!reducedMotion &&
                puffs.map((p) => {
                  const g = layout.geometries.find((x) => x.branchId === p.branchId);
                  if (!g || !g.inWindow) return null;
                  const strikeY = vertical
                    ? Math.max(g.endY, Math.min(g.forkY, p.fromY + PX * 10))
                    : g.endY;
                  return (
                    <AttackFx
                      key={p.key}
                      // The rope's UN-turned column: `rot` adds the turn per
                      // frame on the UI thread, so the chalk stays on the rope
                      // even mid-turn and even if the face is dragged while
                      // the dust is still settling.
                      x={g.endX}
                      y={strikeY}
                      path={g.path}
                      variant={attackVariantFor(theme)}
                      accent={tk.accent}
                      calm={p.calm}
                      fromX={p.fromX + PX * 7}
                      fromY={p.fromY + PX * 4}
                      rot={vertical && g.reachesNow ? rotSV : null}
                      angle={g.angle ?? 0}
                      radius={g.radius ?? 0}
                      />
                  );
                })}

              {/* the pop at the end of a press-and-hold: the dial's arrival */}
              {holdPop &&
                (() => {
                  const g = layout.geometries.find((x) => x.branchId === holdPop.branchId);
                  if (!g || !g.inWindow) return null;
                  return (
                    <PopBurst key={holdPop.key} x={ringX(g) - 3} y={workedY(g)} color={tk.accent} />
                  );
                })()}

              {/* dropped tokens, flipping over their threads until they fly */}
              {coins.map((c) => {
                if (flights.some((f) => f.key === c.key)) return null;
                const g = layout.geometries.find((x) => x.branchId === c.branchId);
                if (!g || !g.inWindow) return null;
                // On the turned face a token hovers over the rope it came
                // from, not over its un-turned column — and its flight starts
                // from the same place (see `flights`).
                const cx = ringX(g) + COIN_LEAD;
                const fadeW = vertical ? svgWidth : layout.metrics.width;
                const fade = Math.max(
                  0,
                  Math.min(1, (fadeW - 40 - cx) / 45, (cx + 20) / 45),
                );
                if (fade <= 0) return null;
                return (
                  <CoinToken
                    key={c.key}
                    x={cx}
                    y={workedY(g)}
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
                    // The summit variant is the same curve transposed: from
                    // the rope's column up into the ledge on the route.
                    const cl = layout.metrics.curveLength;
                    const d =
                      vertical && sm
                        ? `M ${g.laneX ?? g.endX} ${Math.min(g.forkY - 24, sm.nowScreenY + cl * 1.4)}` +
                          ` C ${g.laneX ?? g.endX} ${sm.nowScreenY + cl * 0.5},` +
                          ` ${sm.routeX} ${sm.nowScreenY + cl * 0.55},` +
                          ` ${sm.routeX} ${sm.nowScreenY}`
                        : mergePreviewPath(g, layout.metrics);
                    return (
                      <AnimatedPath
                        key={id}
                        animatedProps={mergeFlowProps}
                        d={d}
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
                      cx={nowPt.x - (vertical ? 0 : 2)}
                      cy={nowPt.y}
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
                  cx={nowPt.x - (vertical ? 0 : 2)}
                  cy={nowPt.y}
                  fill={tk.accent}
                  theme={theme}
                  reducedMotion={reducedMotion}
                />
                <Circle
                  cx={nowPt.x - (vertical ? 0 : 2)}
                  cy={nowPt.y}
                  r={7}
                  fill={tk.accent}
                />
                <SvgText
                  x={vertical ? nowPt.x - 22 : layout.nowX - 8}
                  y={vertical ? nowPt.y + 4 : layout.mainY - 18}
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
                  // Summit: he plants and throws. No body tilt (the rotation
                  // has no origin and would swing him off the face) and no
                  // hop — he is hanging on a rope, not jumping at one.
                  tilt={vertical ? 0 : 9}
                  hop={vertical ? 2 : 10}
                  dx={(() => {
                    if (!hit) return 0;
                    const g = layout.geometries.find((x) => x.branchId === hit.branchId);
                    if (!g) return 0;
                    // Toward where the rope actually IS with the face turned
                    // as it is. On the summit he plants and THROWS, so it is a
                    // small forward pitch rather than a leap at the line.
                    const toward = Math.max(-70, Math.min(70, ringX(g) - mascot.pos.x));
                    return toward * (vertical ? 0.18 : 0.85);
                  })()}
                  dy={(() => {
                    if (!hit) return 0;
                    // He never leaves his altitude on the summit.
                    if (vertical) return 0;
                    const g = layout.geometries.find((x) => x.branchId === hit.branchId);
                    if (!g) return 0;
                    return Math.max(-44, Math.min(44, g.endY - mascot.pos.y)) * 0.85;
                  })()}
                >
                <Mascot
                  posX={mascot.posX}
                  posY={mascot.posY}
                  viewW={vertical ? size.width : layout.metrics.width}
                  runPhase={mascot.runPhase}
                  // A summit strike is a throw, so he keeps the frame he has
                  // — a LAND_A jolt would drop him off the rope he is on.
                  frame={hit && !hit.calm && !vertical ? "LAND_A" : mascot.frame}
                  flip={mascot.flip}
                  mascotType={mascot.mascotType}
                  // Summit: he shins up the rope he is quieting, and swings
                  // with it while he hangs there.
                  rise={mascot.rise}
                  sway={swayRide}
                  grip={gripRide}
                  bubbleO={grabPrompt ? undefined : mascot.bubbleO}
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
              {/* summit: the prompt pops on the focused rope itself */}
              {grabPrompt && (
                <RingG
                  opacity={1}
                  rot={vertical ? rotSV : null}
                  angle={grabPrompt.g.angle ?? 0}
                  radius={grabPrompt.g.radius ?? 0}
                >
                <GrabPrompt
                  key={grabPrompt.id}
                  x={grabPrompt.g.endX}
                  // above the grab band — not the dangling end, which hangs
                  // far below the screen once he has climbed, and high
                  // enough to clear the climber hanging there
                  y={grabPrompt.g.labelY - 104 - grabPrompt.rise}
                  text={t(
                    GRAB_PROMPTS[
                      (promptHash(grabPrompt.id) + Math.floor(nowTick / 86400000)) %
                        GRAB_PROMPTS.length
                    ],
                  )}
                  onPress={guarded(() => {
                    setArmedBranchId(null);
                    setOperation({
                      kind: "quick-touch",
                      branchId: grabPrompt.id,
                      expanded: true,
                    });
                  })}
                  tk={tk}
                  reducedMotion={reducedMotion}
                />
                </RingG>
              )}

              {!vertical && showMascot && mascot.visible && operation.kind === "idle" &&
                (() => {
                  const optId = mascot.arrivedBranchId;
                  if (!optId) return null;
                  // Offers only when Pip walked here on his own patrol — a
                  // thread the user opened themselves needs no suggestion.
                  if (mascot.arrivedVia !== "patrol") return null;
                  const b = branches.find((x) => x.id === optId);
                  if (!b || isClosed(b)) return null;
                  // Patrol only ever lands where an answer is still open.
                  if (handledToday(b, now)) return null;
                  const spriteW = PX * 12;
                  const spriteH = PX * 16;
                  const stageW = vertical ? svgWidth : layout.metrics.width;
                  const worldH = vertical && sm ? sm.timeLen : layout.height;
                  // Pip fades out at the canvas edges (viewing the past);
                  // his offers must never linger there half-clipped either.
                  if (
                    mascot.pos.x > stageW - 70 ||
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
                    mascot.pos.x + spriteW + 14 + bubbleW + 10 > stageW;
                  const pipOnScreen =
                    mascot.pos.x > -spriteW && mascot.pos.x < stageW - spriteW / 2;
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
                    worldH - 26 - (ROW_H * 1.5 + ROW_GAP + BUBBLE_PAD);
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
              </G>
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

        {/* topping out: the summit party — a burst around the climber and
            the banner that names the day */}
        {summitParty > 0 && vertical && (
          <View
            key={`summit-party-${summitParty}`}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              overflow: "hidden",
              zIndex: 8,
            }}
          >
            {!reducedMotion && (
              <CelebrationBurst
                theme={theme}
                nowX={nowPt.x - scrollXRef.current}
                mainY={anchorRestY}
                shimmer={tk.shimmer}
                accent={tk.accent}
                danger={tk.danger}
                spreadAxis="y"
                spreadLen={200}
              />
            )}
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: Math.max(20, anchorRestY - 170),
                alignItems: "center",
                gap: 6,
              }}
            >
              <T
                style={{
                  fontSize: 36,
                  lineHeight: 42,
                  fontWeight: "800",
                  color: tk.ink,
                  textAlign: "center",
                }}
              >
                {t("You did it!")}
              </T>
              <T style={{ fontSize: 15, color: tk.inkSoft, textAlign: "center" }}>
                {t("Every rope handled. The summit is yours today.")}
              </T>
            </View>
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
              nowX={vertical ? nowPt.x - scrollXRef.current : nowPt.x}
              mainY={vertical ? anchorRestY : nowPt.y}
              shimmer={tk.shimmer}
              accent={tk.accent}
              danger={tk.danger}
              spreadAxis={vertical ? "y" : "x"}
              spreadLen={routeLen}
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
                x0={
                  vertical
                    ? nowPt.x - scrollXRef.current - 3
                    : layout.nowX * (0.1 + (0.8 * i) / Math.max(1, bloom.count - 1))
                }
                y0={
                  vertical
                    ? anchorRestY + routeLen * (0.1 + (0.8 * i) / Math.max(1, bloom.count - 1))
                    : layout.mainY - 3
                }
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

        {/* the dates, pinned: lanes scroll behind them, they never move.
            The summit map hangs them on a rail along the right edge instead —
            the face scrolls sideways behind it. */}
        {!vertical && (
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
        )}
        {vertical && sm && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: SUMMIT_RAIL_W,
            zIndex: 5,
          }}
        >
          {/* The dates belong to the TIME frame: they hold their place beside
              the climber, exactly like the main line and Now. Hair-fine and
              unplated — the rock is sized to clear this strip (see faceHalfFor),
              so the numbers sit against sky, not rock. */}
          <Svg width={SUMMIT_RAIL_W} height={size.height}>
            <G>
              {ticks.map((tick) => {
                const y = dateToScreenY(tick.date, layout.window, sm.timeLen, sm.axisLen);
                if (y < -20 || y > size.height + 20) return null;
                // The day's NUMBER, taken from the date itself — the localized
                // label is "5 Sat" here but "Sat 5" or "Sa., 5." elsewhere, so
                // the digits must not be parsed out of it. Wider zoom levels
                // ("Sep", "2027") are already short enough to show as they are.
                // Daily ticks (localized "5 Sat" / "Sat 5" / "Today") shrink to
                // the day's number, taken from the date rather than parsed out
                // of the label; today's is in accent so it still reads at a
                // glance. Coarser zooms ("Sep", "2027") are short already.
                const daily = tick.label === "Today" || tick.label.includes(" ");
                const label = daily ? String(new Date(tick.date).getDate()) : tick.label;
                return (
                  <SvgText
                    key={tick.date}
                    x={SUMMIT_RAIL_W - 5}
                    y={y + 3}
                    textAnchor="end"
                    fontSize={8.5}
                    fontFamily={tk.fontBody}
                    fontWeight={tick.major ? "700" : "400"}
                    fill={tick.major ? tk.accent : tk.inkFaint}
                    opacity={tick.major ? 0.9 : 0.65}
                  >
                    {label}
                  </SvgText>
                );
              })}
            </G>
          </Svg>
        </View>
        )}

        {/* The ring of threads: one mark per rope around the mountain, the ones
            facing you filled. It is always there, so it is always visible that
            there are more threads than the face is showing — and tapping a
            mark turns that one to the front. */}
        {vertical && ropeAngles.length > 0 && (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 10,
              alignItems: "center",
              zIndex: 6,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                paddingVertical: 7,
                paddingHorizontal: 11,
                borderRadius: 999,
                backgroundColor: alpha(tk.bg, 0.82),
              }}
            >
              {ropeAngles.map((r) => {
                const facing = Math.cos(r.angle + rotRef.current);
                const front = facing > 0.55;
                const b = byId.get(r.id);
                const colour = b ? branchColor(b, theme) : tk.inkFaint;
                return (
                  <Pressable
                    key={r.id}
                    accessibilityRole="button"
                    accessibilityLabel={t("Turn the mountain to this rope")}
                    // Forced: pressing a rope's own mark is a deliberate ask
                    // to be shown it. The unforced guard exists to stop a tap
                    // on a ROPE from sliding it out from under the finger —
                    // here it just made the mark do nothing for any rope
                    // already part-way round.
                    onPress={guarded(() => turnToRef.current(r.id, true))}
                    hitSlop={8}
                  >
                    <View
                      style={{
                        width: front ? 9 : 6,
                        height: front ? 9 : 6,
                        borderRadius: 999,
                        backgroundColor: colour,
                        opacity: front ? 1 : facing > -0.2 ? 0.5 : 0.28,
                      }}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* One round +, unmistakable and wordless, floating on the water. */}
        {showFab && (
        <Pressable
          ref={fabTarget as never}
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
          // summit has no entry on purpose: THEME_COPY (src/ui/theme-copy.ts)
          // remaps "Bonk!" → "Chalk!" and "SUPER BONK!" → "FULL SEND!".
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
            // Summit: a rope answered today is coiled at its cliff ledge — it
            // is not on the face any more, so there is nothing there to chalk.
            // Sweeping it would quiet a thread that is already settled, at a
            // spot the climber cannot even stand.
            .filter((x) => !vertical || !handledToday(x.b, now));
          /**
           * The order the sweep works in. On the summit it runs ROUND THE RING
           * in one direction, so every rope — including the ones round the back
           * — is turned to the front and chalked in turn. Sorting by `endX` (a
           * rope's un-turned rest column) made him zig-zag as soon as the face
           * had been turned at all, and never brought the hidden ones round.
           * Elsewhere: top → bottom through the lanes, as before.
           *
           * The order cannot reshuffle mid-sweep even though chalking changes
           * `laneY`: the loudness pull is at most 0.45 of a lane gap per side,
           * so two adjacent lanes can never cross.
           */
          const sweepIds = (): string[] => {
            if (!vertical) {
              return openTargets
                .slice()
                .sort((a, bx) => (a.g!.endY ?? 0) - (bx.g!.endY ?? 0))
                .map((x) => x.b.id);
            }
            const ring = openTargets
              .filter((x) => x.g!.angle !== undefined)
              .map((x) => ({ id: x.b.id, angle: x.g!.angle as number }))
              .sort((a, bx) => a.angle - bx.angle);
            const offRing = openTargets
              .filter((x) => x.g!.angle === undefined)
              .map((x) => x.b.id);
            if (ring.length === 0) return offRing;
            // Start from the end of the ring FARTHER from the front, so the
            // sweep ends near where the mountain already was: the one long
            // turn happens at the start, where it reads as "here we go",
            // rather than whipping round over the celebration.
            const rot = rotRef.current;
            let front = 0;
            for (let i = 1; i < ring.length; i++) {
              if (Math.cos(ring[i].angle + rot) > Math.cos(ring[front].angle + rot)) front = i;
            }
            const order = front < ring.length / 2 ? ring.slice().reverse() : ring;
            return [...order.map((r) => r.id), ...offRing];
          };
          const superReady = bonkCharge >= 100 && openTargets.length > 0;
          const fireSuperBonk = () => {
            if (!superReady) return;
            consumeSuperBonk();
            const ids = sweepIds();
            if (reducedMotion) {
              // No run — the bonks land one after another on their own.
              ids.forEach((id, i) => setTimeout(() => void attackBranch(id), i * 160));
              return;
            }
            mascot.superBonk(ids, (id) => void attackBranch(id));
          };
          return (
            <View
              ref={bonkTarget as never}
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
          // summit's date rail owns the right edge: the button steps left of it
          <View style={{ position: "absolute", top: 12, right: vertical ? SUMMIT_RAIL_W + 14 : 14.4, zIndex: 5 }}>
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
            const x0 = vertical
              ? Math.max(8, Math.min(g.labelX - scrollXRef.current, size.width - 80))
              : Math.min(g.labelX, layout.metrics.width - 80);
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
                    dx={(vertical ? nowPt.x - scrollXRef.current : layout.nowX - 24) - x0}
                    dy={nowPt.y - g.labelY}
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
            const x0 = vertical
              ? Math.max(8, Math.min(g.labelX - scrollXRef.current, size.width - 60))
              : Math.min(g.labelX, layout.metrics.width - 60);
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
                    dx={(vertical ? nowPt.x - scrollXRef.current : layout.nowX - 24) - x0}
                    dy={nowPt.y - g.labelY}
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
