import { View } from "react-native";
import type { PsychologicalBranch } from "@/domain/branches/types";
import { sortMoments } from "@/domain/moments/logic";
import { useT } from "@/i18n/i18n";
import { Card, Hint, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";

type Props = { branch: PsychologicalBranch };

export function MomentList({ branch }: Props) {
  const t = useT();
  const th = useTheme();
  const moments = sortMoments(branch.commits);
  if (moments.length === 0) {
    return (
      <Hint>
        {t("No moments recorded yet. Where it began and Now are the whole story so far.")}
      </Hint>
    );
  }
  const statusText = { color: th.inkSoft, fontSize: 14.1 } as const;
  return (
    <View accessibilityLabel={t("Moments in order")}>
      {moments.map((m) => (
        <Card key={m.id} style={{ paddingVertical: 11.2, paddingHorizontal: 14.4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6.4 }}>
            <T style={statusText}>{new Date(m.date + "T00:00:00").toLocaleDateString()}</T>
            <T style={statusText}>·</T>
            <T style={statusText}>{t(m.type)}</T>
            {m.effect && (
              <>
                <T style={statusText}>·</T>
                <T style={statusText}>{t("made it {effect}", { effect: t(m.effect) })}</T>
              </>
            )}
          </View>
          <T style={{ fontWeight: "600" }}>{m.title}</T>
          {m.description && <Hint style={{ marginBottom: 0 }}>{m.description}</Hint>}
          {m.beliefAdded && (
            <Hint style={{ marginTop: 4, marginBottom: 0 }}>
              {t("Began believing: “{belief}”", { belief: m.beliefAdded })}
            </Hint>
          )}
        </Card>
      ))}
    </View>
  );
}
