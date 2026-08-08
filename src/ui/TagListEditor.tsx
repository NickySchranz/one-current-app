import { useState } from "react";
import { View } from "react-native";
import { useT } from "@/i18n/i18n";
import { AppTextInput, Button, Field, Hint, Tag, rowStyles } from "@/ui/primitives";

type Props = {
  label: string;
  hint?: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: readonly string[];
  placeholder?: string;
  variant?: "default" | "quality";
};

/** Add/remove short statements as tags, with optional suggestions. */
export function TagListEditor({
  label,
  hint,
  values,
  onChange,
  suggestions,
  placeholder,
  variant = "default",
}: Props) {
  const t = useT();
  const [text, setText] = useState("");

  function add(value: string) {
    const v = value.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setText("");
  }

  function remove(value: string) {
    onChange(values.filter((x) => x !== value));
  }

  const remaining = (suggestions ?? []).filter((s) => !values.includes(s));

  return (
    <Field label={label}>
      {hint ? <Hint style={{ marginBottom: 4 }}>{hint}</Hint> : null}
      <View style={rowStyles.tagRow} accessibilityLabel={t("{label}: chosen", { label })}>
        {values.map((v) => (
          <Tag
            key={v}
            label={v}
            quality={variant === "quality"}
            onRemove={() => remove(v)}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 6.4 }}>
        <AppTextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder ?? t("Add your own…")}
          accessibilityLabel={t("Add to {label}", { label })}
          onSubmitEditing={() => add(text)}
          blurOnSubmit={false}
          style={{ flex: 1, width: "auto" }}
        />
        <Button label={t("Add")} disabled={!text.trim()} onPress={() => add(text)} />
      </View>
      {remaining.length > 0 && (
        <View
          style={rowStyles.tagRow}
          accessibilityLabel={t("{label}: suggestions", { label })}
        >
          {remaining.map((s) => (
            <Tag key={s} label={`+ ${t(s)}`} onPress={() => add(s)} />
          ))}
        </View>
      )}
    </Field>
  );
}
