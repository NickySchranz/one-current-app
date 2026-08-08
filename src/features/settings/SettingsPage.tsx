import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { THEMES } from "@/visualization/theme";
import { useT } from "@/i18n/i18n";
import {
  AppTextInput,
  Button,
  Card,
  H2,
  Hint,
  P,
  T,
  rowStyles,
} from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

/** The little round split swatch (paper left, accent right) for a theme button. */
function ThemeSwatch({ paper, accent }: { paper: string; accent: string }) {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: alpha(t.lineAxis, 0.55),
        overflow: "hidden",
        flexDirection: "row",
      }}
    >
      <View style={{ width: 6, height: 12, backgroundColor: paper }} />
      <View style={{ width: 6, height: 12, backgroundColor: accent }} />
    </View>
  );
}

/** A filter-row button that can carry the swatch (aria-pressed look). */
function ThemeButton({
  label,
  paper,
  accent,
  selected,
  onPress,
}: {
  label: string;
  paper: string;
  accent: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={(s) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          minHeight: 28,
          paddingVertical: 2.4,
          paddingHorizontal: 9.6,
          borderRadius: t.btnRadius,
          borderWidth: 1,
          borderColor: selected
            ? t.accent
            : (s as { hovered?: boolean }).hovered
              ? t.inkFaint
              : t.lineAxis,
          backgroundColor: selected ? t.accentSoft : t.bgRaised,
        },
      ]}
    >
      <ThemeSwatch paper={paper} accent={accent} />
      <T style={{ fontSize: 13.6, color: selected ? t.ink : t.inkSoft }}>{label}</T>
    </Pressable>
  );
}

/** A plain checkbox row (the reduce-motion toggle). */
function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: "row", gap: 9.6, alignItems: "center" }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: checked ? t.accent : t.lineAxis,
          backgroundColor: checked ? t.accent : t.bgRaised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <T style={{ color: t.accentInk, fontSize: 13, lineHeight: 16 }}>✓</T>}
      </View>
      <T style={{ flexShrink: 1 }}>{label}</T>
    </Pressable>
  );
}

/** Appearance, language, comfort, and privacy sections, rendered inside More. */
export function SettingsSections() {
  const t = useT();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const setReducedMotion = useAppStore((s) => s.setReducedMotion);
  const exportData = useAppStore((s) => s.exportData);
  const importData = useAppStore((s) => s.importData);
  const deleteEverything = useAppStore((s) => s.deleteEverything);
  const loadExampleData = useAppStore((s) => s.loadExampleData);
  const timeSkewMs = useAppStore((s) => s.timeSkewMs);
  const timeRate = useAppStore((s) => s.timeRate);
  const setTimeRate = useAppStore((s) => s.setTimeRate);
  const resetTimeSkew = useAppStore((s) => s.resetTimeSkew);

  const [message, setMessage] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Native fallbacks for the file-based export/import that the web build uses.
  const [exportJson, setExportJson] = useState("");
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  async function doExport() {
    const json = await exportData();
    if (Platform.OS === "web") {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `one-current-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    // No downloads on native: show the JSON so it can be copied out.
    setExportJson(json);
  }

  async function doImport(text: string) {
    try {
      await importData(text);
      setMessage(t("Import complete."));
      setImportOpen(false);
      setImportText("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("Import failed."));
    }
  }

  function pickImport() {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";
      input.onchange = () => {
        const f = input.files?.[0];
        if (f) void f.text().then((text) => doImport(text));
      };
      input.click();
      return;
    }
    setImportOpen((v) => !v);
  }

  return (
    <>
      <H2>{t("Appearance")}</H2>
      <Card>
        <View accessibilityLabel={t("Theme")} style={rowStyles.filterRow}>
          {THEMES.map((th) => (
            <ThemeButton
              key={th.id}
              label={t(th.name)}
              paper={th.paper}
              accent={th.accent}
              selected={theme === th.id}
              onPress={() => setTheme(th.id)}
            />
          ))}
        </View>
        <Hint style={{ marginTop: 8, marginBottom: 0 }}>
          {t(THEMES.find((th) => th.id === theme)?.hint ?? "")}
        </Hint>
      </Card>

      <H2>{t("Language")}</H2>
      <Card>
        <View accessibilityLabel={t("Language")} style={rowStyles.filterRow}>
          <Button
            selected={language === "en"}
            onPress={() => setLanguage("en")}
            label="English"
          />
          <Button
            selected={language === "es"}
            onPress={() => setLanguage("es")}
            label="Español"
          />
        </View>
        <Hint style={{ marginTop: 8, marginBottom: 0 }}>
          {t("Changes every word the app says. Your own words stay as you wrote them.")}
        </Hint>
      </Card>

      <H2>{t("Comfort")}</H2>
      <Card>
        <CheckboxRow
          label={t("Reduce motion (no line movement or pulsing)")}
          checked={reducedMotion}
          onChange={setReducedMotion}
        />
      </Card>

      <H2>{t("Explore")}</H2>
      <Card>
        <Hint>
          {t(
            "See what a lived-in timeline looks like: nine example threads — drifting, resting, integrated — plus today's actions. You can delete them any time.",
          )}
        </Hint>
        <Button
          style={{ alignSelf: "flex-start" }}
          onPress={() => void loadExampleData()}
          label={t("Load example threads")}
        />
      </Card>

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
      </Card>

      <H2>{t("Privacy")}</H2>
      <Card>
        <Hint>
          {t(
            "Everything you write stays in this browser, stored locally on your device. Nothing is sent anywhere. Export a copy before switching devices.",
          )}
        </Hint>
        <View style={rowStyles.filterRow}>
          <Button onPress={() => void doExport()} label={t("Export everything")} />
          <Button
            onPress={pickImport}
            accessibilityLabel={t("Import a One Current export file")}
            label={t("Import")}
          />
          {!confirmingDelete ? (
            <Button
              variant="danger"
              onPress={() => setConfirmingDelete(true)}
              label={t("Delete everything")}
            />
          ) : (
            <>
              <T style={{ flexShrink: 1 }}>
                {t(
                  "Delete all threads, everything integrated, and your whole history? This cannot be undone.",
                )}
              </T>
              <Button
                variant="danger"
                onPress={() => {
                  void (async () => {
                    await deleteEverything();
                    setConfirmingDelete(false);
                    setMessage(t("All data deleted."));
                  })();
                }}
                label={t("Yes, delete")}
              />
              <Button onPress={() => setConfirmingDelete(false)} label={t("Keep it")} />
            </>
          )}
        </View>
        {exportJson !== "" && Platform.OS !== "web" && (
          <AppTextInput
            multiline
            value={exportJson}
            editable={false}
            selectTextOnFocus
            style={{ marginTop: 8, maxHeight: 180 }}
            accessibilityLabel={t("Export everything")}
          />
        )}
        {importOpen && Platform.OS !== "web" && (
          <View style={{ marginTop: 8, gap: 8 }}>
            <AppTextInput
              multiline
              value={importText}
              onChangeText={setImportText}
              accessibilityLabel={t("Import a One Current export file")}
            />
            <Button
              style={{ alignSelf: "flex-start" }}
              onPress={() => void doImport(importText)}
              disabled={importText.trim() === ""}
              label={t("Import")}
            />
          </View>
        )}
        {message !== "" && (
          <P style={{ marginTop: 8, marginBottom: 0 }}>{message}</P>
        )}
      </Card>
    </>
  );
}
