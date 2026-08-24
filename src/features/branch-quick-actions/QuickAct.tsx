import { useState } from "react";
import { View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import {
  AppTextInput,
  Button,
  CalmNote,
  Choice,
  Field,
  Panel,
  T,
  Tag,
  rowStyles,
  useInTray,
} from "@/ui/primitives";
import { IconClock } from "@/ui/icons";
import { StepFrame, StepTransition } from "./QuickFlow";

type Props = { branchId: string };

const STEP_SUGGESTIONS = [
  "Say it out loud to someone",
  "Write down what you know for five minutes",
  "Do the first two minutes of it",
  "Ask the one question you keep avoiding",
];

const WHEN_OPTIONS = ["Now", "In ten minutes", "Later today", "Choose a time"];

/** One small honest step, placed on the main line today — asked in two steps. */
export function QuickAct({ branchId }: Props) {
  const branch = useAppStore((s) => s.branches.find((b) => b.id === branchId));
  const createTodayAction = useAppStore((s) => s.createTodayAction);
  const setOperation = useAppStore((s) => s.setOperation);
  const t = useT();
  const inTray = useInTray();

  const [stage, setStage] = useState(0);
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
      <StepTransition stepKey={stage}>
        {stage === 0 ? (
          <StepFrame
            title={branch.title}
            prompt={t("What is the smallest honest step?")}
            stepIndex={0}
            totalSteps={2}
            onBack={() => setOperation({ kind: "quick-touch", branchId, expanded: true })}
            next={{
              label: t("Next"),
              disabled: !step.trim(),
              onPress: () => setStage(1),
            }}
          >
            <Field>
              <AppTextInput
                autoFocus
                value={step}
                onChangeText={setStep}
                placeholder={t("One small step")}
                accessibilityLabel={t("The smallest honest step")}
                onSubmitEditing={() => step.trim() && setStage(1)}
                blurOnSubmit={false}
              />
            </Field>
            <View style={rowStyles.tagRow} accessibilityLabel={t("Step suggestions")}>
              {STEP_SUGGESTIONS.map((s) => (
                <Tag key={s} label={t(s)} onPress={() => setStep(t(s))} />
              ))}
            </View>
          </StepFrame>
        ) : (
          <StepFrame
            title={branch.title}
            prompt={t("When will you begin?")}
            stepIndex={1}
            totalSteps={2}
            onBack={() => setStage(0)}
            next={{
              label: t("Place it on today"),
              disabled: !step.trim() || busy,
              onPress: () => void save(),
            }}
          >
            <View
              style={{ flexDirection: "column", gap: 6.4, marginVertical: 6.4 }}
              accessibilityLabel={t("When to begin")}
            >
              {WHEN_OPTIONS.map((w) => (
                <Choice
                  key={w}
                  title={t(w)}
                  icon={w === "Choose a time" ? IconClock : undefined}
                  selected={when === w}
                  onPress={() => setWhen(w)}
                />
              ))}
            </View>
            {when === "Choose a time" && (
              <AppTextInput
                autoFocus
                value={time}
                onChangeText={setTime}
                placeholder="HH:MM"
                accessibilityLabel={t("Time to begin")}
              />
            )}
          </StepFrame>
        )}
      </StepTransition>
    </Panel>
  );
}
