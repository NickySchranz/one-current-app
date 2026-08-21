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
} from "react-native-reanimated";
import { Circle, G, Path, Text as SvgText } from "react-native-svg";
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
import { useBranchStrokes } from "./useSquiggle";

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
  loudnessPreview?: number;
  /** A press starts here; sliding up or down dials this thread's loudness. */
  onDialTouchStart?: (e: GestureResponderEvent) => void;
  onSelect: () => void;
  onSelectMoment: (momentId: string) => void;
  onSelectMergePoint: () => void;
};

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
  loudnessPreview,
  onDialTouchStart,
  onSelect,
  onSelectMoment,
  onSelectMergePoint,
}: Props) {
  const t = useT();
  const tk = useTheme();
  const now = nowMs !== undefined ? new Date(nowMs) : new Date();
  const resting = restingToday(branch, now);
  // A decision was taken on this line today: it rests, marked with a quiet check.
  const acted = isOpen(branch) && decidedToday(branch, now);

  // The line slithers with its loudness — a wave travelling toward Now, wider
  // and faster the louder it is. Both ends stay anchored; a decision today
  // quiets it. The hit path keeps the true geometry and feeds the sampler.
  const loudness = Math.max(1, Math.min(5, loudnessPreview ?? g.loudness));
  const trembling =
    g.inWindow &&
    !reducedMotion &&
    loudness > 1 &&
    isOpen(branch) &&
    !resting &&
    !acted &&
    !born;

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
  });

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
  const label = branch.title.length > 34 ? branch.title.slice(0, 32) + "…" : branch.title;
  const Creature = CREATURES[theme];
  const labelText =
    label +
    (branch.recurrenceCount > 0 ? t(" · returned") : "") +
    (acted ? t(" · decided today") : "");
  const labelX = g.reachesNow ? g.endX - 12 : g.labelX;
  const labelAnchor = g.reachesNow ? ("end" as const) : undefined;

  return (
    <AnimatedG
      animatedProps={groupProps}
      accessible
      accessibilityLabel={describeBranch(branch, t)}
      onPressIn={onDialTouchStart}
    >
      {/* generous invisible hit area — the true geometry, never squiggled.
          react-native-svg on web only maps onPress→onClick, so the loudness
          dial's touch-start needs the DOM pointerdown directly. */}
      <Path
        d={g.path}
        stroke="transparent"
        strokeWidth={22}
        fill="none"
        onPress={onSelect}
        {...(Platform.OS === "web" && onDialTouchStart
          ? ({ onPointerDown: onDialTouchStart } as object)
          : null)}
      />

      {/* only the strokes slither with loudness; the endpoints, dots, hit
          area, fork dot, merge point and label stay still and readable */}

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

      {/* the visible line; a newborn line draws itself from the fork toward Now */}
      <AnimatedPath
        animatedProps={strokes.line}
        stroke={color}
        strokeWidth={focused || highlighted ? g.thickness + 1.25 : g.thickness}
        opacity={g.style.opacity}
        fill="none"
        strokeLinecap="round"
        pointerEvents="none"
      />

      {/* subtle directional movement toward the present */}
      {!born && g.style.animated && (
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

      {/* moments along the branch */}
      {g.momentPoints.map((p) => (
        <Circle
          key={p.moment.id}
          cx={p.x}
          cy={p.y}
          r={4.5}
          fill={color}
          stroke={tk.bg}
          strokeWidth={1.5}
          onPress={() => onSelectMoment(p.moment.id)}
        />
      ))}

      {/* endpoint: the line's presence at Now (merged lines get theirs below).
          In a creature theme an undecided open thread is a small creature
          facing you; a decision today calms it back into the plain circle. */}
      {!g.endsOnMain &&
        (Creature && !acted && !resting ? (
          <Creature
            x={g.endX}
            y={g.endY}
            scale={1.4 + (g.thickness - 2) * 0.24}
            color={color}
            loudness={loudness}
            reducedMotion={reducedMotion}
            onPress={onSelect}
          />
        ) : (
          <AnimatedCircle
            animatedProps={endpointProps}
            cx={g.endX - 3}
            cy={g.endY}
            r={acted ? 6.5 : emphasized ? 6 : 5}
            fill={color}
            onPress={onSelect}
          />
        ))}

      {/* a decision was taken here today: a quiet check at the line's end */}
      {acted && !g.endsOnMain && (
        <Path
          d={`M ${g.endX - 6} ${g.endY + 0.2} l 2.2 2.3 l 4 -4.8`}
          fill="none"
          stroke={tk.bg}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}

      {/* fork point on the main line — only when the fork moment is in view */}
      {g.forkVisible && (
        <Circle cx={g.forkX} cy={g.forkY} r={4} stroke={color} strokeWidth={2} fill={tk.bg} />
      )}

      {/* a merged line ends on the main line: its point stays still */}
      {g.endsOnMain && (
        <Circle
          cx={g.endX}
          cy={g.endY}
          r={6}
          stroke={color}
          strokeWidth={2.5}
          fill={tk.bg}
          onPress={onSelectMergePoint}
        />
      )}

      {/* a merged line or one deliberately left for today carries no label —
          it has been answered; a left line's label returns tomorrow.
          paint-order: stroke isn't supported here, so a stroked twin sits
          behind the filled text to keep it readable over other lines. */}
      {g.labelVisible && !resting && !isClosed(branch) && (
        <>
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
            onPress={onSelect}
          >
            {labelText}
          </SvgText>
        </>
      )}
    </AnimatedG>
  );
});
