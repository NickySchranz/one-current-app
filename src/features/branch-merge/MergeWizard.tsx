import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import type { PsychologicalBranch } from "@/domain/branches/types";
import type { MergeConflict } from "@/domain/conflicts/types";
import type { MergeResultStatus } from "@/domain/merges/types";
import { detectConflicts, unresolvedConflicts } from "@/domain/conflicts/logic";
import { composeIntegratedAction, type ComposeActionInput } from "@/domain/actions/logic";
import { RECLAIMABLE_QUALITIES } from "@/domain/branches/diff";
import { useT } from "@/i18n/i18n";
import { TagListEditor } from "@/ui/TagListEditor";
import { ConflictResolver } from "../merge-conflicts/ConflictResolver";
import { ActionComposer } from "./ActionComposer";
import {
  AppTextInput,
  Button,
  CalmNote,
  Field,
  H1,
  Hint,
  P,
  Panel,
  Prompt,
  T,
  rowStyles,
  useInTray,
} from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { mix } from "@/ui/color";

const RELEASE_EXAMPLES = [
  "repeated checking",
  "comparison with a past self",
  "imaginary conversations",
  "trying to control another person",
  "postponing life",
  "reopening the same decision",
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

type Props = { branchIds: string[] };

/** One screen: what returns with you, one present action, merge. */
export function MergeWizard({ branchIds }: Props) {
  const t = useT();
  const th = useTheme();
  const inTray = useInTray();
  const allBranches = useAppStore((s) => s.branches);
  const mergeDraft = useAppStore((s) => s.mergeDraft);
  const saveMergeDraft = useAppStore((s) => s.saveMergeDraft);
  const cancelMerge = useAppStore((s) => s.cancelMerge);
  const completeMerge = useAppStore((s) => s.completeMerge);
  const startMerge = useAppStore((s) => s.startMerge);

  const branches = useMemo(
    () => branchIds.map((id) => allBranches.find((b) => b.id === id)).filter((b): b is PsychologicalBranch => !!b),
    [branchIds, allBranches],
  );

  const combined = useMemo(() => {
    const merge = (key: "stillValid" | "outdated" | "outsideControl" | "reclaimable") =>
      [...new Set(branches.flatMap((b) => b.preserveRelease?.[key] ?? []))];
    return {
      stillValid: merge("stillValid"),
      outdated: merge("outdated"),
      outsideControl: merge("outsideControl"),
      reclaimable: merge("reclaimable"),
    };
  }, [branches]);

  // Sorted during inspection; carried straight through here.
  const [stillValid] = useState<string[]>(mergeDraft?.partial.stillValid ?? combined.stillValid);
  const [outdated] = useState<string[]>(mergeDraft?.partial.outdatedBeliefs ?? combined.outdated);
  const [outsideControl] = useState<string[]>(
    mergeDraft?.partial.outsideControl ?? combined.outsideControl,
  );
  const [reclaimable, setReclaimable] = useState<string[]>(
    mergeDraft?.partial.reclaimedQualities ?? combined.reclaimable,
  );
  const [conflicts, setConflicts] = useState<MergeConflict[]>(
    () => mergeDraft?.partial.conflicts ?? detectConflicts(branches),
  );
  const [released, setReleased] = useState<string[]>(mergeDraft?.partial.released ?? []);
  const [contribution, setContribution] = useState(mergeDraft?.partial.contribution ?? "");
  // The outcome was decided before arriving here ("what is true now?").
  const [outcome, setOutcome] = useState<MergeResultStatus>(
    mergeDraft?.partial.resultStatus ?? "merged",
  );
  const [actionInput, setActionInput] = useState<Omit<
    ComposeActionInput,
    "branches" | "qualitiesCarried" | "mergeId"
  > | null>(null);
  const [busy, setBusy] = useState(false);

  // Ensure a draft exists (restores interrupted merges after reload).
  useEffect(() => {
    if (!mergeDraft) void startMerge(branchIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mergeDraft) return;
    void saveMergeDraft({
      ...mergeDraft,
      stage: "merge",
      partial: {
        stillValid,
        outdatedBeliefs: outdated,
        outsideControl,
        reclaimedQualities: reclaimable,
        conflicts,
        contribution,
        released,
        resultStatus: outcome,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillValid, outdated, outsideControl, reclaimable, conflicts, contribution, released, outcome]);

  if (branches.length === 0) {
    return (
      <Panel inTray={inTray}>
        <P>{t("These threads are no longer available.")}</P>
      </Panel>
    );
  }

  const open = unresolvedConflicts(conflicts);
  const canCarryAction = outcome === "merged" || outcome === "partly-merged";
  const ready = open.length === 0;

  async function finish() {
    if (busy || !ready) return;
    setBusy(true);
    try {
      const resolution =
        conflicts.map((c) => c.resolution).filter(Boolean).join(" ") ||
        contribution ||
        "Integrated into the present.";
      const action =
        canCarryAction && actionInput
          ? composeIntegratedAction({
              ...actionInput,
              branches,
              qualitiesCarried: reclaimable,
            })
          : undefined;
      await completeMerge({
        branches,
        preserveRelease: { stillValid, outdated, outsideControl, reclaimable },
        conflicts,
        resolution,
        contribution: contribution || undefined,
        released,
        action,
        resultStatus: outcome,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel inTray={inTray}>
      <H1 style={inTray ? { fontSize: 17.6, lineHeight: 23, marginBottom: 5.6 } : undefined}>
        {t("Integrate it into Now")}
      </H1>
      <Hint>
        {branches.length === 1
          ? branches[0].title
          : t("{n} threads entering the present together", { n: branches.length })}
      </Hint>
      <CalmNote style={{ marginBottom: 12 }}>
        <T>
          {branches.length === 1
            ? t("This thread is complete for now.")
            : t("These threads are complete for now.")}{" "}
          {t(
            "Nothing valuable is lost — what still matters crosses into the present with you, and the rest stays in the past, where it happened. If it returns, you can meet the new version of it.",
          )}
        </T>
      </CalmNote>

      {conflicts.length > 0 && (
        <View accessibilityLabel={t("Conflicts")}>
          <Prompt>
            {conflicts.length === 1
              ? t(
                  "Two of these pulls ask for opposite things. Decide what the present must honour.",
                )
              : t(
                  "Some of these pulls ask for opposite things. Decide what the present must honour.",
                )}
          </Prompt>
          {conflicts.map((c) => (
            <ConflictResolver
              key={c.id}
              conflict={c}
              branches={branches}
              onResolved={(resolved) =>
                setConflicts(conflicts.map((x) => (x.id === resolved.id ? resolved : x)))
              }
            />
          ))}
        </View>
      )}

      <View style={{ marginBottom: 14.4 }}>
        <TagListEditor
          label={t("What returns with you")}
          values={reclaimable}
          onChange={setReclaimable}
          suggestions={RECLAIMABLE_QUALITIES}
          variant="quality"
        />
      </View>

      <OptionalDetails summary={t("What quiets down when you integrate it (optional)")}>
        <View style={{ marginBottom: 14.4 }}>
          <TagListEditor
            label={t("Mental processes that can stop running now")}
            values={released}
            onChange={setReleased}
            suggestions={RELEASE_EXAMPLES}
          />
        </View>
        <Field label={t("In your own words, what did this time away give you?")}>
          <AppTextInput multiline value={contribution} onChangeText={setContribution} />
        </Field>
      </OptionalDetails>

      {canCarryAction && (
        <OptionalDetails summary={t("One small step to carry it (optional)")}>
          <ActionComposer
            branches={branches}
            qualitiesCarried={reclaimable}
            onChange={setActionInput}
          />
        </OptionalDetails>
      )}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: outcome === "partly-merged" }}
        onPress={() => setOutcome(outcome === "partly-merged" ? "merged" : "partly-merged")}
        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: outcome === "partly-merged" ? th.accent : th.lineAxis,
            backgroundColor: outcome === "partly-merged" ? th.accent : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {outcome === "partly-merged" && (
            <Text style={{ color: th.accentInk, fontSize: 11, lineHeight: 13 }}>✓</Text>
          )}
        </View>
        <Hint style={{ marginBottom: 0, flex: 1 }}>
          {t("Only part of it integrates for now — the rest stays with less loudness")}
        </Hint>
      </Pressable>

      <View style={rowStyles.stageNav}>
        <Button variant="quiet" label={t("Set aside for now")} onPress={() => void cancelMerge()} />
        <Button
          variant="primary"
          large
          disabled={!ready || busy}
          onPress={() => void finish()}
          label={
            open.length > 0
              ? t(
                  open.length === 1
                    ? "1 conflict to settle first"
                    : "{n} conflicts to settle first",
                  { n: open.length },
                )
              : t("Integrate it into Now")
          }
        />
      </View>
    </Panel>
  );
}
