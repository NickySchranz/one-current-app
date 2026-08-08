import { useState } from "react";
import { View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import {
  AppTextInput,
  Button,
  CalmNote,
  Field,
  Panel,
  Prompt,
  T,
  Tag,
  rowStyles,
  useInTray,
} from "@/ui/primitives";

type Props = { branchId: string };

const STEP_SUGGESTIONS = [
  "Say it out loud to someone",
  "Write down what you know for five minutes",
  "Do the first two minutes of it",
  "Ask the one question you keep avoiding",
];

const WHEN_OPTIONS = ["Now", "In ten minutes", "Later today", "Choose a time"];

/** One small honest step, placed on the main line today. */
export function QuickAct({ branchId }: Props) {
  const branch = useAppStore((s) => s.branches.find((b) => b.id === branchId));
  const createTodayAction = useAppStore((s) => s.createTodayAction);
  const setOperation = useAppStore((s) => s.setOperation);
  const t = useT();
  const inTray = useInTray();

  const [step, setStep] = useState("");
  const [when, setWhen] = useState("Now");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!branch) return null;

  async function save() {
    if (!step.trim() || busy) return;
    setBusy(true);
    try {
      const suffix =
        when === "Choose a time" && time
          ? ` (${t("at {time}", { time })})`
          : when !== "Now"
            ? ` (${t(when).toLowerCase()})`
            : "";
      await createTodayAction(branchId, `${step.trim()}${suffix}`);
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Panel inTray={inTray}>
        <CalmNote style={{ marginBottom: 12 }}>
          <T>{t("Action added to your main line.")}</T>
        </CalmNote>
        <Button
          variant="primary"
          label={t("Return to timeline")}
          onPress={() => setOperation({ kind: "idle" })}
          style={{ alignSelf: "flex-start" }}
        />
      </Panel>
    );
  }

  return (
    <Panel inTray={inTray}>
      <T style={{ fontSize: 16.8, fontWeight: "600" }}>{branch.title}</T>
      <Prompt>{t("What is the smallest honest step?")}</Prompt>
      <Field>
        <AppTextInput
          autoFocus
          value={step}
          onChangeText={setStep}
          placeholder={t("One small step")}
          accessibilityLabel={t("The smallest honest step")}
          onSubmitEditing={() => void save()}
          blurOnSubmit={false}
        />
      </Field>
      <View style={rowStyles.tagRow} accessibilityLabel={t("Step suggestions")}>
        {STEP_SUGGESTIONS.map((s) => (
          <Tag key={s} label={t(s)} onPress={() => setStep(t(s))} />
        ))}
      </View>
      <Field label={t("When will you begin?")}>
        <View style={rowStyles.tagRow} accessibilityLabel={t("When to begin")}>
          {WHEN_OPTIONS.map((w) => (
            <Tag key={w} label={t(w)} pressed={when === w} onPress={() => setWhen(w)} />
          ))}
        </View>
        {when === "Choose a time" && (
          <AppTextInput
            value={time}
            onChangeText={setTime}
            placeholder="HH:MM"
            accessibilityLabel={t("Time to begin")}
          />
        )}
      </Field>
      <View style={rowStyles.stageNav}>
        <Button
          variant="quiet"
          label={t("Back")}
          onPress={() => setOperation({ kind: "quick-touch", branchId })}
        />
        <Button
          variant="primary"
          label={t("Place it on today")}
          disabled={!step.trim() || busy}
          onPress={() => void save()}
        />
      </View>
    </Panel>
  );
}
