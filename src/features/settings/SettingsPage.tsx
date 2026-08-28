import { useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { selectEffectivePro, useAppStore } from "@/stores/app-store";
import { api, ApiHttpError, ApiOfflineError, getApiUrl, hasTokens, setApiUrl } from "@/api/client";
import { SHOW_TESTING } from "@/config/flags";
import { THEMES } from "@/visualization/theme";
import { isProTheme, type PaywallReason } from "@/domain/entitlements/logic";
import { PaywallPrompt } from "@/features/paywall/PaywallPrompt";
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
import { ShareWithPsychologist } from "./ShareWithPsychologist";

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
  locked = false,
  lockedLabel,
  onPress,
}: {
  label: string;
  paper: string;
  accent: string;
  selected: boolean;
  /** A Pro theme without Pro: still visible, but pressing it asks to upgrade. */
  locked?: boolean;
  lockedLabel?: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={locked && lockedLabel ? `${label} — ${lockedLabel}` : label}
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
      {locked && (
        <T
          style={{
            fontSize: 10.5,
            lineHeight: 14,
            color: t.inkSoft,
            borderWidth: 1,
            borderColor: alpha(t.lineAxis, 0.55),
            borderRadius: 999,
            paddingHorizontal: 6,
            overflow: "hidden",
          }}
        >
          {lockedLabel}
        </T>
      )}
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
  const mascotType = useAppStore((s) => s.mascotType);
  const setMascotType = useAppStore((s) => s.setMascotType);
  const exportData = useAppStore((s) => s.exportData);
  const importData = useAppStore((s) => s.importData);
  const deleteEverything = useAppStore((s) => s.deleteEverything);
  const loadExampleData = useAppStore((s) => s.loadExampleData);
  const timeSkewMs = useAppStore((s) => s.timeSkewMs);
  const timeRate = useAppStore((s) => s.timeRate);
  const setTimeRate = useAppStore((s) => s.setTimeRate);
  const resetTimeSkew = useAppStore((s) => s.resetTimeSkew);
  const isPro = useAppStore((s) => s.isPro);
  const coinAlways = useAppStore((s) => s.coinAlways);
  const setPro = useAppStore((s) => s.setPro);
  const effectivePro = useAppStore(selectEffectivePro);
  const apiOnline = useAppStore((s) => s.apiOnline);
  const syncMe = useAppStore((s) => s.syncMe);
  const authUser = useAppStore((s) => s.authUser);
  const signOut = useAppStore((s) => s.signOut);

  const [paywall, setPaywall] = useState<PaywallReason | null>(null);
  const [message, setMessage] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Native fallbacks for the file-based export/import that the web build uses.
  const [exportJson, setExportJson] = useState("");
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  // Account & sync
  const signedIn = hasTokens();
  const [urlDraft, setUrlDraft] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [confirmingRestore, setConfirmingRestore] = useState(false);

  useEffect(() => {
    void getApiUrl().then(setUrlDraft);
  }, []);

  /**
   * Deleting everything locally must not leave uploaded shares readable. Returns
   * how many were revoked, or null when the server could not be reached — the
   * user is told either way rather than being left with a false "all deleted".
   */
  async function revokeUploadedShares(): Promise<number | null> {
    if (!hasTokens()) return 0;
    try {
      const { shares } = await api.listMyShares();
      let revoked = 0;
      for (const share of shares) {
        try {
          await api.deleteShare(share.id);
          revoked += 1;
        } catch {
          return null;
        }
      }
      return revoked;
    } catch {
      return null;
    }
  }

  /**
   * Delete everything: for signed-in accounts the server account goes first
   * (subscription canceled, shares revoked, cloud backup removed), then the
   * device is wiped. A server failure falls back to revoking shares only and
   * says so — never a false "all deleted".
   */
  async function doDeleteEverything() {
    let serverMsg = "";
    if (hasTokens()) {
      try {
        const res = await api.deleteMe();
        signOut();
        serverMsg = t(
          "Your account, cloud backup, and {n} uploaded share(s) are deleted from the server. ",
          { n: res.sharesRevoked },
        );
      } catch {
        const revoked = await revokeUploadedShares();
        serverMsg =
          revoked == null
            ? t(
                "The server could not be reached, so your account still exists — try again while online. ",
              )
            : t(
                "Your account could not be deleted right now, but {n} uploaded share(s) were revoked — try again while online. ",
                { n: revoked },
              );
      }
    }
    await deleteEverything();
    setConfirmingDelete(false);
    setMessage(serverMsg + t("Everything on this device is deleted."));
  }

  function syncError(e: unknown): string {
    if (e instanceof ApiOfflineError) return t("The server could not be reached.");
    if (e instanceof ApiHttpError && e.code === "pro_required")
      return t("Cloud backup is part of Pro.");
    if (e instanceof ApiHttpError && e.code === "no_backup")
      return t("There is no backup on the server yet.");
    return t("That did not work. Try again in a moment.");
  }

  async function uploadBackup() {
    setSyncBusy(true);
    setSyncMsg("");
    try {
      const json = await exportData();
      await api.uploadBackup(json);
      setSyncMsg(t("Backup uploaded."));
    } catch (e) {
      setSyncMsg(syncError(e));
    } finally {
      setSyncBusy(false);
    }
  }

  async function restoreBackup() {
    setSyncBusy(true);
    setSyncMsg("");
    try {
      const doc = await api.downloadBackup();
      await importData(JSON.stringify(doc));
      setSyncMsg(t("Backup restored."));
    } catch (e) {
      setSyncMsg(syncError(e));
    } finally {
      setSyncBusy(false);
      setConfirmingRestore(false);
    }
  }

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
      <H2>{t("Account")}</H2>
      <Card>
        <View style={rowStyles.filterRow}>
          <T style={{ flexShrink: 1 }}>
            {authUser?.name
              ? t("Signed in as {name} ({email})", {
                  name: authUser.name,
                  email: authUser.email,
                })
              : t("Signed in as {email}", { email: authUser?.email ?? "" })}
          </T>
          <Button onPress={signOut} label={t("Sign out")} />
        </View>
        {!signedIn && (
          <Hint style={{ marginTop: 8, marginBottom: 0 }}>
            {t("Offline — signed in on this device only.")}
          </Hint>
        )}
        {signedIn && effectivePro && (
          <View style={[rowStyles.filterRow, { marginTop: 8 }]}>
            <Button
              onPress={() => {
                void api
                  .billingPortal()
                  .then(({ url }) => Linking.openURL(url))
                  .catch(() => setMessage(t("The subscription page could not be opened.")));
              }}
              label={t("Manage subscription")}
            />
          </View>
        )}
        <Hint style={{ marginTop: 8, marginBottom: 0 }}>
          {t("Signing out only closes the door — every thread stays on this device.")}
        </Hint>
      </Card>

      <H2>{t("Account & sync")}</H2>
      <Card>
        <Hint>
          {t(
            "Cloud backup sends a copy of everything in the app — every thread, moment, step and lesson — to your account on our server, so a new device can pick it up. It stays there until you replace it or delete your account. Part of Pro.",
          )}
        </Hint>
        {!signedIn ? (
          <Hint style={{ marginBottom: 0 }}>
            {t("Sign in while the server is reachable to use cloud backup.")}
          </Hint>
        ) : (
          <>
            <View style={rowStyles.filterRow}>
              <Button
                onPress={() => void uploadBackup()}
                disabled={syncBusy || !effectivePro || apiOnline === false}
                label={t("Upload backup")}
              />
              {!confirmingRestore ? (
                <Button
                  onPress={() => setConfirmingRestore(true)}
                  disabled={syncBusy || !effectivePro || apiOnline === false}
                  label={t("Restore backup")}
                />
              ) : (
                <>
                  <T style={{ flexShrink: 1 }}>
                    {t("Bring the server copy onto this device? Matching threads are overwritten.")}
                  </T>
                  <Button
                    variant="danger"
                    onPress={() => void restoreBackup()}
                    disabled={syncBusy}
                    label={t("Yes, restore")}
                  />
                  <Button onPress={() => setConfirmingRestore(false)} label={t("Keep it")} />
                </>
              )}
            </View>
            {!effectivePro && (
              <Hint style={{ marginTop: 8, marginBottom: 0 }}>
                {t("Cloud backup is part of Pro.")}
              </Hint>
            )}
            {apiOnline === false && (
              <Hint style={{ marginTop: 8, marginBottom: 0 }}>
                {t("The server could not be reached.")}
              </Hint>
            )}
            {syncMsg !== "" && <P style={{ marginTop: 8, marginBottom: 0 }}>{syncMsg}</P>}
          </>
        )}
        {SHOW_TESTING && (
          <View style={{ marginTop: 12, gap: 8 }}>
            <Hint style={{ marginBottom: 0 }}>{t("Server address")}</Hint>
            <View style={rowStyles.filterRow}>
              <AppTextInput
                value={urlDraft}
                onChangeText={setUrlDraft}
                placeholder="https://…"
                accessibilityLabel={t("Server address")}
                autoCapitalize="none"
                style={{ flexGrow: 1, minWidth: 200 }}
              />
              <Button
                onPress={() => {
                  void setApiUrl(urlDraft).then(() => {
                    void syncMe();
                    setSyncMsg(t("Server address saved."));
                  });
                }}
                label={t("Save")}
              />
            </View>
          </View>
        )}
      </Card>

      <H2>{t("Appearance")}</H2>
      <Card>
        <View accessibilityLabel={t("Theme")} style={rowStyles.filterRow}>
          {THEMES.map((th) => {
            const locked = isProTheme(th.id) && !effectivePro;
            return (
              <ThemeButton
                key={th.id}
                label={t(th.name)}
                paper={th.paper}
                accent={th.accent}
                selected={theme === th.id}
                locked={locked}
                lockedLabel={t("Pro")}
                onPress={() => (locked ? setPaywall("themes") : setTheme(th.id))}
              />
            );
          })}
        </View>
        <Hint style={{ marginTop: 8, marginBottom: 0 }}>
          {t(THEMES.find((th) => th.id === theme)?.hint ?? "")}
        </Hint>
      </Card>

      <H2>{t("Companion")}</H2>
      <Card>
        <View accessibilityLabel={t("Companion character")} style={rowStyles.filterRow}>
          {(["chronicler", "wisp", "wanderer"] as const).map((type) => (
            <Button
              key={type}
              selected={mascotType === type}
              onPress={() => setMascotType(type)}
              label={type === "chronicler" ? "📖 Chronicler" : type === "wisp" ? "✨ Wisp" : "🗺 Wanderer"}
            />
          ))}
        </View>
        <Hint style={{ marginTop: 8, marginBottom: 0 }}>
          {mascotType === "chronicler"
            ? t("A scholarly adventurer who notes everything and wields a quill.")
            : mascotType === "wisp"
              ? t("A glowing spirit that floats between your threads, trailing light.")
              : t("A rugged explorer with a staff, always ready for the next path.")}
        </Hint>
        <View style={{ marginTop: 12 }}>
          <Button
            style={{ alignSelf: "flex-start" }}
            onPress={() => {
              void AsyncStorage.removeItem("one-current-tutorial-v1").then(() => {
                if (Platform.OS === "web") {
                  window.location.reload();
                } else {
                  Alert.alert(
                    t("Tour restarted"),
                    t("Navigate to Now to see the tour again."),
                  );
                }
              });
            }}
            label={t("Restart tour")}
          />
        </View>
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
            label="Español (España)"
          />
          <Button
            selected={language === "es-CO"}
            onPress={() => setLanguage("es-CO")}
            label="Español (Colombia)"
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
            "See what a lived-in timeline looks like: ten example threads — drifting, resting, integrated — plus today's actions. You can delete them any time.",
          )}
        </Hint>
        <Button
          style={{ alignSelf: "flex-start" }}
          onPress={() => void loadExampleData()}
          label={t("Load example threads")}
        />
      </Card>

      {SHOW_TESTING && (
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
        {/* Payments are not wired yet: this stands in for a real purchase. */}
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
      )}

      <H2>{t("Privacy")}</H2>
      <Card>
        <Hint>
          {t(
            "Everything you write is stored on this device. Nothing is sent anywhere unless you send it: cloud backup uploads a copy of everything to your account, and sharing uploads only the threads you pick. Both are your choice, and neither happens on its own.",
          )}
        </Hint>
        <Hint>
          {t(
            "Words you write down to burn stay here. They are never backed up and never shared.",
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
                {signedIn
                  ? t(
                      "Delete all threads, everything integrated, and your whole history? This cannot be undone. Your account is deleted from the server too — cloud backup, uploaded shares, and any subscription go with it.",
                    )
                  : t(
                      "Delete all threads, everything integrated, and your whole history? This cannot be undone.",
                    )}
              </T>
              <Button
                variant="danger"
                onPress={() => void doDeleteEverything()}
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
        <View style={[rowStyles.filterRow, { marginTop: 8 }]}>
          <Button
            onPress={() => void Linking.openURL("https://onecurrentapp.com/privacy")}
            label={t("Privacy policy")}
          />
          <Button
            onPress={() => void Linking.openURL("https://onecurrentapp.com/terms")}
            label={t("Terms of service")}
          />
        </View>
      </Card>

      <ShareWithPsychologist />

      <PaywallPrompt reason={paywall} onClose={() => setPaywall(null)} />
    </>
  );
}
