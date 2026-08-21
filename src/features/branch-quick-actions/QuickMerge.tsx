import { useState } from "react";
import { Pressable, View, type PressableStateCallbackType } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import { appNow } from "@/domain/time/clock";
import {
  AppTextInput,
  Button,
  Field,
  Hint,
  Panel,
  Prompt,
  T,
  rowStyles,
  useInTray,
  Tag,
} from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

type PressState = PressableStateCallbackType & { hovered?: boolean };

type Props = { branchId: string };

type OutcomeId = "resolved" | "own-task" | "moved-past" | "burned";

const OUTCOMES: { id: OutcomeId; label: string; hint: string }[] = [
  { id: "resolved", label: "It is resolved", hint: "It can end here and come back with you." },
  {
    id: "own-task",
    label: "It has become its own task",
    hint: "It leaves your head and lives where your tasks live.",
  },
  {
    id: "moved-past",
    label: "I have moved past it",
    hint: "It ends here. Nothing needs to come with you.",
  },
  {
    id: "burned",
    label: "Burn it away",
    hint: "Some worries don't get folded in. They get let go of — completely.",
  },
];

/** Bringing back is an ending: resolved, handed off as real work, or moved past. */
export function QuickMerge({ branchId }: Props) {
  const branch = useAppStore((s) => s.branches.find((b) => b.id === branchId));
  const startMerge = useAppStore((s) => s.startMerge);
  const completeMerge = useAppStore((s) => s.completeMerge);
  const addMoment = useAppStore((s) => s.addMoment);
  const handOffBranch = useAppStore((s) => s.handOffBranch);
  const setOperation = useAppStore((s) => s.setOperation);
  const burnBranch = useAppStore((s) => s.burnBranch);
  const t = useT();
  const theme = useTheme();
  const inTray = useInTray();

  const [converting, setConverting] = useState(false);
  const [burning, setBurning] = useState(false);
  const [burnItems, setBurnItems] = useState<string[]>([]);
  const [burnInput, setBurnInput] = useState("");
  const [farewell, setFarewell] = useState("");
  const [lesson, setLesson] = useState("");
  const [workName, setWorkName] = useState(branch?.title ?? "");
  const [workHome, setWorkHome] = useState("");
  const [firstTask, setFirstTask] = useState("");
  const [busy, setBusy] = useState(false);

  if (!branch) return null;

  async function choose(id: OutcomeId) {
    if (!branch || busy) return;
    setBusy(true);
    try {
      if (id === "resolved") {
        await startMerge([branchId]);
      } else if (id === "own-task") {
        setConverting(true);
      } else if (id === "burned") {
        setBurning(true);
      } else {
        // Moved past it: the line rejoins Now carrying nothing.
        await completeMerge({
          branches: [branch],
          preserveRelease: { stillValid: [], outdated: [], outsideControl: [], reclaimable: [] },
          conflicts: [],
          resolution: t("Moved past it"),
          released: branch.occupies ?? [],
          resultStatus: "merged",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    if (!workName.trim() || busy) return;
    setBusy(true);
    try {
      await addMoment({
        branchId,
        date: appNow().toISOString().slice(0, 10),
        title: t("Became real work: {name}", { name: workName.trim() }),
        type: "decision",
        description: [
          workHome.trim() && t("Lives in: {place}", { place: workHome.trim() }),
          firstTask.trim() && t("First task: {task}", { task: firstTask.trim() }),
        ]
          .filter(Boolean)
          .join(" · "),
      });
      await handOffBranch(branchId);
    } finally {
      setBusy(false);
    }
  }

  const burnSuggestions = [
    ...(branch.occupies ?? []),
    ...(branch.anxieties ?? []),
  ].filter((x, i, arr) => arr.indexOf(x) === i && !burnItems.includes(x));

  const addBurnItem = (raw: string) => {
    const item = raw.trim();
    if (!item || burnItems.includes(item)) return;
    setBurnItems([...burnItems, item]);
    setBurnInput("");
  };

  function burn() {
    if (busy || burnItems.length === 0 || !lesson.trim()) return;
    burnBranch(branchId, burnItems, lesson.trim());
  }

  if (burning) {
    return (
      <Panel inTray={inTray}>
        <T style={{ fontSize: 16.8, fontWeight: "600" }}>{branch.title}</T>
        <Prompt>{t("Write down what burns with it. The fire keeps nothing.")}</Prompt>
        <Hint>
          {t("This thread will be gone from the app — completely. No line, no history. Only the lesson stays.")}
        </Hint>
        <Field label={t("What burns with it")}>
          {burnSuggestions.length > 0 && (
            <View style={[rowStyles.tagRow, { marginBottom: 6 }]}>
              {burnSuggestions.map((sug) => (
                <Pressable
                  key={sug}
                  accessibilityRole="button"
                  accessibilityLabel={t("Burn {item}", { item: sug })}
                  onPress={() => addBurnItem(sug)}
                >
                  <Tag label={sug} quality />
                </Pressable>
              ))}
            </View>
          )}
          <AppTextInput
            value={burnInput}
            onChangeText={setBurnInput}
            placeholder={t("a fear, a story, a should…")}
            onSubmitEditing={() => addBurnItem(burnInput)}
            blurOnSubmit={false}
          />
          {burnInput.trim().length > 0 && (
            <Button
              variant="quiet"
              label={t("Add to the fire")}
              onPress={() => addBurnItem(burnInput)}
            />
          )}
          {burnItems.length > 0 && (
            <View style={[rowStyles.tagRow, { marginTop: 6 }]}>
              {burnItems.map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityLabel={t("Take {item} back out", { item })}
                  onPress={() => setBurnItems(burnItems.filter((x) => x !== item))}
                >
                  <View style={{ opacity: 0.9 }}>
                    <Tag label={`✕ ${item}`} quality />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </Field>
        <Field label={t("The lesson you carry out of the fire")}>
          <AppTextInput
            value={lesson}
            onChangeText={setLesson}
            placeholder={t("one sentence you'll keep — e.g. I can survive being disliked")}
          />
          <Hint>{t("The fire takes the weight. You keep this.")}</Hint>
        </Field>
        <Field label={t("A last word to it (optional)")}>
          <AppTextInput
            value={farewell}
            onChangeText={setFarewell}
            placeholder={t("you kept me safe once. not anymore.")}
          />
          <Hint>{t("Spoken to the fire — kept nowhere.")}</Hint>
        </Field>
        <View style={rowStyles.stageNav}>
          <Button variant="quiet" label={t("Back")} onPress={() => setBurning(false)} />
          <Button
            variant="primary"
            label={t("Strike the match")}
            disabled={burnItems.length === 0 || !lesson.trim() || busy}
            onPress={burn}
          />
        </View>
      </Panel>
    );
  }

  if (converting) {
    return (
      <Panel inTray={inTray}>
        <T style={{ fontSize: 16.8, fontWeight: "600" }}>{branch.title}</T>
        <Prompt>{t("It becomes real work and leaves your head.")}</Prompt>
        <Field label={t("What is the work called?")}>
          <AppTextInput value={workName} onChangeText={setWorkName} />
        </Field>
        <Field label={t("Where will it live from now on?")}>
          <AppTextInput
            value={workHome}
            onChangeText={setWorkHome}
            placeholder={t("e.g. my task list, the team board")}
          />
        </Field>
        <Field label={t("What is the first concrete task?")}>
          <AppTextInput value={firstTask} onChangeText={setFirstTask} />
        </Field>
        <View style={rowStyles.stageNav}>
          <Button variant="quiet" label={t("Back")} onPress={() => setConverting(false)} />
          <Button
            variant="primary"
            label={t("Hand it off")}
            disabled={!workName.trim() || busy}
            onPress={() => void convert()}
          />
        </View>
      </Panel>
    );
  }

  return (
    <Panel inTray={inTray}>
      <T style={{ fontSize: 16.8, fontWeight: "600" }}>{branch.title}</T>
      <Prompt>{t("What is true about this thread now?")}</Prompt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6.4, marginVertical: 6.4 }}>
        {OUTCOMES.map((o) => (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            onPress={() => void choose(o.id)}
            style={(s) => ({
              width: "48%",
              flexGrow: 1,
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 2.4,
              paddingVertical: 8,
              paddingHorizontal: 10.4,
              borderWidth: 1,
              borderColor: (s as PressState).hovered
                ? theme.lineAxis
                : alpha(theme.lineAxis, 0.55),
              borderRadius: theme.radius,
              backgroundColor: theme.bgRaised,
            })}
          >
            <T style={{ fontWeight: "600" }}>{t(o.label)}</T>
            <Hint style={{ marginBottom: 0, fontSize: 12.8, lineHeight: 18 }}>{t(o.hint)}</Hint>
          </Pressable>
        ))}
      </View>
      <Button
        variant="quiet"
        label={t("Back")}
        onPress={() => setOperation({ kind: "quick-touch", branchId })}
        style={{ marginTop: 3.2, alignSelf: "flex-start" }}
      />
    </Panel>
  );
}
