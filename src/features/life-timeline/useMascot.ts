/**
 * Mascot brain: state machine, branch selection, position tracking, reactions.
 * Uses rAF for smooth arc animation — works on web + native.
 *
 * State machine: IDLE → JUMPING → LANDING → INSPECTING → TALKING → IDLE …
 *                             ↑
 *               showReaction() can interrupt at any non-jumping point
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { cancelAnimation, useSharedValue, withTiming, Easing, type SharedValue } from "react-native-reanimated";
import type { PsychologicalBranch } from "@/domain/branches/types";
import type { BranchGeometry } from "@/visualization/branch-lines/paths";
import { isClosed } from "@/domain/branches/logic";
import { handledToday } from "@/domain/feelings/logic";
import type { FrameName, MascotType } from "./mascot-frames";

const PX = 2.2; // must match PX in mascot-frames.ts

// ─── Types ────────────────────────────────────────────────────────────────────

export type MascotPos = { x: number; y: number };

export type MascotState = {
  /**
   * Coarse position (React state): updated at landings, snaps and other
   * stationary moments — everything that positions UI around a standing Pip.
   * Never updated per animation frame.
   */
  pos: MascotPos;
  /** Per-frame position (UI thread): the sprite itself rides these. */
  posX: SharedValue<number>;
  posY: SharedValue<number>;
  /** 0/1 while running: which gait frame shows (UI-thread swap). */
  runPhase: SharedValue<number>;
  /**
   * Summit: how far UP the rope he has shinned, in px above his station. A
   * rope offset, never a change of station — `place()` and the tracking
   * effect stay the only writers of posY, and this always unwinds to 0 when
   * he lets go. His own altitude does not move; that invariant is intact.
   */
  rise: SharedValue<number>;
  frame: FrameName;
  flip: number;
  bubbleO: SharedValue<number>;
  bubbleText: string;
  mascotType: MascotType;
  inspectedBranchId: string | null;
  pendingBranchId: string | null;
  /** Set only once Pip is actually standing at the thread — not while travelling. */
  arrivedBranchId: string | null;
  /** How he got there: only 'patrol' arrivals earn his offer pills. */
  arrivedVia: "patrol" | "user";
  onPress: () => void;
  showReaction: (text: string) => void;
  focusBranch: (branchId: string) => void;
  /**
   * Summit: hold position and CLIMB for `ms` — hands over hand, no travel.
   * On the summit the climber never moves; the mountain slides down past him,
   * so the ascent he performs is a gait, not a journey.
   */
  climbInPlace: (ms: number) => void;
  /**
   * Summit: shin `px` up the rope he is holding (0 slides him back down to
   * his station). How high he is on a rope is how far he has quieted it, so
   * this is called with the level he has won, not with a gesture.
   */
  shinUp: (px: number) => void;
  /**
   * Summit: let go of whatever he is holding and walk back to Now. Used when a
   * turn carries his rope round the back of the mountain — he must not be
   * scrolled out of view standing on something nobody can see.
   */
  goHome: () => void;
  /**
   * The full sweep: Pip sprints through every given thread's endpoint,
   * calling `onBonk` at each, then finishes at Now with a triumphant line.
   * Under reduced motion the bonks land staggered with no run.
   */
  superBonk: (branchIds: string[], onBonk: (branchId: string) => void, onDone?: () => void) => void;
  /** Localised phrase pools — use for reactions dispatched from outside the hook. */
  phrases: Phrases;
  visible: boolean;
  /**
   * False until he has been placed for the first time. Position alone cannot
   * answer this: on the summit his real world y runs thousands of px negative,
   * so no "is it very negative" test can tell a live climber from the unborn
   * sentinel — and a camera slaved to him must not read the sentinel.
   */
  born: boolean;
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
  /** Arriving at a thread the user already answered today — pure praise. */
  handled: string[];
  /** Every open thread answered: Pip chills at Now and says these. */
  allDone: string[];
  /** The grand finale of a super bonk sweep. */
  superBonk: string[];
  /** Snatching a dropped token — small delight, credit to the user. */
  coinGrab: string[];
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
  attack:     ["BONK. Shhh — settling now.", "Quieter now, hm?", "Down a notch. You're welcome.", "Soothed it, boss.", "It'll rest easier now."],
  attackCalm: ["This one's already quiet, boss.", "Nothing to soothe — it's calm.", "Shh. It's resting already."],
  merge:      ["HOME. One less thing, boss!", "That's done. I got you.", "CLEARED! You're lighter now.", "Back in your line. Nailed it.", "That thread is FREE!", "Done and dusted, boss.", "Let it go! Yes!"],
  mergeDeep:  ["HUGE ONE. You really did that!", "BOSS MODE. That was a big one.", "That was heavy and you handled it!", "BIG WIN. I felt that one too."],
  born:       ["New thread? On it, boss.", "Got it logged. I'm watching this.", "Named it — that's step one done.", "I see this. Won't lose it.", "Got your back on this one."],
  action:     ["PLAN LOCKED. Let's go!", "Decided. Your future self thanks you!", "That's a real move. Love it.", "Done! Moving forward together.", "Action taken. That's how we roll."],
  note:       ["Got it. Witnessed, boss.", "Recorded — nothing gets lost on my watch.", "I heard that. Logged.", "Got it, boss. Keep going."],
  greet:      ["I got it, boss! Working on these with you.", "Don't worry — I'm keeping an eye on everything.", "Hey boss! Your threads are in good hands.", "On the job! I got these timelines."],
  focus:      ["On it, boss!", "Right, I see this one.", "Got you!", "Let's look at this."],
  handled:    ["This one's answered, boss. Nice.", "Already handled this one. That was you.", "This thread got what it needed today.", "Answered and resting. Good work, boss."],
  allDone:    ["Every thread answered. Enjoy the quiet, boss.", "All handled today. That was you.", "Nothing pulling right now. We handled it.", "Whole current today, boss. I'm just chilling."],
  superBonk:  ["SUPERBONK!! Everybody settle down!", "FULL SWEEP, boss! All quiet on every line!", "BONK BONK BONK. That felt amazing.", "Every thread soothed in one run. We're unstoppable."],
  coinGrab:   ["Ooh, shiny! You shook that loose, boss.", "GOT IT! Straight into the meter.", "A little shine — you earned that.", "Token secured! The bonk fund grows."],
  action_loud:       "This one's LOUD, boss. Give it an answer?",
  action_ready:      "Boss, this one's ready to come home!",
  action_waiting:    "Still waiting on this one…",
  action_support:    "This might need some backup.",
  action_identity:   "Deep stuff. Worth a sit-down.",
  action_projection: "Future worry — let's look together.",
  action_empty:      "Nothing here yet — add a note?",
  action_default:    "How's this one going, boss?",
};

