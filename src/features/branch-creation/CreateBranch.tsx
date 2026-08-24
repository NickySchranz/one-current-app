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
import { LoudnessSlider, loudnessWord } from "@/ui/LoudnessSlider";

type WhenId = "today" | "this-week" | "this-month" | "earlier";

const WHEN_OPTIONS: { id: WhenId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "this-week", label: "This week" },
  { id: "this-month", label: "This month" },
  { id: "earlier", label: "Earlier…" },
];

// "Earlier" is answered by tapping a year — a rough anchor is all the fork
// point needs, so nothing here asks for typing.
const EARLIER_THIS_YEAR = "this-year";
const EARLIER_LONGER = "longer";
const EARLIER_UNSURE = "unsure";

function earlierChoices(now: Date): { id: string; label: string }[] {
  const y = now.getFullYear();
  return [
    { id: EARLIER_THIS_YEAR, label: "Earlier this year" },
    ...[1, 2, 3, 4, 5].map((d) => ({ id: String(y - d), label: String(y - d) })),
    { id: EARLIER_LONGER, label: "Longer ago" },
    { id: EARLIER_UNSURE, label: "I am not sure" },
  ];
}

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
  const [earlier, setEarlier] = useState<string | null>(null);
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
    if (!earlier) return null;
    if (earlier === EARLIER_UNSURE) return { kind: "unsure" };
    const y = appNow().getFullYear();
    if (earlier === EARLIER_THIS_YEAR) {
      return { kind: "approximate-date", date: `${y}-02-01` };
    }
    if (earlier === EARLIER_LONGER) {
      return { kind: "life-period", label: t("Longer ago"), approximateDate: `${y - 8}-06-15` };
    }
    return { kind: "life-period", label: earlier, approximateDate: `${earlier}-06-15` };
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
            <Hint style={{ marginTop: 4, marginBottom: 0 }}>
              {t("Named things get quieter.")}
            </Hint>
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
              <View
                style={rowStyles.tagRow}
                accessibilityRole="radiogroup"
                accessibilityLabel={t("Earlier, more precisely")}
              >
                {earlierChoices(appNow()).map((opt) => (
                  <Tag
                    key={opt.id}
                    label={/^\d+$/.test(opt.label) ? opt.label : t(opt.label)}
                    pressed={earlier === opt.id}
                    onPress={() => setEarlier(opt.id)}
                  />
                ))}
              </View>
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
                {t("It may hold some of {list} for now — integrating it brings them home.", {
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
              accessibilityText={t("{word} — {level} of 5", {
                word: t(loudnessWord(loudness)),
                level: Math.round(loudness),
              })}
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
