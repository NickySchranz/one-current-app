import { useEffect, useState } from "react";
import { View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import type { ForkPeriodChoice, Loudness } from "@/domain/branches/types";
import { resolveForkDate } from "@/domain/branches/logic";
import { ANXIETIES, suggestLockedFeelings } from "@/domain/feelings/logic";
import { FeelingPicker } from "@/features/branch-touch/FeelingPicker";
import { StepFrame, StepTransition } from "@/features/branch-quick-actions/QuickFlow";
import { appNow } from "@/domain/time/clock";
import {
  AppTextInput,
  Field,
  Hint,
  Panel,
  Tag,
  rowStyles,
  useInTray,
} from "@/ui/primitives";
import { LoudnessSlider } from "@/ui/LoudnessSlider";

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
 * Four small questions: what pulls, since when, what it makes you feel, how
 * loud. While the form is open the map holds only this one line (drawn
 * optimistically the moment the form opens; cancelling takes it away).
 * Finishing closes the panel — the line then draws itself in among the rest.
 */
export function CreateBranch() {
  const requestBranch = useAppStore((s) => s.requestBranch);
  const setOperation = useAppStore((s) => s.setOperation);
  const beginDraftBranch = useAppStore((s) => s.beginDraftBranch);
  const updateDraftBranch = useAppStore((s) => s.updateDraftBranch);
  const t = useT();
  const inTray = useInTray();

  const [stage, setStage] = useState(0);
  const [title, setTitle] = useState("");
  const [whenId, setWhenId] = useState<WhenId>("today");
  const [earlierId, setEarlierId] = useState<EarlierId>("date");
  const [approxDate, setApproxDate] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [periodYear, setPeriodYear] = useState("");
  const [anxieties, setAnxieties] = useState<string[]>([]);
  const [loudness, setLoudness] = useState<number>(3);
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
        loudness: loudness as Loudness,
        anxieties: anxieties.length > 0 ? anxieties : undefined,
        occupies: anxieties.length > 0 ? suggestLockedFeelings(anxieties) : undefined,
      });
      // On recurrence the tray content switches to the recurrence check.
      // Otherwise the panel sets itself down: the full map returns, the new
      // line draws itself in, and a small note says it has been added.
      if (result.branch) setOperation({ kind: "idle" });
    } finally {
      setBusy(false);
    }
  }

  // Cancel before the operation flips so the draft never flashes on the
  // restored full map (the unmount cleanup is then a no-op).
  const cancel = () => {
    useAppStore.getState().cancelDraftBranch();
    setOperation({ kind: "idle" });
  };

  const namedTitle = title.trim() || undefined;

  return (
    <Panel inTray={inTray}>
      <StepTransition stepKey={stage}>
        {stage === 0 && (
          <StepFrame
            prompt={t("What is pulling at you?")}
            stepIndex={0}
            totalSteps={4}
            backLabel={t("Cancel")}
            onBack={cancel}
            next={{
              label: t("Next"),
              disabled: !title.trim(),
              onPress: () => setStage(1),
            }}
          >
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
                onSubmitEditing={() => title.trim() && setStage(1)}
                blurOnSubmit={false}
              />
            </Field>
          </StepFrame>
        )}
        {stage === 1 && (
          <StepFrame
            title={namedTitle}
            prompt={t("Since when?")}
            stepIndex={1}
            totalSteps={4}
            onBack={() => setStage(0)}
            next={{
              label: t("Next"),
              disabled: !resolvedPeriod(),
              onPress: () => setStage(2),
            }}
          >
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
          </StepFrame>
        )}
        {stage === 2 && (
          <StepFrame
            title={namedTitle}
            prompt={t("What does it make you feel? (optional)")}
            stepIndex={2}
            totalSteps={4}
            onBack={() => setStage(1)}
            next={{ label: t("Next"), onPress: () => setStage(3) }}
          >
            <FeelingPicker
              label={t("What it makes you feel")}
              options={ANXIETIES}
              selected={anxieties}
              onToggle={(f: string) =>
                setAnxieties((prev) => {
                  const next = prev.includes(f)
                    ? prev.filter((x) => x !== f)
                    : [...prev, f];
                  // the stage shows what the line holds as it is chosen
                  updateDraftBranch({ anxieties: next });
                  return next;
                })
              }
            />
            {anxieties.length > 0 && (
              <Hint style={{ marginTop: 6, marginBottom: 0 }}>
                {t("While it stays open, it may draw on {list}.", {
                  list: suggestLockedFeelings(anxieties)
                    .map((f) => t(f))
                    .join(", "),
                })}
              </Hint>
            )}
          </StepFrame>
        )}
        {stage === 3 && (
          <StepFrame
            title={namedTitle}
            prompt={t("How loud is it right now?")}
            stepIndex={3}
            totalSteps={4}
            onBack={() => setStage(2)}
            next={{
              label: t("Start the thread"),
              disabled: busy,
              onPress: () => void createNow(),
            }}
          >
            <LoudnessSlider
              value={loudness}
              accessibilityText={
                loudness === 1
                  ? t("Quiet")
                  : t("Loudness {level} of 5", { level: Math.round(loudness) })
              }
              onChange={(v) => {
                setLoudness(v);
                // the lone line on the map thickens as the dial fills
                updateDraftBranch({ loudness: v as Loudness });
              }}
            />
          </StepFrame>
        )}
      </StepTransition>
    </Panel>
  );
}
