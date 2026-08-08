/**
 * A little ghost for the Gravemist theme: each open thread ends in one
 * hovering at Now. A quiet thread hums with a small round mouth; the longer
 * it goes unanswered the wider the wail, the hollower the eyes, the further
 * it leans toward you. Answer it and it rests. Drawn hovering just behind
 * the origin with a wisp trailing to the line end, about 17×11 units before
 * scaling.
 */

import { Circle, Ellipse, G, Path } from "react-native-svg";

const HOLLOW = "#191722";

const BODY =
  "M 0 -6.4 C 3.4 -6.4 5.2 -3.8 5.2 -1 L 5.2 3 C 4.4 2.2 3.6 2.2 2.9 3.2" +
  " C 2.2 4.2 1.4 4.2 0.7 3.2 C 0 2.2 -0.8 2.2 -1.5 3.2 C -2.2 4.2 -3 4.2 -3.7 3.2" +
  " C -4.4 2.2 -5.2 2.6 -5.2 3 L -5.2 -1 C -5.2 -3.8 -3.4 -6.4 0 -6.4 Z";

const ARM_L = "M -5 -0.4 C -6.8 -0.6 -7.8 -1.4 -8.4 -2.6 C -7 -2.3 -5.8 -2 -4.9 -1.9 Z";
const ARM_R = "M 5 -0.4 C 6.8 -0.6 7.8 -1.4 8.4 -2.6 C 7 -2.3 5.8 -2 4.9 -1.9 Z";
const WISP = "M 3 3.2 C 4.6 3 5.6 1.8 6.8 0.4";

type Props = {
  x: number;
  y: number;
  scale?: number;
  /** The thread's line colour: the ghost's sheet. */
  color: string;
  /** Effective loudness 1–5: a wider wail and a further lean. */
  loudness?: number;
  /** Comfort setting: the ghost is already still — kept for API parity. */
  reducedMotion?: boolean;
  onPress?: () => void;
};

export function Ghost({ x, y, scale = 1, color, loudness = 3, onPress }: Props) {
  const g = Math.max(1, Math.min(5, loudness));
  const lean = (g - 1) * 2;
  const eyeRy = 1 + (g - 1) * 0.12;
  const mouthCy = 0.2 + (g - 1) * 0.15;
  const mouthRx = 0.65 + (g - 1) * 0.16;
  const mouthRy = 0.45 + (g - 1) * 0.34;

  return (
    <G
      transform={`translate(${x - 3}, ${y}) scale(${scale}) rotate(${-lean})`}
      onPress={onPress}
    >
      {/* generous invisible hit area — the arms are thin */}
      <Circle cx={0} cy={-1} r={9} fill="transparent" stroke="none" />

      {/* wisp trailing back to the line end */}
      <Path d={WISP} fill="none" stroke={color} strokeWidth={0.5} opacity={0.4} />

      {/* the sheet: thread colour, lifted toward mist */}
      <Path d={BODY} fill={color} stroke="none" />
      <Path d={BODY} fill="#fff" opacity={0.45} stroke="none" />

      {/* small reaching arms */}
      <Path d={ARM_L} fill={color} opacity={0.75} stroke="none" />
      <Path d={ARM_R} fill={color} opacity={0.75} stroke="none" />

      {/* hollow eyes, deepening as it gets louder */}
      <Ellipse cx={-1.7} cy={-2.6} rx={0.85} ry={eyeRy} fill={HOLLOW} />
      <Ellipse cx={1.7} cy={-2.6} rx={0.85} ry={eyeRy} fill={HOLLOW} />

      {/* the mouth: a wider and wider wail */}
      <Ellipse cx={0} cy={mouthCy} rx={mouthRx} ry={mouthRy} fill={HOLLOW} />
    </G>
  );
}
