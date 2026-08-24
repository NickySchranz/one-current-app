import { useState, type ComponentType } from "react";
import { Pressable, View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import { appNow } from "@/domain/time/clock";
import {
  AppTextInput,
  Button,
  Choice,
  Hint,
  Panel,
  Prompt,
  T,
  rowStyles,
  useInTray,
  Tag,
} from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import {
  IconCheck,
  IconFlame,
  IconHandOff,
  IconPath,
  type IconProps,
} from "@/ui/icons";
import { StepFrame, StepTransition } from "./QuickFlow";

type Props = { branchId: string };

type OutcomeId = "resolved" | "own-task" | "moved-past" | "burned";

const OUTCOMES: {
  id: OutcomeId;
  label: string;
  hint: string;
  icon: ComponentType<IconProps>;
  tone?: "danger";
}[] = [
  {
    id: "resolved",
    label: "It is resolved",
    hint: "It can end here and come back with you.",
    icon: IconCheck,
  },
  {
    id: "own-task",
    label: "It has become its own task",
    hint: "It leaves your head and lives where your tasks live.",
    icon: IconHandOff,
  },
  {
    id: "moved-past",
    label: "I have moved past it",
    hint: "It ends here. Nothing needs to come with you.",
    icon: IconPath,
  },
  {
    id: "burned",
    label: "Burn it away",
    hint: "Some worries don't get folded in. They get let go of — completely.",
    icon: IconFlame,
    tone: "danger",
  },
];

type Path = "choice" | "burn" | "own-task";

const WORK_HOMES = ["My task list", "My calendar", "The team board", "Someone else's hands"];

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

  const [path, setPath] = useState<Path>("choice");
  const [stepIndex, setStepIndex] = useState(0);
  const [burnItems, setBurnItems] = useState<string[]>([]);
  const [burnInput, setBurnInput] = useState("");
  const [lesson, setLesson] = useState("");
  const [workHome, setWorkHome] = useState("");
  const [busy, setBusy] = useState(false);

  if (!branch) return null;

  async function choose(id: OutcomeId) {
    if (!branch || busy) return;
    setBusy(true);
    try {
      if (id === "resolved") {
        await startMerge([branchId]);
      } else if (id === "own-task") {
        setPath("own-task");
        setStepIndex(0);
      } else if (id === "burned") {
        setPath("burn");
        setStepIndex(0);
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
    if (busy) return;
    setBusy(true);
    try {
      // The work keeps the thread's own name — no renaming step.
      await addMoment({
        branchId,
        date: appNow().toISOString().slice(0, 10),
        title: t("Became real work: {name}", { name: branch!.title }),
        type: "decision",
        description: workHome ? t("Lives in: {place}", { place: t(workHome) }) : "",
      });
      await handOffBranch(branchId);
    } finally {
      setBusy(false);
    }
  }

  const burnSuggestions = [
    ...(branch.occupies ?? []),
    ...(branch.anxieties ?? []),
  ]
    .filter((x, i, arr) => arr.indexOf(x) === i && !burnItems.includes(x))
    .slice(0, 6);

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

  const back = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
    else setPath("choice");
  };

  if (path === "burn") {
    return (
      <Panel inTray={inTray}>
        <StepTransition stepKey={stepIndex}>
          {stepIndex === 0 && (
            <StepFrame
              title={branch.title}
              prompt={t("What burns with it?")}
              stepIndex={0}
              totalSteps={2}
              onBack={back}
              next={{
                label: t("Next"),
                disabled: burnItems.length === 0,
                onPress: () => setStepIndex(1),
              }}
            >
              <Hint numberOfLines={2}>
                {t("This thread will be gone from the app — completely. No line, no history. Only the lesson stays.")}
              </Hint>
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
            </StepFrame>
          )}
          {stepIndex === 1 && (
            <StepFrame
              title={branch.title}
              prompt={t("The lesson you carry out of the fire")}
              stepIndex={1}
              totalSteps={2}
              onBack={back}
              next={{
                label: t("Strike the match"),
                icon: <IconFlame size={16} color={theme.accentInk} />,
                disabled: burnItems.length === 0 || !lesson.trim() || busy,
                onPress: burn,
              }}
            >
              <AppTextInput
                autoFocus
                value={lesson}
                onChangeText={setLesson}
                placeholder={t("one sentence you'll keep — e.g. I can survive being disliked")}
                onSubmitEditing={burn}
                blurOnSubmit={false}
              />
              <Hint style={{ marginTop: 6, marginBottom: 0 }}>
                {t("The fire takes the weight. You keep this.")}
              </Hint>
            </StepFrame>
          )}
        </StepTransition>
      </Panel>
    );
  }

  if (path === "own-task") {
    // One screen, no typing: the work keeps the thread's name; picking where
    // it lives is a tap and optional.
    return (
      <Panel inTray={inTray}>
        <StepFrame
          title={branch.title}
          prompt={t("Where will it live from now on? (optional)")}
          onBack={back}
          next={{
            label: t("Hand it off"),
            disabled: busy,
            onPress: () => void convert(),
          }}
        >
          <Hint numberOfLines={2}>{t("It becomes real work and leaves your head.")}</Hint>
          <View style={rowStyles.tagRow}>
            {WORK_HOMES.map((h) => (
              <Tag
                key={h}
                label={t(h)}
                pressed={workHome === h}
                onPress={() => setWorkHome(workHome === h ? "" : h)}
              />
            ))}
          </View>
        </StepFrame>
      </Panel>
    );
  }

  return (
    <Panel inTray={inTray}>
      <T style={{ fontSize: 16.8, fontWeight: "600" }}>{branch.title}</T>
      <Prompt style={{ marginTop: 8 }}>{t("What is true about this thread now?")}</Prompt>
      <View style={{ flexDirection: "column", gap: 6.4, marginVertical: 6.4 }}>
        {OUTCOMES.map((o) => (
          <Choice
            key={o.id}
            icon={o.icon}
            tone={o.tone}
            title={t(o.label)}
            hint={t(o.hint)}
            hintLines={1}
            onPress={() => void choose(o.id)}
          />
        ))}
      </View>
      <Button
        variant="quiet"
        label={t("Back")}
        onPress={() => setOperation({ kind: "quick-touch", branchId, expanded: true })}
        style={{ marginTop: 3.2, alignSelf: "flex-start" }}
      />
    </Panel>
  );
}
