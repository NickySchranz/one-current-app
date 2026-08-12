/**
 * Mascot brain: state machine, branch selection, position tracking, reactions.
 * Uses rAF for smooth arc animation — works on web + native.
 *
 * State machine: IDLE → JUMPING → LANDING → INSPECTING → TALKING → IDLE …
 *                             ↑
 *               showReaction() can interrupt at any non-jumping point
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { PsychologicalBranch } from "@/domain/branches/types";
import type { BranchGeometry } from "@/visualization/branch-lines/paths";
import { isClosed } from "@/domain/branches/logic";
import type { FrameName, MascotType } from "./mascot-frames";

const PX = 2.2; // must match PX in mascot-frames.ts

// ─── Types ────────────────────────────────────────────────────────────────────

export type MascotPos = { x: number; y: number };

export type MascotState = {
  pos: MascotPos;
  frame: FrameName;
  flip: number;
  bubbleOpacity: number;
  bubbleText: string;
  mascotType: MascotType;
  inspectedBranchId: string | null;
  onPress: () => void;
  showReaction: (text: string) => void;
  /** Run to a specific branch immediately (called when user taps a branch). */
  focusBranch: (branchId: string) => void;
  visible: boolean;
};

// ─── Reaction text libraries ─────────────────────────────────────────────────

export const REACTION_MERGE = [
  "HANDLED. One less thing, boss!",
  "That's done. I got you.",
  "CLEARED! You're lighter now.",
  "Merged it. Nailed it.",
  "That thread is FREE!",
  "Done and dusted, boss.",
  "Let it go! Yes!",
];

export const REACTION_BORN = [
  "New thread? On it, boss.",
  "Got it logged. I'm watching this.",
  "Named it — that's step one done.",
  "I see this. Won't lose it.",
  "Got your back on this one.",
];

export const REACTION_ACTION = [
  "PLAN LOCKED. Let's go!",
  "Decided. Your future self thanks you!",
  "That's a real move. Love it.",
  "Done! Moving forward together.",
  "Action taken. That's how we roll.",
];

export const REACTION_NOTE = [
  "Got it. Witnessed, boss.",
  "Recorded — nothing gets lost on my watch.",
  "I heard that. Logged.",
  "Got it, boss. Keep going.",
];

export const REACTION_MERGE_DEEP = [
  "HUGE ONE. You really did that!",
  "BOSS MODE. That was a big one.",
  "That was heavy and you handled it!",
  "BIG WIN. I felt that one too.",
];

export function randomFrom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Action text (for branch inspection) ─────────────────────────────────────

