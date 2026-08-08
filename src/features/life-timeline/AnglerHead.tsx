/**
 * An anglerfish for the Abyss theme: each open thread ends in one hanging in
 * the dark at Now. The quiet ones drift with the jaw nearly closed; a louder
 * thread gapes wider and its lure burns brighter — the thing it dangles in
 * front of you grows harder to ignore. A decision dims the light. Drawn
 * mouth-at-origin, facing +x, about 17×10 units before scaling.
 */

import { Circle, G, Path } from "react-native-svg";

const CAVE = "#0c1218";
const LURE = "#9fe8c8";
const LURE_CORE = "#dffbee";
const TOOTH = "#e8f0e8";
const EYE = "#dff1f5";

const STALK = "M -3 -4.6 C 0 -7.4 3.8 -6.6 4.2 -3.4";
const SKULL =
  "M 2.6 -1.6 C 1.6 -4.4 -1.6 -5.8 -5 -5 C -8.4 -4.2 -10.6 -2 -11.6 0.4" +
  " C -10 0.2 -8 0.2 -6.6 -0.4 L -5 -1.5 Z";
const BROW = "M -2.2 -3.9 C -3.4 -4.4 -4.8 -4.3 -5.8 -3.6 C -4.8 -3.7 -3.4 -3.5 -2.4 -3.1 Z";
const JAW =
  "M 1.4 3.4 C -0.5 4.6 -4 4.6 -6.6 3.6 C -8.6 2.8 -10 1.6 -11.6 0.4" +
  " C -9.6 1 -7.8 1.4 -6 2.6 Z";
const LOWER_TEETH =
  "M 1.2 3.1 L 1.5 -0.2 M 0.1 3.2 L -0.3 0.9 M -1.4 3.1 L -1 -0.4" +
  " M -2.8 3 L -3.1 1 M -4.4 2.8 L -4 0.1 M -5.8 2.4 L -6 0.9";
const FIN_SPINES =
  "M -10.4 -1.4 L -13.4 -3.4 L -11.2 -0.2 L -14.4 -0.6 L -11 0.8 L -13.2 2.8 L -10.2 1.4 Z";

type Props = {
  x: number;
  y: number;
  scale?: number;
  /** The thread's line colour: the fish's hide. */
  color: string;
  /** Effective loudness 1–5: a wider gape and a brighter lure. */
  loudness?: number;
  /** Comfort setting: the angler is already still — kept for API parity. */
  reducedMotion?: boolean;
  onPress?: () => void;
};

export function AnglerHead({ x, y, scale = 1, color, loudness = 3, onPress }: Props) {
  const g = Math.max(1, Math.min(5, loudness));
  const glow = 0.2 + (g - 1) * 0.2;
  const gape = (g - 1) * 0.55; // the jaw drops as the thread gets louder
  const mouth =
    `M 2.6 -1.6 C 0.5 -0.6 0.2 1.6 1.4 ${3.4 + gape}` +
    ` L -6 ${2.6 + gape * 0.7} L -5 -1.5 Z`;
  const upperTeeth =
    `M 2 -1.4 L 1.6 ${1 + gape * 0.5} M 0.9 -1.1 L 1.1 0.3` +
    ` M -0.3 -1 L -0.6 ${1.5 + gape * 0.5} M -1.8 -1 L -1.6 0.4` +
    ` M -3.1 -1.1 L -3.4 ${0.9 + gape * 0.5} M -4.5 -1.3 L -4.3 0.2`;

  return (
    <G transform={`translate(${x}, ${y}) scale(${scale})`} onPress={onPress}>
      {/* generous invisible hit area — the lure and spines are thin */}
      <Circle cx={-4.5} cy={0} r={9.5} fill="transparent" stroke="none" />

      {/* lure glow: brighter and wider awake the louder the thread */}
      <Circle cx={4.2} cy={-3} r={2.4 + g * 0.9} fill={LURE} opacity={glow * 0.35} />
      <Circle cx={4.2} cy={-3} r={1.4 + g * 0.3} fill={LURE} opacity={glow * 0.7} />
      <Circle cx={4.2} cy={-3} r={0.9} fill={LURE_CORE} />
      <Path d={STALK} fill="none" stroke={color} strokeWidth={0.5} />

      {/* open mouth: a dark cave that gapes with loudness */}
      <Path d={mouth} fill={CAVE} stroke="none" />

      {/* skull with a heavy brow over the eye */}
      <Path d={SKULL} fill={color} stroke="none" />
      <Path d={BROW} fill={CAVE} opacity={0.55} stroke="none" />

      {/* lower jaw drops with the gape, its needle teeth riding along */}
      <G transform={`translate(0 ${gape})`}>
        <Path d={JAW} fill={color} stroke="none" />
        <Path d={JAW} fill="#000" opacity={0.25} stroke="none" />
        <Path
          d={LOWER_TEETH}
          fill="none"
          stroke={TOOTH}
          strokeWidth={0.32}
          strokeLinecap="round"
        />
      </G>

      {/* upper needle teeth: thin, irregular */}
      <Path
        d={upperTeeth}
        fill="none"
        stroke={TOOTH}
        strokeWidth={0.32}
        strokeLinecap="round"
      />

      {/* tiny pale eye under the brow */}
      <Circle cx={-3.6} cy={-3} r={0.75} fill={EYE} />
      <Circle cx={-3.5} cy={-3} r={0.38} fill={CAVE} />

      <Path d={FIN_SPINES} fill={color} opacity={0.8} stroke="none" />
    </G>
  );
}
