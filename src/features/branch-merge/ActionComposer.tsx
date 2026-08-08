import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
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

/** <details class="optional-details"> ported as a tap-to-unfold section. */
function OptionalDetails({
  summary,
  children,
}: {
  summary: string;
  children?: React.ReactNode;
}) {
  const th = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View
      style={{
        marginTop: 12,
        marginBottom: 16,
        borderRadius: th.radius,
        paddingVertical: 8,
        paddingHorizontal: 12.8,
        backgroundColor: open ? mix(th.bgSunken, th.bg, 35) : mix(th.bgSunken, th.bg, 55),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={{ paddingVertical: 3.2 }}
      >
        {(s) => (
          <Text
            style={{
              fontFamily: th.fontBody,
              color: (s as { hovered?: boolean }).hovered ? th.ink : th.inkSoft,
              fontSize: 14.7,
              marginBottom: open ? 9.6 : 0,
            }}
          >
            {open ? "▾" : "▸"} {summary}
          </Text>
        )}
      </Pressable>
      {open ? children : null}
    </View>
  );
}

/** Compose one coherent movement, not a task list. Only the essentials are required. */
export function ActionComposer({ branches, qualitiesCarried, onChange }: Props) {
  const t = useT();
  const th = useTheme();
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [duration, setDuration] = useState(30);
  const [minimum, setMinimum] = useState("");
  const [completion, setCompletion] = useState("");
  const [startTime, setStartTime] = useState("");
  const [reps, setReps] = useState<Record<string, string>>(
    Object.fromEntries(branches.map((b) => [b.id, suggestRepresentation(b)])),
  );

  function emit(next: {
    title?: string;
    instruction?: string;
    duration?: number;
    minimum?: string;
    completion?: string;
    startTime?: string;
    reps?: Record<string, string>;
  }) {
    const nextTitle = next.title ?? title;
    const i = next.instruction ?? instruction;
    if (!nextTitle.trim() || !i.trim()) {
      onChange(null);
      return;
    }
    onChange({
      title: nextTitle,
      instruction: i,
      durationMinutes: next.duration ?? duration,
      minimumVersion: (next.minimum ?? minimum).trim() || "A few honest minutes of it",
      completionDefinition:
        (next.completion ?? completion).trim() || "When the movement has been done once",
      startTime: (next.startTime ?? startTime) || undefined,
      representations: next.reps ?? reps,
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
        {t(
          "One coherent movement that carries what returned. Name it and describe it — the rest is optional.",
        )}
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

      <OptionalDetails summary={t("Shape it further (optional)")}>
        <View
          style={{ marginBottom: 14.4, flexDirection: "row", gap: 12, flexWrap: "wrap" }}
        >
          <Field
            label={t("About how long? (minutes)")}
            style={{ flex: 1, minWidth: 140, marginBottom: 0 }}
          >
            <AppTextInput
              keyboardType="number-pad"
              value={String(duration)}
              onChangeText={(text) => {
                const v = Number(text) || 30;
                setDuration(v);
                emit({ duration: v });
              }}
            />
          </Field>
          <Field label={t("Start time")} style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
            <AppTextInput
              value={startTime}
              onChangeText={(v) => {
                setStartTime(v);
                emit({ startTime: v });
              }}
              placeholder="HH:MM"
            />
          </Field>
        </View>
        <Field label={t("The smallest version that still counts")}>
          <AppTextInput
            value={minimum}
            onChangeText={(v) => {
              setMinimum(v);
              emit({ minimum: v });
            }}
            placeholder={t("e.g. Ten minutes of movement and one written sentence")}
          />
        </Field>
        <Field label={t("You will know it is complete when…")}>
          <AppTextInput
            value={completion}
            onChangeText={(v) => {
              setCompletion(v);
              emit({ completion: v });
            }}
          />
        </Field>
        {branches.length > 1 && (
          <Field label={t("How each thread is represented")}>
            {branches.map((b) => (
              <View key={b.id} style={{ marginBottom: 8 }}>
                <Hint style={{ marginBottom: 0 }}>{b.title} →</Hint>
                <AppTextInput
                  accessibilityLabel={t("How {title} is represented", { title: b.title })}
                  value={reps[b.id] ?? ""}
                  onChangeText={(v) => {
                    const next = { ...reps, [b.id]: v };
                    setReps(next);
                    emit({ reps: next });
                  }}
                />
              </View>
            ))}
          </Field>
        )}
      </OptionalDetails>

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
