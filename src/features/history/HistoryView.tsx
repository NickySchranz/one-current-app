import { useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { isClosed } from "@/domain/branches/logic";
import { energySplit, integrationSummary } from "@/domain/feelings/logic";
import { useT } from "@/i18n/i18n";
import {
  Button,
  Card,
  CalmNote,
  Chip,
  H1,
  H2,
  H3,
  Hint,
  Panel,
  T,
  rowStyles,
} from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";
import { HistoryMascot, wellnessLevel } from "@/features/life-timeline/HistoryMascot";

const DAY = 24 * 60 * 60 * 1000;

type HistoryFilter = "all" | "branches" | "actions" | "merges" | "recurring";

const FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "branches", label: "Threads" },
  { id: "actions", label: "Actions" },
  { id: "merges", label: "Integrated" },
  { id: "recurring", label: "Recurring" },
];

/** English display phrases for merge result statuses (keys stay untouched in data). */
const STATUS_PHRASES: Record<string, string> = {
  merged: "integrated",
  "partly merged": "partly integrated",
};

/** The uppercase overline for a day section (.day-section-title). */
function DaySectionTitle({ children }: { children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <H3
      style={{
        fontSize: 12.5,
        fontWeight: "600",
        letterSpacing: 0.75,
        textTransform: "uppercase",
        color: t.inkSoft,
        marginTop: 11.2,
        marginBottom: 4.8,
      }}
    >
      {children}
    </H3>
  );
}

