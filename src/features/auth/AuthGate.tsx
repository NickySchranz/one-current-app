import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { Logo } from "@/features/navigation/Logo";
import { useT } from "@/i18n/i18n";
import { AppTextInput, Button, Card, H2, Hint, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";

type Screen = "login" | "register" | "forgot";

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * The gate in front of the app: sign in, register, or ask for a password
 * reset. Dummy data for now — any valid-looking credentials are accepted
 * locally and no server is asked; a real backend replaces this later.
 */
export function AuthGate() {
  const t = useT();
  const tk = useTheme();
  const signIn = useAppStore((s) => s.signIn);

  const [screen, setScreen] = useState<Screen>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const go = (next: Screen) => {
    setScreen(next);
    setError("");
    setResetSent(false);
    setPassword("");
  };

  function submitLogin() {
    if (!looksLikeEmail(email)) return setError(t("That does not look like an email address."));
    if (password.length < 4) return setError(t("The password needs at least 4 characters."));
    signIn({ email: email.trim() });
  }

  function submitRegister() {
    if (name.trim() === "") return setError(t("What should we call you?"));
    if (!looksLikeEmail(email)) return setError(t("That does not look like an email address."));
    if (password.length < 4) return setError(t("The password needs at least 4 characters."));
    signIn({ name: name.trim(), email: email.trim() });
  }

  function submitForgot() {
    if (!looksLikeEmail(email)) return setError(t("That does not look like an email address."));
    setError("");
    setResetSent(true);
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
              <Button variant="primary" large onPress={submitLogin} label={t("Sign in")} />
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
              <AppTextInput
                value={name}
                onChangeText={setName}
                placeholder={t("Your name")}
                accessibilityLabel={t("Your name")}
                autoComplete="name"
              />
              {emailField}
              {passwordField}
              {error !== "" && <T style={{ color: tk.danger, fontSize: 13.6 }}>{error}</T>}
              <Button variant="primary" large onPress={submitRegister} label={t("Register")} />
              <Button
                variant="quiet"
                onPress={() => go("login")}
                label={t("I already have an account")}
              />
            </View>
          </Card>
        )}

        {screen === "forgot" && (
          <Card>
            <H2 style={{ marginTop: 0 }}>{t("Forgot your password?")}</H2>
            {resetSent ? (
              <>
                <Hint>
                  {t("If an account exists for {email}, a reset link is on its way.", {
                    email: email.trim(),
                  })}
                </Hint>
                <Button
                  style={{ alignSelf: "flex-start" }}
                  onPress={() => go("login")}
                  label={t("Back to sign in")}
                />
              </>
            ) : (
              <View style={{ gap: 10 }}>
                <Hint style={{ marginBottom: 0 }}>
                  {t("Tell us your email and we will send a link to set a new password.")}
                </Hint>
                {emailField}
                {error !== "" && <T style={{ color: tk.danger, fontSize: 13.6 }}>{error}</T>}
                <Button
                  variant="primary"
                  large
                  onPress={submitForgot}
                  label={t("Send the link")}
                />
                <Button variant="quiet" onPress={() => go("login")} label={t("Back to sign in")} />
              </View>
            )}
          </Card>
        )}

        <Hint style={{ textAlign: "center", marginTop: 4 }}>
          {t("Your threads never leave this device — the account only signs you in.")}
        </Hint>
      </View>
    </ScrollView>
  );
}
