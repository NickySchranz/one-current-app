import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { api, ApiHttpError, ApiOfflineError } from "@/api/client";
import { Logo } from "@/features/navigation/Logo";
import { useT } from "@/i18n/i18n";
import { AppTextInput, Button, Card, H2, Hint, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";

type Screen = "login" | "register" | "forgot" | "verify";

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * The gate in front of the app: sign in, register, or ask for a password
 * reset. The API is asked first; when it cannot be reached the app falls
 * back to a device-only session so it keeps working offline. A wrong
 * password is a real error — never a fallback.
 */
export function AuthGate() {
  const t = useT();
  const tk = useTheme();
  const signIn = useAppStore((s) => s.signIn);
  const signInApi = useAppStore((s) => s.signInApi);
  const registerApi = useAppStore((s) => s.registerApi);
  const verifyEmailApi = useAppStore((s) => s.verifyEmailApi);

  const [screen, setScreen] = useState<Screen>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // Verification: the emailed code, plus resend feedback.
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);
  // When the server has no email provider it hands the code back directly.
  const [devCode, setDevCode] = useState("");
  // Password reset: the emailed code and the replacement password.
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetDone, setResetDone] = useState(false);

  const go = (next: Screen) => {
    setScreen(next);
    setError("");
    setResetSent(false);
    setResetDone(false);
    setResetToken("");
    setNewPassword("");
    setCode("");
    setResent(false);
    setDevCode("");
    setPassword("");
  };

  async function submitLogin() {
    if (!looksLikeEmail(email)) return setError(t("That does not look like an email address."));
    if (password.length < 4) return setError(t("The password needs at least 4 characters."));
    setBusy(true);
    setError("");
    try {
      await signInApi(email.trim(), password);
    } catch (e) {
      if (e instanceof ApiOfflineError) {
        // The server is unreachable: the app still opens, on this device only.
        signIn({ email: email.trim() });
      } else if (e instanceof ApiHttpError && e.code === "email_unverified") {
        go("verify");
      } else if (e instanceof ApiHttpError && e.code === "rate_limited") {
        setError(t("Too many attempts. Wait a moment and try again."));
      } else {
        setError(t("That email and password do not match."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister() {
    if (!looksLikeEmail(email)) return setError(t("That does not look like an email address."));
    if (password.length < 4) return setError(t("The password needs at least 4 characters."));
    // No name field to type: the part before the @ stands in, and the
    // account page shows it alongside the full address anyway.
    const name = email.trim().split("@")[0];
    setBusy(true);
    setError("");
    try {
      const dev = await registerApi(email.trim(), password, name);
      go("verify");
      if (dev) setDevCode(dev);
    } catch (e) {
      if (e instanceof ApiOfflineError) {
        signIn({ name, email: email.trim() });
      } else if (e instanceof ApiHttpError && e.code === "email_taken") {
        setError(t("An account with that email already exists."));
      } else if (e instanceof ApiHttpError && e.code === "rate_limited") {
        setError(t("Too many attempts. Wait a moment and try again."));
      } else {
        setError(t("The account could not be created."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot() {
    if (!looksLikeEmail(email)) return setError(t("That does not look like an email address."));
    setError("");
    setBusy(true);
    try {
      const res = await api.forgotPassword(email.trim());
      if (res.devCode) setDevCode(res.devCode);
    } catch {
      // Enumeration-safe on the server; offline shows the same calm answer.
    } finally {
      setBusy(false);
      setResetSent(true);
    }
  }

  async function submitVerify() {
    if (code.trim() === "") return setError(t("Paste the code from the email first."));
    setBusy(true);
    setError("");
    try {
      await verifyEmailApi(email.trim(), code.trim());
      // authUser is set now — the gate unmounts by itself.
    } catch (e) {
      if (e instanceof ApiOfflineError) {
        setError(t("The server could not be reached."));
      } else if (e instanceof ApiHttpError && e.code === "rate_limited") {
        setError(t("Too many attempts. Wait a moment and try again."));
      } else {
        setError(t("That code is not valid — request a new one and try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setError("");
    setResent(false);
    try {
      const res = await api.resendVerification(email.trim());
      if (res.devCode) setDevCode(res.devCode);
    } catch {
      // Enumeration-safe on the server; offline shows the same calm answer.
    } finally {
      setResent(true);
    }
  }

  async function submitReset() {
    if (resetToken.trim() === "") return setError(t("Paste the code from the email first."));
    if (newPassword.length < 4) return setError(t("The password needs at least 4 characters."));
    setBusy(true);
    setError("");
    try {
      await api.resetPassword(resetToken.trim(), newPassword);
      setResetDone(true);
    } catch (e) {
      if (e instanceof ApiOfflineError) {
        setError(t("The server could not be reached."));
      } else if (e instanceof ApiHttpError && e.code === "rate_limited") {
        setError(t("Too many attempts. Wait a moment and try again."));
      } else {
        setError(t("That reset code is not valid any more — request a new one."));
      }
    } finally {
      setBusy(false);
    }
  }

  const emailField = (
    <AppTextInput
      value={email}
      onChangeText={setEmail}
      placeholder={t("Email")}
      accessibilityLabel={t("Email")}
      autoCapitalize="none"
      autoComplete="email"
      keyboardType="email-address"
    />
  );
  const passwordField = (
    <AppTextInput
      value={password}
      onChangeText={setPassword}
      placeholder={t("Password")}
      accessibilityLabel={t("Password")}
      secureTextEntry
      autoCapitalize="none"
    />
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <View style={{ width: "100%", maxWidth: 420 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Logo />
          <T style={{ fontSize: 16.8, fontWeight: "600", letterSpacing: 0.17 }}>
            One Current
          </T>
        </View>

        {screen === "login" && (
          <Card>
            <H2 style={{ marginTop: 0 }}>{t("Welcome back")}</H2>
            <View style={{ gap: 10 }}>
              {emailField}
              {passwordField}
              {error !== "" && <T style={{ color: tk.danger, fontSize: 13.6 }}>{error}</T>}
              <Button
                variant="primary"
                large
                disabled={busy}
                onPress={() => void submitLogin()}
                label={busy ? t("Signing in…") : t("Sign in")}
              />
              <Button
                variant="quiet"
                onPress={() => go("forgot")}
                label={t("Forgot your password?")}
              />
            </View>
            <Hint style={{ marginTop: 12, marginBottom: 0 }}>{t("New here?")}</Hint>
            <Button
              style={{ alignSelf: "flex-start", marginTop: 6 }}
              onPress={() => go("register")}
              label={t("Create an account")}
            />
          </Card>
        )}

        {screen === "register" && (
          <Card>
            <H2 style={{ marginTop: 0 }}>{t("Create an account")}</H2>
            <View style={{ gap: 10 }}>
              {emailField}
              {passwordField}
              {error !== "" && <T style={{ color: tk.danger, fontSize: 13.6 }}>{error}</T>}
              <Button
                variant="primary"
                large
                disabled={busy}
                onPress={() => void submitRegister()}
                label={busy ? t("One moment…") : t("Register")}
              />
              <Button
                variant="quiet"
                onPress={() => go("login")}
                label={t("I already have an account")}
              />
            </View>
          </Card>
        )}

        {screen === "verify" && (
          <Card>
            <H2 style={{ marginTop: 0 }}>{t("Check your email")}</H2>
            <View style={{ gap: 10 }}>
              <Hint style={{ marginBottom: 0 }}>
                {t("We sent a code to {email}. Paste it here to finish signing up.", {
                  email: email.trim(),
                })}
              </Hint>
              {devCode !== "" && (
                <Hint style={{ marginBottom: 0 }}>
                  {t("Email delivery is not set up yet — use this code: {code}", {
                    code: devCode,
                  })}
                </Hint>
              )}
              <AppTextInput
                value={code}
                onChangeText={setCode}
                placeholder={t("Verification code")}
                accessibilityLabel={t("Verification code")}
                autoCapitalize="characters"
                autoComplete="one-time-code"
              />
              {error !== "" && <T style={{ color: tk.danger, fontSize: 13.6 }}>{error}</T>}
              {resent && <Hint style={{ marginBottom: 0 }}>{t("A new code is on its way.")}</Hint>}
              <Button
                variant="primary"
                large
                disabled={busy}
                onPress={() => void submitVerify()}
                label={busy ? t("One moment…") : t("Verify")}
              />
              <Button variant="quiet" onPress={() => void resendCode()} label={t("Resend the code")} />
              <Button variant="quiet" onPress={() => go("login")} label={t("Back to sign in")} />
            </View>
          </Card>
        )}

        {screen === "forgot" && (
          <Card>
            <H2 style={{ marginTop: 0 }}>{t("Forgot your password?")}</H2>
            {resetDone ? (
              <>
                <Hint>{t("Your password is updated — sign in with it now.")}</Hint>
                <Button
                  style={{ alignSelf: "flex-start" }}
                  onPress={() => go("login")}
                  label={t("Back to sign in")}
                />
              </>
            ) : resetSent ? (
              <View style={{ gap: 10 }}>
                <Hint style={{ marginBottom: 0 }}>
                  {t("If an account exists for {email}, a code is on its way. Paste it here with a new password.", {
                    email: email.trim(),
                  })}
                </Hint>
                {devCode !== "" && (
                  <Hint style={{ marginBottom: 0 }}>
                    {t("Email delivery is not set up yet — use this code: {code}", {
                      code: devCode,
                    })}
                  </Hint>
                )}
                <AppTextInput
                  value={resetToken}
                  onChangeText={setResetToken}
                  placeholder={t("Code from the email")}
                  accessibilityLabel={t("Code from the email")}
                  autoCapitalize="none"
                  autoComplete="one-time-code"
                />
                <AppTextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder={t("New password")}
                  accessibilityLabel={t("New password")}
                  secureTextEntry
                  autoCapitalize="none"
                />
                {error !== "" && <T style={{ color: tk.danger, fontSize: 13.6 }}>{error}</T>}
                <Button
                  variant="primary"
                  large
                  disabled={busy}
                  onPress={() => void submitReset()}
                  label={busy ? t("One moment…") : t("Set the new password")}
                />
                <Button variant="quiet" onPress={() => go("login")} label={t("Back to sign in")} />
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <Hint style={{ marginBottom: 0 }}>
                  {t("Tell us your email and we will send a code to set a new password.")}
                </Hint>
                {emailField}
                {error !== "" && <T style={{ color: tk.danger, fontSize: 13.6 }}>{error}</T>}
                <Button
                  variant="primary"
                  large
                  disabled={busy}
                  onPress={() => void submitForgot()}
                  label={t("Send the code")}
                />
                <Button variant="quiet" onPress={() => go("login")} label={t("Back to sign in")} />
              </View>
            )}
          </Card>
        )}

        <Hint style={{ textAlign: "center", marginTop: 4 }}>
          {t(
            "Signing in does not send your threads anywhere. They stay on this device until you choose to back them up or share them.",
          )}
        </Hint>
      </View>
    </ScrollView>
  );
}
