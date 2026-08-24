import { useState } from "react";
import { Platform, View } from "react-native";
import { selectEffectivePro, useAppStore } from "@/stores/app-store";
import { api, ApiOfflineError, hasTokens } from "@/api/client";
import { db } from "@/db/database";
import { appNow } from "@/domain/time/clock";
import { buildShareExport } from "@/domain/share/build-share-export";
import { PaywallPrompt } from "@/features/paywall/PaywallPrompt";
import { MyShares } from "@/features/settings/MyShares";
import { ThreadPicker } from "@/features/settings/ThreadPicker";
import { useT } from "@/i18n/i18n";
import { AppTextInput, Button, Card, H2, Hint, T, rowStyles } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

const DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(days: number): string {
  return new Date(appNow().getTime() - days * DAY).toISOString().slice(0, 10);
}

type SinceChoice = "week" | "month" | "3months" | "all";

/**
 * Share with a psychologist: pick threads and a start date, get a file
 * holding just that slice — loudness changes, actions, moments,
 * integrations. Nothing leaves the app except the file the user hands over.
 */
export function ShareWithPsychologist() {
  const t = useT();
  const tk = useTheme();
  const branches = useAppStore((s) => s.branches);
  const actions = useAppStore((s) => s.actions);
  const merges = useAppStore((s) => s.merges);
  const draftBranchId = useAppStore((s) => s.draftBranchId);
  const isPro = useAppStore(selectEffectivePro);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [since, setSince] = useState<SinceChoice>("month");
  const [practitionerEmail, setPractitionerEmail] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [paywalled, setPaywalled] = useState(false);
  // Native fallback: no downloads there, so the file shows as copyable text.
  const [shareJson, setShareJson] = useState("");
  // Upload-and-code path (needs a server session).
  const [shareCode, setShareCode] = useState("");
  const [shareCodeErr, setShareCodeErr] = useState("");
  const [uploading, setUploading] = useState(false);

  const candidates = branches.filter((b) => b.id !== draftBranchId && b.title.trim() !== "");

  const from =
    since === "week"
      ? isoDaysAgo(7)
      : since === "month"
        ? isoDaysAgo(30)
        : since === "3months"
          ? isoDaysAgo(90)
          : isoDaysAgo(365 * 50); // "From the beginning" — far enough back for any thread
  const fromValid = true;

  async function createFile() {
    // Waiting containers live only in the database, not in store state.
    const waiting = await db.waiting.toArray();
    const share = buildShareExport({
      branches,
      actions,
      merges,
      waiting,
      selectedIds: [...selected],
      from,
      now: appNow(),
    });
    const json = JSON.stringify(share, null, 2);
    if (Platform.OS === "web") {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `one-current-share-${share.to}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    setShareJson(json);
  }

  async function uploadForCode() {
    const email = practitionerEmail.trim();
    if (email !== "" && !/^\S+@\S+\.\S+$/.test(email)) {
      setEmailErr(t("That doesn't look like an email address."));
      return;
    }
    setEmailErr("");
    setUploading(true);
    setShareCode("");
    setShareCodeErr("");
    try {
      const waiting = await db.waiting.toArray();
      const share = buildShareExport({
        branches,
        actions,
        merges,
        waiting,
        selectedIds: [...selected],
        from,
        now: appNow(),
      });
      const res = await api.createShare(share, email || undefined);
      setShareCode(res.code);
    } catch (e) {
      setShareCodeErr(
        e instanceof ApiOfflineError
          ? t("The server could not be reached.")
          : t("The code could not be created. Try again in a moment."),
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <H2>{t("Share with a psychologist")}</H2>
        {!isPro && (
          <T
            style={{
              fontSize: 10.5,
              lineHeight: 14,
              color: tk.inkSoft,
              borderWidth: 1,
              borderColor: alpha(tk.lineAxis, 0.55),
              borderRadius: 999,
              paddingHorizontal: 6,
              overflow: "hidden",
            }}
          >
            {t("Pro")}
          </T>
        )}
      </View>
      <Card>
        <Hint>
          {t(
            "Choose which threads to share and since when. Only what you pick here leaves the app — as a file you hand over yourself.",
          )}
        </Hint>
        {candidates.length === 0 ? (
          <Hint style={{ marginBottom: 0 }}>
            {t("Nothing to share yet — start a thread first.")}
          </Hint>
        ) : (
          <>
            <ThreadPicker branches={candidates} selected={selected} onChange={setSelected} />
            <View
              accessibilityLabel={t("Since when?")}
              style={[rowStyles.filterRow, { marginTop: 10 }]}
            >
              <Button
                selected={since === "week"}
                onPress={() => setSince("week")}
                label={t("Last week")}
              />
              <Button
                selected={since === "month"}
                onPress={() => setSince("month")}
                label={t("Last month")}
              />
              <Button
                selected={since === "3months"}
                onPress={() => setSince("3months")}
                label={t("Last 3 months")}
              />
              <Button
                selected={since === "all"}
                onPress={() => setSince("all")}
                label={t("From the beginning")}
              />
            </View>
            {hasTokens() && (
              <View style={{ marginTop: 10, gap: 4 }}>
                <AppTextInput
                  value={practitionerEmail}
                  onChangeText={(v) => {
                    setPractitionerEmail(v);
                    if (emailErr) setEmailErr("");
                  }}
                  placeholder="name@example.com"
                  accessibilityLabel={t("Your psychologist's email (optional)")}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={{ maxWidth: 320 }}
                />
                <Hint style={{ marginBottom: 0 }}>
                  {t(
                    "Optional: with their email, the share appears directly in their inbox — and only they can redeem the code.",
                  )}
                </Hint>
                {emailErr !== "" && (
                  <T style={{ color: tk.danger, fontSize: 13.6 }}>{emailErr}</T>
                )}
              </View>
            )}
            <View style={[rowStyles.filterRow, { marginTop: 10 }]}>
              <Button
                variant="primary"
                onPress={isPro ? createFile : () => setPaywalled(true)}
                disabled={selected.size === 0 || !fromValid}
                label={t("Create the file")}
              />
              {hasTokens() && (
                <Button
                  onPress={isPro ? () => void uploadForCode() : () => setPaywalled(true)}
                  disabled={selected.size === 0 || !fromValid || uploading}
                  label={uploading ? t("Uploading…") : t("Upload and get a code")}
                />
              )}
            </View>
            {shareCode !== "" && (
              <View style={{ marginTop: 10, gap: 4 }}>
                <T style={{ fontSize: 21, fontWeight: "700", letterSpacing: 2 }}>
                  {shareCode}
                </T>
                <Hint style={{ marginBottom: 0 }}>
                  {t("Give this code to your psychologist. It works once and expires in 14 days.")}
                </Hint>
              </View>
            )}
            {shareCodeErr !== "" && (
              <T style={{ marginTop: 8, color: tk.danger, fontSize: 13.6 }}>{shareCodeErr}</T>
            )}
            {shareJson !== "" && Platform.OS !== "web" && (
              <AppTextInput
                multiline
                value={shareJson}
                editable={false}
                selectTextOnFocus
                style={{ marginTop: 8, maxHeight: 180 }}
                accessibilityLabel={t("Share file contents")}
              />
            )}
          </>
        )}
      </Card>
      <MyShares refreshKey={shareCode} />
      <PaywallPrompt
        reason={paywalled ? "share" : null}
        onClose={() => setPaywalled(false)}
      />
    </>
  );
}
