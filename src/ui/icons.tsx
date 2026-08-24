import Svg, { Circle, Path } from "react-native-svg";

/**
 * Hand-drawn stroke icons for the quick-flow choices. All live on a 24×24
 * grid, stroke-only, with the wobble of the timeline art — never geometric.
 * Color comes in from the caller so they follow every theme's ink/accent.
 */
export type IconProps = {
  size?: number;
  color: string;
  strokeWidth?: number;
};

type StrokeProps = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: "round";
  strokeLinejoin: "round";
  fill: "none";
};

function strokeProps({ color, strokeWidth = 1.75 }: IconProps): StrokeProps {
  return {
    stroke: color,
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
  };
}

/** Act: one footstep rising out of the line. */
export function IconStep(p: IconProps) {
  const s = strokeProps(p);
  return (
    <Svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24">
      <Path d="M3.5 19.5 C8 19.2, 9.5 18.8, 12 17" {...s} />
      <Path d="M12 17 C15 14.8, 15.5 10.5, 19.5 8.5" {...s} />
      <Path d="M15.5 8 L19.8 8.2 L19.4 12.5" {...s} />
    </Svg>
  );
}

/** Integrate: two strands folding back into one — the logo's motif. */
export function IconMerge(p: IconProps) {
  const s = strokeProps(p);
  return (
    <Svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24">
      <Path d="M3 16.5 H21" {...s} />
      <Path d="M5.5 16.5 C9 16.3, 8.5 7.5, 12.5 7.5 C16.2 7.5, 15.3 16.2, 18.5 16.5" {...s} />
      <Circle cx={18.5} cy={16.5} r={1.9} fill={p.color} />
    </Svg>
  );
}

/** Note: a small pencil over a written line. */
export function IconNote(p: IconProps) {
  const s = strokeProps(p);
  return (
    <Svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24">
      <Path d="M17.8 4.4 L20 6.6 L9.4 17.4 L6.2 18.2 L6.9 15.1 Z" {...s} />
      <Path d="M4.5 21 C10 20.6, 14 20.8, 19.5 20.9" {...s} />
    </Svg>
  );
}

/** Set down: an arrow settling gently onto the line, staying there. */
export function IconSetDown(p: IconProps) {
  const s = strokeProps(p);
  return (
    <Svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24">
      <Path d="M12 4 C11.8 8.5, 12.2 11, 12 14.5" {...s} />
      <Path d="M8 11 C9.4 12.5, 10.6 13.7, 12 14.8 C13.4 13.6, 14.6 12.4, 16 11" {...s} />
      <Path d="M4 19 C9.5 18.6, 14.5 18.8, 20 19" {...s} />
    </Svg>
  );
}

/** Understand: an open eye. */
export function IconEye(p: IconProps) {
  const s = strokeProps(p);
  return (
    <Svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24">
      <Path d="M3 12 C6.5 6.8, 17.5 6.6, 21 12 C17.5 17.3, 6.5 17.4, 3 12 Z" {...s} />
      <Circle cx={12} cy={12} r={2.6} {...s} />
    </Svg>
  );
}

/** Support: a slightly lopsided heart. */
export function IconHeart(p: IconProps) {
  const s = strokeProps(p);
  return (
    <Svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24">
      <Path
        d="M12 19.5 C6.5 15.5, 3.6 12.3, 4.2 8.9 C4.7 6.2, 8.4 4.8, 10.6 7 L12 8.4 L13.5 7.1 C15.8 5, 19.3 6.3, 19.8 9 C20.4 12.3, 17.3 15.4, 12 19.5 Z"
        {...s}
      />
    </Svg>
  );
}

/** Resolved: a check drawn in one relieved stroke. */
export function IconCheck(p: IconProps) {
  const s = strokeProps(p);
  return (
    <Svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24">
      <Path d="M4.5 12.5 C6.5 14.2, 8 15.8, 9.5 17.8 C12.5 12.8, 15.5 9, 19.8 5.8" {...s} />
    </Svg>
  );
}

/** Own task: an arrow leaving an open box — it lives elsewhere now. */
export function IconHandOff(p: IconProps) {
  const s = strokeProps(p);
  return (
    <Svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24">
      <Path d="M9.5 5.5 L5 5.7 L4.8 19 L18.2 18.8 L18.4 14.5" {...s} />
      <Path d="M10.5 13.5 C13.5 10.5, 15.8 8.3, 19.3 5.2" {...s} />
      <Path d="M14.2 4.8 L19.6 4.9 L19.4 10.2" {...s} />
    </Svg>
  );
}

/** Moved past: the path curves around the dot and keeps going. */
export function IconPath(p: IconProps) {
  const s = strokeProps(p);
  return (
    <Svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24">
      <Path d="M3 17 C7 17.2, 8.5 15.8, 10 12.8 C11.5 9.8, 13.5 8.6, 16.5 8.4 C18.2 8.3, 19.6 8.4, 21 8.6" {...s} />
      <Circle cx={7.5} cy={9} r={2.1} {...s} />
      <Path d="M17.5 5.7 L21.3 8.5 L17.8 11.4" {...s} />
    </Svg>
  );
}

/** Burn: a flame with an uneven inner tongue. */
export function IconFlame(p: IconProps) {
  const s = strokeProps(p);
  return (
    <Svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24">
      <Path
        d="M12 3.5 C13.5 6.5, 17.8 8.8, 17.5 13.2 C17.3 17, 15 20, 12 20 C9 20, 6.7 17.2, 6.5 13.5 C6.4 10.8, 8 9.2, 9.3 7.4 C10.3 6.1, 11.4 5, 12 3.5 Z"
        {...s}
      />
      <Path d="M10.2 16.8 C10.1 14.6, 11.2 13.6, 12.3 12.2 C13.5 13.7, 14 14.8, 13.8 16.6" {...s} />
    </Svg>
  );
}

/** Choose a time: a small clock, hands a bit past nine. */
export function IconClock(p: IconProps) {
  const s = strokeProps(p);
  return (
    <Svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8.3} {...s} />
      <Path d="M12 7.5 C12.1 9.4, 12 10.6, 12 12.2 L8.8 13.8" {...s} />
    </Svg>
  );
}
