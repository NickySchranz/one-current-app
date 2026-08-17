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
        d="M7 15 C11.5 15, 10.5 6, 16 6 C21.5 6, 20.5 15, 25 15"
        stroke={t.accent}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx={25} cy={15} r={3.2} fill={t.accent} />
    </Svg>
  );
}
