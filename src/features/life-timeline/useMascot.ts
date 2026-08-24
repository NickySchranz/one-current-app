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
import { restingToday } from "@/visualization/branch-lines/style";
import { decidedToday } from "@/domain/feelings/logic";
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
  pendingBranchId: string | null;
  onPress: () => void;
  showReaction: (text: string) => void;
  focusBranch: (branchId: string) => void;
  /** Localised phrase pools — use for reactions dispatched from outside the hook. */
  phrases: Phrases;
  visible: boolean;
};

// ─── Phrase libraries (English + Spanish) ────────────────────────────────────

type Phrases = {
  merge: string[];
  mergeDeep: string[];
  born: string[];
  action: string[];
  note: string[];
  greet: string[];
  focus: string[];
  attack: string[];
  attackCalm: string[];
  action_loud: string;
  action_ready: string;
  action_waiting: string;
  action_support: string;
  action_identity: string;
  action_projection: string;
  action_empty: string;
  action_default: string;
};

const EN: Phrases = {
  attack:     ["TAKE THAT.", "Quieter now, hm?", "Down a notch. You're welcome.", "BONK. Handled.", "It'll think twice, boss."],
  attackCalm: ["This one's already quiet, boss.", "Nothing to hit — it's calm.", "Shh. It's resting already."],
  merge:      ["HANDLED. One less thing, boss!", "That's done. I got you.", "CLEARED! You're lighter now.", "Merged it. Nailed it.", "That thread is FREE!", "Done and dusted, boss.", "Let it go! Yes!"],
  mergeDeep:  ["HUGE ONE. You really did that!", "BOSS MODE. That was a big one.", "That was heavy and you handled it!", "BIG WIN. I felt that one too."],
  born:       ["New thread? On it, boss.", "Got it logged. I'm watching this.", "Named it — that's step one done.", "I see this. Won't lose it.", "Got your back on this one."],
  action:     ["PLAN LOCKED. Let's go!", "Decided. Your future self thanks you!", "That's a real move. Love it.", "Done! Moving forward together.", "Action taken. That's how we roll."],
  note:       ["Got it. Witnessed, boss.", "Recorded — nothing gets lost on my watch.", "I heard that. Logged.", "Got it, boss. Keep going."],
  greet:      ["I got it, boss! Working on these with you.", "Don't worry — I'm keeping an eye on everything.", "Hey boss! Your threads are in good hands.", "On the job! I got these timelines."],
  focus:      ["On it, boss!", "Right, I see this one.", "Got you!", "Let's look at this."],
  action_loud:       "This one's LOUD, boss. Handle it?",
  action_ready:      "Boss, this one's ready to close!",
  action_waiting:    "Still waiting on this one…",
  action_support:    "This might need some backup.",
  action_identity:   "Deep stuff. Worth a sit-down.",
  action_projection: "Future worry — let's look together.",
  action_empty:      "Nothing here yet — add a note?",
  action_default:    "How's this one going, boss?",
};

