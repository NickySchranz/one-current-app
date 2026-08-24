import { useState } from "react";
import { View } from "react-native";
import type { PsychologicalBranch } from "@/domain/branches/types";
import { suggestRepresentation } from "@/domain/actions/logic";
import type { ComposeActionInput } from "@/domain/actions/logic";
import { useT } from "@/i18n/i18n";
import {
  AppTextInput,
  Card,
  Field,
  H3,
  Hint,
  Tag,
  rowStyles,
} from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { mix } from "@/ui/color";

type Props = {
  branches: PsychologicalBranch[];
  qualitiesCarried: string[];
  onChange: (input: Omit<ComposeActionInput, "branches" | "qualitiesCarried" | "mergeId"> | null) => void;
};

/** Compose one coherent movement, not a task list. Name it and describe it — nothing else is asked. */
export function ActionComposer({ branches, qualitiesCarried, onChange }: Props) {
  const t = useT();
  const th = useTheme();
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");

  function emit(next: { title?: string; instruction?: string }) {
    const nextTitle = next.title ?? title;
    const i = next.instruction ?? instruction;
    if (!nextTitle.trim() || !i.trim()) {
      onChange(null);
      return;
    }
    // The shaping details all have honest defaults — nobody is asked to type them.
    onChange({
      title: nextTitle,
      instruction: i,
      durationMinutes: 30,
      minimumVersion: "A few honest minutes of it",
      completionDefinition: "When the movement has been done once",
      startTime: undefined,
      representations: Object.fromEntries(branches.map((b) => [b.id, suggestRepresentation(b)])),
    });
  }

  return (
    <Card
      style={{
        gap: 7.2,
        paddingTop: 13.6,
        paddingHorizontal: 16,
        paddingBottom: 10.4,
        borderColor: mix(th.accent, th.lineAxis, 45),
      }}
    >
      <H3>{t("One present action")}</H3>
      <Hint>
        {t("One coherent movement that carries what returned. Name it and describe it — that is all it asks.")}
      </Hint>
      <Field label={t("Name it")}>
        <AppTextInput
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            emit({ title: v });
          }}
          placeholder={t("e.g. An evening that carries everything")}
        />
      </Field>
      <Field label={t("The movement itself")}>
        <AppTextInput
          multiline
          value={instruction}
          onChangeText={(v) => {
            setInstruction(v);
            emit({ instruction: v });
          }}
          placeholder={t(
            "e.g. Eat a proper meal, a twenty-minute workout, then define tomorrow's one meaningful work action.",
          )}
        />
      </Field>

      {qualitiesCarried.length > 0 && (
        <View
          style={rowStyles.tagRow}
          accessibilityLabel={t("Qualities this action carries")}
        >
          {qualitiesCarried.map((q) => (
            <Tag key={q} label={q} quality />
          ))}
        </View>
      )}
    </Card>
  );
}
