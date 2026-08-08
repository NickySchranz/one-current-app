/**
 * A pomeranian pup for the Pompom theme: each open thread ends in one sitting
 * at Now, looking straight at you. Classic orange-brown coat with a little
 * white blaze on the forehead, white chest, white paws and a white tail tip;
 * only its collar wears the thread's colour, so every pup stays recognizably
 * its thread.
 *
 * The pup carries the thread's mood. Quiet: a happy blep, blushing cheeks,
 * a wagging tail and, every few seconds, a little hop of joy — each pup on
 * its own clock, so a happy pack pops one at a time. Middling: alert, mouth
 * just open. Loud (4–5): a proper
 * pomeranian tantrum — ears pinned back, angry brows, jaw open mid-bark with
 * tiny teeth, and bark marks snapping at both sides. Any honest decision
 * calms it back into a plain circle.
 *
 * Drawn sitting front-on, roughly 16×15 units before scaling. The fluff is
 * built from scalloped rings so the coat reads as fur, not a circle.
 *
 * Animation is Reanimated ports of the source CSS keyframes (pom-hop,
 * pom-wag, pom-yap, pom-bark). CSS `transform-box: fill-box` origins become
 * fixed translate wrappers around each animated group, using the group's
 * measured bounding box in drawing units.
 */

import { useEffect, useRef } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Circle, Ellipse, G, Path } from "react-native-svg";

const AnimatedG = Animated.createAnimatedComponent(G);

// CSS `ease-in-out` / `ease-out`
const EASE_IN_OUT = Easing.bezier(0.42, 0, 0.58, 1);
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);

const FUR = "#dd8f4a";
const FUR_DEEP = "#c1712f";
const WHITE = "#fdf8ef";
const EAR_INNER = "#e8a3b0";
const EYE_DARK = "#2b2118";
const NOSE = "#241d18";
const MOUTH_DARK = "#4a2b25";
const TONGUE = "#ec8b86";
const TONGUE_LINE = "#d16a66";
const BROW = "#4a352a";
const BARK_MARK = "#b3572f";

/** A scalloped circle: soft tufts bulging outward — the pup's fur. */
function fluffRing(
  cx: number,
  cy: number,
  r: number,
  amp: number,
  tufts: number,
  phase = 0,
): string {
  const pt = (angle: number, radius: number) =>
    `${(cx + Math.cos(angle) * radius).toFixed(2)} ${(cy + Math.sin(angle) * radius).toFixed(2)}`;
  let d = `M ${pt(phase, r)}`;
  for (let i = 1; i <= tufts; i++) {
    const a = phase + (i / tufts) * Math.PI * 2;
    const mid = phase + ((i - 0.5) / tufts) * Math.PI * 2;
    d += ` Q ${pt(mid, r + amp * 2)} ${pt(a, r)}`;
  }
  return d + " Z";
}

const TAIL = fluffRing(4.7, -1.1, 2.1, 0.5, 8, 0.4);
const TAIL_TIP = fluffRing(5.7, -2.2, 1.05, 0.32, 6, 0.9);
const BODY = fluffRing(0, 2.7, 3.9, 0.55, 10, 0.15);
const CHEST = fluffRing(0, 3.1, 2.3, 0.4, 8, 0.5);
const RUFF = fluffRing(0, -3.2, 4.3, 0.65, 11, 0.2);
const HEAD = fluffRing(0, -3.2, 3.55, 0.5, 9, 0.55);

// white blaze: a soft little stripe from the topknot down to between the eyes
const BLAZE =
  "M -0.55 -6.7 Q 0 -7.05 0.55 -6.7 C 0.65 -5.8 0.5 -4.7 0.38 -4.05" +
  " Q 0 -3.7 -0.38 -4.05 C -0.5 -4.7 -0.65 -5.8 -0.55 -6.7 Z";

