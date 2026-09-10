import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { selectEffectivePro, useAppStore } from "@/stores/app-store";
import { api, hasTokens } from "@/api/client";
import type { PaywallReason } from "@/domain/entitlements/logic";
import { SHOW_TESTING } from "@/config/flags";
import { useT } from "@/i18n/i18n";
import { Button, H2, Hint, rowStyles } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

/** Does this account have the long view — the curves, the trend, the totals? */
export function useDepthGate(): boolean {
  return useAppStore(selectEffectivePro);
}

const COPY: Record<PaywallReason, { title: string; body: string }> = {
  themes: {
    title: "This look is part of Pro",
    body: "The five plain looks are always free. The living themes — where the timeline itself comes alive — come with One Current Pro.",
  },
  depth: {
    title: "Pro keeps the long view",
    body: "How each thread has moved, how your fortnight has gone, and everything you have closed. The threads themselves, and every answer you give them, are free and always will be.",
  },
  share: {
    title: "Sharing is part of Pro",
    body: "Creating a file for your psychologist comes with One Current Pro. Everything else about your data stays yours, on this device, either way.",
  },
};

type Period = "monthly" | "biannual" | "annual";

const PERIODS: { id: Period; label: string; price: string }[] = [
  { id: "monthly", label: "Monthly", price: "€6 / month" },
  { id: "biannual", label: "6 months", price: "€30 — €5 / month" },
  { id: "annual", label: "Yearly", price: "€48 — €4 / month" },
];

/**
 * The upgrade prompt: a small centered sheet over everything, shown when a
 * locked feature is touched. Signed-in accounts pick a billing period and go
 * through checkout; a device-only session is offered the way back to the
 * sign-in screen, since upgrading needs an account the server knows.
 */
export function PaywallPrompt({
  reason,
  onClose,
}: {
  reason: PaywallReason | null;
  onClose: () => void;
}) {
  const t = useT();
  const tk = useTheme();
  const syncMe = useAppStore((s) => s.syncMe);
  const setShowAuth = useAppStore((s) => s.setShowAuth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("monthly");
  const canUpgrade = hasTokens();

  async function upgrade() {
    setBusy(true);
    setError("");
    try {
      const checkout = await api.checkout(period);
      if (checkout.mode === "stub") {
        // The stub grants Pro with no money changing hands. It exists so the
        // flow can be exercised before Stripe is armed, and the server already
        // 404s the dev endpoint in production — but the client must not depend
        // on that. A real build refuses to walk this path at all, so a
        // misconfigured server can never hand out a subscription nobody paid
        // for.
        if (!SHOW_TESTING) {
          setError(t("Payment is not available right now. Nothing has been charged."));
          return;
        }
        await api.completeStubCheckout(checkout.sessionId);
      } else if (typeof window !== "undefined") {
        window.location.assign(checkout.url);
        return;
      }
      await syncMe();
      onClose();
    } catch {
      setError(t("The upgrade did not go through. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  if (!reason) return null;
  const copy = COPY[reason];
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel={t("Close")}
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: alpha(tk.bg, 0.35),
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        {/* Stop backdrop presses from passing through the card. */}
        <Pressable
          accessibilityViewIsModal
          onPress={() => undefined}
          style={{
            width: "100%",
            maxWidth: 420,
            backgroundColor: tk.bgRaised,
            borderWidth: 1,
            borderColor: alpha(tk.lineAxis, 0.55),
            borderRadius: tk.radiusLg,
            paddingVertical: 16,
            paddingHorizontal: 17.5,
            cursor: "auto",
          }}
        >
          <H2 style={{ marginTop: 0 }}>{t(copy.title)}</H2>
          <Hint>{t(copy.body)}</Hint>
          {canUpgrade && (
            <View accessibilityLabel={t("Billing period")} style={rowStyles.filterRow}>
              {PERIODS.map((p) => (
                <Button
                  key={p.id}
                  selected={period === p.id}
                  onPress={() => setPeriod(p.id)}
                  label={`${t(p.label)} · ${t(p.price)}`}
                />
              ))}
            </View>
          )}
          {canUpgrade && (
            <Hint>
              {t(
                "Renews automatically at the same price each period until you cancel. Cancel any time from Settings → Account; you keep Pro until the period you have paid for ends.",
              )}
            </Hint>
          )}
          {!canUpgrade && (
            <Hint>
              {t(
                "Upgrading needs an account the server knows. Sign in or create one while online — everything you already have stays exactly where it is.",
              )}
            </Hint>
          )}
          {error !== "" && <Hint style={{ color: tk.danger }}>{error}</Hint>}
          <View style={rowStyles.filterRow}>
            {canUpgrade ? (
              <Button
                variant="primary"
                disabled={busy}
                onPress={() => void upgrade()}
                label={busy ? t("Upgrading…") : t("Upgrade to Pro")}
              />
            ) : (
              <Button
                variant="primary"
                onPress={() => {
                  // Opens sign-in. It used to call signOut(), which was the
                  // only route to the gate when the gate was a wall — for
                  // someone with no account that is a destructive no-op.
                  onClose();
                  setShowAuth(true);
                }}
                label={t("Sign in to upgrade")}
              />
            )}
            <Button onPress={onClose} label={t("Not now")} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
