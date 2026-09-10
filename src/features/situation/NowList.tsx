import { useMemo } from "react";
import { Pressable, ScrollView, View, type PressableStateCallbackType } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { isOpen } from "@/domain/branches/logic";
import { handledToday } from "@/domain/feelings/logic";
import { headlineOf, whereThisStands } from "@/domain/situations/where-this-stands";
import { formatReviewDate } from "@/domain/waiting/logic";
import { appNow } from "@/domain/time/clock";
import { useT } from "@/i18n/i18n";
import { Button, Card, Hint, Panel, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

/** How many cards before the rest fold away. A wall of open problems is the
 * thing this view exists not to be. */
const SHOWN = 5;

/**
 * Now, as a list.
 *
 * The map is the app's identity and stays the default, but it asks someone to
 * read a graph before they can act, and it has no text equivalent for anyone
 * using a screen reader. This is that equivalent and, for people who find the
 * canvas a lot, a perfectly good home: each situation with the one line that
 * says where it stands, and its next useful step.
 *
 * Ordering is stated out loud and can be overridden — a list that silently
 * ranks someone's problems is making a claim it cannot support.
 */
export function NowList() {
  const t = useT();
  const tk = useTheme();
  const branches = useAppStore((s) => s.branches);
  const actions = useAppStore((s) => s.actions);
  const merges = useAppStore((s) => s.merges);
  const waiting = useAppStore((s) => s.waiting);
  const pinned = useAppStore((s) => s.pinnedSituationIds);
  const setPinned = useAppStore((s) => s.setSituationPinned);
  const dismissed = useAppStore((s) => s.dismissedSituationIds);
  const setDismissed = useAppStore((s) => s.setSituationDismissed);
  const setOperation = useAppStore((s) => s.setOperation);
  const setView = useAppStore((s) => s.setView);
  const nowTick = useAppStore((s) => s.nowTick);

  const rows = useMemo(() => {
    const now = new Date(nowTick);
    const open = branches.filter(isOpen);
    const ranked = [...open].sort((a, b) => {
      const pa = pinned.includes(a.id) ? 1 : 0;
      const pb = pinned.includes(b.id) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return b.lastActivatedAt.localeCompare(a.lastActivatedAt);
    });
    return ranked.map((branch) => ({
      branch,
      stands: whereThisStands({ branch, actions, merges, waiting }),
      answered: handledToday(branch, now),
      hidden: dismissed.includes(branch.id) && !pinned.includes(branch.id),
    }));
  }, [branches, actions, merges, waiting, pinned, dismissed, nowTick]);

  const visible = rows.filter((r) => !r.hidden);
  const setAside = rows.filter((r) => r.hidden);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <Panel style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T style={{ fontSize: 17.6, fontWeight: "700", marginRight: "auto" }}>
            {t("Now")}
          </T>
          <Button
            variant="primary"
            label={t("+ Capture")}
            onPress={() => setOperation({ kind: "creating-branch" })}
          />
        </View>

        {visible.length === 0 ? (
          <Hint>
            {t("Nothing open. When something starts coming back to you, capture it here.")}
          </Hint>
        ) : (
          <Hint style={{ marginBottom: 2 }}>
            {/* Said plainly, because an unexplained order is a silent claim
                about which of someone's problems matters most. */}
            {t("Most recently touched first. Pin anything to keep it at the top.")}
          </Hint>
        )}

        {visible.slice(0, SHOWN).map(({ branch, stands, answered }) => {
          const head = headlineOf(stands);
          return (
            <Card key={branch.id} style={{ gap: 6 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("Open {title}", { title: branch.title })}
                onPress={() => setOperation({ kind: "quick-touch", branchId: branch.id })}
                style={({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => ({
                  gap: 2,
                  opacity: hovered ? 0.85 : 1,
                })}
              >
                <T style={{ fontWeight: "700" }}>{branch.title}</T>
                {head ? (
                  <Hint style={{ margin: 0 }}>
                    {t(head.label)}
                    {": "}
                    {head.voice === "theirs" ? `“${head.text}”` : head.text}
                    {head.kind === "waiting" && head.on
                      ? ` · ${t("look again {date}", { date: formatReviewDate(head.on) })}`
                      : ""}
                  </Hint>
                ) : (
                  <Hint style={{ margin: 0 }}>{t("Nothing recorded on it yet.")}</Hint>
                )}
              </Pressable>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                <Button
                  variant="quiet"
                  label={pinned.includes(branch.id) ? t("Unpin") : t("Pin")}
                  onPress={() => setPinned(branch.id, !pinned.includes(branch.id))}
                />
                <Button
                  variant="quiet"
                  label={t("Not now")}
                  onPress={() => setDismissed(branch.id, true)}
                />
                <Button
                  variant="quiet"
                  label={t("Prepare a conversation")}
                  onPress={() => setView({ kind: "brief", branchIds: [branch.id] })}
                />
                {answered && (
                  <T style={{ fontSize: 11.5, color: tk.inkSoft, alignSelf: "center" }}>
                    {t("answered today")}
                  </T>
                )}
              </View>
            </Card>
          );
        })}

        {visible.length > SHOWN && (
          <Hint>
            {t("{n} more below the fold — open the map to see everything at once.", {
              n: visible.length - SHOWN,
            })}
          </Hint>
        )}

        {setAside.length > 0 && (
          <View
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: alpha(tk.lineAxis, 0.55),
              gap: 4,
            }}
          >
            <Hint style={{ margin: 0 }}>
              {t("Set aside for now: {n}", { n: setAside.length })}
            </Hint>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {setAside.map(({ branch }) => (
                <Button
                  key={branch.id}
                  variant="quiet"
                  label={branch.title}
                  onPress={() => setDismissed(branch.id, false)}
                />
              ))}
            </View>
          </View>
        )}
      </Panel>
    </ScrollView>
  );
}
