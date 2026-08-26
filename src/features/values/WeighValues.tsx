import { useState } from "react";
import {
  Pressable,
  useWindowDimensions,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";
import { effectiveLoudness } from "@/domain/branches/logic";
import { appNow } from "@/domain/time/clock";
import {
  liveValues,
  looksLikeFor,
  steadyingValues,
} from "@/domain/values/logic";
import type { CoreValue } from "@/domain/values/types";
import { FeelingPicker } from "@/features/branch-touch/FeelingPicker";
import {
  Button,
  CalmNote,
  Hint,
  Panel,
  Prompt,
  T,
  rowStyles,
  useInTray,
} from "@/ui/primitives";

/**
 * One thread, held next to what matters. It opens by *showing* — the values
 * you chose, in your own words — because steadying comes before deciding.
 *
 * Naming values is the evidenced part of this feature; holding a worry
 * against one is this app's own idea. So nothing here scores anything, every
 * exit is a real answer, and the question is only ever which value this
 * touches — never how well you are doing.
 */
export function WeighValues({ branchId }: { branchId: string }) {
  const t = useT();
  const th = useTheme();
  const inTray = useInTray();
  const { width } = useWindowDimensions();
  // The tray is a narrow docked card: two columns only when the panel really
  // has the room, not merely because the window does.
  const twoCol = !inTray && width > 640;

  const branch = useAppStore((s) => s.branches.find((b) => b.id === branchId));
  const values = useAppStore((s) => s.values);
  const setOperation = useAppStore((s) => s.setOperation);
  const createTodayAction = useAppStore((s) => s.createTodayAction);
  const updateBranch = useAppStore((s) => s.updateBranch);
  const addMoment = useAppStore((s) => s.addMoment);
  const turnValue = useAppStore((s) => s.turnValue);

  const steady = steadyingValues(values);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [turning, setTurning] = useState(false);
  const [done, setDone] = useState<"step" | "noticed" | "turned" | null>(null);

  if (!branch) return null;
  const held: CoreValue | undefined =
    steady.find((v) => v.id === heldId) ?? (heldId ? liveValues(values).find((v) => v.id === heldId) : undefined);

  const compareCardStyle = {
    borderWidth: 1,
    borderColor: alpha(th.lineAxis, 0.55),
    borderRadius: th.radius,
    paddingVertical: 9.6,
    paddingHorizontal: 11.2,
    backgroundColor: th.bg,
    ...(twoCol ? { flex: 1 } : null),
  } as const;
  const anchorStyle = {
    marginBottom: 8,
    fontSize: 13.1,
    color: th.inkSoft,
    letterSpacing: 0.26,
  } as const;

  /** Both exits are real answers, and both are remembered on the thread. */
  const record = async (value: CoreValue) => {
    await addMoment({
      branchId,
      title: t("Held against {name}", { name: t(value.name) }),
      type: "insight",
      date: appNow().toISOString().slice(0, 10),
    });
    if (branch.status === "active" || branch.status === "activated") {
      await updateBranch(branchId, { status: "explored" });
    }
  };

  const takeStep = async (value: CoreValue, line: string) => {
    await record(value);
    await createTodayAction(branchId, line);
    setDone("step");
  };

  const justNoticing = async (value: CoreValue) => {
    await record(value);
    setDone("noticed");
  };

  const applyTurn = async (value: CoreValue, kind: "reword" | "set-down") => {
    const loudness = effectiveLoudness(branch, appNow());
    if (kind === "set-down") {
      await turnValue(value.id, { setDown: true }, { becauseOf: branchId, loudness });
    } else {
      // Re-offer the lines for this name; keeping the old wording is the point.
      await turnValue(
        value.id,
        { looksLike: looksLikeFor(value.name).slice(0, 2) },
        { becauseOf: branchId, loudness },
      );
    }
    setDone("turned");
  };

  // ── nothing named yet: offer the naming, never demand it ──
  if (steady.length === 0 && liveValues(values).length === 0) {
    return (
      <Panel inTray={inTray}>
        <T style={{ fontSize: 16.8, fontWeight: "600" }}>{branch.title}</T>
        <Prompt style={{ marginTop: 8 }}>{t("Would it help to name what matters to you first?")}</Prompt>
        <Hint>
          {t("A few taps, once. Then this thread has something to sit beside.")}
        </Hint>
        <View style={rowStyles.stageNav}>
          <Button
            variant="quiet"
            label={t("Not now")}
            onPress={() => setOperation({ kind: "idle" })}
          />
          <Button
            variant="primary"
            label={t("Name what matters")}
            onPress={() => setOperation({ kind: "naming-values", becauseOf: branchId })}
          />
        </View>
      </Panel>
    );
  }

  if (done) {
    return (
      <Panel inTray={inTray}>
        <CalmNote style={{ marginVertical: 8 }}>
          <T>
            {done === "step"
              ? t("That is on today. It came from what matters to you, which is the whole point.")
              : done === "turned"
                ? t("Changed. The earlier wording is kept — you can see what it used to say.")
                : t("Noticing is a real answer. Nothing else is asked of you.")}
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

  // ── ground: show what you chose, before asking anything ──
  if (!held) {
    return (
      <Panel inTray={inTray}>
        <T style={{ fontSize: 16.8, fontWeight: "600" }}>{branch.title}</T>
        <Prompt style={{ marginTop: 8 }}>{t("What matters to you")}</Prompt>
        <Hint style={{ marginTop: 2 }}>
          {t("Which of these does this thread touch? None of them is a fine answer too.")}
        </Hint>
        <View style={{ gap: 8, marginTop: 4 }}>
          {(steady.length > 0 ? steady : liveValues(values)).map((v) => (
            <Pressable
              key={v.id}
              accessibilityRole="button"
              accessibilityLabel={t("Hold it against {name}", { name: t(v.name) })}
              onPress={() => setHeldId(v.id)}
              style={({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => ({
                ...compareCardStyle,
                backgroundColor: hovered ? th.bgRaised : th.bg,
              })}
            >
              <T style={{ fontSize: 15.2, fontWeight: "600" }}>{t(v.name)}</T>
              {v.looksLike.length > 0 && (
                <T style={{ fontSize: 14, color: th.inkSoft, marginTop: 4 }}>
                  {v.looksLike.map((l) => t(l)).join(" · ")}
                </T>
              )}
            </Pressable>
          ))}
        </View>
        <View style={rowStyles.stageNav}>
          <Button
            variant="quiet"
            label={t("None of these")}
            onPress={() => setOperation({ kind: "idle" })}
          />
        </View>
      </Panel>
    );
  }

  // ── the turn: a situation changed what matters ──
  if (turning) {
    const loud = effectiveLoudness(branch, appNow()) >= 4;
    return (
      <Panel inTray={inTray}>
        <T style={{ fontSize: 16.8, fontWeight: "600" }}>{t(held.name)}</T>
        <Prompt style={{ marginTop: 8 }}>{t("What changed?")}</Prompt>
        {loud && (
          <Hint>
            {t(
              "This thread is loud right now. What shifts under pressure often settles back, so the app will offer this again in two weeks.",
            )}
          </Hint>
        )}
        <View style={{ gap: 6, marginTop: 4 }}>
          <Button
            label={t("What it looks like has changed")}
            onPress={() => void applyTurn(held, "reword")}
            style={{ alignSelf: "flex-start" }}
          />
          <Button
            label={t("This is not mine any more")}
            onPress={() => void applyTurn(held, "set-down")}
            style={{ alignSelf: "flex-start" }}
          />
          <Button
            variant="quiet"
            label={t("Take up something new")}
            onPress={() => setOperation({ kind: "naming-values", becauseOf: branchId })}
            style={{ alignSelf: "flex-start" }}
          />
        </View>
        <View style={rowStyles.stageNav}>
          <Button variant="quiet" label={t("Back")} onPress={() => setTurning(false)} />
        </View>
      </Panel>
    );
  }

  // ── contrast: two versions of today, side by side ──
  const feels = (branch.anxieties ?? []).slice(0, 3);
  const lines = held.looksLike.length > 0 ? held.looksLike : looksLikeFor(held.name).slice(0, 2);
  return (
    <Panel inTray={inTray}>
      <T style={{ fontSize: 16.8, fontWeight: "600" }}>{branch.title}</T>
      <Prompt style={{ marginTop: 8 }}>{t("Two versions of today")}</Prompt>
      <View style={{ flexDirection: twoCol ? "row" : "column", gap: 8, marginTop: 4 }}>
        <View style={compareCardStyle}>
          <T style={anchorStyle}>{t("If the thread leads")}</T>
          <T style={{ fontSize: 14.4 }}>{branch.title}</T>
          {feels.length > 0 && (
            <T style={{ fontSize: 13.6, color: th.inkSoft, marginTop: 4 }}>
              {feels.map((f) => t(f)).join(" · ")}
            </T>
          )}
          {branch.currentBelief ? (
            <T style={{ fontSize: 13.6, color: th.inkSoft, marginTop: 4 }}>
              “{branch.currentBelief}”
            </T>
          ) : null}
        </View>
        <View style={compareCardStyle}>
          <T style={anchorStyle}>{t("If {name} leads", { name: t(held.name) })}</T>
          <View style={{ gap: 4 }}>
            {lines.map((line) => (
              <Button
                key={line}
                label={t(line)}
                onPress={() => void takeStep(held, line)}
                style={{ alignSelf: "flex-start" }}
              />
            ))}
          </View>
          <Hint style={{ marginTop: 6, marginBottom: 0 }}>
            {t("Tap one to make it today's step.")}
          </Hint>
        </View>
      </View>
      <View style={rowStyles.stageNav}>
        <Button variant="quiet" label={t("Just noticing")} onPress={() => void justNoticing(held)} />
        <Button
          variant="quiet"
          label={t("This changed what matters")}
          onPress={() => setTurning(true)}
        />
      </View>
      {steady.length > 1 && (
        <>
          <Hint style={{ marginTop: 10 }}>{t("Or hold it against another one.")}</Hint>
          <FeelingPicker
            selected={[held.name]}
            onToggle={(name) => {
              const match = steady.find((v) => t(v.name) === name || v.name === name);
              if (match) setHeldId(match.id);
            }}
            label={t("Which of these does this thread touch?")}
            options={steady.map((v) => v.name)}
          />
        </>
      )}
    </Panel>
  );
}