// ears: outer triangles with a pink inner, hinged where they meet the ruff
const EAR_L = "M -1.9 -5.5 L -3.3 -8.3 L -4.5 -5.8 Z";
const EAR_L_IN = "M -2.5 -5.9 L -3.3 -7.5 L -3.9 -6.0 Z";
const EAR_R = "M 1.9 -5.5 L 3.3 -8.3 L 4.5 -5.8 Z";
const EAR_R_IN = "M 2.5 -5.9 L 3.3 -7.5 L 3.9 -6.0 Z";

const NOSE_PATH =
  "M -0.55 -2.55 Q 0 -2.9 0.55 -2.55 Q 0.62 -2.15 0 -1.8 Q -0.62 -2.15 -0.55 -2.55 Z";

const SMILE =
  "M 0 -1.8 L 0 -1.5 M 0 -1.5 Q -0.5 -0.9 -1.05 -1.5 M 0 -1.5 Q 0.5 -0.9 1.05 -1.5";

// the collar: a curved band across the chest, wearing the thread's colour
const COLLAR = "M -2.9 0.9 Q 0 2.3 2.9 0.9 L 2.75 1.75 Q 0 3.1 -2.75 1.75 Z";

// bark marks: two nested arcs snapping outward on each side of the head
const BARK_L1 = "M -5.1 -4.4 Q -6.0 -3.2 -5.1 -2.0";
const BARK_L2 = "M -6.1 -5.0 Q -7.4 -3.2 -6.1 -1.4";
const BARK_R1 = "M 5.1 -4.4 Q 6.0 -3.2 5.1 -2.0";
const BARK_R2 = "M 6.1 -5.0 Q 7.4 -3.2 6.1 -1.4";

// CSS transform-origins (`transform-box: fill-box` percentages) resolved
// against each group's bounding box in drawing units.
const WHOLE_ORIGIN = { x: 1.2, y: 7.2 }; // .pom-whole: 50% 100%
const TAIL_ORIGIN = { x: 3.1, y: 0.7 }; // .pom-tail: 20% 85%
const HEAD_ORIGIN = { x: 0, y: 0.75 }; // .pom-head: 50% 90%
const BARK_ORIGIN = { x: 0, y: -3.2 }; // .pom-bark: 50% 50%

const HOP_PERIOD = 5200; // pom-hop 5.2s

type Props = {
  x: number;
  y: number;
  scale?: number;
  /** The thread's line colour: the pup's collar. */
  color: string;
  /** Effective loudness 1–5: happy blep → alert → full barking tantrum. */
  loudness?: number;
  /** Comfort setting: the pup holds still — no wag, no yap. */
  reducedMotion?: boolean;
  onPress?: () => void;
};

