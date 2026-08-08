import { useState } from "react";
import { View } from "react-native";
import type { MergeConflict } from "@/domain/conflicts/types";
import type { PsychologicalBranch } from "@/domain/branches/types";
import { CONFLICT_TYPE_LABELS, resolveConflict } from "@/domain/conflicts/logic";
import { useT } from "@/i18n/i18n";
import { TagListEditor } from "@/ui/TagListEditor";
import { AppTextInput, Button, CalmNote, Card, Field, H3, Hint, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";

type Props = {
  conflict: MergeConflict;
  branches: PsychologicalBranch[];
  onResolved: (resolved: MergeConflict) => void;
};

/** Two valid branches demand incompatible actions. Resolve the conflict. */
export function ConflictResolver({ conflict, branches, onResolved }: Props) {
  const t = useT();
  const th = useTheme();
  const [preserved, setPreserved] = useState<string[]>(conflict.preservedTruths);
  const [excesses, setExcesses] = useState<string[]>(conflict.rejectedExcesses);
  const [resolution, setResolution] = useState(conflict.resolution ?? "");
  const involved = branches.filter((b) => conflict.branchIds.includes(b.id));

  const resolved = !!conflict.resolution;

  return (
    <Card
      style={{
        borderLeftWidth: 4,
        borderLeftColor: resolved ? th.accent : th.danger,
        paddingLeft: 13.6,
      }}
    >
      <H3>{t(CONFLICT_TYPE_LABELS[conflict.type])}</H3>
      <Hint>
        {t("Between {names}", { names: involved.map((b) => b.title).join(t(" and ")) })}
      </Hint>
      <View
        style={{
          paddingVertical: 8,
          paddingHorizontal: 11.2,
          borderRadius: th.radius,
          backgroundColor: th.bgSunken,
          marginBottom: 6.4,
        }}
      >
        <T>{conflict.demandA}</T>
      </View>
      <View
        style={{
          paddingVertical: 8,
          paddingHorizontal: 11.2,
          borderRadius: th.radius,
          backgroundColor: th.bgSunken,
          marginBottom: 6.4,
        }}
      >
        <T>{conflict.demandB}</T>
      </View>

      {resolved ? (
        <CalmNote style={{ marginTop: 6.4 }}>
          <T>{t("Resolved: {resolution}", { resolution: conflict.resolution ?? "" })}</T>
        </CalmNote>
      ) : (
        <>
          <TagListEditor
            label={t("What does each thread correctly understand?")}
            values={preserved}
            onChange={setPreserved}
            placeholder={t("A truth worth keeping")}
          />
          <TagListEditor
            label={t("Where is each thread becoming excessive?")}
            values={excesses}
            onChange={setExcesses}
            placeholder={t("A demand that would fragment you")}
          />
          <Field
            label={t(
              "What action respects both truths without letting either thread control the whole present?",
            )}
          >
            <AppTextInput multiline value={resolution} onChangeText={setResolution} />
          </Field>
          <Button
            variant="primary"
            label={t("Resolve the conflict")}
            disabled={!resolution.trim()}
            onPress={() =>
              onResolved(resolveConflict(conflict, resolution.trim(), preserved, excesses))
            }
            style={{ alignSelf: "flex-start" }}
          />
        </>
      )}
    </Card>
  );
}
