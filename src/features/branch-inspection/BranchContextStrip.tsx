import { View } from "react-native";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import type { PsychologicalBranch } from "@/domain/branches/types";
import { effectiveLoudness, isClosed } from "@/domain/branches/logic";
import { statusToLineStyle, loudnessToThickness } from "@/visualization/branch-lines/style";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

type Props = { branch: PsychologicalBranch; color: string };

/**
 * A slim always-visible strip preserving the connection to the main line and Now
 * while a branch is inspected.
 */
export function BranchContextStrip({ branch, color }: Props) {
  const t = useT();
  const th = useTheme();
  const style = statusToLineStyle(branch.status);
  const merged = isClosed(branch);
  const w = 640;
  const mainY = 16;
  const laneY = 40;
  const forkX = 70;
  const endX = merged ? w - 140 : w - 40;

  const monthYear = new Date(branch.forkDate + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        borderBottomWidth: 1,
        borderBottomColor: alpha(th.lineAxis, 0.55),
        backgroundColor: alpha(th.bgRaised, 0.6),
      }}
    >
      <View style={{ width: "100%", maxWidth: 760, alignSelf: "center" }}>
        <Svg
          viewBox={`0 0 ${w} 56`}
          width="100%"
          height={56}
          preserveAspectRatio="xMidYMid meet"
        >
          <Path
            d={`M 0 ${mainY} L ${w} ${mainY}`}
            stroke={th.lineMain}
            strokeWidth={2.5}
            fill="none"
          />
          <Path
            d={
              `M ${forkX} ${mainY} C ${forkX + 24} ${mainY}, ${forkX + 18} ${laneY}, ${forkX + 42} ${laneY}` +
              ` L ${endX - (merged ? 42 : 0)} ${laneY}` +
              (merged
                ? ` C ${endX - 18} ${laneY}, ${endX - 24} ${mainY}, ${endX} ${mainY}`
                : "")
            }
            fill="none"
            stroke={color}
            strokeWidth={loudnessToThickness(effectiveLoudness(branch))}
            opacity={style.opacity}
            strokeLinecap="round"
          />
          <Circle cx={forkX} cy={mainY} r={4} fill={th.bg} stroke={color} strokeWidth={2} />
          <SvgText
            x={forkX}
            y={mainY - 6}
            fontSize={11}
            fontFamily={th.fontBody}
            fill={th.inkSoft}
            textAnchor="middle"
          >
            {branch.forkLabel ?? monthYear}
          </SvgText>
          <Circle cx={w - 12} cy={mainY} r={6} fill={th.accent} />
          <SvgText
            x={w - 12}
            y={mainY - 8}
            fontSize={11.5}
            fontWeight="600"
            fontFamily={th.fontBody}
            fill={th.ink}
            textAnchor="end"
          >
            {t("Now")}
          </SvgText>
          {!merged && <Circle cx={endX} cy={laneY} r={4.5} fill={color} opacity={style.opacity} />}
        </Svg>
      </View>
    </View>
  );
}
