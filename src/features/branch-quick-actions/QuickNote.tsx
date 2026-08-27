import { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import { appNow } from "@/domain/time/clock";
import {
  AppTextInput,
  Field,
  Panel,
  useInTray,
} from "@/ui/primitives";
import { StepFrame } from "./QuickFlow";

type Props = { branchId: string };

/** Add what just happened — one line, on the thread, done. */
export function QuickNote({ branchId }: Props) {
  const branch = useAppStore((s) => s.branches.find((b) => b.id === branchId));
  const addMoment = useAppStore((s) => s.addMoment);
  const finishReflection = useAppStore((s) => s.finishReflection);
  const setOperation = useAppStore((s) => s.setOperation);
  const t = useT();
  const inTray = useInTray();

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  if (!branch) return null;

  // Noting it closes this stage: the moment appears on the line as the map
  // comes back, and Pip says it from there.
  async function save() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await addMoment({
        branchId,
        date: appNow().toISOString().slice(0, 10),
        title: text.trim(),
        type: "event",
      });
      finishReflection(branchId, "note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel inTray={inTray}>
      <StepFrame
        title={branch.title}
        prompt={t("Add what just happened.")}
        onBack={() => setOperation({ kind: "quick-touch", branchId, expanded: true })}
        next={{ label: t("Note it"), disabled: !text.trim() || busy, onPress: () => void save() }}
      >
        <Field>
          <AppTextInput
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder={t("What happened, in a few words")}
            accessibilityLabel={t("What just happened")}
            onSubmitEditing={() => void save()}
            blurOnSubmit={false}
          />
        </Field>
      </StepFrame>
    </Panel>
  );
}