// Spanish — culturally warm, uses "jefe/a" (boss) which is casual and
// affectionate in Latin American Spanish. Same principles as English:
// soothing-same-energy (no combat verbs), credit the user's act, calm wins.
const ES: Phrases = {
  attack:     ["¡BONK! Shhh — ya se aquieta.", "Más suavecito ahora, ¿no?", "Un punto menos. De nada, jefe.", "Listo, lo arrullé un poco.", "Ahora descansa más tranquilo."],
  attackCalm: ["Este ya está tranquilo, jefe.", "Nada que calmar — ya descansa.", "Shh. Ya está en paz."],
  merge:      ["¡A CASA! Una menos que cargar, jefe.", "Eso quedó. Yo te cubro.", "¡INTEGRADO! Vas más liviano.", "De vuelta en tu línea. Eso fue tuyo.", "¡Ese hilo volvió a casa!", "Hecho y guardado, jefe.", "¡Lo soltaste! Eso es."],
  mergeDeep:  ["¡ESE ERA GRANDE, JEFE! Lo hiciste tú.", "MODO JEFE. Ese pesaba de verdad.", "Era pesado y lo llevaste a casa.", "GRAN LOGRO. Yo también lo sentí."],
  born:       ["¿Nuevo hilo? En eso estoy, jefe.", "Anotado. Le tengo el ojo puesto.", "Nombrado — el primer paso ya está.", "Lo veo. No lo pierdo de vista.", "Te cubro con este."],
  action:     ["¡PLAN LISTO! Vamos.", "Decidido. Tu yo del futuro te lo agradece.", "Eso es un paso real. Me encanta.", "¡Hecho! Avanzando juntos.", "Paso dado. Así se hace, jefe."],
  note:       ["Anotado. Yo fui testigo.", "Guardado — aquí nada se pierde.", "Te escuché. Quedó escrito.", "Listo, jefe. Sigue tranquilo."],
  greet:      ["¡Aquí estoy, jefe! Estos hilos los llevamos juntos.", "Tranquilo — les tengo el ojo puesto a todos.", "¡Hola, jefe! Tus hilos están en buenas manos.", "¡Al tanto! Yo cuido estas líneas."],
  focus:      ["¡Voy, jefe!", "Claro, veamos este.", "¡Te tengo!", "Miremos esto juntos."],
  handled:    ["Este ya está respondido, jefe. Bien.", "Este ya lo atendiste hoy. Eso fue tuyo.", "Este hilo ya recibió lo suyo hoy.", "Respondido y en calma. Buen trabajo, jefe."],
  allDone:    ["Todos los hilos respondidos. Disfruta la calma, jefe.", "Todo atendido hoy. Eso fuiste tú.", "Nada jala ahora mismo. Lo lograste.", "Corriente entera hoy, jefe. Aquí descansando."],
  superBonk:  ["¡¡SUPERBONK!! Todos a descansar.", "¡BARRIDA COMPLETA, jefe! Calma en cada línea.", "BONK BONK BONK. Qué gusto dio eso.", "Cada hilo arrullado en una sola carrera."],
  coinGrab:   ["¡Uy, brilla! Tú lo soltaste, jefe.", "¡LA TENGO! Directo al medidor.", "Un brillito — te lo ganaste.", "Ficha guardada. El medidor crece."],
  action_loud:       "Este hilo suena FUERTE, jefe. ¿Le damos una respuesta?",
  action_ready:      "¡Jefe, este ya está listo para volver a casa!",
  action_waiting:    "Todavía esperando por este…",
  action_support:    "Este podría necesitar un apoyo.",
  action_identity:   "Cosa profunda. Vale la pena sentarse con ella.",
  action_projection: "Preocupación futura — mirémosla juntos.",
  action_empty:      "Nada aquí aún. ¿Le añades una nota?",
  action_default:    "¿Cómo va este, jefe?",
};

// Colombian Spanish — its own voice, not Spain-with-parce: quiubo, parce y
// parcero, "de una", "sin afán", "qué nota", agregar (nunca añadir), tuteo
// cálido en todo. Mismos principios: arrullar, nunca golpear.
const ES_CO: Phrases = {
  attack:     ["¡BONK! Shhh — ya se calma, parce.", "Más suavecito ahora, ¿cierto?", "Un punto menos. Con gusto.", "Listo, lo arrullé un poquito.", "Ya descansa más tranquilo, parce."],
  attackCalm: ["Este ya está tranquilo, parce.", "Nada que calmar — ya descansa.", "Shh. Ya está en paz."],
  merge:      ["¡A CASA! Una menos, parce.", "Eso quedó. Yo te cubro.", "¡INTEGRADO! Vas más liviano, parcero.", "De vuelta en tu línea. Eso fue todo tuyo.", "¡Ese hilo volvió a casa! ¡Qué nota!", "Hecho y guardado, parcero.", "¡Lo soltaste! Eso es, de una."],
  mergeDeep:  ["¡ESE ERA GRANDÍSIMO, PARCE! Lo hiciste tú.", "¡MODO CRACK! Ese pesaba de verdad.", "Era un hilo tenaz y lo llevaste a casa. ¡Qué nota!", "GRAN LOGRO, PARCE. Yo también lo sentí."],
  born:       ["¿Nuevo hilo? En eso estoy, parce.", "Anotado. Le tengo el ojo puesto.", "Nombrado — el primer paso ya quedó.", "Lo veo. No lo pierdo de vista.", "Te cubro con este, parcero."],
  action:     ["¡PLAN LISTO! De una.", "Decidido. Tu yo del futuro te lo agradece.", "Eso es un paso real. Me encanta.", "¡Listo pues! Avanzando juntos.", "Paso dado. Así es, parce."],
  note:       ["Anotado. Yo fui testigo, parce.", "Guardado — aquí nada se pierde.", "Te escuché. Quedó escrito.", "Listo, parce. Sigue sin afán."],
  greet:      ["¡Aquí estoy, parce! Estos hilos los llevamos juntos.", "Fresco — les tengo el ojo puesto a todos.", "¡Quiubo, parce! Tus hilos están en buenas manos.", "¡Al tanto! Yo cuido estas líneas."],
  focus:      ["¡Voy, parce!", "Claro, veamos este.", "¡Te tengo, parcero!", "Miremos esto juntos."],
  handled:    ["Este ya está respondido, parce. Bien.", "Este ya lo atendiste hoy. Todo tuyo.", "Este hilo ya recibió lo suyo hoy.", "Respondido y en calma. Buen trabajo, parce."],
  allDone:    ["Todos los hilos respondidos. Disfruta la calma, parce.", "Todo atendido hoy. Eso fuiste tú.", "Nada jala ahora, parcero. Lo lograste.", "Corriente entera hoy, parce. Sin afán."],
  superBonk:  ["¡¡SUPERBONK!! Todos a descansar, parce.", "¡BARRIDA COMPLETA! Calma en cada línea, parcero.", "BONK BONK BONK. ¡Qué nota!", "Cada hilo arrullado de una sola."],
  coinGrab:   ["¡Uy, qué brillo! Tú lo soltaste, parce.", "¡LA COGÍ! Directo al medidor.", "Un brillito — te lo ganaste, parcero.", "Ficha guardada. El medidor crece."],
  action_loud:       "Este hilo suena DURO, parce. ¿Le damos una respuesta?",
  action_ready:      "¡Parce, este ya está listo para volver a casa!",
  action_waiting:    "Todavía esperando por este…",
  action_support:    "Este podría necesitar un apoyo.",
  action_identity:   "Cosa profunda. Vale la pena sentarse con ella.",
  action_projection: "Preocupación futura — mirémosla juntos.",
  action_empty:      "Nada aquí todavía. ¿Le agregas una nota?",
  action_default:    "¿Cómo va este, parce?",
};

