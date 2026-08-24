import React, { createContext, useContext } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { alpha, mix } from "./color";
import { useTheme, type ThemeTokens } from "./theme";
import type { IconProps } from "./icons";

/** Web adds `hovered` to Pressable's style-state; native never sets it. */
type PressState = PressableStateCallbackType & { hovered?: boolean };

/* ---------- text ---------- */

type TProps = {
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  accessibilityRole?: "header" | "text";
};

function useBodyFont(): TextStyle {
  const t = useTheme();
  return { fontFamily: t.fontBody, color: t.ink };
}

export function H1({ children, style }: TProps) {
  const t = useTheme();
  const midnight = t.id === "midnight";
  return (
    <Text
      accessibilityRole="header"
      style={[
        {
          fontFamily: t.fontDisplay,
          color: t.ink,
          fontWeight: t.id === "sunprint" || t.id === "porcelain" ? "500" : "600",
          fontSize:
            t.id === "porcelain" ? 27 : t.id === "sunprint" ? 25 : midnight ? 17.5 : 21.5,
          lineHeight: t.id === "porcelain" ? 34 : 27,
          marginBottom: 8,
          ...(midnight ? { textTransform: "uppercase" as const, letterSpacing: 2 } : null),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function H2({ children, style }: TProps) {
  const t = useTheme();
  const midnight = t.id === "midnight";
  return (
    <Text
      accessibilityRole="header"
      style={[
        {
          fontFamily: t.fontDisplay,
          color: t.ink,
          fontWeight: t.id === "sunprint" || t.id === "porcelain" ? "500" : "600",
          fontStyle: t.id === "porcelain" || t.id === "gravemist" ? "italic" : "normal",
          fontSize: midnight ? 14.5 : 18.5,
          lineHeight: 23,
          marginBottom: 8,
          ...(midnight ? { textTransform: "uppercase" as const, letterSpacing: 1.7 } : null),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function H3({ children, style }: TProps) {
  const t = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[
        {
          fontFamily: t.fontDisplay,
          color: t.ink,
          fontWeight: "600",
          fontSize: 16,
          lineHeight: 20,
          marginBottom: 8,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Body paragraph (p): 16px, bottom margin. */
export function P({ children, style, numberOfLines }: TProps) {
  const body = useBodyFont();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ ...body, fontSize: 16, lineHeight: 24.8, marginBottom: 12 }, style]}
    >
      {children}
    </Text>
  );
}

/** Muted helper text (.hint). */
export function Hint({ children, style, numberOfLines }: TProps) {
  const t = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: t.fontBody,
          color: t.inkSoft,
          fontSize: 14.7,
          lineHeight: 22,
          marginBottom: 12,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Leading question of a flow (.prompt). */
export function Prompt({ children, style }: TProps) {
  const body = useBodyFont();
  return (
    <Text
      style={[
        { ...body, fontSize: 19, fontWeight: "600", marginTop: 19, marginBottom: 12 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Inline text with the theme body font. */
export function T({ children, style, numberOfLines }: TProps) {
  const body = useBodyFont();
  return (
    <Text numberOfLines={numberOfLines} style={[{ ...body, fontSize: 16 }, style]}>
      {children}
    </Text>
  );
}

/* ---------- buttons ---------- */

export type ButtonVariant = "default" | "primary" | "quiet" | "danger";

function buttonSurface(
  t: ThemeTokens,
  variant: ButtonVariant,
  state: PressState,
): { container: ViewStyle; text: TextStyle } {
  const { pressed } = state;
  const hovered = !!state.hovered;
  // Base look per theme family (mirrors the per-theme .btn rules).
  let bg: string = t.bgRaised;
  let border: string = t.lineAxis;
  let color: string = t.ink;
  switch (t.id) {
    case "midnight":
    case "abyss":
      bg = "transparent";
      border = mix(t.accent, t.lineAxis, t.id === "midnight" ? 35 : 28);
      if (hovered) border = t.accent;
      break;
    case "sunprint":
    case "koipond":
    case "catnap": {
      const pct = hovered ? (t.id === "sunprint" ? 16 : t.id === "koipond" ? 14 : 15) : t.id === "sunprint" ? 8 : t.id === "koipond" ? 6 : 7;
      bg = mix(t.accent, t.bgRaised, pct);
      border = "transparent";
      break;
    }
    case "porcelain":
      bg = hovered ? t.ink : "transparent";
      border = t.ink;
      color = hovered ? t.bg : t.ink;
      break;
    case "duskwood":
    case "demonfire":
    case "gravemist":
      bg = t.bgRaised;
      border = hovered ? mix(t.accent, t.lineAxis, 55) : t.lineAxis;
      if (hovered) color = t.accent;
      break;
    case "carnival":
    case "pompom":
      bg = t.bgRaised;
      border = hovered ? t.accent : mix(t.accent, t.lineAxis, t.id === "carnival" ? 30 : 26);
      break;
    default:
      if (hovered) border = t.inkFaint;
  }
  if (pressed) bg = t.bgSunken;

  if (variant === "primary") {
    if (t.id === "midnight" || t.id === "abyss") {
      bg = t.accentSoft;
      border = t.accent;
      color = t.accent;
    } else if (t.id === "porcelain" && hovered) {
      bg = t.ink;
      border = t.ink;
      color = t.bg;
    } else {
      bg = t.accent;
      border = t.accent;
      color = t.accentInk;
    }
  } else if (variant === "quiet") {
    bg = hovered || pressed ? t.bgSunken : "transparent";
    border = "transparent";
    color = t.inkSoft;
  } else if (variant === "danger") {
    color = t.danger;
    border = mix(t.danger, t.lineAxis, 45);
  }
  return { container: { backgroundColor: bg, borderColor: border }, text: { color } };
}

export function Button({
  label,
  onPress,
  variant = "default",
  large = false,
  disabled = false,
  selected,
  icon,
  style,
  textStyle,
  accessibilityLabel,
}: {
  label: React.ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  large?: boolean;
  disabled?: boolean;
  /** aria-pressed styling for filter/toggle buttons. */
  selected?: boolean;
  /** Leading glyph — an Svg can't live inside the label Text on native. */
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const midnightish = t.id === "midnight";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={(state) => {
        const s = buttonSurface(t, variant, state as PressState);
        if (selected) {
          s.container.backgroundColor = t.accentSoft;
          s.container.borderColor = t.accent;
        }
        return [
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: large ? 9 : 5,
            paddingHorizontal: large ? 19 : 12,
            minHeight: large ? 44 : 32,
            borderRadius: t.btnRadius,
            borderWidth: 1,
            opacity: disabled ? 0.45 : 1,
            ...s.container,
          },
          style,
        ];
      }}
    >
      {(state) => {
        const s = buttonSurface(t, variant, state as PressState);
        if (selected) s.text.color = t.ink;
        return (
          <>
          {icon}
          <Text
            style={[
              {
                fontFamily: t.fontBody,
                fontWeight: "500",
                fontSize: midnightish ? 12.8 : large ? 16 : 14.7,
                ...(midnightish
                  ? { textTransform: "uppercase" as const, letterSpacing: 1 }
                  : null),
                ...s.text,
              },
              textStyle,
            ]}
          >
            {label}
          </Text>
          </>
        );
      }}
    </Pressable>
  );
}

/* ---------- surfaces ---------- */

export function Card({
  children,
  sunken = false,
  style,
}: {
  children?: React.ReactNode;
  sunken?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: sunken ? t.bgSunken : t.bgRaised,
          borderWidth: 1,
          borderColor: t.id === "porcelain" ? t.lineAxis : alpha(t.lineAxis, 0.55),
          borderRadius: t.radiusLg,
          paddingVertical: 16,
          paddingHorizontal: 17.5,
          marginBottom: 16,
          ...(t.shadows ? shadow(t) : null),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function shadow(t: ThemeTokens): ViewStyle {
  const dark = t.mode === "dark";
  return {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: dark ? 0.4 : 0.07,
    shadowRadius: 28,
    elevation: 4,
  };
}

/* ---------- tags & chips ---------- */

export function Tag({
  label,
  quality = false,
  onPress,
  onRemove,
  pressed,
  style,
}: {
  label: string;
  /** Feelings/qualities: accent-tinted (.tag.quality). */
  quality?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = pressed ? t.accentSoft : quality ? t.accentSoft : t.bgSunken;
  const border = pressed ? t.accent : quality ? "transparent" : t.lineAxis;
  const inner = (
    <>
      <Text style={{ fontFamily: t.fontBody, color: t.ink, fontSize: 13.6 }}>{label}</Text>
      {onRemove && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          onPress={onRemove}
          hitSlop={8}
        >
          <Text style={{ color: t.inkSoft, fontSize: 13.6 }}>×</Text>
        </Pressable>
      )}
    </>
  );
  const base: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: 4.8,
    borderRadius: 6,
    backgroundColor: bg,
    borderWidth: 1,
    borderColor: border,
    paddingVertical: 2.4,
    paddingHorizontal: 8.8,
    minHeight: 28,
  };
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: pressed }}
        onPress={onPress}
        style={(s) => [base, (s as PressState).hovered ? { borderColor: t.inkFaint } : null, style]}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{inner}</View>;
}

/** Small toggle chip (.chip). */
export function Chip({
  label,
  onPress,
  pressed = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: pressed }}
      onPress={onPress}
      style={(s) => [
        {
          borderWidth: 1,
          borderColor: pressed ? t.accent : t.lineAxis,
          backgroundColor: pressed
            ? t.accentSoft
            : (s as PressState).hovered
              ? t.bgSunken
              : "transparent",
          borderRadius: 6,
          paddingVertical: 1.6,
          paddingHorizontal: 8.8,
          minHeight: 26,
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Text
        style={{ fontFamily: t.fontBody, color: pressed ? t.ink : t.inkSoft, fontSize: 12.8 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ---------- form fields ---------- */

export function Field({
  label,
  children,
  style,
}: {
  label?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View style={[{ marginBottom: 14.4 }, style]}>
      {label ? (
        <Text
          style={{
            fontFamily: t.fontBody,
            color: t.ink,
            fontWeight: "500",
            marginBottom: 4.8,
            fontSize: 16,
          }}
        >
          {label}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function AppTextInput({
  multiline,
  style,
  ...props
}: TextInputProps) {
  const t = useTheme();
  const [focused, setFocused] = React.useState(false);
  // These are personal reflections, never form data: no autofill bars, no
  // contact/password suggestions, no iOS QuickType dialogs. Fields that DO
  // want autofill (the login form) opt back in by passing autoComplete.
  const noAutofill =
    props.autoComplete == null
      ? ({ autoComplete: "off", textContentType: "none", importantForAutofill: "no" } as const)
      : null;
  return (
    <TextInput
      {...noAutofill}
      {...props}
      multiline={multiline}
      placeholderTextColor={t.inkFaint}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[
        {
          fontFamily: t.fontBody,
          fontSize: 16,
          color: t.ink,
          backgroundColor: focused ? t.bgRaised : mix(t.bgRaised, t.bg, 70),
          borderWidth: 1,
          borderColor: focused ? mix(t.accent, t.lineAxis, 45) : alpha(t.lineAxis, 0.55),
          borderRadius: t.radius,
          paddingVertical: 9.6,
          paddingHorizontal: 12,
          width: "100%",
          minHeight: multiline ? 80 : 44,
          textAlignVertical: multiline ? "top" : "center",
        },
        style,
      ]}
    />
  );
}

/* ---------- choice grid ---------- */

export function Choice({
  title,
  hint,
  selected = false,
  onPress,
  icon: Icon,
  tone = "default",
  hintLines,
  accessibilityHint,
  style,
}: {
  title: string;
  hint?: string;
  selected?: boolean;
  onPress?: () => void;
  /** Leading stroke icon, colored by selection state (accent) or ink. */
  icon?: React.ComponentType<IconProps>;
  /** "danger" tints the icon and title — for choices that destroy. */
  tone?: "default" | "danger";
  /** Cap the hint's lines where vertical space is tight. */
  hintLines?: number;
  /** Spoken hint for choices whose visible hint was traded for calm. */
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const inkColor = tone === "danger" ? t.danger : t.ink;
  const iconColor = selected ? t.accent : tone === "danger" ? t.danger : t.inkSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={(s) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderWidth: 1,
          borderColor: selected
            ? t.accent
            : (s as PressState).hovered
              ? t.inkFaint
              : alpha(t.lineAxis, 0.55),
          borderRadius: t.radius,
          backgroundColor: selected ? t.accentSoft : t.bgRaised,
          paddingVertical: 8.8,
          paddingHorizontal: 12.8,
        },
        style,
      ]}
    >
      {Icon ? (
        <View style={{ width: 24, alignItems: "center" }}>
          <Icon color={iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontFamily: t.fontBody, color: inkColor, fontSize: 15.2, lineHeight: 20.5 }}
        >
          {title}
        </Text>
        {hint ? (
          <Text
            numberOfLines={hintLines}
            style={{
              fontFamily: t.fontBody,
              color: t.inkSoft,
              fontSize: 13.6,
              lineHeight: 18.4,
              marginTop: 2,
            }}
          >
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/* ---------- layout helpers ---------- */

export const rowStyles = StyleSheet.create({
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6.4, marginVertical: 5.6 },
  stack: { flexDirection: "column", gap: 7.2, marginTop: 9.6 },
  stageNav: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    flexWrap: "wrap",
  },
  filterRow: { flexDirection: "row", gap: 4.8, flexWrap: "wrap", alignItems: "center" },
});

/** Page container (.panel): centered column, max 720 wide. */
export function Panel({
  children,
  wide = false,
  inTray = false,
  style,
}: {
  children?: React.ReactNode;
  wide?: boolean;
  /** Inside the operation tray panels lose their page framing. */
  inTray?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        inTray
          ? { width: "100%" }
          : {
              maxWidth: wide ? 896 : 720,
              width: "100%",
              alignSelf: "center",
              paddingTop: 24,
              paddingHorizontal: 17.6,
              paddingBottom: 64,
            },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** The calm accent-washed note (.calm-note). */
export function CalmNote({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: mix(t.accentSoft, t.bg, 62),
          borderRadius: t.radius,
          paddingVertical: 12,
          paddingHorizontal: 15,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ---------- tray context: panels adapt their headings inside the tray ---------- */

export const InTrayContext = createContext(false);
export function useInTray(): boolean {
  return useContext(InTrayContext);
}
