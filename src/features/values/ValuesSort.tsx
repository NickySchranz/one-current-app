import { useState } from "react";
import { View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import {
  FIRST_SORT_TARGET,
  VALUE_NAMES,
  liveValues,
  looksLikeFor,
} from "@/domain/values/logic";
import type { ValueMotive } from "@/domain/values/types";
import { StepFrame, StepTransition } from "@/features/branch-quick-actions/QuickFlow";
import { FeelingPicker } from "@/features/branch-touch/FeelingPicker";
import { Button, CalmNote, Hint, Panel, T, useInTray } from "@/ui/primitives";

/**
 * Naming what matters. Three coarse steps and no keyboard: choose the names
 * that are yours, tap what each looks like on a hard day, and say once whose
 * value it really is.
 *
 * Naming values is the part of this feature with evidence behind it, and it
 * belongs in a calm moment — so nothing here is required, every step can be
 * skipped, and no thread has to be open for it.
 */
export function ValuesSort({ becauseOf }: { becauseOf?: string }) {
  const t = useT();
  const inTray = useInTray();
  const setOperation = useAppStore((s) => s.setOperation);
  const takeUpValue = useAppStore((s) => s.takeUpValue);
  const values = useAppStore((s) => s.values);
  const already = liveValues(values).map((v) => v.name);

  const [stage, setStage] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [lines, setLines] = useState<Record<string, string[]>>({});
  const [motives, setMotives] = useState<Record<string, ValueMotive>>({});
  const [done, setDone] = useState(false);

  const offered = VALUE_NAMES.filter((n) => !already.includes(n));
  // One naming screen per chosen value, then one motive screen per value.
  const linesStage = (i: number) => 1 + i;
  const motiveStage = (i: number) => 1 + picked.length + i;
  const total = 1 + picked.length * 2;

  const toggleName = (name: string) =>
    setPicked((p) =>
      p.includes(name) ? p.filter((x) => x !== name) : p.length >= FIRST_SORT_TARGET ? p : [...p, name],
    );

  const toggleLine = (name: string, line: string) =>
    setLines((l) => {
      const cur = l[name] ?? [];
      return {
        ...l,
        [name]: cur.includes(line) ? cur.filter((x) => x !== line) : [...cur, line],
      };
    });

  const finish = async () => {
    for (const name of picked) {
      await takeUpValue({
        name,
        looksLike: lines[name] ?? [],
        motive: motives[name] ?? "chosen",
        becauseOf,
      });
    }
    setDone(true);
  };

  if (done) {
    return (
      <Panel inTray={inTray}>
        <CalmNote style={{ marginVertical: 8 }}>
          <T>
            {t(
              "Named. Your line carries these now — you can change any of them whenever a situation changes you.",
            )}
          </T>
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

  // ── step 0: which names are yours ──
  if (stage === 0) {
    return (
      <Panel inTray={inTray}>
        <StepTransition stepKey={0}>
          <StepFrame
            prompt={t("What matters to you?")}
            stepIndex={0}
            totalSteps={total}
            onBack={() => setOperation({ kind: "idle" })}
            backLabel={t("Not now")}
            next={{
              label: t("Next"),
              disabled: picked.length === 0,
              onPress: () => setStage(linesStage(0)),
            }}
          >
            <Hint style={{ marginTop: 4 }}>
              {t("Tap the ones that are yours. Three is plenty to start.")}
            </Hint>
            <FeelingPicker
              selected={picked}
              onToggle={toggleName}
              label={t("What matters to you")}
              options={offered}
            />
          </StepFrame>
        </StepTransition>
      </Panel>
    );
  }

  // ── one screen per value: what it looks like ──
  for (let i = 0; i < picked.length; i++) {
    if (stage !== linesStage(i)) continue;
    const name = picked[i];
    const options = looksLikeFor(name);
    return (
      <Panel inTray={inTray}>
        <StepTransition stepKey={stage}>
          <StepFrame
            title={t(name)}
            prompt={t("What does {name} look like on a hard day?", { name: t(name) })}
            stepIndex={stage}
            totalSteps={total}
            onBack={() => setStage(i === 0 ? 0 : linesStage(i - 1))}
            next={{
              label: t("Next"),
              onPress: () => setStage(i + 1 < picked.length ? linesStage(i + 1) : motiveStage(0)),
            }}
          >
            <Hint style={{ marginTop: 4 }}>
              {t("Tap any that fit. These become the words you see later.")}
            </Hint>
            <FeelingPicker
              selected={lines[name] ?? []}
              onToggle={(line) => toggleLine(name, line)}
              label={t("What this looks like")}
              options={options}
            />
          </StepFrame>
        </StepTransition>
      </Panel>
    );
  }

  // ── one screen per value: whose it is ──
  for (let i = 0; i < picked.length; i++) {
    if (stage !== motiveStage(i)) continue;
    const name = picked[i];
    const chosen = motives[name] ?? "chosen";
    const last = i + 1 >= picked.length;
    return (
      <Panel inTray={inTray}>
        <StepTransition stepKey={stage}>
          <StepFrame
            title={t(name)}
            prompt={t("Whose is this one?")}
            stepIndex={stage}
            totalSteps={total}
            onBack={() => setStage(i === 0 ? linesStage(picked.length - 1) : motiveStage(i - 1))}
            next={{
              label: last ? t("That is mine") : t("Next"),
              onPress: () => (last ? void finish() : setStage(motiveStage(i + 1))),
            }}
          >
            <Hint style={{ marginTop: 4 }}>
              {t("Worth asking once. There is no wrong answer here.")}
            </Hint>
            <View style={{ gap: 6, marginTop: 6 }}>
              {(
                [
                  ["chosen", "Mine — I chose it"],
                  ["expected-of-me", "Expected of me"],
                  ["would-feel-guilty", "I would feel guilty otherwise"],
                ] as const
              ).map(([m, label]) => (
                <Button
                  key={m}
                  label={t(label)}
                  selected={chosen === m}
                  onPress={() => setMotives((x) => ({ ...x, [name]: m as ValueMotive }))}
                  style={{ alignSelf: "flex-start" }}
                />
              ))}
            </View>
            {chosen !== "chosen" && (
              <Hint style={{ marginTop: 8, marginBottom: 0 }}>
                {t(
                  "Kept, and worth knowing: a value carried for someone else tends to take more than it gives.",
                )}
              </Hint>
            )}
          </StepFrame>
        </StepTransition>
      </Panel>
    );
  }

  return null;
}
