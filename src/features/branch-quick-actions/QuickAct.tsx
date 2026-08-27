import { useState } from "react";
import { View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import {
  AppTextInput,
  Choice,
  Field,
  Panel,
  Tag,
  rowStyles,
  useInTray,
} from "@/ui/primitives";
import { StepFrame, StepTransition } from "./QuickFlow";

type Props = { branchId: string };

const STEP_SUGGESTIONS = [
  "Say it out loud to someone",
  "Write down what you know for five minutes",
  "Do the first two minutes of it",
  "Ask the one question you keep avoiding",
];

const WHEN_OPTIONS = ["Now", "In ten minutes", "Later today", "This evening"];

/** One small honest step, placed on the main line today — asked in two steps. */
export function QuickAct({ branchId }: Props) {
  const branch = useAppStore((s) => s.branches.find((b) => b.id === branchId));
  const createTodayAction = useAppStore((s) => s.createTodayAction);
  const finishReflection = useAppStore((s) => s.finishReflection);
  const setOperation = useAppStore((s) => s.setOperation);
  const t = useT();
  const inTray = useInTray();

  const [stage, setStage] = useState(0);
  const [step, setStep] = useState("");
  const [when, setWhen] = useState("Now");
  const [busy, setBusy] = useState(false);

  if (!branch) return null;

  // Placing the step closes this stage. Nothing is confirmed here: the map
  // comes back and Pip says it, standing at the thread the step belongs to.
  async function save() {
    if (!step.trim() || busy) return;
    setBusy(true);
    try {
      const suffix = when !== "Now" ? ` (${t(when).toLowerCase()})` : "";
      await createTodayAction(branchId, `${step.trim()}${suffix}`);
      finishReflection(branchId, "act");
    } finally {
      setBusy(false);
    }
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
                <Choice key={w} title={t(w)} selected={when === w} onPress={() => setWhen(w)} />
              ))}
            </View>
          </StepFrame>
        )}
      </StepTransition>
    </Panel>
  );
}
