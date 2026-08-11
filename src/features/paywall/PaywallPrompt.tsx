import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { selectEffectivePro, useAppStore } from "@/stores/app-store";
import { api, hasTokens } from "@/api/client";
import {
  FREE_OPEN_THREAD_LIMIT,
  canCreateThread,
  type PaywallReason,
} from "@/domain/entitlements/logic";
import { useT } from "@/i18n/i18n";
import { Button, H2, Hint, rowStyles } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

/** May another thread open right now? Shared by every create/reopen entry point. */
export function useThreadGate(): boolean {
  const branches = useAppStore((s) => s.branches);
  const isPro = useAppStore(selectEffectivePro);
  const draftBranchId = useAppStore((s) => s.draftBranchId);
  return canCreateThread(branches, isPro, draftBranchId);
}

const COPY: Record<PaywallReason, { title: string; body: string }> = {
  themes: {
    title: "This look is part of Pro",
    body: "The five plain looks are always free. The creature themes — where every open thread becomes a small companion — come with One Current Pro.",
  },
  "thread-limit": {
    title: "Ten threads is the free current",
    body: "The free plan holds {n} open threads at a time. Integrate or close one to make room — or let One Current Pro carry as many as your days do.",
  },
  share: {
    title: "Sharing is part of Pro",
    body: "Creating a file for your psychologist comes with One Current Pro. Everything else about your data stays yours, on this device, either way.",
  },
};

/**
 * The upgrade prompt: a small centered sheet over everything, shown when a
 * locked feature is touched. Signed-in accounts go through the (stub)
 * checkout; without a server session the button only announces itself and
 * the testing unlock in Settings stands in.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canUpgrade = hasTokens();

  async function upgrade() {
    setBusy(true);
    setError("");
    try {
      const checkout = await api.checkout();
      if (checkout.mode === "stub") {
        // No Stripe keys on the server yet: the stub completes immediately.
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
          <Hint>{t(copy.body, { n: FREE_OPEN_THREAD_LIMIT })}</Hint>
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
                disabled
                label={t("Upgrade — coming soon")}
                accessibilityLabel={t("Upgrade — coming soon")}
              />
            )}
            <Button onPress={onClose} label={t("Not now")} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