/** Recent days, threads integrated, recurring patterns, and past merges. */
export function HistoryView() {
  const t = useT();
  const tokens = useTheme();
  const language = useAppStore((s) => s.language);
  const branches = useAppStore((s) => s.branches);
  const nowTick = useAppStore((s) => s.nowTick);
  const dayIso = (offset: number) =>
    new Date(nowTick + offset * DAY).toISOString().slice(0, 10);
  const merges = useAppStore((s) => s.merges);
  const lessons = useAppStore((s) => s.lessons);
  const setView = useAppStore((s) => s.setView);
  // 0 = today; step back as far as you like.
  const [dayOffset, setDayOffset] = useState(0);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const mascotType = useAppStore((s) => s.mascotType);
  const show = (f: HistoryFilter) => filter === "all" || filter === f;
  const locale = language === "en" ? undefined : language;

  // Slide the days like a strip of paper: right reveals earlier days.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < 48) return;
        if (g.dx > 0) setDayOffset((o) => o - 1);
        else setDayOffset((o) => Math.min(0, o + 1));
      },
    }),
  ).current;

  const mergedBranches = branches.filter(
    (b) => isClosed(b) || b.status === "partly-integrated",
  );
  const recurring = branches.filter((b) => b.recurrenceCount > 0);

  const day = dayIso(dayOffset);
  const label =
    dayOffset === 0
      ? t("Today")
      : dayOffset === -1
        ? t("Yesterday")
        : new Date(nowTick + dayOffset * DAY).toLocaleDateString(locale, {
            weekday: "short",
            day: "numeric",
            month: "short",
          });
  // The record a past day leaves behind: steps, moments, beginnings, endings.
  const dayActions = useAppStore((s) => s.actions).filter(
    (a) => a.createdAt.slice(0, 10) === day,
  );
  const dayMoments = branches.flatMap((b) =>
    b.commits.filter((m) => m.date === day).map((m) => ({ branch: b, moment: m })),
  );
  const dayStarted = branches.filter((b) => b.firstCreatedAt.slice(0, 10) === day);
  const dayClosed = branches.filter((b) => b.mergeDate === day);

  // Where the day's energy went, and which feelings were held or returned.
  // Every decision — an action or "nothing can be done" — brings some home.
  const dayDate = new Date(day + "T12:00:00");
  const energy = energySplit(branches, dayDate);
  const feelings = integrationSummary(branches, dayDate);

  return (
    <ScrollView>
      <Panel>
        {/* Fires leave exactly one thing behind. The threads are gone; these stay. */}
        {lessons.length > 0 && (
          <Card sunken style={{ marginTop: 8, marginBottom: 4 }}>
            <H3>{t("What the fires taught you")}</H3>
            {lessons
              .slice()
              .sort((a, b) => b.on.localeCompare(a.on))
              .map((l) => (
                <View
                  key={l.id}
                  style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6 }}
                >
                  <T style={{ fontSize: 13.6, flex: 1 }}>{l.text}</T>
                  <T style={{ fontSize: 11, opacity: 0.55 }}>{l.on}</T>
                </View>
              ))}
            <Hint style={{ marginTop: 8, marginBottom: 0 }}>
              {t("Each of these outlived a worry you burned. The worry is gone; you changed.")}
            </Hint>
          </Card>
        )}

        {/* The day itself is the page header: swipe or step through the days here. */}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6.4, marginBottom: 3.2 }}>
          <View {...pan.panHandlers} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Button
              variant="quiet"
              accessibilityLabel={t("Previous day")}
              onPress={() => setDayOffset((o) => o - 1)}
              style={{ paddingVertical: 1, paddingHorizontal: 9.6 }}
              textStyle={{ fontSize: 17.6 }}
              label="‹"
            />
            <H1 style={{ marginBottom: 0, minWidth: 128, textAlign: "center" }}>{label}</H1>
            <Button
              variant="quiet"
              accessibilityLabel={t("Next day")}
              disabled={dayOffset >= 0}
              onPress={() => setDayOffset((o) => Math.min(0, o + 1))}
              style={{ paddingVertical: 1, paddingHorizontal: 9.6 }}
              textStyle={{ fontSize: 17.6 }}
              label="›"
            />
          </View>
          {/* Mascot + cycling bubble — top-right of the day header */}
          <HistoryMascot
            wellness={wellnessLevel(
              dayClosed.length,
              dayActions.length,
              dayMoments.length,
              branches.filter(b => b.loudness >= 4 && b.mergeDate !== day && !['merged','archived'].includes(b.status)).length,
              branches.filter(b => !['merged','archived'].includes(b.status)).length,
            )}
            mascotType={mascotType}
            theme={tokens}
          />
        </View>

        <Card sunken style={{ gap: 6.4 }}>
          <DaySectionTitle>{t("Energy · feelings")}</DaySectionTitle>
          <View
            accessibilityRole="image"
            accessibilityLabel={t(
              "About {pct} percent of your energy moves with your main line this day.",
              { pct: Math.round(energy.mainShare * 100) },
            )}
            style={{
              flexDirection: "row",
              height: 8,
              borderRadius: 4,
              overflow: "hidden",
              backgroundColor: tokens.bgSunken,
            }}
          >
            <View
              style={{ width: `${energy.mainShare * 100}%`, backgroundColor: tokens.accent }}
            />
            {energy.parts.map((p, i) => (
              <View
                key={p.branch.id}
                style={{
                  width: `${p.share * 100}%`,
                  backgroundColor: tokens.inkFaint,
                  opacity: 0.55,
                  borderLeftWidth: i > 0 ? 1 : 0,
                  borderLeftColor: tokens.bg,
                }}
              />
            ))}
          </View>
          <Hint style={{ marginBottom: 0 }}>
            {energy.parts.length === 0
              ? t("All of you moves with your main line.")
              : t(
                  energy.parts.length === 1
                    ? "1 open line is drawing on you. Every decision returns some of that energy."
                    : "{n} open lines are drawing on you. Every decision returns some of that energy.",
                  { n: energy.parts.length },
                )}
          </Hint>
          {feelings.returnedToday.length > 0 && (
            <Hint style={{ marginBottom: 0 }}>
              {t("Returned by this day's decisions: {list}", {
                list: feelings.returnedToday.map((f) => t(f)).join(", "),
              })}
            </Hint>
          )}
          {feelings.held.map((h) => (
            <Hint key={h.branch.id} style={{ marginBottom: 0 }}>
              {t("“{title}” still holds {list}", {
                title: h.branch.title,
                list: h.feelings.map((f) => t(f)).join(", "),
              })}
            </Hint>
          ))}
        </Card>

        <View accessibilityLabel={t("What to review")} style={rowStyles.tagRow}>
          {FILTERS.map((f) => (
            <Chip
              key={f.id}
              pressed={filter === f.id}
              onPress={() => setFilter(f.id)}
              label={t(f.label)}
            />
          ))}
        </View>

        {show("actions") && (
          <View>
            {dayActions.length > 0 && (
              <>
                <DaySectionTitle>{t("Steps you decided on")}</DaySectionTitle>
                {dayActions.map((a) => (
                  <Card key={a.id} sunken>
                    <T style={{ fontWeight: "600" }}>{a.title}</T>
                    <Hint style={{ marginBottom: 0 }}>
                      {a.branchesIntegrated[0]?.branchTitle
                        ? t("toward “{title}”", { title: a.branchesIntegrated[0].branchTitle })
                        : t("on your main line")}
                      {a.durationMinutes
                        ? ` · ${t("about {n} min", { n: a.durationMinutes })}`
                        : ""}
                    </Hint>
                  </Card>
                ))}
              </>
            )}
            {dayMoments.map(({ branch: b, moment: m }) => (
              <Card key={m.id} sunken>
                <T style={{ fontWeight: "600" }}>{m.title}</T>
                <Hint style={{ marginBottom: 0 }}>
                  {t("a moment on “{title}”", { title: b.title })}
                </Hint>
              </Card>
            ))}
            {dayClosed.map((b) => (
              <Card key={b.id} sunken>
                <T style={{ fontWeight: "600" }}>{b.title}</T>
                <Hint style={{ marginBottom: 0 }}>
                  {b.status === "converted-to-project"
                    ? t("became real work and left your head")
                    : t("folded back into your one line")}
                </Hint>
              </Card>
            ))}
            {dayStarted.map((b) => (
              <Card key={b.id} sunken>
                <T style={{ fontWeight: "600" }}>{b.title}</T>
                <Hint style={{ marginBottom: 0 }}>{t("began pulling on you this day")}</Hint>
              </Card>
            ))}
            {dayActions.length === 0 &&
              dayMoments.length === 0 &&
              dayClosed.length === 0 &&
              dayStarted.length === 0 && (
                <CalmNote>
                  <T>{t("Nothing was recorded on this day. It simply passed.")}</T>
                </CalmNote>
              )}
          </View>
        )}

        {show("branches") && (
          <>
            <H2>{t("Integrated threads")}</H2>
            {mergedBranches.length === 0 ? (
              <Hint>
                {t(
                  "Nothing integrated yet. Threads you integrate stay visible here and on the timeline.",
                )}
              </Hint>
            ) : (
              mergedBranches.map((b) => (
                <Card key={b.id}>
                  <T style={{ fontWeight: "600" }}>{b.title}</T>
                  <Hint style={{ marginBottom: 0 }}>
                    {t("Began {date}", { date: b.forkLabel ?? b.forkDate })}
                    {b.mergeDate
                      ? ` · ${t("integrated {date}", { date: b.mergeDate })}`
                      : ` · ${t("partly integrated")}`}
                    {b.storedQualities.length > 0
                      ? ` · ${t("reclaimed: {list}", { list: b.storedQualities.join(", ") })}`
                      : ""}
                  </Hint>
                  {b.mergeIds.length > 0 && (
                    <Button
                      variant="quiet"
                      style={{ alignSelf: "flex-start", marginTop: 6 }}
                      onPress={() =>
                        setView({
                          kind: "merge-review",
                          mergeId: b.mergeIds[b.mergeIds.length - 1],
                        })
                      }
                      label={t("What was integrated")}
                    />
                  )}
                </Card>
              ))
            )}
          </>
        )}

        {show("recurring") && recurring.length > 0 && (
          <>
            <H2>{t("Patterns")}</H2>
            <Hint>
              {t(
                "Threads that returned. Returning does not undo integrating something — it usually points at a need that keeps asking.",
              )}
            </Hint>
            {recurring.map((b) => (
              <Card key={b.id} sunken>
                <T style={{ fontWeight: "600" }}>{b.title}</T>
                <Hint style={{ marginBottom: 0 }}>
                  {t(b.recurrenceCount === 1 ? "Returned 1 time" : "Returned {n} times", {
                    n: b.recurrenceCount,
                  })}{" "}
                  ·{" "}
                  {b.unmetNeeds.length > 0
                    ? t("needs: {list}", { list: b.unmetNeeds.join(", ") })
                    : t("no needs recorded")}
                </Hint>
              </Card>
            ))}
          </>
        )}

        {show("merges") && (
          <>
            <H2>{t("Everything integrated")}</H2>
            {merges.length === 0 ? (
              <Hint>{t("Nothing has been integrated yet.")}</Hint>
            ) : (
              [...merges]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((m) => (
                  <Pressable
                    key={m.id}
                    accessibilityRole="button"
                    onPress={() => setView({ kind: "merge-review", mergeId: m.id })}
                    style={(s) => [
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 9.6,
                        width: "100%",
                        borderWidth: 1,
                        borderColor: (s as { hovered?: boolean }).hovered
                          ? tokens.accent
                          : alpha(tokens.lineAxis, 0.55),
                        borderRadius: tokens.radius,
                        paddingVertical: 9.6,
                        paddingHorizontal: 12.8,
                        marginBottom: 8,
                        backgroundColor: tokens.bgRaised,
                      },
                    ]}
                  >
                    <View>
                      <T style={{ fontWeight: "600" }}>
                        {new Date(m.createdAt).toLocaleDateString(locale)}
                      </T>
                      <Hint style={{ marginBottom: 0 }}>
                        {t(m.branchIds.length === 1 ? "1 thread" : "{n} threads", {
                          n: m.branchIds.length,
                        })}{" "}
                        ·{" "}
                        {t(
                          STATUS_PHRASES[m.resultStatus.replace(/-/g, " ")] ??
                            m.resultStatus.replace(/-/g, " "),
                        )}
                        {m.reclaimedQualities.length > 0
                          ? ` · ${t("reclaimed {list}", {
                              list: m.reclaimedQualities.join(", "),
                            })}`
                          : ""}
                      </Hint>
                    </View>
                  </Pressable>
                ))
            )}
          </>
        )}
      </Panel>
    </ScrollView>
  );
}
