import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { FEELINGS } from "@/domain/feelings/logic";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/ui/theme";

type PressState = PressableStateCallbackType & { hovered?: boolean };

type Props = {
  selected: string[];
  onToggle: (feeling: string) => void;
  label: string;
  /** The tap vocabulary; defaults to the feelings a line can hold. */
  options?: readonly string[];
};

/** Tap-only chooser for the feelings a line holds. No typing. */
export function FeelingPicker({ selected, onToggle, label, options = FEELINGS }: Props) {
  const t = useT();
  const theme = useTheme();
  return (
    <View
      accessibilityLabel={label}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: 4.8 }}
    >
      {options.map((f) => {
        const pressed = selected.includes(f);
        return (
          <Pressable
            key={f}
            accessibilityRole="button"
            accessibilityState={{ selected: pressed }}
            onPress={() => onToggle(f)}
            style={(s) => {
              const hovered = !!(s as PressState).hovered;
              return {
                borderWidth: 1,
                borderColor: pressed || hovered ? theme.accent : theme.lineAxis,
                borderRadius: 999,
                backgroundColor: pressed ? theme.accentSoft : "transparent",
                paddingVertical: 2.4,
                paddingHorizontal: 10.4,
                minHeight: 28,
                justifyContent: "center",
              };
            }}
          >
            {(s) => (
              <Text
                style={{
                  fontFamily: theme.fontBody,
                  fontSize: 13.6,
                  color: pressed || !!(s as PressState).hovered ? theme.ink : theme.inkSoft,
                }}
              >
                {t(f)}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
