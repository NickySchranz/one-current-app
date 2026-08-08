/**
 * A balloon for the Carnival theme: each open thread ends in one, tied to the
 * line at Now. The longer a thread waits, the fuller its balloon — it swells,
 * tilts, and at the loudest levels shows little strain marks near the seam.
 * A decision lets the air out. Drawn knot-at-origin, floating up from the
 * line end, about 9×17 units before scaling (slightly shrunk so it stays
 * inside its lane).
 */

import { Circle, Ellipse, G, Path } from "react-native-svg";

type Props = {
  x: number;
  y: number;
  scale?: number;
  /** The thread's line colour: the balloon's skin. */
  color: string;
  /** Effective loudness 1–5: a louder thread means a fuller, tenser balloon. */
  loudness?: number;
  /** Comfort setting: the balloon is already still — kept for API parity. */
  reducedMotion?: boolean;
  onPress?: () => void;
};

export function Balloon({ x, y, scale = 1, color, loudness = 3, onPress }: Props) {
  const g = Math.max(1, Math.min(5, loudness));
  const grow = 1 + (g - 1) * 0.09;
  const tilt = (g - 1) * 3.5;
  const cy = -5.8 - 5.2 * grow;
  const hiX = -0.6 + 1.6 * grow;
  const hiY = -5.8 - 6.8 * grow;

  return (
    <G
      // stay inside the lane: the balloon is drawn a touch smaller than the
      // other creatures because it rises instead of trailing back
      transform={`translate(${x}, ${y}) scale(${scale * 0.85})`}
      onPress={onPress}
    >
      {/* generous invisible hit area over string and balloon */}
      <Circle cx={-0.6} cy={-9} r={10.5} fill="transparent" stroke="none" />

      {/* string: anchored at the line end, curling up to the knot */}
      <Path
        d="M 0 0 C -2.6 -1.2 0.8 -3 -0.6 -4.6"
        fill="none"
        stroke={color}
        strokeWidth={0.45}
        opacity={0.8}
      />
      <G transform={`rotate(${tilt} -0.6 -4.6)`}>
        {/* knot */}
        <Path d="M -0.6 -4.6 L -1.5 -5.8 L 0.3 -5.8 Z" fill={color} />
        {/* balloon: skin, shade, shine */}
        <Ellipse cx={-0.6} cy={cy} rx={4.4 * grow} ry={5.2 * grow} fill={color} />
        <Ellipse cx={-0.6} cy={cy} rx={4.4 * grow} ry={5.2 * grow} fill="#000" opacity={0.12} />
        <Ellipse
          cx={hiX}
          cy={hiY}
          rx={1.3 * grow}
          ry={2 * grow}
          fill="#fff"
          opacity={0.4}
          transform={`rotate(24 ${hiX} ${hiY})`}
        />
        {/* near bursting: strain marks by the seam */}
        {g >= 4 && (
          <G
            stroke="#fff"
            strokeWidth={0.55}
            strokeLinecap="round"
            opacity={0.5 + (g - 4) * 0.35}
          >
            <Path d="M 1.2 -13.4 l 1.4 -1.4 M 2.4 -11.6 l 1.8 -0.7 M -0.4 -14.6 l 0.6 -1.8" />
          </G>
        )}
      </G>
    </G>
  );
}
