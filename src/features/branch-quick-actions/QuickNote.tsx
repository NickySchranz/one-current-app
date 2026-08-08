import { useState } from "react";
import { View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import { appNow } from "@/domain/time/clock";
import {
  AppTextInput,
  Button,
  CalmNote,
  Field,
  Panel,
  Prompt,
  T,
  rowStyles,
  useInTray,
} from "@/ui/primitives";

type Props = { branchId: string };

/** Add what just happened — one line, on the thread, done. */
export function QuickNote({ branchId }: Props) {
  const branch = useAppStore((s) => s.branches.find((b) => b.id === branchId));
  const addMoment = useAppStore((s) => s.addMoment);
  const setOperation = useAppStore((s) => s.setOperation);
  const t = useT();
  const inTray = useInTray();

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!branch) return null;

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
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Panel inTray={inTray}>
        <CalmNote style={{ marginBottom: 12 }}>
          <T>{t("Noted on the thread.")}</T>
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
      <Prompt>{t("Add what just happened.")}</Prompt>
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
      <View style={rowStyles.stageNav}>
        <Button
          variant="quiet"
          label={t("Back")}
          onPress={() => setOperation({ kind: "quick-touch", branchId })}
        />
        <Button
          variant="primary"
          label={t("Note it")}
          disabled={!text.trim() || busy}
          onPress={() => void save()}
        />
      </View>
    </Panel>
  );
}