function actionText(b: PsychologicalBranch): string {
  if (b.loudness >= 4) return "This one's LOUD, boss. Handle it?";
  if (b.status === "ready-to-merge") return "Boss, this one's ready to close!";
  if (b.status === "waiting-with-boundaries") return "Still waiting on this one…";
  if (b.status === "needs-support") return "This might need some backup.";
  if (b.type === "identity") return "Deep stuff. Worth a sit-down.";
  if (b.type === "projection") return "Future worry — let's look together.";
  if (b.commits.length === 0) return "Nothing here yet — add a note?";
  return "How's this one going, boss?";
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreBranch(
  b: PsychologicalBranch,
  g: BranchGeometry,
  nowX: number,
  lastVisited: Map<string, number>,
): number {
  if (isClosed(b)) return -Infinity;
  if (!g.inWindow) return -Infinity;
  if (nowX > 0 && g.endX > nowX + 20) return -Infinity;

  const msSince = Date.now() - (lastVisited.get(b.id) ?? 0);
  let score = b.loudness * 2;
  if (b.status === "waiting-with-boundaries") score += 3;
  if (b.status === "ready-to-merge") score += 4;
  if (b.status === "needs-support") score += 2;
  score += Math.min(msSince / 20_000, 5);
  score += Math.random() * 1.5;
  return score;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ─── Mascot type selection ────────────────────────────────────────────────────

function pickMascotType(): MascotType {
  const types: MascotType[] = ['chronicler', 'wisp', 'wanderer'];
  return types[Math.floor(Math.random() * types.length)];
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useMascot(
  branches: PsychologicalBranch[],
  geometries: BranchGeometry[],
  nowX: number,
  onSelectBranch: (id: string) => void,
  mascotType: MascotType,
): MascotState {
  // Stable refs for latest values
  const branchesRef = useRef(branches);
  branchesRef.current = branches;
  const geometriesRef = useRef(geometries);
  geometriesRef.current = geometries;
  const nowXRef = useRef(nowX);
  nowXRef.current = nowX;
  const onSelectRef = useRef(onSelectBranch);
  onSelectRef.current = onSelectBranch;

  const lastVisited = useRef(new Map<string, number>());
  const phase = useRef<'idle'|'jumping'|'landing'|'inspecting'|'talking'|'reacting'>('idle');
  const inspectedId = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const initialised = useRef(false);
  // Mutable position ref so waypoint runner can read current pos without setState callback
  const posRef = useRef<MascotPos>({ x: -999, y: -999 });
  // Rendering state
  const [pos, setPos] = useState<MascotPos>({ x: -999, y: -999 });
  const [frame, setFrame] = useState<FrameName>('IDLE_A');
  const [flip, setFlip] = useState(1);
  const [bubbleOpacity, setBubbleOpacity] = useState(0);
  const [bubbleText, setBubbleText] = useState('');
  const [inspectedIdState, setInspectedIdState] = useState<string | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
  };
  const cancelRaf = () => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };

  // Smooth bubble fade
  const bubbleOpacityRef = useRef(0);
  const fadeBubble = useCallback((target: number, ms: number) => {
    const start = bubbleOpacityRef.current;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const v = start + (target - start) * t;
      bubbleOpacityRef.current = v;
      setBubbleOpacity(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    cancelRaf();
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const jumpRef = useRef<() => void>(() => {});

  // ── Waypoint runner ──
  // Runs Pip through an array of {x,y} waypoints one segment at a time.
  // Each segment is a straight angular run; flip updates per segment so Pip
  // faces his current direction. This gives the jagged "managing things" gait.
  const runWaypoints = useCallback((
    waypoints: Array<{x: number; y: number}>,
    onDone: () => void,
    pxPerMs = 0.16,  // slow: ~160px/second
  ) => {
    let idx = 0;
    let lastToggle = performance.now();
    let runA = true;

    const step = () => {
      if (idx >= waypoints.length) { onDone(); return; }
      const wp = waypoints[idx];
      const cur = posRef.current;
      const dx = wp.x - cur.x, dy_ = wp.y - cur.y;
      const dist = Math.hypot(dx, dy_) || 1;
      const duration = Math.max(120, dist / pxPerMs);

      // Face the direction of this segment
      setFlip(dx >= 0 ? 1 : -1);

      const t0 = performance.now();
      const fromX = cur.x, fromY = cur.y;

      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const nx = fromX + dx * t;
        const ny = fromY + dy_ * t;
        posRef.current = { x: nx, y: ny };
        setPos({ x: nx, y: ny });

        if (now - lastToggle >= 115) {
          runA = !runA;
          setFrame(runA ? 'RUN_A' : 'RUN_B');
          lastToggle = now;
        }

        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          posRef.current = { x: wp.x, y: wp.y };
          setPos({ x: wp.x, y: wp.y });
          idx++;
          step();
        }
      };

      cancelRaf();
      rafRef.current = requestAnimationFrame(tick);
    };

    step();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build jagged waypoints between two positions.
  // Uses angular zigzag: offset perpendicular to main direction alternating sides.
  const makeZigWaypoints = (
    fromX: number, fromY: number,
    toX: number,   toY: number,
    zigCount: number, zigW: number,
  ): Array<{x: number; y: number}> => {
    const dist = Math.hypot(toX - fromX, toY - fromY);
    if (dist < 40) return [{ x: toX, y: toY }];   // too close, go straight
    const dirX = (toX - fromX) / dist, dirY = (toY - fromY) / dist;
    const perpX = -dirY, perpY = dirX;
    const wps: Array<{x: number; y: number}> = [];
    for (let i = 0; i < zigCount; i++) {
      const t = (i + 1) / (zigCount + 1);
      const side = (i % 2 === 0 ? 1 : -1) * zigW;
      wps.push({
        x: fromX + (toX - fromX) * t + perpX * side,
        y: fromY + (toY - fromY) * t + perpY * side,
      });
    }
    wps.push({ x: toX, y: toY });
    return wps;
  };

  // Track geometry changes AND escape from closed branches
  useEffect(() => {
    const id = inspectedId.current;
    if (!id) return;
    if (phase.current === 'jumping') return;

    // If the inspected branch is now closed, leave immediately
    const branch = branchesRef.current.find(b => b.id === id);
    if (branch && isClosed(branch)) {
      inspectedId.current = null;
      setInspectedIdState(null);
      clearTimer(); cancelRaf();
      timerRef.current = setTimeout(() => jumpRef.current(), 400);
      return;
    }

    const geo = geometries.find(g => g.branchId === id);
    if (!geo) return;
    const tx = geo.endX + 10;
    const ty = geo.endY - PX * 10;
    const cur = posRef.current;
    if (Math.abs(cur.x - tx) >= 1 || Math.abs(cur.y - ty) >= 1) {
      posRef.current = { x: tx, y: ty };
      setPos({ x: tx, y: ty });
    }
  }, [geometries, branches]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Talking phase ──
  const startTalking = useCallback((branchId: string) => {
    const b = branchesRef.current.find(br => br.id === branchId);
    if (b) {
      setBubbleText(actionText(b));
      fadeBubble(1, 220);
    }
    phase.current = 'talking';
    const tick = (step: number) => {
      setFrame(step % 2 === 0 ? 'TALK_A' : 'TALK_B');
      if (step < 4) {
        timerRef.current = setTimeout(() => tick(step + 1), 480);
      } else {
        fadeBubble(0, 200);
        timerRef.current = setTimeout(() => {
          phase.current = 'idle';
          setFrame('IDLE_A');
          lastVisited.current.set(branchId, Date.now());
          timerRef.current = setTimeout(() => jumpRef.current(), 2500 + Math.random() * 2000);
        }, 350);
      }
    };
    tick(0);
  }, [fadeBubble]);

  // ── Landing ──
  const onLanded = useCallback((branchId: string) => {
    phase.current = 'landing';
    inspectedId.current = branchId;
    setInspectedIdState(branchId);
    setFrame('LAND_A');
    timerRef.current = setTimeout(() => {
      phase.current = 'inspecting';
      setFrame('INSPECT_A');
      timerRef.current = setTimeout(() => {
        setFrame('INSPECT_B');
        timerRef.current = setTimeout(() => startTalking(branchId), 500);
      }, 600);
    }, 160);
  }, [startTalking]);

  // ── Jump ──
  const jumpToNext = useCallback(() => {
    const bs = branchesRef.current;
    const gs = geometriesRef.current;
    const nX = nowXRef.current;
    const geoMap = new Map(gs.map(g => [g.branchId, g]));

    let best: PsychologicalBranch | null = null;
    let bestScore = -Infinity;
    for (const b of bs) {
      const g = geoMap.get(b.id);
      if (!g) continue;
      const s = scoreBranch(b, g, nX, lastVisited.current);
      if (s > bestScore) { bestScore = s; best = b; }
    }
    if (!best || bestScore === -Infinity) return;
    const destGeo = geoMap.get(best.id)!;

    const toX = destGeo.endX + 10;
    const toY = destGeo.endY - PX * 10;

    const cur = posRef.current;
    // 3 zigzag waypoints, 38px wide offset — jagged and frantic
    const wps = makeZigWaypoints(cur.x, cur.y, toX, toY, 3, 38);
    phase.current = 'jumping';
    setFrame('RUN_A');
    const targetId = best.id;
    runWaypoints(wps, () => onLanded(targetId), 0.16);
  }, [onLanded, runWaypoints]); // eslint-disable-line react-hooks/exhaustive-deps

  jumpRef.current = jumpToNext;

  // ── External reaction trigger (called by LifeTimeline on actions) ──
  const showReaction = useCallback((text: string) => {
    if (phase.current === 'jumping') return; // don't interrupt mid-air
    clearTimer(); cancelRaf();
    phase.current = 'reacting';
    fadeBubble(0, 100);
    timerRef.current = setTimeout(() => {
      setBubbleText(text);
      fadeBubble(1, 200);
      setFrame('REACT');
      timerRef.current = setTimeout(() => {
        fadeBubble(0, 250);
        timerRef.current = setTimeout(() => {
          phase.current = 'idle';
          setFrame('IDLE_A');
          timerRef.current = setTimeout(() => jumpRef.current(), 1500);
        }, 350);
      }, 2800);
    }, 120);
  }, [fadeBubble]);

  // ── Idle bob ──
  useEffect(() => {
    let s = false;
    const id = setInterval(() => {
      if (phase.current === 'idle') { setFrame(s ? 'IDLE_B' : 'IDLE_A'); s = !s; }
    }, 380);
    return () => clearInterval(id);
  }, []);

  // ── Focus: run to a specific branch when user taps it ──
  const focusBranch = useCallback((branchId: string) => {
    const geo = geometriesRef.current.find(g => g.branchId === branchId);
    if (!geo) return;

    const toX = geo.endX + 10;
    const toY = geo.endY - PX * 10;

    // Already there — just update focus silently
    if (inspectedId.current === branchId && phase.current !== 'jumping') {
      inspectedId.current = branchId;
      setInspectedIdState(branchId);
      return;
    }

    clearTimer(); cancelRaf();
    inspectedId.current = branchId;
    setInspectedIdState(branchId);

    const cur = posRef.current;
    // 2 waypoints for a snappier focus-run, slightly faster
    const wps = makeZigWaypoints(cur.x, cur.y, toX, toY, 2, 30);
    phase.current = 'jumping';
    setFrame('RUN_A');
    runWaypoints(wps, () => {
      posRef.current = { x: toX, y: toY };
      setPos({ x: toX, y: toY });
      setFrame('INSPECT_A');
      phase.current = 'inspecting';
      const focusTexts = [
        "On it, boss!", "Right, I see this one.", "Got you!", "Let's look at this.",
      ];
      setBubbleText(randomFrom(focusTexts));
      fadeBubble(1, 150);
      timerRef.current = setTimeout(() => {
        fadeBubble(0, 200);
        timerRef.current = setTimeout(() => { phase.current = 'idle'; setFrame('IDLE_A'); }, 350);
      }, 1800);
    }, 0.20); // slightly faster for the responsive focus-tap
  }, [fadeBubble, runWaypoints]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bootstrap ──
  const hasGreeted = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    const geoMap = new Map(geometries.map(g => [g.branchId, g]));
    const open = branches.filter(b => !isClosed(b));
    if (open.length === 0) return;

    let best = open[0], geo = geoMap.get(best.id);
    for (const b of open) {
      const g = geoMap.get(b.id);
      if (g && b.loudness > best.loudness) { best = b; geo = g; }
    }
    if (!geo) {
      for (const b of open) {
        const g = geoMap.get(b.id);
        if (g) { best = b; geo = g; break; }
      }
    }
    if (!geo) return;

    initialised.current = true;
    const startPos = { x: geo.endX + 10, y: geo.endY - PX * 10 };
    posRef.current = startPos;
    setPos(startPos);
    inspectedId.current = best.id;
    setInspectedIdState(best.id);

    // Greet on first appearance
    if (!hasGreeted.current) {
      hasGreeted.current = true;
      const greetings = [
        "I got it, boss! Working on these with you.",
        "Don't worry — I'm keeping an eye on everything.",
        "Hey boss! Your threads are in good hands.",
        "On the job! I got these timelines.",
      ];
      timerRef.current = setTimeout(() => {
        setBubbleText(randomFrom(greetings));
        fadeBubble(1, 250);
        timerRef.current = setTimeout(() => {
          fadeBubble(0, 300);
          timerRef.current = setTimeout(() => jumpRef.current(), 500);
        }, 2500);
      }, 1200);
    } else {
      timerRef.current = setTimeout(() => jumpRef.current(), 3000);
    }
  }, [branches, geometries, fadeBubble]);

  useEffect(() => () => { clearTimer(); cancelRaf(); }, []);

  const onPress = useCallback(() => {
    if (inspectedId.current) onSelectRef.current(inspectedId.current);
  }, []);

  const visible = branches.some(b => !isClosed(b));

  return {
    pos, frame, flip,
    bubbleOpacity, bubbleText,
    mascotType,
    inspectedBranchId: inspectedIdState,
    onPress, showReaction, focusBranch, visible,
  };
}
