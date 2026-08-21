import { ScrollView, View, useWindowDimensions } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { CONFLICT_TYPE_LABELS } from "@/domain/conflicts/logic";
import { useT } from "@/i18n/i18n";
import {
  Button,
  CalmNote,
  Card,
  H1,
  H3,
  Hint,
  P,
  Panel,
  T,
  Tag,
  rowStyles,
} from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { mix } from "@/ui/color";

type Props = { mergeId: string };

/** One diff line inside a review card (.diff-item). */
function DiffItem({ children }: { children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        paddingVertical: 7.2,
        paddingHorizontal: 9.6,
        borderRadius: t.radius,
        backgroundColor: t.bgSunken,
        marginBottom: 6.4,
      }}
    >
      <T style={{ fontSize: 15.2 }}>{children}</T>
    </View>
  );
}

/** Text summary of a bring-back: what was integrated at this point. */
export function MergeReview({ mergeId }: Props) {
  const t = useT();
  const tokens = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width <= 700;
  const language = useAppStore((s) => s.language);
  const merge = useAppStore((s) => s.merges.find((m) => m.id === mergeId));
  const branches = useAppStore((s) => s.branches);
  const setView = useAppStore((s) => s.setView);

  if (!merge) {
    return (
      <ScrollView>
        <Panel>
          <P>{t("This record no longer exists.")}</P>
        </Panel>
      </ScrollView>
    );
  }

  const involved = branches.filter((b) => merge.branchIds.includes(b.id));
  const gridCard = { width: narrow ? ("100%" as const) : ("48%" as const), marginBottom: 0 };

  return (
    <ScrollView>
      <Panel>
        <H1>{t("Integrated")}</H1>
        <Hint>
          {new Date(merge.createdAt).toLocaleDateString(language === "es" ? "es" : undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}{" "}
          · {involved.map((b) => b.title).join(", ")}
        </Hint>

        {merge.contribution && (
          <Card
            style={{
              gap: 7.2,
              paddingTop: 13.6,
              paddingHorizontal: 16,
              paddingBottom: 10.4,
              borderColor: mix(tokens.accent, tokens.lineAxis, 45),
            }}
          >
            <H3>{t("What it now contributes")}</H3>
            <P style={{ marginBottom: 0 }}>
              {merge.contributionKind ? `${t(merge.contributionKind.replace(/-/g, " "))}: ` : ""}
              {merge.contribution}
            </P>
          </Card>
        )}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <Card style={gridCard}>
            <H3>{t("Preserved as true")}</H3>
            {merge.stillValid.length > 0 ? (
              merge.stillValid.map((s) => <DiffItem key={s}>{s}</DiffItem>)
            ) : (
              <Hint>—</Hint>
            )}
          </Card>
          <Card style={gridCard}>
            <H3>{t("Released as outdated")}</H3>
            {merge.outdatedBeliefs.length > 0 ? (
              merge.outdatedBeliefs.map((s) => <DiffItem key={s}>{s}</DiffItem>)
            ) : (
              <Hint>—</Hint>
            )}
          </Card>
          <Card style={gridCard}>
            <H3>{t("Left outside control")}</H3>
            {merge.outsideControl.length > 0 ? (
              merge.outsideControl.map((s) => <DiffItem key={s}>{s}</DiffItem>)
            ) : (
              <Hint>—</Hint>
            )}
          </Card>
          <Card style={gridCard}>
            <H3>{t("Qualities reclaimed")}</H3>
            <View style={rowStyles.tagRow}>
              {merge.reclaimedQualities.length > 0 ? (
                merge.reclaimedQualities.map((q) => <Tag key={q} quality label={q} />)
              ) : (
                <Hint>—</Hint>
              )}
            </View>
          </Card>
        </View>

        {merge.released.length > 0 && (
          <Card sunken>
            <H3>{t("Stopped running separately")}</H3>
            {merge.released.map((r) => (
              <DiffItem key={r}>{r}</DiffItem>
            ))}
          </Card>
        )}

        {merge.conflicts.length > 0 && (
          <Card>
            <H3>{t("Conflicts resolved")}</H3>
            {merge.conflicts.map((c) => (
              <View
                key={c.id}
                style={{
                  borderLeftWidth: 4,
                  borderLeftColor: tokens.accent,
                  paddingLeft: 13.6,
                  marginBottom: 12,
                }}
              >
                <T style={{ fontWeight: "600" }}>{t(CONFLICT_TYPE_LABELS[c.type])}</T>
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 11.2,
                    borderRadius: tokens.radius,
                    backgroundColor: tokens.bgSunken,
                    marginTop: 6.4,
                    marginBottom: 6.4,
                  }}
                >
                  <T>{c.demandA}</T>
                </View>
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 11.2,
                    borderRadius: tokens.radius,
                    backgroundColor: tokens.bgSunken,
                    marginBottom: 6.4,
                  }}
                >
                  <T>{c.demandB}</T>
                </View>
                {c.resolution && (
                  <CalmNote>
                    <T>{c.resolution}</T>
                  </CalmNote>
                )}
              </View>
            ))}
          </Card>
        )}

        {merge.action && (
          <Card>
            <H3>{t("The action it became")}</H3>
            <P style={{ fontWeight: "600", marginBottom: 0 }}>{merge.action.title}</P>
            <P>{merge.action.instruction}</P>
            {merge.action.branchesIntegrated.map((r) => (
              <Hint key={r.branchId} style={{ marginBottom: 0 }}>
                {r.branchTitle} → {r.representedAs}
              </Hint>
            ))}
          </Card>
        )}

        <CalmNote style={{ marginBottom: 16 }}>
          <T>
            {t("This remains part of your history, but it no longer needs to organise today.")}
          </T>
        </CalmNote>
        <Button
          variant="primary"
          style={{ alignSelf: "flex-start" }}
          onPress={() => setView({ kind: "now" })}
          label={t("Return to Now")}
        />
      </Panel>
    </ScrollView>
  );
}
