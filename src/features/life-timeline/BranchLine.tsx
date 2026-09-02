import { memo, useEffect } from "react";
import { Platform } from "react-native";
import type { GestureResponderEvent } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import { Circle, G, Path, Text as SvgText } from "react-native-svg";
import type { CircleProps } from "react-native-svg";
import type { PsychologicalBranch } from "@/domain/branches/types";
import type { BranchGeometry } from "@/visualization/branch-lines/paths";
import { branchColor, restingToday } from "@/visualization/branch-lines/style";
import type { ThemeId } from "@/visualization/theme";
import { decidedToday } from "@/domain/feelings/logic";
import { isClosed, isOpen } from "@/domain/branches/logic";
import { describeBranch } from "@/visualization/a11y/describe";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/ui/theme";
import { DragonHead } from "./DragonHead";
import { KoiFish } from "./KoiFish";
import { Balloon } from "./Balloon";
import { CatHead } from "./CatHead";
import { AnglerHead } from "./AnglerHead";
import { Ghost } from "./Ghost";
import { Pomeranian } from "./Pomeranian";
import { calmWaveOffset, useBranchStrokes, type WaveHandles } from "./useSquiggle";
import { CliffLedge, CoiledRope } from "./SummitScene";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

/** Themes where an undecided open thread ends in a creature instead of a
 * plain circle. Every creature takes the same props: anchored at the line
 * end, wearing the thread's colour, animated by its loudness. */
type CreatureProps = {
  x: number;
  y: number;
  scale?: number;
  color: string;
  loudness?: number;
  /** Comfort setting: creatures that move on their own hold still. */
  reducedMotion?: boolean;
  onPress?: () => void;
};
const CREATURES: Partial<Record<ThemeId, (props: CreatureProps) => React.JSX.Element>> = {
  demonfire: DragonHead,
  koipond: KoiFish,
  carnival: Balloon,
  catnap: CatHead,
  abyss: AnglerHead,
  gravemist: Ghost,
  pompom: Pomeranian,
};

type Props = {
  branch: PsychologicalBranch;
  geometry: BranchGeometry;
  theme: ThemeId;
  focused: boolean;
  emphasizedId?: string;
  /** The branch belongs to the action currently shown in the stack. */
  highlighted?: boolean;
  /** Another branch is in focus; this one steps back. */
  dimmed?: boolean;
  /** Just created: the line draws itself from the fork toward Now. */
  born?: boolean;
  /** Being burned: the fire overlay owns the pixels; this line steps out. */
  burning?: boolean;
  /** Comfort setting or system preference: no slither, no pulsing. */
  reducedMotion?: boolean;
  /** The app's current moment (epoch ms) — moves live, jumps on fast-forward. */
  nowMs?: number;
  /** While the loudness dial is being dragged: the level under the thumb. */
  
  /** A press starts here; sliding up or down dials this thread's loudness. */
  holdEnabled?: boolean;
  onHoldStart?: (branchId: string, e: GestureResponderEvent) => void;
  /** A press-and-hold is charging on this line: it swells until the pop. */
  holding?: boolean;
  /** Hold progress 0..1 on the UI thread (only read while `holding`). */
  holdP?: SharedValue<number>;
  onSelect: (branchId: string) => void;
  onSelectMoment: (branchId: string, momentId: string) => void;
  onSelectMergePoint: (branchId: string) => void;
  /** The main line's calm wave: this branch's fork/merge ends ride it. */
  wave?: WaveHandles | null;
  waveNowX?: number;
  wavePeriodMs?: number;
  /** Summit: the map runs vertically — ropes sway, anchors knot, coils rest. */
  orientation?: "horizontal" | "vertical";
  /** Summit: time-axis length, for mapping screen y to route arc length. */
  timeLen?: number;
  /** Summit: the route's wave — only the fork/merge dots ride it. */
  routeWave?: WaveHandles | null;
  /**
   * Summit: how far the mountain has slid down under the climber (world px).
   * The rope, its cliff edge and its coil live ON the mountain and ride this;
   * the rope's NAME and its moment dots do not — they stay in the fixed band
   * beside the climber, who never moves. That split is the whole illusion:
   * he holds still, the mountain travels.
   */
  climbOffset?: SharedValue<number> | null;
  /** False when this line is round the back of the summit's mountain: it is
   * drawn away to nothing, so it must not answer taps either. */
  interactive?: boolean;
  /** Summit: the world's seconds, shared with the climber so he swings in
   * step with the rope he is holding. Null elsewhere (local clock). */
  clock?: SharedValue<number> | null;
};