// Spanish — culturally warm, uses "jefe/a" (boss) which is casual and affectionate
// in Latin American Spanish. Phrases are direct, expressive and celebratory.
const ES: Phrases = {
  attack:     ["¡TOMA YA!", "Más callado ahora, ¿eh?", "Un punto menos. De nada.", "¡PUM! Controlado.", "Se lo pensará dos veces, jefe."],
  attackCalm: ["Este ya está tranquilo, jefe.", "Nada que golpear — está en calma.", "Shh. Ya descansa."],
  merge:      ["¡Listo, jefe! ¡Una menos que cargar!", "¡Cerrado! Eso ya no pesa.", "¡HECHO! Ya respiras mejor.", "Integrado. Bien jugado.", "¡Ese hilo es libre! ¡Dale!", "¡Terminado! Sin vueltas.", "¡Soltado! ¡Sí, así!"],
  mergeDeep:  ["¡ESE ERA GRANDE, JEFE! ¡Lo lograste!", "¡NIVEL CAPI! Ese era pesado de verdad.", "Era un hilo de peso y lo manejaste. ¡Brutal!", "¡GOLAZO! Lo sentí yo también."],
  born:       ["¿Nuevo hilo? En eso estoy, jefe.", "Anotado. Le tengo el ojo encima.", "Nombrado — eso ya es el primer paso.", "Lo veo. No lo pierdo de vista.", "Te cubro en este."],
  action:     ["¡PLAN LISTO! ¡Vamos!", "Decidido. Tu yo del futuro te lo agradece.", "Eso es movimiento real. Me gusta.", "¡Listo! Avanzando juntos.", "Acción tomada. Así se hace, jefe."],
  note:       ["Anotado. Testigo de ello.", "Registrado — nada se pierde aquí.", "Te escucho. Guardado.", "Listo, jefe. Sigue adelante."],
  greet:      ["¡Yo me encargo, jefe! Trabajando contigo en esto.", "No te preocupes — tengo el ojo en todo.", "¡Oye, jefe! Tus hilos están en buenas manos.", "¡En ello! Me ocupo de estos hilos."],
  focus:      ["¡Aquí estoy, jefe!", "Claro, a ver este.", "¡Te tengo!", "Veamos esto juntos."],
  action_loud:       "¡Este hilo está FUERTE, jefe! ¿Lo resolvemos?",
  action_ready:      "¡Jefe, este ya está listo para cerrar!",
  action_waiting:    "Todavía esperando por este…",
  action_support:    "Este puede necesitar un apoyo extra.",
  action_identity:   "Cosa profunda. Vale la pena sentarse con ella.",
  action_projection: "Preocupación futura — mirémosla juntos.",
  action_empty:      "Nada aquí aún. ¿Le añades una nota?",
  action_default:    "¿Cómo va este, jefe?",
};

// Colombia variant: slightly warmer slang ("parce" = friend/buddy)
const ES_CO: Phrases = {
  ...ES,
  attack:     ["¡TOME PUES!", "Más callado ahora, ¿cierto?", "Un punto menos. Con gusto.", "¡PUM! Controlado.", "Lo va a pensar dos veces, parce."],
  attackCalm: ["Este ya está tranquilo, parce.", "Nada que golpear — está en calma.", "Shh. Ya descansa."],
  merge:      ["¡Listo, parce! ¡Una menos!", "¡Cerrado! Eso ya no pesa, parcero.", "¡HECHO! Ya respiras mejor.", "Integrado. Bien jugado.", "¡Ese hilo quedó libre! ¡Uy!", "¡Terminado, parcero!", "¡Soltado! ¡Sí señor!"],
  mergeDeep:  ["¡ESE ERA GRANDÍSIMO, PARCE! ¡Lo lograste!", "¡MODO CRACK! Ese era muy pesado.", "Era un hilo tenaz y lo manejaste. ¡Qué chimba!", "¡GOLAZO, PARCE! Lo sentí yo también."],
  born:       ["¿Nuevo hilo? En eso estoy, parce.", "Anotado. Le tengo el ojo encima.", "Nombrado — eso ya es el primer paso.", "Lo veo. No lo pierdo de vista.", "Te cubro en este, parcero."],
  greet:      ["¡Yo me encargo, parce! Trabajando contigo.", "No te preocupes — tengo el ojo en todo.", "¡Oye, parce! Tus hilos están en buenas manos.", "¡En ello! Me ocupo de estos hilos."],
  focus:      ["¡Aquí estoy, parce!", "Claro, a ver este.", "¡Te tengo, parcero!", "Veamos esto juntos."],
  action_loud:       "¡Este hilo está TENAZ, parce! ¿Lo resolvemos?",
  action_default:    "¿Cómo va este, parce?",
};

function getLang(language: string): Phrases {
  if (language === "es-CO") return ES_CO;
  if (language === "es") return ES;
  return EN;
}

