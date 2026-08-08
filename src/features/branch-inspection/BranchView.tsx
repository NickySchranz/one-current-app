import React, { useMemo, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { DIFF_CHANGE_OPTIONS, RECLAIMABLE_QUALITIES, type DiffChangeId } from "@/domain/branches/diff";
import type { Controllability, PsychologicalBranch } from "@/domain/branches/types";
import { ANXIETIES, suggestLockedFeelings } from "@/domain/feelings/logic";
import { describeBranch } from "@/visualization/a11y/describe";
import { useT } from "@/i18n/i18n";
import { appNow } from "@/domain/time/clock";
import { TagListEditor } from "@/ui/TagListEditor";
import { FeelingPicker } from "@/features/branch-touch/FeelingPicker";
import { MomentList } from "../branch-moments/MomentList";
import { MomentEditor } from "../branch-moments/MomentEditor";
import {
  AppTextInput,
  Button,
  CalmNote,
  Chip,
  Field,
  H1,
  Hint,
  P,
  Panel,
  Prompt,
  T,
  Tag,
  rowStyles,
  useInTray,
} from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha, mix } from "@/ui/color";

const EXAMPLE_BELIEFS = [
  "I cannot relax until this is resolved.",
  "My real life begins after this.",
  "I was stronger then.",
  "I need this person's approval.",
  "I have fallen behind.",
  "If I do not control this, something bad will happen.",
];

const CONTROLLABILITY: { id: Controllability; label: string }[] = [
  { id: "changeable", label: "I can change this" },
  { id: "influenceable", label: "I can influence this" },
  { id: "outside-control", label: "This is outside my control" },
  { id: "unclear", label: "Unclear for now" },
];

const VALID_EXAMPLES = [
  "I need connection.",
  "This relationship matters.",
  "My body needs recovery.",
  "A boundary was crossed.",
  "There is still a real task to complete.",
];
const OUTDATED_EXAMPLES = [
  "My life cannot begin yet.",
  "I must solve everything tonight.",
  "I need certainty before acting.",
  "This other person determines my value.",
];
const OUTSIDE_EXAMPLES = [
  "another person's decision",
  "approval",
  "institutional timing",
  "an uncertain outcome",
];