/** Cheap stable hash → [0, 2π): every rope sways on its own phase. */
export function phaseFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000 * 2 * Math.PI;
}

/**
 * Loud enough to move. The one predicate the rope's own sway and the climber
 * hanging on it both read — they must never disagree about whether it moves.
 * (`acted` folds into `!decidedToday`: a closed line fails `isOpen` already.)
 */
export function lineTrembles(o: {
  branch: PsychologicalBranch;
  inWindow: boolean;
  level: number;
  reducedMotion: boolean;
  now: Date;
  born: boolean;
}): boolean {
  return (
    o.inWindow &&
    !o.reducedMotion &&
    o.level > 1 &&
    isOpen(o.branch) &&
    !restingToday(o.branch, o.now) &&
    !decidedToday(o.branch, o.now) &&
    !o.born
  );
}

/** One branch: fork curve, run, optional merge curve, moments, label, endpoint. */
export const BranchLine = memo(function BranchLine({
  branch,
  geometry: g,
  theme,
  focused,
  emphasizedId,
  highlighted = false,
  dimmed = false,
  born = false,
  burning = false,
  reducedMotion = false,
  nowMs,
  holdEnabled = false,
  onHoldStart,
  onSelect,
  onSelectMoment,
  onSelectMergePoint,
  wave = null,
  waveNowX = 0,
  wavePeriodMs = 1,
  holding = false,
  holdP,
  orientation = "horizontal",
  timeLen = 0,
  routeWave = null,
  climbOffset = null,
  interactive = true,
  clock = null,
}: Props) {
  const vertical = orientation === "vertical";
  const t = useT();
  const tk = useTheme();
  const now = nowMs !== undefined ? new Date(nowMs) : new Date();
  const resting = restingToday(branch, now);
  // A decision was taken on this line today: it rests, marked with a quiet check.
  const acted = isOpen(branch) && decidedToday(branch, now);

  // Press-and-hold: the line grows under the finger until the pop opens its
  // dial. Costs nothing unless `holding` — the props read 0 and never change.
  const holdScaleProps = useAnimatedProps(() => {
    const p = holding && holdP ? holdP.value : 0;
    return { scale: 1 + 0.055 * p };
  }, [holding, holdP]);
  const holdGlowProps = useAnimatedProps(() => {
    const p = holding && holdP ? holdP.value : 0;
    return { r: Math.max(0.1, 4 + p * 16), opacity: 0.32 * p };
  }, [holding, holdP]);
  // The mountain's own slide: the rope and its cliff edge ride it, the
  // rope's name and moments do not (see the climbOffset prop).
  const climbRide = useAnimatedProps(
    () => ({ translateY: climbOffset ? climbOffset.value : 0 }),
    [climbOffset],
  );
  // Which frame a rope's MARKS live in depends on where the geometry put
  // them. A rope answered today has its label, moments and check at its cliff
  // ledge — on the rock, so they travel with it. A rope still hanging has them
  // in the fixed band beside the climber, who does not move.
  const marksOnRock = !!g.coiled;
  const marksRide = useAnimatedProps(
    () => ({ translateY: climbOffset && marksOnRock ? climbOffset.value : 0 }),
    [climbOffset, marksOnRock],
  );

  // Local closures over the id-keyed stable handlers (recreated only when
  // THIS branch renders — the parent's identity stays stable).
  const select = () => onSelect(branch.id);
  const holdTouch =
    holdEnabled && onHoldStart
      ? (e: GestureResponderEvent) => onHoldStart(branch.id, e)
      : undefined;

  // The line slithers with its loudness — a wave travelling toward Now, wider
  // and faster the louder it is. Both ends stay anchored; a decision today
  // quiets it. The hit path keeps the true geometry and feeds the sampler.
  const loudness = Math.max(1, Math.min(5, g.loudness));
  const trembling = lineTrembles({
    branch,
    inWindow: g.inWindow,
    level: loudness,
    reducedMotion,
    now,
    born,
  });

  const emphasized =
    !resting &&
    !acted &&
    !dimmed &&
    (g.style.emphasized || branch.id === emphasizedId || highlighted);

  const strokes = useBranchStrokes({
    trembling,
    level: loudness,
    basePath: g.path,
    born,
    flowing: g.inWindow && !born && g.style.animated,
    flowDurationMs: emphasized ? 1400 : tk.flowDuration,
    reducedMotion,
    wave,
    waveNowX,
    wavePeriodMs,
    attachStart: g.forkVisible,
    attachEnd: g.endsOnMain,
    mode: vertical ? "sway" : "slither",
    swayPhase: vertical ? phaseFromId(branch.id) : 0,
    // Summit hands in the world's clock so the climber gripping this rope can
    // reproduce its sway exactly (see Mascot's `sway`). The horizontal maps
    // keep the local one, which ticks only while something is trembling.
    clock,
  });

  // The fork and merge dots sit ON the main line, so they rise and fall
  // with its wave — same clock, same formula, no drift. On the summit map
  // the route runs vertically and its wave displaces x, so the dots ride
  // sideways instead (routeWave; arc length runs canvas bottom → ledge).
  const forkDotProps = useAnimatedProps<CircleProps>(() => {
    if (vertical) {
      return {
        cx:
          g.forkX -
          (routeWave
            ? calmWaveOffset(
                timeLen - g.forkY,
                routeWave.tick.value,
                Math.min(1.35, routeWave.progressSV.value + routeWave.surgeSV.value),
                routeWave.progressSV.value,
                waveNowX,
                wavePeriodMs,
              )
            : 0),
      };
    }
    return {
      cy:
        g.forkY -
        (wave
          ? calmWaveOffset(
              g.forkX,
              wave.tick.value,
              Math.min(1.35, wave.progressSV.value + wave.surgeSV.value),
              wave.progressSV.value,
              waveNowX,
              wavePeriodMs,
            )
          : 0),
    };
  }, [g.forkX, g.forkY, wave, routeWave, vertical, timeLen, waveNowX, wavePeriodMs]);
  const mergeDotProps = useAnimatedProps<CircleProps>(() => {
    if (vertical) {
      return {
        cx:
          g.endX -
          (routeWave && g.endsOnMain
            ? calmWaveOffset(
                timeLen - g.endY,
                routeWave.tick.value,
                Math.min(1.35, routeWave.progressSV.value + routeWave.surgeSV.value),
                routeWave.progressSV.value,
                waveNowX,
                wavePeriodMs,
              )
            : 0),
      };
    }
    return {
      cy:
        g.endY -
        (wave && g.endsOnMain
          ? calmWaveOffset(
              g.endX,
              wave.tick.value,
              Math.min(1.35, wave.progressSV.value + wave.surgeSV.value),
              wave.progressSV.value,
              waveNowX,
              wavePeriodMs,
            )
          : 0),
    };
  }, [g.endX, g.endY, g.endsOnMain, wave, routeWave, vertical, timeLen, waveNowX, wavePeriodMs]);

  // `.branch-dimmed { transition: opacity 0.25s ease }` — the whole group
  // steps back while another line holds the focus.
  const groupOpacity = useSharedValue(burning ? 0 : dimmed ? 0.22 : 1);
  useEffect(() => {
    // While burning, the fire overlay draws this line instead — vanish at once.
    groupOpacity.value = burning
      ? 0
      : withTiming(dimmed ? 0.22 : 1, {
          duration: 250,
          easing: Easing.inOut(Easing.ease),
        });
  }, [dimmed, burning, groupOpacity]);
  const groupProps = useAnimatedProps(() => ({ opacity: groupOpacity.value }));

  // `.pulse` on an emphasized endpoint: opacity 0.95 ↔ 0.55, 2.2s ease-in-out.
  const pulsing = g.inWindow && emphasized && !reducedMotion;
  const endpointStaticOpacity = acted ? 0.9 : g.style.opacity;
  const pulse = useSharedValue(0.95);
  useEffect(() => {
    if (!pulsing) {
      cancelAnimation(pulse);
      pulse.value = 0.95;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.95, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [pulsing, pulse]);
  const endpointProps = useAnimatedProps(
    () => ({ opacity: pulsing ? pulse.value : endpointStaticOpacity }),
    [pulsing, endpointStaticOpacity],
  );

  // A closed line lives in its own time frame: off the window, nothing is drawn.
  if (!g.inWindow) return null;

  const color = branchColor(branch, theme, emphasized ? "raised" : g.style.saturation);
  // Rope labels ladder above narrow columns: they earn less room than lanes.
  const maxChars = vertical ? 22 : 34;
  const label =
    branch.title.length > maxChars ? branch.title.slice(0, maxChars - 2) + "…" : branch.title;
  const Creature = CREATURES[theme];
  const labelText =
    label +
    (branch.recurrenceCount > 0 ? t(" · returned") : "") +
    (acted ? t(" · decided today") : "");
  const labelX = vertical ? g.labelX : g.reachesNow ? g.endX - 12 : g.labelX;
  const labelAnchor = vertical
    ? (g.labelAnchor ?? ("middle" as const))
    : g.reachesNow
      ? ("end" as const)
      : undefined;

  // Answered for the day on the summit map: the rope leaves the face and a
  // small coil rests at its anchor — still tappable, back as a rope tomorrow
  // (the same date compare that lets a faint lane return elsewhere).
  // For open ropes `(resting || acted)` equals domain handledToday() — the
  // predicate the climb's ledge count uses — so a rope EARNS its ledge
  // exactly when it is answered. (handledToday itself lacks acted's isOpen
  // guard, which a merged-today rope needs to keep drawing its merged path.)
  // But it only LEAVES the face once the climber has topped it out and is
  // standing on that ledge — `g.ropeGone`, held back by LifeTimeline until
  // his climb lands. Until then the answered rope still hangs, now visibly
  // fixed to its cliff edge, and he climbs it.
  if (vertical && (resting || acted) && g.ropeGone && !g.endsOnMain) {
    return (
      <AnimatedG
        animatedProps={groupProps}
        accessible
        accessibilityLabel={describeBranch(branch, t)}
      >
        {/* the conquered rope rests coiled on its own cliff ledge — part of
            the mountain now, so it travels down with it */}
        <AnimatedG animatedProps={climbRide}>
          <CliffLedge x={g.endX} y={g.endY} tk={tk} />
          <CoiledRope x={g.endX} y={g.endY - 9} color={color} bg={tk.bg} onPress={select} />
        </AnimatedG>
      </AnimatedG>
    );
  }

  return (
    <AnimatedG
      animatedProps={groupProps}
      accessible
      accessibilityLabel={describeBranch(branch, t)}
      onPressIn={holdTouch}
    >
      {/* the rope itself hangs on the mountain: hit area and strokes ride
          its slide, while the label and moments below stay with the climber */}
      <AnimatedG animatedProps={climbRide}>
      {/* generous invisible hit area — the true geometry, never squiggled.
          react-native-svg on web only maps onPress→onClick, so the loudness
          dial's touch-start needs the DOM pointerdown directly. */}
      <Path
        d={g.path}
        stroke="transparent"
        strokeWidth={22}
        fill="none"
        pointerEvents={interactive ? "auto" : "none"}
        onPress={interactive ? select : undefined}
        {...(Platform.OS === "web" && holdTouch
          ? ({ onPointerDown: holdTouch } as object)
          : null)}
      />

      {/* only the strokes slither with loudness; the endpoints, dots, hit
          area, fork dot, merge point and label stay still and readable.
          A press-and-hold scales them gently around the endpoint — the
          Facebook-emoji swell before the pop. */}
      <AnimatedG
        animatedProps={holdScaleProps}
        // The pivot must be a point that is actually on screen. On the summit
        // a rope's `endY` is its anchor, thousands of px above the viewport, so
        // scaling about it slid the whole rope ~200px down the screen; its
        // label band sits in the visible stretch instead.
        origin={vertical ? `${g.endX}, ${g.labelY}` : `${g.endX}, ${g.endY}`}
        pointerEvents="none"
      >

      {/* soft halo behind the line of the action being viewed */}
      {highlighted && (
        <AnimatedPath
          animatedProps={strokes.halo}
          stroke={color}
          strokeWidth={g.thickness + 9}
          opacity={0.16}
          fill="none"
          strokeLinecap="round"
          pointerEvents="none"
        />
      )}

      {/* the visible line; a newborn line draws itself from the fork toward
          Now. On the summit it is an actual rope: a dark round under-stroke
          for the cylinder, the colored core, and dashed twist ridges — all
          riding the same swaying path. */}
      {/* branchColor speaks hsl(), which mix() can't parse — the rope's dark
          layers are translucent black over/under the core instead, so they
          shade whatever color the thread wears. */}
      {vertical && !born && (
        <AnimatedPath
          animatedProps={strokes.underlay}
          stroke="#141b22"
          strokeWidth={g.thickness + 2.8}
          opacity={g.style.opacity * 0.5}
          fill="none"
          strokeLinecap="round"
          pointerEvents="none"
        />
      )}
      <AnimatedPath
        animatedProps={strokes.line}
        stroke={color}
        strokeWidth={
          vertical
            ? g.thickness + (focused || highlighted ? 2.2 : 1.2)
            : focused || highlighted
              ? g.thickness + 1.25
              : g.thickness
        }
        opacity={g.style.opacity}
        fill="none"
        strokeLinecap="round"
        pointerEvents="none"
      />
      {vertical && !born && (
        <AnimatedPath
          animatedProps={strokes.bands}
          stroke="#141b22"
          strokeWidth={g.thickness + 2.2}
          strokeDasharray={[2.8, 5]}
          opacity={g.style.opacity * 0.38}
          fill="none"
          strokeLinecap="butt"
          pointerEvents="none"
        />
      )}

      {/* subtle directional movement toward the present (the rope's twist
          ridges replace it on the summit) */}
      {!vertical && !born && g.style.animated && (
        <AnimatedPath
          animatedProps={strokes.flow}
          stroke={color}
          strokeWidth={Math.max(1.5, g.thickness - 1)}
          strokeDasharray={tk.flowDash}
          opacity={0.85}
          fill="none"
          strokeLinecap="round"
          pointerEvents="none"
        />
      )}
      </AnimatedG>
      </AnimatedG>

      {/* the charging bulge of a press-and-hold, right where it will pop */}
      {holding && (
        <AnimatedCircle
          animatedProps={holdGlowProps}
          cx={g.endX - 3}
          // same reason as the swell's pivot above: on the summit the anchor is
          // off-screen, so the charge glow belongs in the visible band
          cy={vertical ? g.labelY : g.endY}
          fill={color}
          pointerEvents="none"
        />
      )}

      {/* moments along the branch */}
      <AnimatedG animatedProps={marksRide}>
      {g.momentPoints.map((p) => (
        <Circle
          key={p.moment.id}
          cx={p.x}
          cy={p.y}
          r={4.5}
          fill={color}
          stroke={tk.bg}
          strokeWidth={1.5}
          onPress={() => onSelectMoment(branch.id, p.moment.id)}
        />
      ))}
      </AnimatedG>

      {/* endpoint: the line's presence at Now (merged lines get theirs below).
          In a creature theme an undecided open thread is a small creature
          facing you; a decision today calms it back into the plain circle. */}
      {!g.endsOnMain &&
        (vertical ? (
          // the anchor is a feature of the rock — it rides the mountain's
          // slide, which is how a conquered ledge arrives under his feet
          <AnimatedG animatedProps={climbRide}>
            {/* the anchor: a little cliff ledge on the face, the rope tied
                over its lip */}
            <CliffLedge x={g.endX} y={g.endY} tk={tk} />
            <Circle
              cx={g.endX}
              cy={g.endY - 4}
              r={3.4}
              fill={color}
              opacity={endpointStaticOpacity}
              onPress={select}
            />
          </AnimatedG>
        ) : Creature && !acted && !resting ? (
          <Creature
            x={g.endX}
            y={g.endY}
            scale={1.4 + (g.thickness - 2) * 0.24}
            color={color}
            loudness={loudness}
            reducedMotion={reducedMotion}
            onPress={select}
          />
        ) : (
          <AnimatedCircle
            animatedProps={endpointProps}
            cx={g.endX - 3}
            cy={g.endY}
            r={acted ? 6.5 : emphasized ? 6 : 5}
            fill={color}
            onPress={select}
          />
        ))}

      {/* a decision was taken here today: a quiet check at the line's end */}
      {acted && !g.endsOnMain && (
        <AnimatedG animatedProps={marksRide}>
        <Path
          d={`M ${g.endX - 6} ${g.endY + 0.2} l 2.2 2.3 l 4 -4.8`}
          fill="none"
          stroke={tk.bg}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
        </AnimatedG>
      )}

      {/* fork point on the main line — rides the calm wave with it */}
      {g.forkVisible && (
        <AnimatedCircle
          animatedProps={forkDotProps}
          cx={g.forkX}
          cy={g.forkY}
          r={4}
          stroke={color}
          strokeWidth={2}
          fill={tk.bg}
        />
      )}

      {/* a merged line ends on the main line: its point moves with the line */}
      {g.endsOnMain && (
        <AnimatedCircle
          animatedProps={mergeDotProps}
          cx={g.endX}
          cy={g.endY}
          r={6}
          stroke={color}
          strokeWidth={2.5}
          fill={tk.bg}
          onPress={() => onSelectMergePoint(branch.id)}
        />
      )}

      {/* a merged line or one deliberately left for today carries no label —
          it has been answered; a left line's label returns tomorrow.
          paint-order: stroke isn't supported here, so a stroked twin sits
          behind the filled text to keep it readable over other lines. */}
      {g.labelVisible && !resting && !isClosed(branch) && (
        <AnimatedG animatedProps={marksRide}>
          <SvgText
            x={labelX}
            y={g.labelY}
            textAnchor={labelAnchor}
            fontSize={12.5}
            fontWeight={focused ? "700" : "600"}
            fontFamily={tk.fontBody}
            stroke={tk.bg}
            strokeWidth={4}
            fill={tk.bg}
            pointerEvents="none"
          >
            {labelText}
          </SvgText>
          <SvgText
            x={labelX}
            y={g.labelY}
            textAnchor={labelAnchor}
            fontSize={12.5}
            fontWeight={focused ? "700" : "600"}
            fontFamily={tk.fontBody}
            fill={color}
            onPress={select}
          >
            {labelText}
          </SvgText>
        </AnimatedG>
      )}
    </AnimatedG>
  );
},
/**
 * Geometry objects are rebuilt wholesale on every layout pass, so the default
 * shallow compare re-renders every line whenever anything at all changes —
 * which, mid-climb, re-commits every animated path and can drop a frame back
 * to its declarative value. Compare the geometry by VALUE instead.
 */
function sameLine(a: Props, b: Props) {
  const g = a.geometry;
  const h = b.geometry;
  if (
    g !== h &&
    (g.path !== h.path ||
      g.forkX !== h.forkX ||
      g.forkY !== h.forkY ||
      g.endX !== h.endX ||
      g.endY !== h.endY ||
      g.laneY !== h.laneY ||
      g.labelX !== h.labelX ||
      g.labelY !== h.labelY ||
      g.thickness !== h.thickness ||
      g.loudness !== h.loudness ||
      g.inWindow !== h.inWindow ||
      g.labelVisible !== h.labelVisible ||
      g.forkVisible !== h.forkVisible ||
      g.endsOnMain !== h.endsOnMain ||
      g.reachesNow !== h.reachesNow ||
      g.coiled !== h.coiled ||
      g.ropeGone !== h.ropeGone ||
      g.labelAnchor !== h.labelAnchor ||
      g.style !== h.style ||
      g.momentPoints.length !== h.momentPoints.length ||
      g.momentPoints.some((p, i) => {
        const q = h.momentPoints[i];
        return p.x !== q.x || p.y !== q.y || p.moment.id !== q.moment.id;
      }))
  ) {
    return false;
  }
  for (const k of Object.keys(a) as (keyof Props)[]) {
    if (k === "geometry") continue;
    if (a[k] !== b[k]) return false;
  }
  return Object.keys(a).length === Object.keys(b).length;
});
