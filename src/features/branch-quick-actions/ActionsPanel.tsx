import { Pressable, View, type PressableStateCallbackType } from "react-native";
import { useAppStore } from "@/stores/app-store";
import type { PsychologicalBranch } from "@/domain/branches/types";
import { isClosed } from "@/domain/branches/logic";
import { decidedToday } from "@/domain/feelings/logic";
import { appNow } from "@/domain/time/clock";
import { useT } from "@/i18n/i18n";
import { Button, Hint, Panel, Prompt, T, useInTray } from "@/ui/primitives";
import { useTheme, type ThemeTokens } from "@/ui/theme";
import { alpha, mix } from "@/ui/color";

type PressState = PressableStateCallbackType & { hovered?: boolean };

type RowKind = "undecided" | "decided" | "done";

/** The uppercase section label (.actions-section). */
function SectionLabel({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Hint
      style={{
        marginTop: 5.6,
        marginBottom: 6.4,
        fontSize: 11.5,
        lineHeight: 15,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: t.inkFaint,
      }}
    >
      {children}
    </Hint>
  );
}

function rowMainStyle(t: ThemeTokens, kind: RowKind, hovered: boolean) {
  const surfaceSoft = mix(t.bgSunken, t.bg, 55);
  const base = {
    flex: 1,
    flexDirection: "column" as const,
    gap: 1.6,
    paddingVertical: 7.2,
    paddingHorizontal: 8.8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.bgSunken,
    backgroundColor: hovered ? t.bgRaised : surfaceSoft,
    opacity: 1,
  };
  if (kind === "decided" || kind === "done") {
    // a decision taken is something gained: a quiet accent edge
    return {
      ...base,
      borderLeftWidth: 3,
      borderLeftColor: alpha(t.accent, 0.55),
      backgroundColor: mix(t.accentSoft, surfaceSoft, hovered ? 70 : 45),
      opacity: kind === "done" ? 0.6 : 1,
    };
  }
  // still undecided: a slightly urgent edge asking for one decision
  return {
    ...base,
    borderColor: mix(t.danger, t.bgSunken, 26),
    borderLeftWidth: 3,
    borderLeftColor: alpha(t.danger, 0.55),
  };
}

/** One row of the day (.actions-row-main). */
function RowMain({
  kind,
  title,
  hint,
  onPress,
  disabled,
}: {
  kind: RowKind;
  title: string;
  hint: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  const hintColor = kind === "undecided" ? mix(t.danger, t.inkFaint, 60) : undefined;
  const content = (hovered: boolean) => (
    <View style={rowMainStyle(t, kind, hovered && !disabled && !!onPress)}>
      <T style={{ fontWeight: "600" }}>{title}</T>
      <Hint style={[{ marginBottom: 0 }, hintColor ? { color: hintColor } : null]}>{hint}</Hint>
    </View>
  );
  if (!onPress) return <View style={{ flex: 1 }}>{content(false)}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ flex: 1 }}
    >
      {(s) => content(!!(s as PressState).hovered)}
    </Pressable>
  );
}

/**
 * The day, thread by thread. Open threads without a decision today ask for
 * one — a little urgently, because they are still pulling. Below them, every
 * decision already taken, worded as the achievement it is: planned steps,
 * steps done, threads set down. Integrated threads have left this list with
 * everything they carried.
 */
export function ActionsPanel() {
  const actions = useAppStore((s) => s.actions);
  const branches = useAppStore((s) => s.branches);
  const markActionDone = useAppStore((s) => s.markActionDone);
  const setOperation = useAppStore((s) => s.setOperation);
  const t = useT();
  const inTray = useInTray();

  const today = appNow().toISOString().slice(0, 10);
  const open = branches.filter((b) => !isClosed(b));
  const ownerOf = (actionId: string) => {
    const a = actions.find((x) => x.id === actionId);
    const id = a?.branchesIntegrated[0]?.branchId;
    return id ? open.find((b) => b.id === id) : undefined;
  };

  // Planned steps still ahead of you. Steps of integrated threads left with them.
  const pending = actions.filter((a) => {
    if (a.completedAt) return false;
    const ownerId = a.branchesIntegrated[0]?.branchId;
    return !ownerId || !!ownerOf(a.id);
  });
  // Steps already done today: part of the day's record.
  const doneToday = actions.filter((a) => a.completedAt?.slice(0, 10) === today);

  const hasPending = (b: PsychologicalBranch) =>
    pending.some((a) => a.branchesIntegrated[0]?.branchId === b.id);

  // Threads still asking for a decision today.
  const undecided = open.filter((b) => !decidedToday(b, appNow()) && !hasPending(b));

  // Threads whose decision today was not a planned step.
  const settled = open.filter((b) => !hasPending(b) && !undecided.includes(b));
  const settledLabel = (b: PsychologicalBranch): string => {
    if (b.leftOn === today) return t("You chose rest — nothing can be done for now.");
    return t("You decided what this needs today.");
  };

  const empty =
    undecided.length === 0 && pending.length === 0 && doneToday.length === 0 && settled.length === 0;

  const listStyle = { flexDirection: "column" as const, gap: 6.4 };
  const rowStyle = { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 };

  return (
    <Panel inTray={inTray}>
      <Prompt>{t("Your threads today")}</Prompt>

      {empty && (
        <Hint>{t("Nothing is open right now. Your whole current is moving as one.")}</Hint>
      )}

      {undecided.length > 0 && (
        <>
          <SectionLabel>{t("Still undecided today")}</SectionLabel>
          <View style={listStyle}>
            {undecided.map((b) => (
              <View key={b.id} style={rowStyle}>
                <RowMain
                  kind="undecided"
                  title={b.title}
                  hint={t("Decide what it needs — even that nothing can be done.")}
                  onPress={() => setOperation({ kind: "quick-touch", branchId: b.id })}
                />
              </View>
            ))}
          </View>
        </>
      )}

      {(pending.length > 0 || doneToday.length > 0 || settled.length > 0) && (
        <>
          <SectionLabel>{t("Decided today")}</SectionLabel>
          <View style={listStyle}>
            {pending.map((a) => {
              const owner = ownerOf(a.id);
              return (
                <View key={a.id} style={rowStyle}>
                  <RowMain
                    kind="decided"
                    title={a.title}
                    hint={
                      owner
                        ? t("A step you chose for “{title}”.", { title: owner.title })
                        : t("A step you chose.")
                    }
                    disabled={!owner}
                    onPress={() =>
                      owner && setOperation({ kind: "quick-touch", branchId: owner.id })
                    }
                  />
                  <Button label={t("Done")} onPress={() => void markActionDone(a.id)} />
                </View>
              );
            })}
            {settled.map((b) => (
              <View key={b.id} style={rowStyle}>
                <RowMain
                  kind="decided"
                  title={b.title}
                  hint={settledLabel(b)}
                  onPress={() => setOperation({ kind: "quick-touch", branchId: b.id })}
                />
              </View>
            ))}
            {doneToday.map((a) => (
              <View key={a.id} style={rowStyle}>
                <RowMain kind="done" title={`✓ ${a.title}`} hint={t("done today")} />
              </View>
            ))}
          </View>
        </>
      )}
    </Panel>
  );
}