export function Pomeranian({
  x,
  y,
  scale = 1,
  color,
  loudness = 3,
  reducedMotion = false,
  onPress,
}: Props) {
  const g = Math.max(1, Math.min(5, loudness));
  const happy = g < 2.5;
  const barking = g >= 4;
  const earPin = Math.max(0, g - 2) * 7; // ears fold outward as it gets louder
  const eyeRy = barking ? 0.75 : 0.95;
  // a stable random phase per pup: happy hops land one at a time, not in chorus
  const hopDelay = useRef(Math.random() * HOP_PERIOD);

  // pom-hop: the whole pup — squash, pop, land
  const hopTy = useSharedValue(0);
  const hopSx = useSharedValue(1);
  const hopSy = useSharedValue(1);
  // pom-wag: the tail
  const wagRot = useSharedValue(0);
  // pom-yap: the head
  const yapTy = useSharedValue(0);
  const yapRot = useSharedValue(0);
  // pom-bark: the bark marks (static attribute opacity was 0.85)
  const barkOp = useSharedValue(0.85);
  const barkScale = useSharedValue(1);

  const happyAnim = happy && !reducedMotion;
  const barkAnim = barking && !reducedMotion;

  useEffect(() => {
    const rest = () => {
      for (const v of [hopTy, hopSx, hopSy, wagRot, yapTy, yapRot, barkOp, barkScale]) {
        cancelAnimation(v);
      }
      hopTy.value = 0;
      hopSx.value = 1;
      hopSy.value = 1;
      wagRot.value = 0;
      yapTy.value = 0;
      yapRot.value = 0;
      barkOp.value = 0.85;
      barkScale.value = 1;
    };
    rest();

    if (happyAnim) {
      // pom-hop 5.2s ease-in-out infinite; keyframes 0/76/79/84/89/93/100%
      const hop = (a: number, b: number, c: number, d: number) =>
        withDelay(
          hopDelay.current,
          withRepeat(
            withSequence(
              withTiming(a, { duration: 3952 }), // 0 → 76%: hold
              withTiming(b, { duration: 156, easing: EASE_IN_OUT }), // 79%
              withTiming(c, { duration: 260, easing: EASE_IN_OUT }), // 84%
              withTiming(d, { duration: 260, easing: EASE_IN_OUT }), // 89%
              withTiming(a, { duration: 208, easing: EASE_IN_OUT }), // 93%
              withTiming(a, { duration: 364 }), // 93 → 100%: hold
            ),
            -1,
            false,
          ),
        );
      hopTy.value = hop(0, 0.5, -2.6, 0);
      hopSx.value = hop(1, 1.07, 0.96, 1.05);
      hopSy.value = hop(1, 0.9, 1.06, 0.93);

      // pom-wag 1.1s ease-in-out infinite: rotate(-9deg) ↔ rotate(11deg)
      wagRot.value = -9;
      wagRot.value = withRepeat(
        withSequence(
          withTiming(11, { duration: 550, easing: EASE_IN_OUT }),
          withTiming(-9, { duration: 550, easing: EASE_IN_OUT }),
        ),
        -1,
        false,
      );
    } else if (barkAnim) {
      // pom-yap 0.6s ease-in-out infinite; keyframes 0/30/55/100%
      const yap = (a: number, b: number, c: number) =>
        withRepeat(
          withSequence(
            withTiming(b, { duration: 180, easing: EASE_IN_OUT }),
            withTiming(c, { duration: 150, easing: EASE_IN_OUT }),
            withTiming(a, { duration: 270, easing: EASE_IN_OUT }),
          ),
          -1,
          false,
        );
      yapTy.value = yap(0, -0.7, 0.2);
      yapRot.value = yap(0, -2.5, 1.5);

      // pom-bark 0.6s ease-out infinite; keyframes 0/35/100%, snapping back
      const bark = (start: number, mid: number, end: number) =>
        withRepeat(
          withSequence(
            withTiming(start, { duration: 1 }), // keyframes restart from 0%
            withTiming(mid, { duration: 209, easing: EASE_OUT }),
            withTiming(end, { duration: 390, easing: EASE_OUT }),
          ),
          -1,
          false,
        );
      barkOp.value = bark(0, 0.9, 0);
      barkScale.value = bark(0.7, 1, 1.18);
    }
    return rest;
  }, [happyAnim, barkAnim, hopTy, hopSx, hopSy, wagRot, yapTy, yapRot, barkOp, barkScale]);

  const wholeProps = useAnimatedProps(() => ({
    transform: [
      { translateY: hopTy.value },
      { scaleX: hopSx.value },
      { scaleY: hopSy.value },
    ],
  }));
  const tailProps = useAnimatedProps(() => ({
    transform: [{ rotate: `${wagRot.value}deg` }],
  }));
  const headProps = useAnimatedProps(() => ({
    transform: [{ translateY: yapTy.value }, { rotate: `${yapRot.value}deg` }],
  }));
  const barkProps = useAnimatedProps(() => ({
    opacity: barkOp.value,
    transform: [{ scale: barkScale.value }],
  }));

  return (
    <G
      transform={`translate(${x - 4}, ${y - 2}) scale(${(scale * 0.85).toFixed(3)})`}
      onPress={onPress}
    >
      {/* generous invisible hit area — ears, tail and bark marks are thin */}
      <Circle cx={0} cy={-0.5} r={9.5} fill="transparent" stroke="none" />

      {/* the whole pup hops from its feet (origin bottom-centre) */}
      <G transform={`translate(${WHOLE_ORIGIN.x}, ${WHOLE_ORIGIN.y})`}>
        <AnimatedG animatedProps={wholeProps}>
          <G transform={`translate(${-WHOLE_ORIGIN.x}, ${-WHOLE_ORIGIN.y})`}>
            {/* tail: a plume over the back, white at the tip; it wags when happy */}
            <G transform={`translate(${TAIL_ORIGIN.x}, ${TAIL_ORIGIN.y})`}>
              <AnimatedG animatedProps={tailProps}>
                <G transform={`translate(${-TAIL_ORIGIN.x}, ${-TAIL_ORIGIN.y})`}>
                  <Path d={TAIL} fill={FUR_DEEP} />
                  <Path d={TAIL_TIP} fill={WHITE} opacity={0.92} />
                </G>
              </AnimatedG>
            </G>

            {/* seated fluff-ball body with a white chest */}
            <Path d={BODY} fill={FUR} />
            <Path d={CHEST} fill={WHITE} opacity={0.88} />

            {/* little white front paws with toe marks */}
            <G>
              <Ellipse cx={-1.7} cy={6.15} rx={1.15} ry={0.85} fill={WHITE} />
              <Ellipse cx={1.7} cy={6.15} rx={1.15} ry={0.85} fill={WHITE} />
              <Path
                d="M -1.95 5.6 L -1.95 6.6 M -1.35 5.65 L -1.35 6.65 M 1.35 5.65 L 1.35 6.65 M 1.95 5.6 L 1.95 6.6"
                stroke={FUR_DEEP}
                strokeWidth={0.18}
                strokeLinecap="round"
                opacity={0.4}
                fill="none"
              />
            </G>

            {/* the collar keeps the thread's colour, with a little tag */}
            <G>
              <Path d={COLLAR} fill={color} />
              <Circle cx={0} cy={2.5} r={0.52} fill="#eec96d" stroke="#a8843a" strokeWidth={0.14} />
            </G>

            {/* the head: yaps forward when barking */}
            <G transform={`translate(${HEAD_ORIGIN.x}, ${HEAD_ORIGIN.y})`}>
              <AnimatedG animatedProps={headProps}>
                <G transform={`translate(${-HEAD_ORIGIN.x}, ${-HEAD_ORIGIN.y})`}>
                  {/* ears pin back the louder the thread gets */}
                  <G transform={`rotate(${-earPin} -3.2 -5.7)`}>
                    <Path d={EAR_L} fill={FUR_DEEP} />
                    <Path d={EAR_L_IN} fill={EAR_INNER} opacity={0.85} />
                  </G>
                  <G transform={`rotate(${earPin} 3.2 -5.7)`}>
                    <Path d={EAR_R} fill={FUR_DEEP} />
                    <Path d={EAR_R_IN} fill={EAR_INNER} opacity={0.85} />
                  </G>

                  {/* two fluff layers so the coat reads as fur */}
                  <Path d={RUFF} fill={FUR_DEEP} />
                  <Path d={HEAD} fill={FUR} />

                  {/* the little white blaze on the forehead */}
                  <Path d={BLAZE} fill={WHITE} opacity={0.92} />

                  {/* white muzzle */}
                  <Ellipse cx={0} cy={-1.9} rx={1.85} ry={1.5} fill={WHITE} opacity={0.9} />

                  {/* button eyes, each with a double sparkle; they narrow when barking */}
                  <Ellipse cx={-1.75} cy={-3.3} rx={0.95} ry={eyeRy} fill={EYE_DARK} />
                  <Ellipse cx={1.75} cy={-3.3} rx={0.95} ry={eyeRy} fill={EYE_DARK} />
                  <Circle cx={-2.05} cy={-3.6} r={0.3} fill="#fff" opacity={0.95} />
                  <Circle cx={1.45} cy={-3.6} r={0.3} fill="#fff" opacity={0.95} />
                  <Circle cx={-1.5} cy={-3.05} r={0.14} fill="#fff" opacity={0.7} />
                  <Circle cx={2} cy={-3.05} r={0.14} fill="#fff" opacity={0.7} />

                  {/* angry brows arrive with the bark */}
                  {g >= 3.5 && (
                    <G
                      stroke={BROW}
                      strokeWidth={0.45}
                      strokeLinecap="round"
                      opacity={Math.min(1, (g - 3.5) / 1.2 + 0.4)}
                    >
                      <Path d="M -2.6 -4.75 L -0.95 -4.15" fill="none" />
                      <Path d="M 2.6 -4.75 L 0.95 -4.15" fill="none" />
                    </G>
                  )}

                  <Path d={NOSE_PATH} fill={NOSE} />

                  {/* the mouth carries the mood: blep, alert, or mid-bark */}
                  {happy ? (
                    <G>
                      <Path d={SMILE} fill="none" stroke={NOSE} strokeWidth={0.26} opacity={0.65} />
                      <Ellipse cx={0} cy={-0.78} rx={0.5} ry={0.62} fill={TONGUE} />
                      <Path
                        d="M 0 -1.1 L 0 -0.45"
                        stroke={TONGUE_LINE}
                        strokeWidth={0.16}
                        opacity={0.7}
                      />
                      <Ellipse cx={-2.7} cy={-2.2} rx={0.75} ry={0.45} fill={TONGUE} opacity={0.35} />
                      <Ellipse cx={2.7} cy={-2.2} rx={0.75} ry={0.45} fill={TONGUE} opacity={0.35} />
                    </G>
                  ) : barking ? (
                    <G>
                      <Ellipse cx={0} cy={-1.05} rx={1.05} ry={0.95} fill={MOUTH_DARK} />
                      <Path d="M -0.55 -1.85 L -0.3 -1.35 L -0.05 -1.85 Z" fill="#fff" opacity={0.95} />
                      <Path d="M 0.05 -1.85 L 0.3 -1.35 L 0.55 -1.85 Z" fill="#fff" opacity={0.95} />
                      <Ellipse cx={0} cy={-0.5} rx={0.58} ry={0.45} fill={TONGUE} />
                    </G>
                  ) : (
                    <G>
                      <Ellipse cx={0} cy={-1.1} rx={0.62} ry={0.5} fill={MOUTH_DARK} />
                      <Ellipse cx={0} cy={-0.85} rx={0.36} ry={0.26} fill={TONGUE} />
                    </G>
                  )}
                </G>
              </AnimatedG>
            </G>

            {/* bark marks snap at both sides while the pup is loud */}
            {barking && (
              <G transform={`translate(${BARK_ORIGIN.x}, ${BARK_ORIGIN.y})`}>
                <AnimatedG animatedProps={barkProps}>
                  <G
                    transform={`translate(${-BARK_ORIGIN.x}, ${-BARK_ORIGIN.y})`}
                    stroke={BARK_MARK}
                    strokeWidth={0.5}
                    strokeLinecap="round"
                    fill="none"
                  >
                    <Path d={BARK_L1} />
                    <Path d={BARK_L2} opacity={0.65} />
                    <Path d={BARK_R1} />
                    <Path d={BARK_R2} opacity={0.65} />
                  </G>
                </AnimatedG>
              </G>
            )}
          </G>
        </AnimatedG>
      </G>
    </G>
  );
}
