import { useEffect, useState } from "react";
import { View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import type { ForkPeriodChoice } from "@/domain/branches/types";
import { resolveForkDate } from "@/domain/branches/logic";
import { ANXIETIES, suggestLockedFeelings } from "@/domain/feelings/logic";
import { FeelingPicker } from "@/features/branch-touch/FeelingPicker";
import { appNow } from "@/domain/time/clock";
import {
  AppTextInput,
  Button,
  Field,
  Hint,
  Panel,
  Prompt,
  Tag,
  rowStyles,
  useInTray,
} from "@/ui/primitives";

type WhenId = "today" | "this-week" | "this-month" | "earlier";
type EarlierId = "date" | "period" | "unsure";

const WHEN_OPTIONS: { id: WhenId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "this-week", label: "This week" },
  { id: "this-month", label: "This month" },
  { id: "earlier", label: "Earlier…" },
];

const EARLIER_OPTIONS: { id: EarlierId; label: string }[] = [
  { id: "date", label: "Around a date" },
  { id: "period", label: "A life period" },
  { id: "unsure", label: "I am not sure" },
];

/**
 * One screen: name what pulls, say when, create. The line draws itself onto
 * the timeline the moment the form opens (optimistically); cancelling takes
 * it away again. Loudness is not asked here — the quick menu that follows
 * carries the dial.
 */
export function CreateBranch() {
  const requestBranch = useAppStore((s) => s.requestBranch);
  const setOperation = useAppStore((s) => s.setOperation);
  const beginDraftBranch = useAppStore((s) => s.beginDraftBranch);
  const updateDraftBranch = useAppStore((s) => s.updateDraftBranch);
  const t = useT();
  const inTray = useInTray();

  const [title, setTitle] = useState("");
  const [whenId, setWhenId] = useState<WhenId>("today");
  const [earlierId, setEarlierId] = useState<EarlierId>("date");
  const [approxDate, setApproxDate] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [periodYear, setPeriodYear] = useState("");
  const [anxieties, setAnxieties] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // The optimistic line: born with the form, gone if the form closes unsaved.
  // Committing clears draftBranchId first, so this cleanup then does nothing.
  useEffect(() => {
    beginDraftBranch();
    return () => useAppStore.getState().cancelDraftBranch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per open form
  }, []);

  function resolvedPeriod(): ForkPeriodChoice | null {
    if (whenId === "today") return { kind: "today" };
    if (whenId === "this-week") return { kind: "this-week" };
    if (whenId === "this-month") return { kind: "this-month" };
    if (earlierId === "date") {
      return approxDate ? { kind: "approximate-date", date: approxDate } : null;
    }
    if (earlierId === "period") {
      if (!periodLabel || !periodYear) return null;
      return { kind: "life-period", label: periodLabel, approximateDate: `${periodYear}-06-15` };
    }
    return { kind: "unsure" };
  }

  // The optimistic line follows the "since when?" answer as it changes.
  const period = resolvedPeriod();
  const forkKey = period ? JSON.stringify(period) : null;
  useEffect(() => {
    if (!forkKey) return;
    const { forkDate, forkLabel } = resolveForkDate(JSON.parse(forkKey), appNow());
    updateDraftBranch({ forkDate, forkLabel });
  }, [forkKey, updateDraftBranch]);

  async function createNow() {
    const p = resolvedPeriod();
    if (!title.trim() || !p || busy) return;
    setBusy(true);
    try {
      // The kind is not asked up front; it can be named later, or never.
      // What the thread draws away is derived from how it makes you feel.
      const result = await requestBranch({
        title,
        kindChoiceId: "unnamed",
        period: p,
        anxieties: anxieties.length > 0 ? anxieties : undefined,
        occupies: anxieties.length > 0 ? suggestLockedFeelings(anxieties) : undefined,
      });
      // On recurrence the tray content switches to the recurrence check.
      // Otherwise the new line stays in focus and its quick menu opens:
      // the same actions every thread has, right away.
      if (result.branch) setOperation({ kind: "quick-touch", branchId: result.branch.id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel inTray={inTray}>
      <Prompt>{t("What is pulling at you?")}</Prompt>
      <Field>
        <AppTextInput
          autoFocus
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            // the optimistic line carries the name as it is typed
            updateDraftBranch({ title: v });
          }}
          placeholder={t("Name it in a few words")}
          accessibilityLabel={t("Name the thread")}
          onSubmitEditing={() => void createNow()}
        />
      </Field>
      <Field label={t("Since when?")}>
        <View
          style={rowStyles.tagRow}
          accessibilityRole="radiogroup"
          accessibilityLabel={t("When this began")}
        >
          {WHEN_OPTIONS.map((opt) => (
            <Tag
              key={opt.id}
              label={t(opt.label)}
              pressed={whenId === opt.id}
              onPress={() => setWhenId(opt.id)}
            />
          ))}
        </View>
      </Field>
      {whenId === "earlier" && (
        <>
          <View
            style={rowStyles.tagRow}
            accessibilityRole="radiogroup"
            accessibilityLabel={t("Earlier, more precisely")}
          >
            {EARLIER_OPTIONS.map((opt) => (
              <Tag
                key={opt.id}
                label={t(opt.label)}
                pressed={earlierId === opt.id}
                onPress={() => setEarlierId(opt.id)}
              />
            ))}
          </View>
          {earlierId === "date" && (
            <Field label={t("Roughly when?")}>
              <AppTextInput
                value={approxDate}
                onChangeText={setApproxDate}
                placeholder="YYYY-MM-DD"
                accessibilityLabel={t("Roughly when?")}
              />
            </Field>
          )}
          {earlierId === "period" && (
            <>
              <Field label={t("Name the period")}>
                <AppTextInput
                  value={periodLabel}
                  onChangeText={setPeriodLabel}
                  placeholder={t("e.g. after the move, my first job")}
                />
              </Field>
              <Field label={t("Around which year?")}>
                <AppTextInput
                  value={periodYear}
                  onChangeText={setPeriodYear}
                  keyboardType="number-pad"
                  placeholder={String(appNow().getFullYear())}
                  accessibilityLabel={t("Around which year?")}
                />
              </Field>
            </>
          )}
        </>
      )}
      <Field label={t("What does it make you feel? (optional)")}>
        <FeelingPicker
          label={t("What it makes you feel")}
          options={ANXIETIES}
          selected={anxieties}
          onToggle={(f: string) =>
            setAnxieties((prev) =>
              prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
            )
          }
        />
        {anxieties.length > 0 && (
          <Hint style={{ marginBottom: 0 }}>
            {t("While it stays open, it may draw on {list}.", {
              list: suggestLockedFeelings(anxieties)
                .map((f) => t(f))
                .join(", "),
            })}
          </Hint>
        )}
      </Field>
      <View style={rowStyles.stageNav}>
        <Button
          variant="quiet"
          label={t("Cancel")}
          onPress={() => setOperation({ kind: "idle" })}
        />
        <Button
          variant="primary"
          label={t("Start the thread")}
          disabled={!title.trim() || !resolvedPeriod() || busy}
          onPress={() => void createNow()}
        />
      </View>
    </Panel>
  );
}
