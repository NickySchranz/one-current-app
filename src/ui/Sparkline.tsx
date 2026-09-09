import { View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

/**
 * A small line with no chart furniture around it: no axes, no gridlines, no
 * numbers. The shape is the whole message, and it is drawn in the same stroke
 * weight as the timeline's own lines so a curve here reads as the same kind of
 * object as a thread on the map.
 *
 * `null` in `values` is a gap, never a zero — a day the app was closed must
 * not read as a day when everything went quiet.
 */
export type SparklineProps = {
  /** One value per step, oldest first. null = no reading that day. */
  values: (number | null)[];
  min: number;
  max: number;
  width: number;
  height: number;
  color: string;
  strokeWidth?: number;
  /** Dot the first and last real readings, so short series still read as a line. */
  endpoints?: boolean;
  /** Indices to mark with a faint vertical tick (e.g. the day a thread integrated). */
  marks?: number[];
  /** Faint horizontal rule, in value space (e.g. the level a thread started at). */
  baseline?: number;
};

export function Sparkline({
  values,
  min,
  max,
  width,
  height,
  color,
  strokeWidth = 1.6,
  endpoints = true,
  marks = [],
  baseline,
}: SparklineProps) {
  const pad = strokeWidth + 1;
  const span = Math.max(1e-6, max - min);
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const x = (i: number) => pad + i * stepX;
  // Higher values sit higher on the page, which is the only orientation a
  // "louder" or "steadier" reading can honestly have.
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  // Runs of consecutive real readings become their own path, so gaps stay gaps.
  const runs: { i: number; v: number }[][] = [];
  let run: { i: number; v: number }[] = [];
  values.forEach((v, i) => {
    if (v === null || Number.isNaN(v)) {
      if (run.length > 0) runs.push(run);
      run = [];
      return;
    }
    run.push({ i, v });
  });
  if (run.length > 0) runs.push(run);

  const real = runs.flat();
  const first = real[0];
  const last = real[real.length - 1];

  return (
    <View>
      <Svg width={width} height={height}>
        {baseline !== undefined && (
          <Line
            x1={pad}
            y1={y(baseline)}
            x2={width - pad}
            y2={y(baseline)}
            stroke={color}
            strokeWidth={0.75}
            opacity={0.22}
            strokeDasharray={[2, 4]}
          />
        )}
        {marks.map((i) => (
          <Line
            key={`m${i}`}
            x1={x(i)}
            y1={pad}
            x2={x(i)}
            y2={height - pad}
            stroke={color}
            strokeWidth={0.75}
            opacity={0.3}
          />
        ))}
        {runs.map((points, ri) =>
          points.length === 1 ? (
            <Circle
              key={`r${ri}`}
              cx={x(points[0].i)}
              cy={y(points[0].v)}
              r={strokeWidth}
              fill={color}
            />
          ) : (
            <Path
              key={`r${ri}`}
              d={points
                .map((p, k) => `${k === 0 ? "M" : "L"} ${x(p.i).toFixed(2)} ${y(p.v).toFixed(2)}`)
                .join(" ")}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ),
        )}
        {endpoints && first && last && runs.some((r) => r.length > 1) && (
          <>
            <Circle cx={x(first.i)} cy={y(first.v)} r={strokeWidth} fill={color} opacity={0.55} />
            <Circle cx={x(last.i)} cy={y(last.v)} r={strokeWidth * 1.25} fill={color} />
          </>
        )}
      </Svg>
    </View>
  );
}
