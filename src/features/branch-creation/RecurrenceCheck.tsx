import { useState } from "react";
import { View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import type { CreateBranchInput } from "@/stores/app-store";
import { appNow } from "@/domain/time/clock";
import {
  RECURRENCE_REASONS,
  recommendForRecurrence,
  type RecurrenceReasonId,
} from "@/domain/branches/recurrence";
import {
  Button,
  CalmNote,
  Card,
  Choice,
  Hint,
  Panel,
  Prompt,
  T,
  rowStyles,
  useInTray,
} from "@/ui/primitives";

type Props = { matchedBranchId: string; pending: CreateBranchInput };

/** A new concern resembles a thread integrated before. Recurrence is not failure. */
export function RecurrenceCheck({ matchedBranchId, pending }: Props) {
  const branches = useAppStore((s) => s.branches);
  const createBranchNow = useAppStore((s) => s.createBranchNow);
  const recordRecurrenceOn = useAppStore((s) => s.recordRecurrenceOn);
  const addMoment = useAppStore((s) => s.addMoment);
  const updateBranch = useAppStore((s) => s.updateBranch);
  const setOperation = useAppStore((s) => s.setOperation);
  const t = useT();
  const inTray = useInTray();

  const matched = branches.find((b) => b.id === matchedBranchId);
  const [reason, setReason] = useState<RecurrenceReasonId | null>(null);
  const [busy, setBusy] = useState(false);

  if (!matched) return null;

  async function proceed() {
    if (!reason || busy || !matched) return;
    setBusy(true);
    await recordRecurrenceOn(matched.id);
    const rec = recommendForRecurrence(reason);

    if (rec === "new-branch") {
      const branch = await createBranchNow(pending);
      setOperation({ kind: "quick-touch", branchId: branch.id });
    } else if (rec === "add-moment") {
      await addMoment({
        branchId: matched.id,
        date: appNow().toISOString().slice(0, 10),
        title: pending.title,
        type: "intensification",
        description: t("Returned: {reason}", {
          reason: t(RECURRENCE_REASONS.find((r) => r.id === reason)?.label ?? ""),
        }),
      });
      setOperation({ kind: "quick-touch", branchId: matched.id });
    } else if (rec === "reopen") {
      await updateBranch(matched.id, { status: "active", lastActivatedAt: appNow().toISOString() });
      setOperation({ kind: "quick-touch", branchId: matched.id });
    } else if (rec === "new-conflict") {
      await updateBranch(matched.id, { status: "active" });
      setOperation({ kind: "quick-merge", branchId: matched.id });
    } else {
      await updateBranch(matched.id, { status: "needs-support" });
      setOperation({ kind: "seeking-support", branchId: matched.id });
    }
  }

  return (
    <Panel inTray={inTray}>
      <Prompt>{t("This resembles a thread you integrated before.")}</Prompt>
      <Card sunken>
        <T style={{ fontWeight: "600" }}>{matched.title}</T>
        <Hint style={{ marginBottom: 0 }}>
          {t(
            matched.recurrenceCount === 1
              ? "Integrated {date} · returned {n} time before"
              : "Integrated {date} · returned {n} times before",
            { date: matched.mergeDate ?? t("earlier"), n: matched.recurrenceCount },
          )}
        </Hint>
      </Card>
      <CalmNote style={{ marginBottom: 12 }}>
        <T>
          {t(
            "Returning does not mean it was integrated too soon. Something new may be asking for attention.",
          )}
        </T>
      </CalmNote>
      <Prompt>{t("What is different now?")}</Prompt>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 8,
          marginBottom: 16,
        }}
      >
        {RECURRENCE_REASONS.map((r) => (
          <Choice
            key={r.id}
            title={t(r.label)}
            selected={reason === r.id}
            onPress={() => setReason(r.id)}
            style={{ minWidth: 210, flexGrow: 1, flexBasis: 210 }}
          />
        ))}
      </View>
      <View style={rowStyles.stageNav}>
        <Button
          variant="quiet"
          label={t("It is something new")}
          onPress={() => {
            // Treat it as genuinely new anyway.
            void (async () => {
              const branch = await createBranchNow(pending);
              setOperation({ kind: "quick-touch", branchId: branch.id });
            })();
          }}
        />
        <Button
          variant="primary"
          label={t("Continue")}
          disabled={!reason || busy}
          onPress={() => void proceed()}
        />
      </View>
    </Panel>
  );
}
