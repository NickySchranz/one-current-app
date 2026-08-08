import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "@/ui/theme";

/** The One Current mark: a main line, one branch, and its return into Now. */
export function Logo({ size = 22 }: { size?: number }) {
  const t = useTheme();
  return (
    <Svg width={size * 1.5} height={size} viewBox="0 0 33 22">
      <Path
        d="M2 15 H31"
        stroke={t.ink}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M7 15 C10 15, 9 7, 13 7 H18 C22 7, 21 15, 24 15"
        stroke={t.ink}
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
        opacity={0.55}
      />
      <Circle cx={29} cy={15} r={3.2} fill={t.accent} />
    </Svg>
  );
}