/** <details class="optional-details"> ported as a tap-to-unfold section. */
function OptionalDetails({
  summary,
  children,
}: {
  summary: string;
  children?: React.ReactNode;
}) {
  const th = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View
      style={{
        marginTop: 12,
        marginBottom: 16,
        borderRadius: th.radius,
        paddingVertical: 8,
        paddingHorizontal: 12.8,
        backgroundColor: open ? mix(th.bgSunken, th.bg, 35) : mix(th.bgSunken, th.bg, 55),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={{ paddingVertical: 3.2 }}
      >
        {(s) => (
          <Text
            style={{
              fontFamily: th.fontBody,
              color: (s as { hovered?: boolean }).hovered ? th.ink : th.inkSoft,
              fontSize: 14.7,
              marginBottom: open ? 9.6 : 0,
            }}
          >
            {open ? "▾" : "▸"} {summary}
          </Text>
        )}
      </Pressable>
      {open ? children : null}
    </View>
  );
}

type Props = { branchId: string };

/** One calm view of the whole line — story, what's still yours, and what happens next. */
export function BranchView({ branchId }: Props) {
  const t = useT();
  const th = useTheme();
  const inTray = useInTray();
  const { width } = useWindowDimensions();
  const branches = useAppStore((s) => s.branches);
  const updateBranch = useAppStore((s) => s.updateBranch);
  const createTodayAction = useAppStore((s) => s.createTodayAction);
  const branch = useMemo(
    () => branches.find((b) => b.id === branchId),
    [branches, branchId],
  );

  const [happened, setHappened] = useState(branch?.description ?? "");
  const [belief, setBelief] = useState(branch?.originalBelief ?? "");
  const [currentBelief, setCurrentBelief] = useState(branch?.currentBelief ?? "");
  const [addingMoment, setAddingMoment] = useState(false);
  const [step, setStep] = useState("");
  const [stepMade, setStepMade] = useState(false);
  // The less-available feelings follow what it stirs until adjusted by hand.
  const [occupiesCustom, setOccupiesCustom] = useState(false);

  if (!branch) {
    return (
      <Panel inTray={inTray}>
        <P>{t("This thread no longer exists.")}</P>
      </Panel>
    );
  }

  const forkWhen =
    branch.forkLabel ??
    new Date(branch.forkDate + "T00:00:00").toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  const today = appNow().toLocaleDateString(undefined, { month: "long", day: "numeric" });

  const diffSelected = new Set((branch.diffSelections ?? []) as DiffChangeId[]);
  const pr = branch.preserveRelease ?? {
    stillValid: [],
    outdated: [],
    outsideControl: [],
    reclaimable: [],
  };

  function saveStory() {
    if (!branch) return;
    const patch: Parameters<typeof updateBranch>[1] = {};
    if (happened !== (branch.description ?? "")) patch.description = happened;
    if (belief !== (branch.originalBelief ?? "")) patch.originalBelief = belief;
    if (currentBelief !== (branch.currentBelief ?? "")) {
      patch.currentBelief = currentBelief;
      if (branch.status === "active" || branch.status === "activated") patch.status = "explored";
    }
    if (Object.keys(patch).length > 0) void updateBranch(branch.id, patch);
  }

  function toggleDiff(id: DiffChangeId) {
    if (!branch) return;
    const next = new Set(diffSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void updateBranch(branch.id, {
      diffSelections: [...next],
      status:
        branch.status === "active" || branch.status === "activated" ? "explored" : branch.status,
    });
  }

  function savePr(patch: Partial<typeof pr>) {
    if (!branch) return;
    const next = { ...pr, ...patch };
    void updateBranch(branch.id, {
      preserveRelease: next,
      unmetNeeds: next.stillValid,
      status:
        next.stillValid.length + next.reclaimable.length > 0 && branch.status === "explored"
          ? "ready-to-merge"
          : branch.status,
    });
  }

  function toggleAnxiety(a: string) {
    if (!branch) return;
    const current = branch.anxieties ?? [];
    const next = current.includes(a) ? current.filter((x) => x !== a) : [...current, a];
    const patch: Partial<PsychologicalBranch> = { anxieties: next };
    if (!occupiesCustom) patch.occupies = suggestLockedFeelings(next);
    void updateBranch(branch.id, patch);
  }

  function toggleOccupies(f: string) {
    if (!branch) return;
    setOccupiesCustom(true);
    const current = branch.occupies ?? [];
    const next = current.includes(f) ? current.filter((x) => x !== f) : [...current, f];
    void updateBranch(branch.id, { occupies: next });
  }

  const twoCol = width > 640;
  const compareCardStyle = {
    borderWidth: 1,
    borderColor: alpha(th.lineAxis, 0.55),
    borderRadius: th.radius,
    paddingVertical: 9.6,
    paddingHorizontal: 11.2,
    backgroundColor: th.bg,
    ...(twoCol ? { flex: 1 } : null),
  } as const;
  const compareAnchorStyle = {
    marginBottom: 8,
    fontSize: 13.1,
    color: th.inkSoft,
    letterSpacing: 0.26,
  } as const;

  return (
    <Panel inTray={inTray}>
      <H1 style={inTray ? { fontSize: 17.6, lineHeight: 23, marginBottom: 5.6 } : undefined}>
        {branch.title}
      </H1>
      <Hint>
        {t(
          "This thread split off {when} and reaches Now. Take what is still yours; leave the rest where it happened. Nothing here is required.",
          { when: forkWhen },
        )}
      </Hint>
      <T
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}
      >
        {describeBranch(branch, t)}
      </T>

      <View style={{ marginBottom: 14.4 }}>
        <TagListEditor
          label={t("What from this still belongs to you now?")}
          values={pr.reclaimable}
          onChange={(v) => savePr({ reclaimable: v })}
          suggestions={RECLAIMABLE_QUALITIES}
          variant="quality"
        />
      </View>

      <OptionalDetails summary={t("Compare where it began with Now (optional)")}>
        <Hint>
          {t("Two points on the same thread: where it began, and where you actually are.")}
        </Hint>
        <View style={{ flexDirection: twoCol ? "row" : "column", gap: 12, marginBottom: 12 }}>
          <View style={compareCardStyle} accessibilityLabel={t("Where it began")}>
            <T style={compareAnchorStyle}>
              {t("Where it began · {date}", { date: forkWhen })}
            </T>
            <View style={{ marginBottom: 9.6 }}>
              <AppTextInput
                multiline
                value={happened}
                onChangeText={setHappened}
                onBlur={saveStory}
                placeholder={t("What was happening when this thread began")}
                accessibilityLabel={t("What happened when this thread began")}
                style={{ minHeight: 54.4 }}
              />
            </View>
            <View style={{ marginBottom: 9.6 }}>
              <AppTextInput
                multiline
                value={belief}
                onChangeText={setBelief}
                onBlur={saveStory}
                placeholder={t("What did you begin believing at the time?")}
                accessibilityLabel={t("What did you begin believing at the time?")}
                style={{ minHeight: 54.4 }}
              />
            </View>
            <View style={rowStyles.tagRow} accessibilityLabel={t("Example conclusions")}>
              {EXAMPLE_BELIEFS.map((b) => (
                <Tag key={b} label={t(b)} onPress={() => setBelief(b)} />
              ))}
            </View>
          </View>
          <View style={compareCardStyle} accessibilityLabel={t("At Now")}>
            <T style={compareAnchorStyle}>{t("At Now · {date}", { date: today })}</T>
            <View style={{ marginBottom: 9.6 }}>
              <Field
                label={t("What feels true today, in your own words?")}
                style={{ marginBottom: 0 }}
              >
                <AppTextInput
                  multiline
                  value={currentBelief}
                  onChangeText={setCurrentBelief}
                  onBlur={saveStory}
                  placeholder={
                    branch.originalBelief
                      ? t("Then: “{belief}”", { belief: branch.originalBelief })
                      : undefined
                  }
                  style={{ minHeight: 54.4 }}
                />
              </Field>
            </View>
          </View>
        </View>
        <Hint>{t("If any of these have changed since it began, mark them.")}</Hint>
        <View style={rowStyles.tagRow} accessibilityLabel={t("What has changed")}>
          {DIFF_CHANGE_OPTIONS.map((o) => (
            <Chip
              key={o.id}
              label={t(o.label)}
              pressed={diffSelected.has(o.id)}
              onPress={() => toggleDiff(o.id)}
            />
          ))}
        </View>
      </OptionalDetails>

      <OptionalDetails
        summary={t("What it stirs, and what feels less available (optional)")}
      >
        <Hint>
          {t("Tap what's true. Naming it is how the thread starts loosening.")}
        </Hint>
        <FeelingPicker
          options={ANXIETIES}
          selected={branch.anxieties ?? []}
          onToggle={toggleAnxiety}
          label={t("What this thread makes you feel")}
        />
        {(branch.anxieties ?? []).length > 0 && (
          <>
            <Prompt style={{ marginTop: 12 }}>
              {t("What feels less available while this thread is active?")}
            </Prompt>
            <Hint>
              {t(
                "You selected these; adjust freely. They return to your main line each time you decide something about the thread.",
              )}
            </Hint>
            <FeelingPicker
              selected={branch.occupies ?? []}
              onToggle={toggleOccupies}
              label={t("What feels less available while this thread is active")}
            />
          </>
        )}
      </OptionalDetails>

      <OptionalDetails
        summary={`${t("Moments on this thread")}${
          branch.commits.length > 0 ? ` (${branch.commits.length})` : ""
        }`}
      >
        <MomentList branch={branch} />
        {addingMoment ? (
          <MomentEditor branchId={branch.id} onDone={() => setAddingMoment(false)} />
        ) : (
          <Button label={t("Add a moment")} onPress={() => setAddingMoment(true)} />
        )}
      </OptionalDetails>

      <OptionalDetails summary={t("Where should each part go? (optional)")}>
        <Hint>
          {t("Everything on this thread has a destination. Nothing is deleted; it is placed.")}
        </Hint>
        <View style={{ marginBottom: 14.4 }}>
          <TagListEditor
            label={t("Carry forward — still true, comes with you")}
            values={pr.stillValid}
            onChange={(v) => savePr({ stillValid: v })}
            suggestions={VALID_EXAMPLES}
          />
        </View>
        <View style={{ marginBottom: 14.4 }}>
          <TagListEditor
            label={t("Leave in history — no longer fits reality")}
            values={pr.outdated}
            onChange={(v) => savePr({ outdated: v })}
            suggestions={OUTDATED_EXAMPLES}
          />
        </View>
        <View style={{ marginBottom: 14.4 }}>
          <TagListEditor
            label={t("Outside my control — not yours to carry")}
            values={pr.outsideControl}
            onChange={(v) => savePr({ outsideControl: v })}
            suggestions={OUTSIDE_EXAMPLES}
          />
          <View style={rowStyles.tagRow} accessibilityLabel={t("Controllability")}>
            {CONTROLLABILITY.map((c) => (
              <Tag
                key={c.id}
                label={t(c.label)}
                quality={branch.controllability === c.id}
                pressed={branch.controllability === c.id}
                onPress={() => void updateBranch(branch.id, { controllability: c.id })}
              />
            ))}
          </View>
        </View>
        <Field label={t("Needs a real action — one honest step")}>
          {stepMade ? (
            <CalmNote>
              <T>{t("Placed on today. It will show as your current action.")}</T>
            </CalmNote>
          ) : (
            <View
              style={{
                flexDirection: "row",
                gap: 6.4,
                alignItems: "center",
                marginTop: -2.4,
                marginBottom: 9.6,
                paddingLeft: 4,
              }}
            >
              <AppTextInput
                value={step}
                onChangeText={setStep}
                placeholder={t("e.g. send the one email")}
                style={{ flex: 1, width: "auto" }}
              />
              <Button
                label={t("Make it today's action")}
                disabled={!step.trim()}
                onPress={() => {
                  void (async () => {
                    await createTodayAction(branch.id, step.trim());
                    setStep("");
                    setStepMade(true);
                  })();
                }}
              />
            </View>
          )}
        </Field>
      </OptionalDetails>

      {branch.status === "needs-support" && (
        <CalmNote style={{ marginBottom: 12 }}>
          <T>
            {t(
              "Marked as carried with support. Bringing this to someone you trust is a form of action, not a failure of the thread.",
            )}
          </T>
        </CalmNote>
      )}
    </Panel>
  );
}
