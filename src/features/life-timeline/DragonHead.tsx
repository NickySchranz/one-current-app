/**
 * A dragon head for the Demonfire theme: each open thread ends in one, facing
 * Now — the demon you are facing. Fiercer than a mascot but still a drawing,
 * not gore: a snarling open jaw with bone fangs over a dark-red mouth, a
 * heavy brow with a spike, a glowing slit-pupil ember eye, twin swept-back
 * horns, neck spikes, snarl wrinkles and a wisp of smoke from the nostril.
 * Drawn nose-at-origin, facing +x, about 17×9 units before scaling.
 *
 * The body keeps the thread's line colour so every demon stays recognizably
 * its thread; horns, teeth, mouth and eye share one ember palette.
 */

import { Circle, G, Path } from "react-native-svg";

const BONE = "#e6d3ae";
const BONE_DIM = "#d9c29a";
const MOUTH = "#6b1010";
const TONGUE = "#a2231d";
const EMBER = "#ff8c1f";
const EYE = "#ffb02e";
const PUPIL = "#2a0a06";

// inner mouth, behind everything: reaches back to the jaw hinge
const INNER_MOUTH = "M -7.6 1.3 L 2.2 0.3 L 1.0 2.6 C -2.0 3.1 -5.6 3.0 -7.2 2.3 Z";
const TONGUE_PATH =
  "M -5.4 1.8 C -3.0 2.1 -1.2 1.9 -0.2 1.4 C -0.7 2.0 -2.6 2.4 -5.2 2.2 Z";

// twin horns swept back from the skull
const HORN_MAIN =
  "M -6.0 -2.6 C -8.3 -4.7 -11.0 -5.4 -13.6 -4.8 C -10.6 -4.5 -8.4 -3.4 -6.4 -1.8 Z";
const HORN_LOW =
  "M -7.2 -1.8 C -9.2 -2.9 -10.9 -3.1 -12.4 -2.6 C -10.5 -2.4 -9.0 -1.6 -7.5 -0.7 Z";

// three spikes where the head meets its line
const NECK_SPIKES =
  "M -9.5 -1.4 L -11.4 -0.9 L -9.5 -0.2 Z" +
  " M -9.7 0.3 L -11.7 1.2 L -9.3 1.5 Z" +
  " M -9.1 2.0 L -10.8 3.0 L -8.4 2.9 Z";

// upper skull + snout: sharp nose, brow spike, angular skull
const SKULL =
  "M 2.6 0.0" +
  " C 2.4 -0.9 1.7 -1.5 0.6 -1.7" +
  " C -0.4 -2.0 -1.6 -2.0 -2.6 -2.3" +
  " C -3.0 -2.4 -3.5 -2.6 -3.9 -2.7" +
  " L -4.5 -3.9 L -5.3 -2.9" +
  " C -6.7 -3.2 -7.9 -2.9 -8.9 -2.1" +
  " C -9.9 -1.3 -10.3 -0.2 -9.8 0.8" +
  " C -9.3 1.7 -7.8 2.0 -6.2 1.8" +
  " C -3.4 1.4 -0.4 0.8 2.6 0.0" +
  " Z";

// snarl wrinkles over the snout + scale hints on the cheek
const WRINKLES =
  "M 0.4 -1.3 q -0.7 0.5 -1.6 0.45 M -1.0 -1.7 q -0.7 0.5 -1.6 0.45" +
  " M -7.5 0.3 q 0.7 0.5 1.5 0.4 M -6.3 -0.7 q 0.7 0.5 1.5 0.4";

const UPPER_TEETH =
  "M 2.0 0.2 L 1.5 1.8 L 1.0 0.45 Z" +
  " M 0.0 0.7 L -0.4 1.75 L -0.9 0.85 Z" +
  " M -1.9 1.05 L -2.3 2.0 L -2.8 1.15 Z" +
  " M -3.8 1.35 L -4.1 2.1 L -4.6 1.4 Z";

