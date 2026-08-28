import { Platform, ScrollView, Text } from "react-native";
import { SettingsSections } from "@/features/settings/SettingsPage";
import { useT } from "@/i18n/i18n";
import { Card, H1, H2, Hint, Panel } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";

/** Everything that is not working (Now) or reviewing (History). */
export function MorePage() {
  const t = useT();
  const tokens = useTheme();
  return (
    <ScrollView>
      <Panel>
        <H1>{t("More")}</H1>
        <SettingsSections />
        <H2>{t("About")}</H2>
        <Card>
          <Hint style={{ marginBottom: 0 }}>
            {Platform.OS === "web" ? (
              <Text
                accessibilityRole="link"
                style={{ color: tokens.accent, textDecorationLine: "underline" }}
                onPress={() => {
                  window.open("https://onecurrentapp.com/", "_blank");
                }}
              >
                {t("What One Current is, and how it works")}
              </Text>
            ) : (
              t("What One Current is, and how it works")
            )}
          </Hint>
        </Card>
      </Panel>
    </ScrollView>
  );
}
