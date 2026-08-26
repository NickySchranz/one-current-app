import { useAppStore } from "@/stores/app-store";
import { View } from "react-native";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/ui/theme";
import {
  canTakeUpValue,
  dueForRevisit,
  liveValues,
  looksLikeFor,
  setDownValues,
} from "@/domain/values/logic";
import { appNow } from "@/domain/time/clock";
import { Button, Card, H2, Hint, T } from "@/ui/primitives";

/**
 * What matters to you, kept where it can be read in a calm moment — which is
 * where naming values actually helps. Nothing here scores anything, and a
 * value that is set down is kept, not deleted.
 */
export function ValuesEditor() {
  const t = useT();
  const th = useTheme();
  const values = useAppStore((s) => s.values);
  const setOperation = useAppStore((s) => s.setOperation);
  const turnValue = useAppStore((s) => s.turnValue);
  const settleValueRevisit = useAppStore((s) => s.settleValueRevisit);

  const live = liveValues(values);
  const setDown = setDownValues(values);
  const revisit = dueForRevisit(values, appNow());

  return (
    <>
      <H2>{t("What matters to you")}</H2>
      <Card>
        {live.length === 0 ? (
          <Hint>
            {t(
              "Nothing named yet. Naming a few things you stand for gives a loud thread something to sit beside.",
            )}
          </Hint>
        ) : (
          <>
            <Hint>
              {t("Your line carries these. Change any of them whenever a situation changes you.")}
            </Hint>
            <View style={{ gap: 10 }}>
              {live.map((v) => {
                const dueNow = revisit.some((r) => r.id === v.id);
                const earlier = v.history.filter((h) => h.was).slice(-1)[0]?.was;
                return (
                  <View key={v.id} style={{ gap: 4 }}>
                    <T style={{ fontSize: 15.2, fontWeight: "600" }}>{t(v.name)}</T>
                    {v.looksLike.length > 0 && (
                      <T style={{ fontSize: 14, color: th.inkSoft }}>
                        {v.looksLike.map((l) => t(l)).join(" · ")}
                      </T>
                    )}
                    {v.motive !== "chosen" && (
                      <Hint style={{ marginBottom: 0 }}>
                        {v.motive === "expected-of-me"
                          ? t("Held because it is expected of you.")
                          : t("Held to avoid guilt.")}
                      </Hint>
                    )}
                    {earlier && earlier.name === v.name && earlier.looksLike.length > 0 && (
                      <Hint style={{ marginBottom: 0 }}>
                        {t("It used to say: {was}", {
                          was: earlier.looksLike.map((l) => t(l)).join(" · "),
                        })}
                      </Hint>
                    )}
                    {dueNow && (
                      <View style={{ gap: 4, marginTop: 2 }}>
                        <Hint style={{ marginBottom: 0 }}>
                          {t("You changed this while things were loud. Does it still read true?")}
                        </Hint>
                        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                          <Button
                            label={t("Still true")}
                            onPress={() => void settleValueRevisit(v.id)}
                          />
                          <Button
                            variant="quiet"
                            label={t("Put back what it said")}
                            onPress={() => {
                              const was = v.history.filter((h) => h.was).slice(-1)[0]?.was;
                              if (was)
                                void turnValue(v.id, {
                                  name: was.name,
                                  looksLike: was.looksLike,
                                  motive: was.motive,
                                }).then(() => settleValueRevisit(v.id));
                            }}
                          />
                        </View>
                      </View>
                    )}
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                      <Button
                        label={t("Change what it looks like")}
                        onPress={() =>
                          void turnValue(v.id, { looksLike: looksLikeFor(v.name).slice(0, 2) })
                        }
                      />
                      <Button
                        variant="quiet"
                        label={t("Set it down")}
                        onPress={() => void turnValue(v.id, { setDown: true })}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
        <View style={{ marginTop: 12 }}>
          <Button
            variant={live.length === 0 ? "primary" : "default"}
            label={live.length === 0 ? t("Name what matters") : t("Take up another")}
            disabled={!canTakeUpValue(values)}
            onPress={() => setOperation({ kind: "naming-values" })}
          />
          {!canTakeUpValue(values) && (
            <Hint style={{ marginTop: 6, marginBottom: 0 }}>
              {t("A handful is enough to steady you. Set one down to take up another.")}
            </Hint>
          )}
        </View>
        {setDown.length > 0 && (
          <View style={{ marginTop: 14, gap: 6 }}>
            <Hint style={{ marginBottom: 0 }}>{t("Set down, and kept")}</Hint>
            {setDown.map((v) => (
              <View key={v.id} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <T style={{ fontSize: 14, color: th.inkSoft }}>{t(v.name)}</T>
                <Button
                  variant="quiet"
                  label={t("Take it back up")}
                  onPress={() => void turnValue(v.id, { setDown: true })}
                />
              </View>
            ))}
          </View>
        )}
      </Card>
    </>
  );
}
