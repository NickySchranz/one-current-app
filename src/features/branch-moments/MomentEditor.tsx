import { useState } from "react";
import { View } from "react-native";
import type { MomentType } from "@/domain/moments/types";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import { appNow } from "@/domain/time/clock";
import { AppTextInput, Button, Card, Field, H3, Tag, rowStyles } from "@/ui/primitives";

const MOMENT_TYPES: { id: MomentType; label: string }[] = [
  { id: "event", label: "Something happened" },
  { id: "belief", label: "A belief formed" },
  { id: "decision", label: "A decision" },
  { id: "action", label: "An action taken" },
  { id: "setback", label: "A setback" },
  { id: "insight", label: "An insight" },
  { id: "intensification", label: "It grew stronger" },
  { id: "relief", label: "A period of relief" },
];

type Props = { branchId: string; onDone?: () => void };

/** Quick moment capture: what happened, when, what it changed. */
export function MomentEditor({ branchId, onDone }: Props) {
  const t = useT();
  const addMoment = useAppStore((s) => s.addMoment);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(appNow().toISOString().slice(0, 10));
  const [type, setType] = useState<MomentType>("event");
  const [belief, setBelief] = useState("");
  const [effect, setEffect] = useState<"stronger" | "lighter" | "different" | undefined>();
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim() || busy) return;
    setBusy(true);
    await addMoment({
      branchId,
      title,
      date,
      type,
      beliefAdded: belief.trim() || undefined,
      effect,
    });
    setTitle("");
    setBelief("");
    setEffect(undefined);
    setBusy(false);
    onDone?.();
  }

  return (
    <Card sunken>
      <H3>{t("Add a moment")}</H3>
      <Field label={t("What happened here?")}>
        <AppTextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t("A conversation, setback, decision, reassurance…")}
        />
      </Field>
      <Field label={t("When?")}>
        <AppTextInput
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          accessibilityLabel={t("When?")}
        />
      </Field>
      <Field label={t("What kind of moment?")}>
        <View style={rowStyles.tagRow} accessibilityRole="radiogroup">
          {MOMENT_TYPES.map((mt) => (
            <Tag
              key={mt.id}
              label={t(mt.label)}
              quality={type === mt.id}
              pressed={type === mt.id}
              onPress={() => setType(mt.id)}
            />
          ))}
        </View>
      </Field>
      <Field label={t("What did you begin believing after this? (optional)")}>
        <AppTextInput value={belief} onChangeText={setBelief} />
      </Field>
      <Field label={t("Did this make the thread stronger, lighter, or simply different?")}>
        <View style={rowStyles.tagRow} accessibilityRole="radiogroup">
          {(["stronger", "lighter", "different"] as const).map((eff) => (
            <Tag
              key={eff}
              label={t(eff)}
              quality={effect === eff}
              pressed={effect === eff}
              onPress={() => setEffect(effect === eff ? undefined : eff)}
            />
          ))}
        </View>
      </Field>
      <Button
        variant="primary"
        label={t("Add moment")}
        disabled={!title.trim() || busy}
        onPress={() => void save()}
        style={{ alignSelf: "flex-start" }}
      />
    </Card>
  );
}