export const REACTION_MERGE      = EN.merge;
export const REACTION_MERGE_DEEP = EN.mergeDeep;
export const REACTION_BORN       = EN.born;
export const REACTION_ACTION     = EN.action;
export const REACTION_NOTE       = EN.note;

export function randomFrom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Action text (localised) ──────────────────────────────────────────────────

function actionText(b: PsychologicalBranch, lang: Phrases): string {
  if (b.loudness >= 4) return lang.action_loud;
  if (b.status === "ready-to-merge") return lang.action_ready;
  if (b.status === "waiting-with-boundaries") return lang.action_waiting;
  if (b.status === "needs-support") return lang.action_support;
  if (b.type === "identity") return lang.action_identity;
  if (b.type === "projection") return lang.action_projection;
  if (b.commits.length === 0) return lang.action_empty;
  return lang.action_default;
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
  // Skip branches already handled today — Pip only patrols undecided threads
  const now = new Date();
  if (decidedToday(b, now) || restingToday(b, now)) return -Infinity;

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
  patrolEnabled: boolean,
  viewingIntegrated: boolean,
  language: string,
  /**
   * The thread the user is focused on (armed for a bonk, or the one an open
   * panel concerns). While set, Pip runs to it, stays at it, and never
   * patrols away — until the hold is released by another interaction.
   */
  heldBranchId: string | null = null,
  /** A thread mid-destruction (burning): patrol never lands on it. */
  avoidBranchId: string | null = null,
): MascotState {
  const lang = getLang(language);
  // Stable refs for latest values
  const branchesRef = useRef(branches);
  branchesRef.current = branches;
  const geometriesRef = useRef(geometries);
  geometriesRef.current = geometries;
  const nowXRef = useRef(nowX);
  nowXRef.current = nowX;
  const onSelectRef = useRef(onSelectBranch);
  onSelectRef.current = onSelectBranch;

  const patrolEnabledRef = useRef(patrolEnabled);
  patrolEnabledRef.current = patrolEnabled;
  const pendingPatrol = useRef(false); // set when patrol is blocked mid-cycle
  const viewingIntegratedRef = useRef(viewingIntegrated);
  viewingIntegratedRef.current = viewingIntegrated;
  const heldRef = useRef(heldBranchId);
  heldRef.current = heldBranchId;
  const avoidRef = useRef(avoidBranchId);
  avoidRef.current = avoidBranchId;

  const lastVisited = useRef(new Map<string, number>());
  const phase = useRef<'idle'|'jumping'|'landing'|'inspecting'|'talking'|'reacting'>('idle');
  const inspectedId = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const initialised = useRef(false);
  // Live jump destination — updated when geometries change during a jump
  const jumpDestRef = useRef<{ x: number; y: number; branchId: string } | null>(null);
  // Guard against re-entrant mid-jump re-routes
  const reroutingRef = useRef(false);
  // Mutable position ref so waypoint runner can read current pos without setState callback
  const posRef = useRef<MascotPos>({ x: -999, y: -999 });
  // Rendering state
  const [pos, setPos] = useState<MascotPos>({ x: -999, y: -999 });
  const [frame, setFrame] = useState<FrameName>('IDLE_A');
  const [flip, setFlip] = useState(1);
  const [bubbleOpacity, setBubbleOpacity] = useState(0);
  const [bubbleText, setBubbleText] = useState('');
  const [inspectedIdState, setInspectedIdState] = useState<string | null>(null);
  const [pendingIdState, setPendingIdState] = useState<string | null>(null);

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
  const focusBranchRef = useRef<(id: string) => void>(() => {});

  // The only door back to patrol. While the user holds a thread (or a panel
  // is open, or they browse the past) the jump is parked, not scheduled —
  // the hold-release / panel-close effects reopen the door.
  const scheduleJump = useCallback((delay: number) => {
    if (heldRef.current || !patrolEnabledRef.current || viewingIntegratedRef.current) {
      pendingPatrol.current = true;
      return;
    }
    timerRef.current = setTimeout(() => jumpRef.current(), delay);
  }, []);

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

  // Track geometry changes, escape closed branches, and re-route mid-jump if the
  // timeline is panned so the destination drifts significantly.
  // When the user is browsing past integrations, Pip freezes — he lives in today.
  useEffect(() => {
    if (viewingIntegratedRef.current) return;
    const id = inspectedId.current;
    if (!id) return;

    // Never track closed/merged branches — they live in the past. A DELETED
    // branch (burned away) must be escaped the same way, or Pip freezes at a
    // dead spot with no patrol timer ever coming.
    const branch = branchesRef.current.find(b => b.id === id);
    if (!branch || isClosed(branch)) {
      if (heldRef.current === id) return; // stale hold — the caller clears it
      inspectedId.current = null;
      setInspectedIdState(null);
      clearTimer(); cancelRaf();
      scheduleJump(400); // parks as pendingPatrol when a panel is open
      return;
    }

    const geo = geometries.find(g => g.branchId === id);
    if (!geo) return;
    const tx = geo.endX + 10;
    const ty = geo.endY - PX * 10;

    if (phase.current === 'jumping') {
      // Update the live destination ref so the landing callback uses fresh coords
      if (jumpDestRef.current?.branchId === id) {
        jumpDestRef.current = { x: tx, y: ty, branchId: id };
      }
      // If the destination has drifted far (user panned), cancel and re-route
      // directly without zigzag so the mascot cleanly tracks the branch.
      const dest = jumpDestRef.current;
      if (!reroutingRef.current && dest && (Math.abs(dest.x - tx) > 25 || Math.abs(dest.y - ty) > 25)) {
        reroutingRef.current = true;
        cancelRaf();
        jumpDestRef.current = { x: tx, y: ty, branchId: id };
        const wps = [{ x: tx, y: ty }]; // straight line to new destination
        runWaypoints(wps, () => {
          reroutingRef.current = false;
          posRef.current = { x: tx, y: ty };
          setPos({ x: tx, y: ty });
          setPendingIdState(null);
          onLanded(id);
        }, 0.28);
      }
      return;
    }

    // Stationary — snap to follow the branch (handles panning + loudness shifts).
    // Pip naturally scrolls off-screen when the user pans away from today.
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
      setBubbleText(actionText(b, lang));
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
          scheduleJump(2500 + Math.random() * 2000);
        }, 350);
      }
    };
    tick(0);
  }, [fadeBubble, scheduleJump]);

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
    // A held thread pins him — a stale timer must never pull him off it.
    if (heldRef.current) { pendingPatrol.current = true; return; }
    const bs = branchesRef.current;
    const gs = geometriesRef.current;
    const nX = nowXRef.current;
    const geoMap = new Map(gs.map(g => [g.branchId, g]));

    let best: PsychologicalBranch | null = null;
    let bestScore = -Infinity;
    for (const b of bs) {
      if (b.id === avoidRef.current) continue; // burning line — never land on it
      const g = geoMap.get(b.id);
      if (!g) continue;
      const s = scoreBranch(b, g, nX, lastVisited.current);
      if (s > bestScore) { bestScore = s; best = b; }
    }
    if (!best || bestScore === -Infinity) return;
    const destGeo = geoMap.get(best.id)!;

    const toX = destGeo.endX + 10;
    const toY = destGeo.endY - PX * 10;

    const targetId = best.id;
    jumpDestRef.current = { x: toX, y: toY, branchId: targetId };

    // Highlight the destination branch immediately, then pause briefly before
    // Pip starts running so the user sees which timeline he's heading to.
    setPendingIdState(targetId);
    setInspectedIdState(targetId);

    timerRef.current = setTimeout(() => {
      const cur = posRef.current;
      const wps = makeZigWaypoints(cur.x, cur.y, toX, toY, 3, 38);
      phase.current = 'jumping';
      setFrame('RUN_A');
      runWaypoints(wps, () => {
        // Use live geometry in case timeline was panned during the run
        const liveGeo = geometriesRef.current.find(g => g.branchId === targetId);
        const fx = liveGeo ? liveGeo.endX + 10 : (jumpDestRef.current?.x ?? toX);
        const fy = liveGeo ? liveGeo.endY - PX * 10 : (jumpDestRef.current?.y ?? toY);
        posRef.current = { x: fx, y: fy };
        setPos({ x: fx, y: fy });
        jumpDestRef.current = null;
        reroutingRef.current = false;
        setPendingIdState(null);
        onLanded(targetId);
      }, 0.16);
    }, 500); // 500 ms highlight before he moves
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
          scheduleJump(1500);
        }, 350);
      }, 2800);
    }, 120);
  }, [fadeBubble, scheduleJump]);

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
    reroutingRef.current = false;
    inspectedId.current = branchId;
    setInspectedIdState(branchId);
    jumpDestRef.current = { x: toX, y: toY, branchId };

    const cur = posRef.current;
    // 2 waypoints for a snappier focus-run, slightly faster
    const wps = makeZigWaypoints(cur.x, cur.y, toX, toY, 2, 30);
    phase.current = 'jumping';
    setFrame('RUN_A');
    runWaypoints(wps, () => {
      // Use live geometry in case timeline was panned
      const liveGeo = geometriesRef.current.find(g => g.branchId === branchId);
      const fx = liveGeo ? liveGeo.endX + 10 : (jumpDestRef.current?.x ?? toX);
      const fy = liveGeo ? liveGeo.endY - PX * 10 : (jumpDestRef.current?.y ?? toY);
      posRef.current = { x: fx, y: fy };
      setPos({ x: fx, y: fy });
      jumpDestRef.current = null;
      reroutingRef.current = false;
      setFrame('INSPECT_A');
      phase.current = 'inspecting';
      setBubbleText(randomFrom(lang.focus));
      fadeBubble(1, 150);
      timerRef.current = setTimeout(() => {
        fadeBubble(0, 200);
        timerRef.current = setTimeout(() => {
          phase.current = 'idle';
          setFrame('IDLE_A');
          // Resume patrol after a passing focus; a held thread keeps him here.
          scheduleJump(2000 + Math.random() * 1500);
        }, 350);
      }, 1800);
    }, 0.20);
  }, [fadeBubble, runWaypoints, lang, scheduleJump]); // eslint-disable-line react-hooks/exhaustive-deps
  focusBranchRef.current = focusBranch;

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
      timerRef.current = setTimeout(() => {
        setBubbleText(randomFrom(lang.greet));
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

  // Resume patrol when the panel closes (patrolEnabled flips true)
  useEffect(() => {
    if (!patrolEnabled || heldRef.current) return;
    if (pendingPatrol.current && (phase.current === 'idle' || phase.current === 'inspecting')) {
      pendingPatrol.current = false;
      timerRef.current = setTimeout(() => jumpRef.current(), 1200);
    }
  }, [patrolEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // The user's hold: run to the held thread and stay planted at it; when the
  // hold releases (panel closed, another interaction), rejoin the patrol.
  const prevHeld = useRef<string | null>(heldBranchId);
  useEffect(() => {
    const prev = prevHeld.current;
    prevHeld.current = heldBranchId;
    if (heldBranchId) {
      const b = branchesRef.current.find(x => x.id === heldBranchId);
      if (b && !isClosed(b) && !viewingIntegratedRef.current) {
        focusBranchRef.current(heldBranchId);
      }
      return;
    }
    if (prev === null) return; // nothing was released — leave timers alone
    if (phase.current === 'idle' || phase.current === 'inspecting') {
      clearTimer();
      scheduleJump(1500);
    } else {
      pendingPatrol.current = true;
    }
  }, [heldBranchId, scheduleJump]); // eslint-disable-line react-hooks/exhaustive-deps

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
    pendingBranchId: pendingIdState,
    onPress, showReaction, focusBranch, phrases: lang, visible,
  };
}