function getLang(language: string): Phrases {
  if (language === "es-CO") return ES_CO;
  if (language === "es") return ES;
  return EN;
}


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
  vertical: boolean,
): number {
  if (isClosed(b)) return -Infinity;
  if (!g.inWindow) return -Infinity;
  // On the summit map anchors sit in lane columns, not on the time axis —
  // the past-Now cull is meaningless there; inWindow already gates them.
  if (!vertical && nowX > 0 && g.endX > nowX + 20) return -Infinity;
  // Skip branches already handled today — Pip only patrols undecided threads
  // (a pending planned step does NOT count: its rope still hangs).
  const now = new Date();
  if (handledToday(b, now)) return -Infinity;

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

// One greeting per app session, across remounts (the timeline unmounts and
// remounts around the creation screen) and across hook instances.
let greetedThisSession = false;

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
  /** The main line's y — where Pip chills when every thread is answered. */
  nowY = 0,
  /**
   * Fires once whenever Pip sets off for a new destination (its final x/y in
   * world coords) — the stage can pan its camera to keep him on screen.
   */
  onTravel?: (x: number, y: number) => void,
  /** Summit: steep segments climb (CLIMB frames), and patrol skips the
   * endpoint-past-Now cull that only makes sense on a horizontal map.
   * `onClimbEnd` fires when a climb to the rest point lands — the summit
   * retires the rope he just topped out on. */
  opts?: {
    vertical?: boolean;
    reducedMotion?: boolean;
    /** Summit: a rope's x with the mountain turned as it is (see ringX). */
    ringX?: (g: BranchGeometry) => number;
    /** Bumped whenever the mountain has been turned: his place at a rope
     * moves with it, so the tracking effect has to look again. */
    turnKey?: number;
    /** Summit: whether a rope is on the visible side of the mountain. Patrol
     * only ever visits ropes the user can see. */
    ringVisible?: (g: BranchGeometry) => boolean;
    /** Summit sweep: bring this rope round to the front now, and say how many
     * ms that will take (0 if it is already facing). */
    sweepTurn?: (branchId: string) => number;
    /** Summit sweep: where he stands to throw at a rope once it has been
     * brought to the front — backed off it, so the chalk has an arc to fly. */
    sweepStandX?: (g: BranchGeometry) => number;
    onClimbEnd?: () => void;
  },
): MascotState {
  const lang = getLang(language);
  const verticalRef = useRef(opts?.vertical ?? false);
  verticalRef.current = opts?.vertical ?? false;
  const onClimbEndRef = useRef(opts?.onClimbEnd);
  onClimbEndRef.current = opts?.onClimbEnd;
  /** Comfort setting: he keeps his place and his poses, but nothing travels or
   * loops. On the summit he is the subject of the whole map — hiding him left
   * a mountain with nobody on it and a scene that slid for no visible reason. */
  const stillRef = useRef(opts?.reducedMotion ?? false);
  stillRef.current = opts?.reducedMotion ?? false;
  const ringXRef = useRef(opts?.ringX);
  ringXRef.current = opts?.ringX;
  const ringVisibleRef = useRef(opts?.ringVisible);
  ringVisibleRef.current = opts?.ringVisible;
  const sweepTurnRef = useRef(opts?.sweepTurn);
  sweepTurnRef.current = opts?.sweepTurn;
  const sweepStandXRef = useRef(opts?.sweepStandX);
  sweepStandXRef.current = opts?.sweepStandX;
  const langRef = useRef(lang);
  langRef.current = lang;
  // Stable refs for latest values
  const branchesRef = useRef(branches);
  branchesRef.current = branches;
  const geometriesRef = useRef(geometries);
  geometriesRef.current = geometries;
  const onTravelRef = useRef(onTravel);
  onTravelRef.current = onTravel;
  // Declared early: several callbacks below refuse to interrupt the sweep.
  const superBonkActiveRef = useRef(false);
  const nowXRef = useRef(nowX);
  nowXRef.current = nowX;
  const nowYRef = useRef(nowY);
  nowYRef.current = nowY;
  // True while every open thread is answered and Pip rests at the Now point.
  const chillingRef = useRef(false);
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
  // How far the world has panned since the current run began. The waypoint
  // runner adds this at render time, so Pip and his remaining path translate
  // with the timeline instead of sticking to the screen.
  const panShiftRef = useRef({ x: 0, y: 0 });
  // Mutable position ref so waypoint runner can read current pos without setState callback
  const posRef = useRef<MascotPos>({ x: -999, y: -999 });
  // Rendering state
  const [pos, setPos] = useState<MascotPos>({ x: -999, y: -999 });
  const bornRef = useRef(false);
  const [born, setBorn] = useState(false);
  const posX = useSharedValue(-999);
  const posY = useSharedValue(-999);
  // 0/1 gait phase while running — swapped on the UI thread, no re-renders.
  const runPhase = useSharedValue(0);
  // Move the sprite: per-frame ticks write ONLY the shared values (UI
  // thread); coarse moments (`sync`) also publish React state for the UI
  // that arranges itself around a standing Pip. Never sync from a rAF loop —
  // that re-renders the whole timeline every frame.
  const place = (x: number, y: number, sync: boolean) => {
    if (!bornRef.current) { bornRef.current = true; setBorn(true); }
    posRef.current = { x, y };
    posX.value = x;
    posY.value = y;
    if (sync) setPos({ x, y });
  };
  const placeRef = useRef(place);
  placeRef.current = place;
  const [frame, setFrame] = useState<FrameName>('IDLE_A');
  const [flip, setFlip] = useState(1);
  const bubbleO = useSharedValue(0);
  const [bubbleText, setBubbleText] = useState('');
  const [inspectedIdState, setInspectedIdState] = useState<string | null>(null);
  const [pendingIdState, setPendingIdState] = useState<string | null>(null);
  const [arrivedIdState, setArrivedIdState] = useState<string | null>(null);
  // Why he is standing there: his own patrol earns an offer; a user tap
  // does not (the tap already opened the panel itself).
  const arrivedViaRef = useRef<"patrol" | "user">("patrol");
  const [arrivedVia, setArrivedVia] = useState<"patrol" | "user">("patrol");
  const markArrival = (via: "patrol" | "user") => {
    arrivedViaRef.current = via;
    setArrivedVia(via);
  };

  // Where Pip goes to visit a rope.
  // On the summit his place is the Now line and nothing moves him off it:
  // the mountain slides down instead. So a rope is worked from HIS altitude
  // — coiled or hanging, all that changes is which column he steps to.
  const ropeSpot = (g: BranchGeometry): { x: number; y: number } => {
    if (verticalRef.current) {
      // The ropes hang around a mountain that can be turned, so his place at
      // one is wherever it currently faces — not its un-turned column.
      const x = ringXRef.current ? ringXRef.current(g) : g.endX;
      return { x: x - PX * 6, y: nowYRef.current - PX * 10 };
    }
    return { x: g.endX + 10, y: g.endY - PX * 10 };
  };
  const ropeSpotRef = useRef(ropeSpot);
  ropeSpotRef.current = ropeSpot;

  const clearTimer = () => {
    if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
  };
  const cancelRaf = () => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };

  // Smooth bubble fade — on the UI thread, no React re-renders and no
  // contention with the waypoint runner's rAF.
  const fadeBubble = useCallback((target: number, ms: number) => {
    cancelAnimation(bubbleO);
    bubbleO.value = withTiming(target, { duration: ms, easing: Easing.linear });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared value is stable
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
    // Waypoints are in the coordinates of the moment the run began; any pan
    // after that lives in panShiftRef and is added at render time, so the
    // whole run stays glued to the timeline, not the screen.
    panShiftRef.current = { x: 0, y: 0 };

    // Every travel funnels through here: tell the stage where he is headed
    // (once per run, never per frame) so the camera can follow him.
    const dest = waypoints[waypoints.length - 1];
    if (dest) onTravelRef.current?.(dest.x, dest.y);

    const step = () => {
      if (idx >= waypoints.length) { onDone(); return; }
      const wp = waypoints[idx];
      const s0 = panShiftRef.current;
      const cur = posRef.current;
      const fromX = cur.x - s0.x, fromY = cur.y - s0.y; // back to base coords
      const dx = wp.x - fromX, dy_ = wp.y - fromY;
      const dist = Math.hypot(dx, dy_) || 1;
      const duration = Math.max(120, dist / pxPerMs);

      // Face the direction of this segment; on the summit a steep segment
      // is climbed hand over hand (one setState per segment, like setFlip —
      // the 9Hz gait itself stays on the UI thread via runPhase).
      setFlip(dx >= 0 ? 1 : -1);
      setFrame(verticalRef.current && Math.abs(dy_) > Math.abs(dx) ? 'CLIMB_A' : 'RUN_A');

      const t0 = performance.now();

      const tick = (now: number) => {
        // rAF timestamps can precede the performance.now() taken at segment
        // start — without the lower clamp the first tick runs BACKWARDS.
        const t = Math.min(1, Math.max(0, (now - t0) / duration));
        const s = panShiftRef.current;
        const nx = fromX + dx * t + s.x;
        const ny = fromY + dy_ * t + s.y;
        placeRef.current(nx, ny, false);

        if (now - lastToggle >= 115) {
          runA = !runA;
          runPhase.value = runA ? 0 : 1; // sprite alternates on the UI thread
          lastToggle = now;
        }

        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          idx++;
          step();
        }
      };

      cancelRaf();
      rafRef.current = requestAnimationFrame(tick);
    };

    step();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Summit movement. The climber is PINNED to a line on screen (the stage's
   * camera is slaved to his position), so his motion IS the world's motion:
   * a straight, smoothly eased glide with no arc and no overshoot. An arc
   * would bob the whole mountain; an overshoot would leave the camera parked
   * at the high point with him dropping away from the pin. Sideways moves to
   * a rope are flat, so taking hold never moves the world at all.
   */
  const glideRun = useCallback(
    (
      toX: number,
      toY: number,
      onDone: () => void,
      /**
       * Where he is headed, re-read every frame. The summit's ropes hang on a
       * ring that can still be turning while he crosses to one — without this
       * he runs to where the rope WAS and is snapped sideways on arrival.
       */
      retarget?: () => { x: number; y: number } | null,
    ) => {
      if (stillRef.current) {
        panShiftRef.current = { x: 0, y: 0 };
        placeRef.current(toX, toY, true);
        onDone();
        return;
      }
      const from = posRef.current;
      let dx = toX - from.x;
      let dy = toY - from.y;
      const dist = Math.hypot(dx, dy);
      const climbing = Math.abs(dy) > 24;
      // A rung is a screen-jump: give it real time, so the mountain pans by
      // rather than snaps. Sideways scrambles are quicker.
      const dur = climbing
        ? Math.max(700, Math.min(1900, 420 + Math.abs(dy) * 1.5))
        : Math.max(260, Math.min(900, 180 + dist * 1.1));
      panShiftRef.current = { x: 0, y: 0 };
      onTravelRef.current?.(toX, toY);
      setFlip(dx >= 0 ? 1 : -1);
      setFrame(climbing ? 'CLIMB_A' : 'RUN_A');
      const t0 = performance.now();
      let gait = 0;
      const tick = (now: number) => {
        // rAF timestamps can precede the performance.now() taken here — the
        // lower clamp keeps the first tick from running backwards.
        const raw = Math.min(1, Math.max(0, (now - t0) / dur));
        // ease in and out: he leans into the move and settles onto the ledge
        const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
        // Follow the rope if it is still coming round: the eased path bends
        // onto its moving column instead of ending beside it.
        const live = retarget?.();
        if (live) {
          dx = live.x - from.x;
          dy = live.y - from.y;
          toX = live.x;
          toY = live.y;
        }
        const s = panShiftRef.current;
        placeRef.current(from.x + dx * t + s.x, from.y + dy * t + s.y, false);
        const g = Math.floor((now - t0) / 130) % 2;
        if (g !== gait) { gait = g; runPhase.value = g; }
        if (raw < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          const s2 = panShiftRef.current;
          placeRef.current(toX + s2.x, toY + s2.y, true);
          onDone();
        }
      };
      cancelRaf();
      rafRef.current = requestAnimationFrame(tick);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs only
    [],
  );

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
    if (!id) {
      // On the summit his place is the Now line, always — he has no other
      // resting spot to be away from, so he is always "chilling" there and
      // any drift (a stage resize, a first layout) is corrected at once.
      if (!chillingRef.current && !verticalRef.current) return;
      const tx = nowXRef.current - PX * 12 - 10;
      const ty = nowYRef.current - PX * 10;
      if (phase.current === 'jumping') {
        // Mid-walk to Now while the world pans: fold the drift into the run,
        // exactly like a jump toward a thread.
        const dest = jumpDestRef.current;
        if (dest?.branchId === "__now__") {
          if (verticalRef.current) return; // summit: climbs are pure runs
          const dx = tx - dest.x, dy = ty - dest.y;
          if (dx !== 0 || dy !== 0) {
            jumpDestRef.current = { x: tx, y: ty, branchId: "__now__" };
            panShiftRef.current = {
              x: panShiftRef.current.x + dx,
              y: panShiftRef.current.y + dy,
            };
            placeRef.current(posRef.current.x + dx, posRef.current.y + dy, false);
          }
        }
        return;
      }
      // Chilling at Now: the Now point pans with the timeline, and so does he.
      // On the summit a big vertical move means the ledge itself rose (an
      // answer landed while he rested) — that ascent is climbed, not snapped;
      // small drifts are pans and stay glued.
      const cur = posRef.current;
      // The summit climber never travels vertically — the mountain slides
      // under him — so a vertical difference here is the world having moved
      // (a resize, a time pan, the first layout) and is simply corrected.
      if (Math.abs(cur.x - tx) >= 1 || Math.abs(cur.y - ty) >= 1) {
        placeRef.current(tx, ty, true);
      }
      return;
    }

    // Never track closed/merged branches — they live in the past. A DELETED
    // branch (burned away) must be escaped the same way, or Pip freezes at a
    // dead spot with no patrol timer ever coming.
    const branch = branchesRef.current.find(b => b.id === id);
    if (!branch || isClosed(branch)) {
      if (heldRef.current === id) return; // stale hold — the caller clears it
      inspectedId.current = null;
      setInspectedIdState(null);
      setArrivedIdState(null);
      clearTimer(); cancelRaf();
      scheduleJump(400); // parks as pendingPatrol when a panel is open
      return;
    }

    const geo = geometries.find(g => g.branchId === id);
    if (!geo) return;
    const { x: tx, y: ty } = ropeSpotRef.current(geo);

    if (phase.current === 'jumping') {
      // The world panned under him mid-run: fold the drift into the pan
      // shift so Pip and his remaining path translate WITH the timeline —
      // he keeps his place relative to Now, never to the screen.
      const dest = jumpDestRef.current;
      if (dest?.branchId === id) {
        if (verticalRef.current) return; // summit: runs are never folded
        const dx = tx - dest.x, dy = ty - dest.y;
        if (dx !== 0 || dy !== 0) {
          jumpDestRef.current = { x: tx, y: ty, branchId: id };
          panShiftRef.current = {
            x: panShiftRef.current.x + dx,
            y: panShiftRef.current.y + dy,
          };
          placeRef.current(posRef.current.x + dx, posRef.current.y + dy, false);
        }
      }
      return;
    }

    // Stationary — snap to follow the branch (handles panning + loudness shifts).
    // Pip naturally scrolls off-screen when the user pans away from today.
    const cur = posRef.current;
    if (Math.abs(cur.x - tx) >= 1 || Math.abs(cur.y - ty) >= 1) {
      placeRef.current(tx, ty, true);
    }
  }, [geometries, branches, opts?.turnKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
    markArrival('patrol');
    setArrivedIdState(branchId);
    if (verticalRef.current) {
      // Summit: he has hold of the rope. No inspect-and-offer routine — the
      // rope's own "grab on" prompt is the invitation, so he just hangs
      // there until it is answered (or another rope calls him over).
      phase.current = 'inspecting';
      setFrame('CLIMB_A');
      scheduleJump(13000 + Math.random() * 7000);
      return;
    }
    setFrame('LAND_A');
    timerRef.current = setTimeout(() => {
      phase.current = 'inspecting';
      setFrame('INSPECT_A');
      timerRef.current = setTimeout(() => {
        setFrame('INSPECT_B');
        timerRef.current = setTimeout(() => startTalking(branchId), 500);
      }, 600);
    }, 160);
  }, [startTalking, scheduleJump]);

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
      if (verticalRef.current && ringVisibleRef.current && !ringVisibleRef.current(g)) continue;
      const s = scoreBranch(b, g, nX, lastVisited.current, verticalRef.current);
      if (s > bestScore) { bestScore = s; best = b; }
    }

    // Summit: he starts the day on the Now spot and goes OUT to the ropes —
    // the patrol travels, same as anywhere else. He takes hold of the rope
    // it picks (onLanded's vertical arm), and the rope's own prompt asks to
    // be grabbed. Nothing else here needs to know the map is vertical.
    if (verticalRef.current && best && bestScore !== -Infinity) {
      lastVisited.current.set(best.id, Date.now());
    }
    if (!best || bestScore === -Infinity) {
      // Every open thread has its answer for today: Pip retires to the Now
      // point and, every so often, says how well it all went — until a new
      // (or reopened) thread gives the patrol somewhere to go again.
      chillingRef.current = true;
      inspectedId.current = null;
      setInspectedIdState(null);
      setPendingIdState(null);
      setArrivedIdState(null);
      const tx = nX - PX * 12 - 10;
      const ty = nowYRef.current - PX * 10;
      const say = () => {
        setBubbleText(randomFrom(langRef.current.allDone));
        fadeBubble(1, 250);
        timerRef.current = setTimeout(() => {
          fadeBubble(0, 300);
          timerRef.current = setTimeout(() => {
            phase.current = 'idle';
            scheduleJump(12000 + Math.random() * 8000);
          }, 350);
        }, 2600);
      };
      const cur = posRef.current;
      if (Math.hypot(tx - cur.x, ty - cur.y) > 8) {
        phase.current = 'jumping';
        // A live destination, so a pan during the walk folds into the run
        // like any other jump — he keeps heading for Now, not for a stale x.
        jumpDestRef.current = { x: tx, y: ty, branchId: "__now__" };
        setFrame('RUN_A');
        const home = () => {
          jumpDestRef.current = null;
          phase.current = 'idle';
          setFrame('IDLE_A');
          say();
        };
        if (verticalRef.current) glideRun(tx, ty, home);
        else runWaypoints(makeZigWaypoints(cur.x, cur.y, tx, ty, 2, 24), home, 0.18);
      } else {
        phase.current = 'idle';
        setFrame('IDLE_A');
        say();
      }
      return;
    }
    chillingRef.current = false;
    const destGeo = geoMap.get(best.id)!;

    const { x: toX, y: toY } = ropeSpotRef.current(destGeo);

    const targetId = best.id;
    jumpDestRef.current = { x: toX, y: toY, branchId: targetId };

    // Highlight the destination branch immediately, then pause briefly before
    // Pip starts running so the user sees which timeline he's heading to.
    setPendingIdState(targetId);
    setInspectedIdState(targetId);
    setArrivedIdState(null); // his options fold away the moment he leaves

    timerRef.current = setTimeout(() => {
      const cur = posRef.current;
      phase.current = 'jumping';
      // From here he belongs to the destination: a press mid-run opens the
      // thread he's heading to, never the (possibly deleted) one he left.
      inspectedId.current = targetId;
      setFrame('RUN_A');
      const land = () => {
        // Use live geometry in case timeline was panned during the run
        const liveGeo = geometriesRef.current.find(g => g.branchId === targetId);
        const live = liveGeo ? ropeSpotRef.current(liveGeo) : null;
        const fx = live ? live.x : (jumpDestRef.current?.x ?? toX);
        const fy = live ? live.y : (jumpDestRef.current?.y ?? toY);
        placeRef.current(fx, fy, true);
        jumpDestRef.current = null;
        setPendingIdState(null);
        onLanded(targetId);
      };
      if (verticalRef.current) glideRun(toX, toY, land);
      else runWaypoints(makeZigWaypoints(cur.x, cur.y, toX, toY, 3, 38), land, 0.16);
    }, 500); // 500 ms highlight before he moves
  }, [onLanded, runWaypoints, glideRun]); // eslint-disable-line react-hooks/exhaustive-deps

  jumpRef.current = jumpToNext;

  // ── External reaction trigger (called by LifeTimeline on actions) ──
  const showReaction = useCallback((text: string) => {
    if (superBonkActiveRef.current) return; // the sweep owns him until it ends
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
          // Hanging on a rope? Keep the grip after the reaction.
          const hangingOpen =
            verticalRef.current &&
            inspectedId.current !== null &&
            !geometriesRef.current.find((g) => g.branchId === inspectedId.current)?.coiled;
          phase.current = hangingOpen ? 'inspecting' : 'idle';
          setFrame(hangingOpen ? 'CLIMB_A' : 'IDLE_A');
          scheduleJump(1500);
        }, 350);
      }, 2800);
    }, 120);
  }, [fadeBubble, scheduleJump]);

  // ── Idle bob ──
  useEffect(() => {
    let s = false;
    const id = setInterval(() => {
      if (stillRef.current) return;
      if (phase.current === 'idle') { setFrame(s ? 'IDLE_B' : 'IDLE_A'); s = !s; }
    }, 380);
    return () => clearInterval(id);
  }, []);

  // ── Super bonk: the charged sweep across every open timeline ──
  const superBonk = useCallback(
    (branchIds: string[], onBonk: (branchId: string) => void, onDone?: () => void) => {
      if (superBonkActiveRef.current || branchIds.length === 0) return;
      superBonkActiveRef.current = true;
      clearTimer(); cancelRaf();
      dropRise();
      chillingRef.current = false;
      setPendingIdState(null);
      setArrivedIdState(null);
      // He lets go of whatever he was on for the whole sweep. Nulling the
      // STATE too (not just the ref) is what makes the summit's release rule
      // — "a rope turned away sends him home" — dead while the sweep itself
      // turns the mountain a full circle.
      setInspectedIdState(null);
      fadeBubble(0, 120);

      const finish = () => {
        superBonkActiveRef.current = false;
        // Victory lap ends at the Now point with the big line.
        const tx = nowXRef.current - PX * 12 - 10;
        const ty = nowYRef.current - PX * 10;
        phase.current = 'jumping';
        inspectedId.current = null;
        setInspectedIdState(null);
        jumpDestRef.current = { x: tx, y: ty, branchId: "__now__" };
        chillingRef.current = true;
        setFrame('RUN_A');
        const lap = () => {
          jumpDestRef.current = null;
          phase.current = 'idle';
          setFrame('REACT');
          setBubbleText(randomFrom(langRef.current.superBonk));
          fadeBubble(1, 200);
          timerRef.current = setTimeout(() => {
            fadeBubble(0, 350);
            timerRef.current = setTimeout(() => {
              setFrame('IDLE_A');
              scheduleJump(2500);
              onDone?.();
            }, 400);
          }, 2600);
        };
        // The summit never zig-zags: the zig runs perpendicular to travel,
        // which on a vertical map is VERTICAL — and he holds one altitude.
        if (verticalRef.current) glideRun(tx, ty, lap);
        else runWaypoints(makeZigWaypoints(posRef.current.x, posRef.current.y, tx, ty, 1, 16), lap, 0.5);
      };

      /** How long he lingers on a rope once the chalk has landed. */
      const beat = branchIds.length > 8 ? 170 : 220;

      const hop = (i: number) => {
        if (i >= branchIds.length) { finish(); return; }
        const id = branchIds[i];
        const geo = geometriesRef.current.find((g) => g.branchId === id);
        if (!geo) { hop(i + 1); return; }
        // The mountain starts turning NOW, and his destination is already
        // known without waiting for it: a rope brought to the front sits at a
        // computable column — the SAME column for every waiting rope, since
        // they share one radius. So he takes his station once and the
        // mountain delivers rope after rope into his hand.
        const t0 = performance.now();
        const turnMs = sweepTurnRef.current ? sweepTurnRef.current(id) : 0;
        const stand = sweepStandXRef.current?.(geo);
        const spot = ropeSpotRef.current(geo);
        const tx = stand ?? spot.x;
        const ty = spot.y;
        phase.current = 'jumping';
        inspectedId.current = id;
        jumpDestRef.current = { x: tx, y: ty, branchId: id };

        const strike = () => {
          jumpDestRef.current = null;
          setFrame('LAND_A');
          onBonk(id);
          timerRef.current = setTimeout(() => hop(i + 1), beat);
        };
        // He must not throw at a rope that has not arrived yet.
        const waitOutTurn = () => {
          const left = turnMs - (performance.now() - t0);
          if (left < 16) strike();
          else timerRef.current = setTimeout(strike, left);
        };

        if (Math.abs(tx - posRef.current.x) < 14 && Math.abs(ty - posRef.current.y) < 14) {
          // Already on his station — the normal case after the first rope.
          placeRef.current(tx, ty, true);
          setFrame('IDLE_A');
          waitOutTurn();
          return;
        }
        setFrame('RUN_A');
        if (verticalRef.current) glideRun(tx, ty, waitOutTurn);
        else runWaypoints(makeZigWaypoints(posRef.current.x, posRef.current.y, tx, ty, 1, 14), strike, 0.5);
      };
      hop(0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and stable callbacks
    [fadeBubble, runWaypoints, glideRun, scheduleJump],
  );

  // ── Focus: run to a specific branch when user taps it ──
  const focusBranch = useCallback((branchId: string) => {
    // A tap mid-sweep must not hijack the hop chain — the sheet still opens
    // in the stage; Pip simply finishes his sweep first.
    if (superBonkActiveRef.current) return;
    const geo = geometriesRef.current.find(g => g.branchId === branchId);
    if (!geo) return;

    const { x: toX, y: toY } = ropeSpotRef.current(geo);

    // Already there — just update focus silently
    if (inspectedId.current === branchId && phase.current !== 'jumping') {
      inspectedId.current = branchId;
      setInspectedIdState(branchId);
      markArrival('user');
      setArrivedIdState(branchId);
      return;
    }

    clearTimer(); cancelRaf();
    chillingRef.current = false;
    inspectedId.current = branchId;
    setInspectedIdState(branchId);
    setArrivedIdState(null);
    jumpDestRef.current = { x: toX, y: toY, branchId };

    const cur = posRef.current;
    phase.current = 'jumping';
    setFrame('RUN_A');
    const land = () => {
      // Use live geometry in case timeline was panned
      const liveGeo = geometriesRef.current.find(g => g.branchId === branchId);
      const live = liveGeo ? ropeSpotRef.current(liveGeo) : null;
      const fx = live ? live.x : (jumpDestRef.current?.x ?? toX);
      const fy = live ? live.y : (jumpDestRef.current?.y ?? toY);
      placeRef.current(fx, fy, true);
      jumpDestRef.current = null;
      if (verticalRef.current) {
        // He grabs the rope and HANGS — gripping until the answer sends him
        // up it, or another rope calls him away. The focus-cycling patrol
        // keeps running underneath.
        setFrame('CLIMB_A');
        phase.current = 'inspecting';
        markArrival('user');
        setArrivedIdState(branchId);
        scheduleJump(6500 + Math.random() * 3500);
        return;
      }
      setFrame('INSPECT_A');
      phase.current = 'inspecting';
      markArrival('user');
      setArrivedIdState(branchId);
      // A thread already answered today gets praise, not a prompt.
      const focused = branchesRef.current.find(x => x.id === branchId);
      const answered = focused && handledToday(focused, new Date());
      setBubbleText(randomFrom(answered ? lang.handled : lang.focus));
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
    };
    // The summit never zig-zags: the zig is perpendicular to travel, which on
    // a vertical map means VERTICAL — and he holds one altitude all day.
    if (verticalRef.current) {
      // The rope may still be coming round while he crosses to it, so his
      // destination is re-read every frame — he arrives ON it, not beside it.
      glideRun(toX, toY, land, () => {
        const g = geometriesRef.current.find((x) => x.branchId === branchId);
        return g ? ropeSpotRef.current(g) : null;
      });
    } else runWaypoints(makeZigWaypoints(cur.x, cur.y, toX, toY, 2, 30), land, 0.2);
  }, [fadeBubble, runWaypoints, glideRun, lang, scheduleJump]); // eslint-disable-line react-hooks/exhaustive-deps
  focusBranchRef.current = focusBranch;


  /**
   * How far up the rope he has shinned. Not a change of station: his own
   * altitude is fixed by `place()`, and this offset always unwinds to 0 when
   * he lets go — so the pinned time frame stays pinned.
   */
  const rise = useSharedValue(0);
  /** The shin's own gait handle. NOT rafRef: that one owns travel. */
  const gaitRafRef = useRef<number | null>(null);
  const stopGait = () => {
    if (gaitRafRef.current !== null) {
      cancelAnimationFrame(gaitRafRef.current);
      gaitRafRef.current = null;
    }
  };
  /** Slide back down to his station — used wherever he lets go of a rope. */
  const dropRise = () => {
    stopGait();
    cancelAnimation(rise);
    if (rise.value === 0) return;
    rise.value = stillRef.current ? 0 : withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) });
  };

  const shinUp = useCallback((px: number) => {
    if (superBonkActiveRef.current || viewingIntegratedRef.current) return;
    if (Math.abs(rise.value - px) < 0.5) return;
    cancelAnimation(rise);
    // Reduced motion: the height is information (how far he has quieted it),
    // the travel is decoration — so it lands rather than climbs.
    if (stillRef.current) {
      rise.value = px;
      return;
    }
    const up = px > rise.value;
    rise.value = withTiming(px, { duration: 380, easing: Easing.out(Easing.quad) });
    stopGait();
    if (!up) return; // sliding back down needs no hand-over-hand
    const t0 = performance.now();
    let gait = -1;
    const beat = () => {
      const g = Math.floor((performance.now() - t0) / 130) % 2;
      if (g !== gait) { gait = g; runPhase.value = g; }
      gaitRafRef.current =
        performance.now() - t0 < 380 ? requestAnimationFrame(beat) : null;
    };
    gaitRafRef.current = requestAnimationFrame(beat);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and shared values only
  }, []);

  /** Let go and walk back to the Now spot. */
  const goHome = useCallback(() => {
    if (superBonkActiveRef.current || viewingIntegratedRef.current) return;
    if (heldRef.current) return; // the user is holding this thread open
    clearTimer();
    cancelRaf();
    dropRise();
    inspectedId.current = null;
    setInspectedIdState(null);
    setPendingIdState(null);
    setArrivedIdState(null);
    chillingRef.current = true;
    fadeBubble(0, 120);
    const tx = nowXRef.current - PX * 12 - 10;
    const ty = nowYRef.current - PX * 10;
    const settle = () => {
      jumpDestRef.current = null;
      phase.current = 'idle';
      setFrame('IDLE_A');
      scheduleJump(2600 + Math.random() * 1400);
    };
    if (Math.hypot(tx - posRef.current.x, ty - posRef.current.y) < 12) {
      settle();
      return;
    }
    phase.current = 'jumping';
    jumpDestRef.current = { x: tx, y: ty, branchId: "__now__" };
    setFrame('RUN_A');
    glideRun(tx, ty, settle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
  }, [fadeBubble, glideRun, scheduleJump]);

  /** The climbing gait, in place, for as long as the mountain is moving. */
  const climbInPlace = useCallback((ms: number) => {
    if (superBonkActiveRef.current || viewingIntegratedRef.current) return;
    // The rope has been answered: he settles back onto his station and then
    // climbs the rock, rather than climbing from partway up a dead rope.
    dropRise();
    // A travel in flight does NOT get to swallow the climb: tapping a rope
    // starts a sideways scramble, and answering it quickly lands mid-scramble.
    // Put him down at its destination and climb — the mountain is already
    // moving, and he must be climbing while it does.
    if (phase.current === 'jumping') {
      const dest = jumpDestRef.current;
      cancelRaf();
      if (dest) {
        const s = panShiftRef.current;
        placeRef.current(dest.x + s.x, dest.y + s.y, true);
      }
      jumpDestRef.current = null;
      phase.current = 'idle';
    }
    clearTimer();
    fadeBubble(0, 120);
    setFrame('CLIMB_A');
    if (stillRef.current) {
      timerRef.current = setTimeout(() => {
        setFrame('IDLE_A');
        scheduleJump(2200);
      }, Math.min(600, ms));
      return;
    }
    const t0 = performance.now();
    let gait = 0;
    const beat = () => {
      const now = performance.now();
      const g = Math.floor((now - t0) / 130) % 2;
      if (g !== gait) { gait = g; runPhase.value = g; }
      if (now - t0 < ms) {
        rafRef.current = requestAnimationFrame(beat);
      } else {
        setFrame('LAND_A');
        timerRef.current = setTimeout(() => {
          // Back to the route once the rock has arrived: he answered from the
          // rope's column, and the summit — when it comes — is on the route.
          const tx = nowXRef.current - PX * 12 - 10;
          const ty = nowYRef.current - PX * 10;
          const settle = () => {
            jumpDestRef.current = null;
            phase.current = 'idle';
            setFrame('IDLE_A');
            scheduleJump(2200 + Math.random() * 1200);
          };
          if (Math.abs(posRef.current.x - tx) > 24) {
            inspectedId.current = null;
            setInspectedIdState(null);
            setArrivedIdState(null);
            chillingRef.current = true;
            phase.current = 'jumping';
            jumpDestRef.current = { x: tx, y: ty, branchId: "__now__" };
            setFrame('RUN_A');
            glideRun(tx, ty, settle);
          } else {
            settle();
          }
        }, 320);
      }
    };
    cancelRaf();
    rafRef.current = requestAnimationFrame(beat);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs only
  }, [fadeBubble, glideRun, scheduleJump]);

  // ── Bootstrap ──
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
    if (verticalRef.current) {
      // Summit: he boots at his rest spot (base camp, his highest conquered
      // ledge, or the peak) — the stage feeds it via nowX/nowY.
      placeRef.current(nowXRef.current - PX * 12 - 10, nowYRef.current - PX * 10, true);
    } else {
      const startPos = ropeSpotRef.current(geo);
      placeRef.current(startPos.x, startPos.y, true);
      inspectedId.current = best.id;
      setInspectedIdState(best.id);
      markArrival('patrol');
      setArrivedIdState(best.id); // he starts the session standing at it
    }

    // Greet on first appearance
    if (!greetedThisSession) {
      greetedThisSession = true;
      timerRef.current = setTimeout(() => {
        setBubbleText(randomFrom(lang.greet));
        fadeBubble(1, 250);
        timerRef.current = setTimeout(() => {
          fadeBubble(0, 300);
          // Summit: he STAYS at the Now spot — the day starts there and the
          // first move is the user's (tap a rope). His own wandering between
          // ropes is a slow ambient thing, not the opening act.
          timerRef.current = setTimeout(
            () => jumpRef.current(),
            verticalRef.current ? 16000 : 500,
          );
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

  useEffect(() => () => { clearTimer(); cancelRaf(); stopGait(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onPress = useCallback(() => {
    const id = inspectedId.current;
    // Never open a panel for a thread that no longer exists (just burned).
    if (id && branchesRef.current.some(b => b.id === id)) onSelectRef.current(id);
  }, []);

  const visible = branches.some(b => !isClosed(b));

  return {
    pos, posX, posY, runPhase, rise, frame, flip,
    bubbleO, bubbleText,
    mascotType,
    inspectedBranchId: inspectedIdState,
    pendingBranchId: pendingIdState,
    arrivedBranchId: arrivedIdState,
    arrivedVia,
    onPress, showReaction, focusBranch, climbInPlace, shinUp, goHome, superBonk,
    phrases: lang, visible, born,
  };
}
