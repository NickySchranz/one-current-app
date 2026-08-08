import { useState } from "react";
import { View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import { Button, CalmNote, H1, Hint, Panel, T, rowStyles, useInTray } from "@/ui/primitives";

type Props = { branchId: string };

/** Some threads are best carried with another person. Focused and quiet. */
export function SupportPanel({ branchId }: Props) {
  const branch = useAppStore((s) => s.branches.find((b) => b.id === branchId));
  const updateBranch = useAppStore((s) => s.updateBranch);
  const setOperation = useAppStore((s) => s.setOperation);
  const [saved, setSaved] = useState(branch?.status === "needs-support");
  const t = useT();
  const inTray = useInTray();

  if (!branch) return null;

  return (
    <Panel inTray={inTray}>
      <H1>{branch.title}</H1>
      <CalmNote style={{ marginBottom: 12 }}>
        <T>
          {t(
            "Some threads are too heavy to carry alone, and that is not a failure of yours. Carrying it with another person is a real way forward — a friend, someone you trust, or a professional.",
          )}
        </T>
      </CalmNote>
      <Hint>
        {t(
          "The thread stays on your timeline, marked as carried with support. Nothing about it is asked of you here.",
        )}
      </Hint>
      {!saved ? (
        <Button
          variant="primary"
          label={t("Mark it as carried with support")}
          onPress={() => {
            void updateBranch(branchId, { status: "needs-support" }).then(() => setSaved(true));
          }}
          style={{ alignSelf: "flex-start" }}
        />
      ) : (
        <View accessibilityLiveRegion="polite">
          <CalmNote>
            <T>
              {t(
                "Marked. You selected support for this thread — it will hold that shape on the timeline.",
              )}
            </T>
          </CalmNote>
        </View>
      )}
      <View style={rowStyles.stageNav}>
        <Button
          variant="quiet"
          label={t("Return to timeline")}
          onPress={() => setOperation({ kind: "idle" })}
        />
      </View>
    </Panel>
  );
}
