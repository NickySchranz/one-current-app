/**
 * Capture-build-only controls: the promo footage scripts drive the app with
 * these (fast clock, Pro unlock, super-bonk fill, always-drop tokens).
 * Renders nothing unless the build was exported with
 * EXPO_PUBLIC_SHOW_TESTING=1 — it does not exist in the shipped app or in
 * plain dev builds.
 */
import { View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { CAPTURE_TESTING } from "@/config/flags";
import { useT } from "@/i18n/i18n";
import { Button, Card, H2, Hint, T, rowStyles } from "@/ui/primitives";
import { CheckboxRow } from "./SettingsPage";

export function TestingPanel() {
  const t = useT();
  const timeSkewMs = useAppStore((s) => s.timeSkewMs);
  const timeRate = useAppStore((s) => s.timeRate);
  const setTimeRate = useAppStore((s) => s.setTimeRate);
  const resetTimeSkew = useAppStore((s) => s.resetTimeSkew);
  const isPro = useAppStore((s) => s.isPro);
  const coinAlways = useAppStore((s) => s.coinAlways);
  const setPro = useAppStore((s) => s.setPro);

  if (!CAPTURE_TESTING) return null;
  return (
    <>
      <H2>{t("Testing")}</H2>
      <Card>
        <Hint>
          {t(
            "Let the app's clock run faster than real time and watch how threads grow louder when days pass without decisions. This only affects this session — reloading returns to real time.",
          )}
        </Hint>
        <View accessibilityLabel={t("How fast time passes")} style={rowStyles.filterRow}>
          <Button selected={timeRate === 1} onPress={() => setTimeRate(1)} label={t("Real time")} />
          <Button
            selected={timeRate === 3600}
            onPress={() => setTimeRate(3600)}
            label={t("An hour per second")}
          />
          <Button
            selected={timeRate === 86400}
            onPress={() => setTimeRate(86400)}
            label={t("A day per second")}
          />
        </View>
        {timeSkewMs > 60_000 && (
          <View style={[rowStyles.filterRow, { marginTop: 8 }]}>
            <T>
              {t("The app is living {days} day(s) ahead.", {
                days: (timeSkewMs / (24 * 60 * 60 * 1000)).toFixed(1),
              })}
            </T>
            <Button onPress={resetTimeSkew} label={t("Back to real time")} />
          </View>
        )}
        <View style={{ marginTop: 12 }}>
          <CheckboxRow
            label={t("Pro unlocked (testing)")}
            checked={isPro}
            onChange={setPro}
          />
        </View>
        <View style={{ marginTop: 12 }}>
          <Button
            label={t("Fill super bonk (testing)")}
            onPress={() => useAppStore.getState().addBonkCharge(100)}
          />
        </View>
        <View style={{ marginTop: 12 }}>
          <CheckboxRow
            label={t("Always drop tokens (testing)")}
            checked={coinAlways}
            onChange={(v) => useAppStore.getState().setCoinAlways(v)}
          />
        </View>
      </Card>
    </>
  );
}
