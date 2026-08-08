/**
 * A koi for the Koi pond theme: each open thread ends in a fish nosing at
 * Now. The body keeps the thread's line colour; the classic orange patches
 * make it a koi. A louder thread stirs the water — faint ripples spread from
 * its mouth and the mouth opens a little wider, asking. Drawn mouth-at-origin,
 * facing +x, about 15×8 units before scaling.
 */

import { Circle, G, Path } from "react-native-svg";

const PATCH = "#e2643c";
const EYE = "#1c1c22";

const TAIL =
  "M -10.5 0 C -12.5 -3.2 -15.8 -3.8 -17 -2.8 C -15.2 -1.5 -14.9 -0.7 -15 0" +
  " C -14.9 0.7 -15.2 1.5 -17 2.8 C -15.8 3.8 -12.5 3.2 -10.5 0 Z";

const BELLY =
  "M 1.8 1 C -0.5 2.6 -4.5 2.9 -7.5 2.2 C -9.5 1.7 -10.9 0.8 -11.8 0" +
  " C -10 0.6 -7 1.4 -4 1.6 C -1.5 1.8 0.5 1.5 1.8 1 Z";

const PATCH_FRONT = "M -2.5 -2.9 C -1 -3 0.5 -2.4 1.2 -1.5 C 0 -1.1 -1.8 -1.3 -3 -1.9 Z";
const PATCH_BACK = "M -7.5 -2.4 C -6.2 -2.7 -5 -2.5 -4.4 -1.9 C -5.6 -1.4 -7.2 -1.5 -8.3 -1.8 Z";

const DORSAL = "M -4 -2.85 C -5 -4.4 -7.5 -4.8 -9 -4 C -8 -3.4 -7 -2.7 -6.4 -2.2 Z";
const PECTORAL = "M -2.4 1.6 C -2.8 3.2 -4.4 4.2 -5.8 4 C -5 3 -4.4 2.2 -4.2 1.4 Z";
const GILL = "M -1.4 -2.2 C -2.2 -1 -2.2 1 -1.4 2.2";
const BARBELS = "M 2.4 0.8 C 3.3 1 3.8 1.8 3.7 2.6 M 2.2 1.2 C 2.8 1.6 3 2.2 2.9 2.9";

type Props = {
  x: number;
  y: number;
  scale?: number;
  /** The thread's line colour: the koi's body. */
  color: string;
  /** Effective loudness 1–5: a louder koi stirs the water and gapes wider. */
  loudness?: number;
  /** Comfort setting: the koi is already still — kept for API parity. */
  reducedMotion?: boolean;
  onPress?: () => void;
};

export function KoiFish({ x, y, scale = 1, color, loudness = 3, onPress }: Props) {
  const g = Math.max(1, Math.min(5, loudness));
  const gape = 0.3 + (g - 1) * 0.28;
  const body =
    `M 2.6 ${-gape * 0.5} C 2.2 -2.6 -1.6 -3.5 -5.2 -2.8 C -8.6 -2.1 -10.6 -1 -11.8 0` +
    ` C -10.6 1 -8.6 2.1 -5.2 2.8 C -1.6 3.5 2.2 2.6 2.6 ${gape * 0.5} L 1.4 0 Z`;

  return (
    <G transform={`translate(${x}, ${y}) scale(${scale})`} onPress={onPress}>
      {/* generous invisible hit area — fins and barbels are thin */}
      <Circle cx={-5} cy={0} r={9.5} fill="transparent" stroke="none" />

      {/* ripples: a louder koi stirs the water */}
      {[0, 1].map((i) => (
        <Circle
          key={i}
          cx={2.6}
          cy={0}
          r={3 + i * 2}
          fill="none"
          stroke={color}
          strokeWidth={0.25}
          opacity={(Math.max(0, 0.32 - i * 0.12) * (g - 1)) / 4}
        />
      ))}

      <Path d={TAIL} fill={color} opacity={0.75} stroke="none" />
      <Path d={body} fill={color} stroke="none" />
      <Path d={BELLY} fill="#fff" opacity={0.5} stroke="none" />

      <Path d={PATCH_FRONT} fill={PATCH} stroke="none" />
      <Path d={PATCH_BACK} fill={PATCH} opacity={0.85} stroke="none" />

      <Path d={DORSAL} fill={color} opacity={0.7} stroke="none" />
      <Path d={PECTORAL} fill={color} opacity={0.6} stroke="none" />
      <Path d={GILL} fill="none" stroke="#000" strokeWidth={0.3} opacity={0.3} />

      <Circle cx={0.6} cy={-1.1} r={0.75} fill={EYE} />
      <Circle cx={0.85} cy={-1.35} r={0.25} fill="#fff" />

      <Path
        d={BARBELS}
        fill="none"
        stroke={color}
        strokeWidth={0.35}
        strokeLinecap="round"
        opacity={0.9}
      />
    </G>
  );
}
