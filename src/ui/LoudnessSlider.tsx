import { useState } from "react";
import { View } from "react-native";
import { useTheme } from "./theme";
import { alpha } from "./color";

/** The loudness dial: a thumb-sized bar — tap or drag anywhere to fill it. */
export function LoudnessSlider({
  value,
  onChange,
  accessibilityText,
}: {
  value: number;
  onChange: (v: number) => void;
  accessibilityText: string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const HEIGHT = 44;
  const set = (x: number) => {
    if (width <= 0) return;
    const frac = Math.min(1, Math.max(0, x / width));
    onChange(Math.round((1 + frac * 4) * 10) / 10);
  };
  const frac = (Math.min(5, Math.max(1, value)) - 1) / 4;
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 1, max: 5, now: value, text: accessibilityText }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => set(e.nativeEvent.locationX)}
      onResponderMove={(e) => set(e.nativeEvent.locationX)}
      style={{
        height: HEIGHT,
        marginVertical: 2,
        width: "100%",
        borderRadius: theme.radius,
        borderWidth: 1,
        borderColor: alpha(theme.lineAxis, 0.55),
        backgroundColor: alpha(theme.lineAxis, 0.22),
        overflow: "hidden",
        justifyContent: "center",
      }}
    >
      {/* the fill IS the value: no small thumb to hunt for */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: Math.max(8, frac * width),
          backgroundColor: alpha(theme.accent, 0.85),
        }}
      />
      {/* quiet step marks at 2, 3 and 4 */}
      {width > 0 &&
        [0.25, 0.5, 0.75].map((f) => (
          <View
            key={f}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: f * width,
              top: 6,
              bottom: 6,
              width: 1,
              backgroundColor: alpha(theme.lineAxis, 0.6),
            }}
          />
        ))}
    </View>
  );
}
