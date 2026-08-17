import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { api, hasTokens, type ShareMeta } from "@/api/client";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import { Button, Card, H2, Hint, T, rowStyles } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";

/**
 * The shares this account has uploaded: date range, thread count, and whether
 * the psychologist already picked them up. Codes are never shown again — the
 * server only keeps a hash — but a share can be revoked here at any time.
 */
export function MyShares({ refreshKey }: { refreshKey?: string }) {
  const t = useT();
  const tk = useTheme();
  const language = useAppStore((s) => s.language);
  const [shares, setShares] = useState<ShareMeta[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await api.listMyShares();
      setShares(res.shares);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasTokens()) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  if (!hasTokens()) return null;

  const locale = language === "en" ? undefined : language;
  const fmt = (iso: string) =>
    new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
    });

  async function revoke(id: string) {
    setBusyId(id);
    try {
      await api.deleteShare(id);
      setShares((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
      setConfirmingId(null);
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  }

  const status = (s: ShareMeta) =>
    s.redeemed
      ? t("Redeemed")
      : new Date().toISOString() > s.expiresAt
        ? t("Expired")
        : t("Expires {date}", { date: fmt(s.expiresAt) });

  return (
    <>
      <H2>{t("Your uploaded shares")}</H2>
      <Card>
        {loading && shares === null ? (
          <ActivityIndicator color={tk.accent} />
        ) : error ? (
          <View style={rowStyles.filterRow}>
            <Hint style={{ marginBottom: 0, flexShrink: 1 }}>
              {t("The server could not be reached.")}
            </Hint>
            <Button onPress={() => void load()} label={t("Try again")} />
          </View>
        ) : !shares || shares.length === 0 ? (
          <Hint style={{ marginBottom: 0 }}>
            {t("No uploaded shares. Codes you create appear here.")}
          </Hint>
        ) : (
          <View style={{ gap: 10 }}>
            {shares.map((s) => (
              <View
                key={s.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 160 }}>
                  <T>
                    {fmt(s.from)} – {fmt(s.to)} ·{" "}
                    {s.threadCount === 1
                      ? t("1 thread")
                      : t("{n} threads", { n: s.threadCount })}
                  </T>
                  <Hint style={{ marginBottom: 0 }}>{status(s)}</Hint>
                </View>
                {confirmingId !== s.id ? (
                  <Button
                    variant="danger"
                    onPress={() => setConfirmingId(s.id)}
                    label={t("Revoke")}
                  />
                ) : (
                  <View style={[rowStyles.filterRow, { flexShrink: 1 }]}>
                    <T style={{ flexShrink: 1, fontSize: 13.6 }}>
                      {t("Revoke this share? The code stops working immediately.")}
                    </T>
                    <Button
                      variant="danger"
                      disabled={busyId === s.id}
                      onPress={() => void revoke(s.id)}
                      label={busyId === s.id ? t("Revoking…") : t("Yes, revoke")}
                    />
                    <Button onPress={() => setConfirmingId(null)} label={t("Keep it")} />
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </Card>
    </>
  );
}