// lower jaw, hinged into the cheek, with a chin barb
const JAW =
  "M -7.6 1.4" +
  " C -6.6 2.4 -4.2 2.7 -1.4 2.5" +
  " L 1.0 2.2 L 1.9 3.1 L 0.7 3.2" +
  " C -2.2 3.8 -5.4 3.6 -7.0 2.8" +
  " C -7.6 2.4 -7.9 1.9 -7.6 1.4" +
  " Z";

const LOWER_TEETH = "M 0.3 2.25 L 0.0 1.2 L -0.6 2.35 Z M -1.8 2.5 L -2.1 1.6 L -2.7 2.55 Z";

// angular eye socket under the brow
const EYE_SOCKET = "M -3.5 -1.35 L -5.4 -1.75 L -5.1 -0.65 L -3.7 -0.7 Z";

// nostril slit + a wisp of smoke curling up from it
const NOSTRIL = "M 1.6 -0.7 q 0.4 0.15 0.7 0.0";
const SMOKE =
  "M 2.3 -0.9 C 2.8 -1.4 2.9 -2.0 2.6 -2.7 M 2.6 -2.7 C 2.5 -3.1 2.7 -3.4 3.0 -3.6";

type Props = {
  x: number;
  y: number;
  scale?: number;
  /** The thread's line colour: the demon's body. */
  color: string;
  /** Effective loudness 1–5: a louder demon has a brighter ember eye. */
  loudness?: number;
  /** Comfort setting: the dragon is already still — kept for API parity. */
  reducedMotion?: boolean;
  onPress?: () => void;
};

export function DragonHead({ x, y, scale = 1, color, loudness = 3, onPress }: Props) {
  const glow = Math.max(1, Math.min(5, loudness));
  return (
    <G transform={`translate(${x}, ${y}) scale(${scale})`} onPress={onPress}>
      {/* generous invisible hit area — horns and smoke are thin */}
      <Circle cx={-5} cy={0} r={9.5} fill="transparent" stroke="none" />

      <Path d={INNER_MOUTH} fill={MOUTH} stroke="none" />
      <Path d={TONGUE_PATH} fill={TONGUE} stroke="none" />

      <Path d={HORN_MAIN} fill={BONE} stroke="none" />
      <Path d={HORN_LOW} fill={BONE_DIM} stroke="none" />

      {/* neck spikes: the body colour, shaded darker */}
      <Path d={NECK_SPIKES} fill={color} stroke="none" />
      <Path d={NECK_SPIKES} fill="#000" opacity={0.25} stroke="none" />

      <Path d={SKULL} fill={color} stroke="none" />
      <Path
        d={WRINKLES}
        fill="none"
        stroke="#000"
        strokeWidth={0.24}
        strokeLinecap="round"
        opacity={0.32}
      />

      <Path d={UPPER_TEETH} fill={BONE} stroke="none" />

      {/* lower jaw: body colour, slightly shaded so it reads as underneath */}
      <Path d={JAW} fill={color} stroke="none" />
      <Path d={JAW} fill="#000" opacity={0.18} stroke="none" />
      <Path d={LOWER_TEETH} fill={BONE} stroke="none" />

      {/* the ember eye: glow grows with loudness, slit pupil stays cold */}
      <Circle
        cx={-4.6}
        cy={-1.2}
        r={0.95 + glow * 0.12}
        fill={EMBER}
        opacity={0.08 + glow * 0.05}
      />
      <Path d={EYE_SOCKET} fill={EYE} stroke="none" />
      <Path
        d="M -4.6 -1.62 L -4.45 -0.68"
        stroke={PUPIL}
        strokeWidth={0.38}
        strokeLinecap="round"
      />

      <Path
        d={NOSTRIL}
        fill="none"
        stroke={PUPIL}
        strokeWidth={0.3}
        strokeLinecap="round"
      />
      <Path
        d={SMOKE}
        fill="none"
        stroke={EMBER}
        strokeWidth={0.28}
        strokeLinecap="round"
        opacity={0.65}
      />
    </G>
  );
}
