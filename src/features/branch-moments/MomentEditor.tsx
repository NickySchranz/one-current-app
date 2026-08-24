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

// A rough anchor is all a moment needs — picked by tap, never typed.
const DAY_CHOICES = [
  { label: "Today", days: 0 },
  { label: "Yesterday", days: 1 },
  { label: "Last week", days: 7 },
  { label: "A month ago", days: 30 },
];

const isoDaysAgo = (days: number) =>
  new Date(appNow().getTime() - days * 86_400_000).toISOString().slice(0, 10);

/** Quick moment capture: what happened, when, what it changed. */
export function MomentEditor({ branchId, onDone }: Props) {
  const t = useT();
  const addMoment = useAppStore((s) => s.addMoment);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(isoDaysAgo(0));
  const [type, setType] = useState<MomentType>("event");
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
      // For "A belief formed", what happened IS the belief — no second field.
      beliefAdded: type === "belief" ? title.trim() : undefined,
      effect,
    });
    setTitle("");
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
        <View style={rowStyles.tagRow} accessibilityRole="radiogroup">
          {DAY_CHOICES.map((d) => (
            <Tag
              key={d.label}
              label={t(d.label)}
              pressed={date === isoDaysAgo(d.days)}
              onPress={() => setDate(isoDaysAgo(d.days))}
            />
          ))}
        </View>
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
