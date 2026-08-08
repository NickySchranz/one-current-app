/**
 * A cat for the Catnap theme: each open thread ends in a small face watching
 * you from Now. A quiet thread is a drowsy cat; a louder one stares — pupils
 * blown wide, ears flattening outward. A decision lets it curl up again.
 * Drawn face-centred just behind the origin, about 14×12 units with whiskers,
 * before scaling.
 */

import { Circle, Ellipse, G, Path } from "react-native-svg";

const EAR_INNER = "#e8a3b0";
const IRIS = "#e8d36a";
const DARK = "#1c1c22";
const NOSE = "#d3746a";

const HEAD =
  "M 0 -5.2 C 3.4 -5.2 5.6 -3 5.6 -0.4 C 5.6 2.6 3.2 4.6 0 4.6" +
  " C -3.2 4.6 -5.6 2.6 -5.6 -0.4 C -5.6 -3 -3.4 -5.2 0 -5.2 Z";

const MOUTH =
  "M 0 2.3 L 0 2.9 M 0 2.9 C -0.6 3.6 -1.5 3.6 -2 3 M 0 2.9 C 0.6 3.6 1.5 3.6 2 3";

const WHISKERS_L = "M -3 1.8 C -4.6 1.5 -6 1.6 -7.2 2 M -3 2.4 C -4.4 2.5 -5.8 2.8 -6.8 3.4";
const WHISKERS_R = "M 3 1.8 C 4.6 1.5 6 1.6 7.2 2 M 3 2.4 C 4.4 2.5 5.8 2.8 6.8 3.4";

type Props = {
  x: number;
  y: number;
  scale?: number;
  /** The thread's line colour: the cat's fur. */
  color: string;
  /** Effective loudness 1–5: wider pupils and flatter ears the louder it is. */
  loudness?: number;
  /** Comfort setting: the cat is already still — kept for API parity. */
  reducedMotion?: boolean;
  onPress?: () => void;
};

export function CatHead({ x, y, scale = 1, color, loudness = 3, onPress }: Props) {
  const g = Math.max(1, Math.min(5, loudness));
  const earFlat = (g - 1) * 6; // degrees the ears rotate outward
  const pupil = 0.3 + (g - 1) * 0.17; // pupils blow wide

  return (
    <G transform={`translate(${x - 4}, ${y}) scale(${scale})`} onPress={onPress}>
      {/* generous invisible hit area — ears and whiskers are thin */}
      <Circle cx={0} cy={-0.5} r={8.5} fill="transparent" stroke="none" />

      {/* ears: flattening outward as the thread gets louder */}
      <G transform={`rotate(${-earFlat} -3.4 -3.4)`}>
        <Path d="M -4.8 -2.6 L -6 -7.4 L -1.6 -4.6 Z" fill={color} />
        <Path d="M -4.4 -3.4 L -5.2 -6 L -2.8 -4.4 Z" fill={EAR_INNER} opacity={0.8} />
      </G>
      <G transform={`rotate(${earFlat} 3.4 -3.4)`}>
        <Path d="M 4.8 -2.6 L 6 -7.4 L 1.6 -4.6 Z" fill={color} />
        <Path d="M 4.4 -3.4 L 5.2 -6 L 2.8 -4.4 Z" fill={EAR_INNER} opacity={0.8} />
      </G>

      <Path d={HEAD} fill={color} stroke="none" />
      <Ellipse cx={0} cy={2.2} rx={2.6} ry={1.9} fill="#fff" opacity={0.35} />

      {/* eyes: gold, with pupils that dilate with loudness */}
      <Ellipse cx={-2.1} cy={-0.8} rx={1.25} ry={1.15} fill={IRIS} />
      <Ellipse cx={2.1} cy={-0.8} rx={1.25} ry={1.15} fill={IRIS} />
      <Ellipse cx={-2.1} cy={-0.8} rx={pupil} ry={1} fill={DARK} />
      <Ellipse cx={2.1} cy={-0.8} rx={pupil} ry={1} fill={DARK} />
      <Circle cx={-1.85} cy={-1.15} r={0.22} fill="#fff" opacity={0.9} />
      <Circle cx={2.35} cy={-1.15} r={0.22} fill="#fff" opacity={0.9} />

      {/* nose + mouth */}
      <Path d="M -0.7 1.4 L 0.7 1.4 L 0 2.3 Z" fill={NOSE} />
      <Path d={MOUTH} fill="none" stroke={DARK} strokeWidth={0.3} opacity={0.6} />

      {/* whiskers */}
      <G stroke="#fff" strokeWidth={0.3} opacity={0.75} strokeLinecap="round" fill="none">
        <Path d={WHISKERS_L} />
        <Path d={WHISKERS_R} />
      </G>
    </G>
  );
}
