import { useState } from "react";
import { View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import { appNow } from "@/domain/time/clock";
import { AppTextInput, Button, Field, Hint, Panel, rowStyles, useInTray } from "@/ui/primitives";
import { StepFrame } from "./QuickFlow";

type Props = { branchId: string };

/** Offered horizons. A date is what makes waiting different from avoiding. */
const HORIZONS: { id: string; label: string; days: number }[] = [
  { id: "week", label: "In a week", days: 7 },
  { id: "fortnight", label: "In two weeks", days: 14 },
  { id: "month", label: "In a month", days: 30 },
];

function isoIn(days: number): string {
  return new Date(appNow().getTime() + days * 86400000).toISOString().slice(0, 10);
}

/**
 * Waiting, said out loud.
 *
 * Some situations are genuinely not yours to move yet, and the honest answer
 * is neither a step nor "leave it". Without this, the only way to stop a
 * thread asking every day was to let it rest each morning or integrate it as
 * though it were finished — so the app quietly pushed people to overclaim.
 *
 * The distinction that matters: waiting names WHAT is awaited and WHEN to
 * look again. That is what separates it from avoidance, and it is why the
 * date is not optional.
 *
 * The model behind this (WaitingContainer, applyWaitingToBranch, isReviewDue,
 * nextReviewText) was written long ago and never had a caller — the status,
 * the export field and Pip's phrase for it have all been waiting for a door.
 */
export function QuickWait({ branchId }: Props) {
  const branch = useAppStore((s) => s.branches.find((b) => b.id === branchId));
  const startWaiting = useAppStore((s) => s.startWaiting);
  const setOperation = useAppStore((s) => s.setOperation);
  const t = useT();
  const inTray = useInTray();

  const [awaiting, setAwaiting] = useState("");
  const [horizon, setHorizon] = useState("fortnight");
  const [busy, setBusy] = useState(false);

  if (!branch) return null;

  const days = HORIZONS.find((h) => h.id === horizon)?.days ?? 14;

  async function save() {
    if (!awaiting.trim() || busy) return;
    setBusy(true);
    try {
      await startWaiting(branchId, { awaiting: awaiting.trim(), reviewDate: isoIn(days) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel inTray={inTray}>
      <StepFrame
        title={branch.title}
        prompt={t("What are you waiting for?")}
        onBack={() => setOperation({ kind: "quick-touch", branchId, expanded: true })}
        next={{
          label: busy ? t("Setting it down…") : t("Wait for this"),
          disabled: !awaiting.trim() || busy,
          onPress: () => void save(),
        }}
      >
        <Field>
          <AppTextInput
            autoFocus
            value={awaiting}
            onChangeText={setAwaiting}
            placeholder={t("e.g. their answer about the dates")}
            accessibilityLabel={t("What are you waiting for?")}
            onSubmitEditing={() => void save()}
            blurOnSubmit={false}
          />
        </Field>
        <Hint style={{ marginTop: 4 }}>{t("When should this come back to you?")}</Hint>
        <View style={rowStyles.filterRow} accessibilityLabel={t("When should this come back to you?")}>
          {HORIZONS.map((h) => (
            <Button
              key={h.id}
              selected={horizon === h.id}
              onPress={() => setHorizon(h.id)}
              label={t(h.label)}
            />
          ))}
        </View>
        <Hint style={{ marginBottom: 0 }}>
          {t(
            "Until then it stops asking. Naming the date is what makes this waiting rather than avoiding — and you can open it sooner whenever you like.",
          )}
        </Hint>
      </StepFrame>
    </Panel>
  );
}
