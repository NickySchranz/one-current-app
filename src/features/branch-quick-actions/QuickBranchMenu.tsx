import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { useAppStore } from "@/stores/app-store";
import { useT } from "@/i18n/i18n";
import { effectiveLoudness, isClosed } from "@/domain/branches/logic";
import { decidedToday } from "@/domain/feelings/logic";
import type { Loudness } from "@/domain/branches/types";
import { appNow } from "@/domain/time/clock";
import { PaywallPrompt, useThreadGate } from "@/features/paywall/PaywallPrompt";
import {
  Button,
  CalmNote,
  Choice,
  Hint,
  Panel,
  Prompt,
  T,
  rowStyles,
  useInTray,
} from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";
import { LoudnessSlider, loudnessWord } from "@/ui/LoudnessSlider";
import {
  IconEye,
  IconHeart,
  IconMerge,
  IconNote,
  IconSetDown,
  IconStep,
  type IconProps,
} from "@/ui/icons";

type PressState = PressableStateCallbackType & { hovered?: boolean };

type Props = { branchId: string; startExpanded?: boolean; dialOnly?: boolean };

const ACTIONS: {
  key: string;
  kind: "quick-act" | "quick-merge" | "quick-note";
  label: string;
  hint: string;
  icon: ComponentType<IconProps>;
}[] = [
  { key: "a", kind: "quick-act", label: "Act", hint: "Take one small step.", icon: IconStep },
  {
    key: "m",
    kind: "quick-merge",
    label: "Integrate",
    hint: "Fold what it gave you back into your one line.",
    icon: IconMerge,
  },
  {
    key: "t",
    kind: "quick-note",
    label: "Note",
    hint: "Add what just happened.",
    icon: IconNote,
  },
];

function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target;
  return (
    typeof HTMLElement !== "undefined" &&
    t instanceof HTMLElement &&
    (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
  );
}

/** The sheet's title line (.touch-sheet-title). */
function SheetTitle({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <T style={{ fontSize: 16.8, fontWeight: "600" }}>{title}</T>
    </View>
  );
}

/** One question at the endpoint: what does this thread need from you now? */
export function QuickBranchMenu({ branchId, startExpanded = false, dialOnly = false }: Props) {
  const branch = useAppStore((s) => s.branches.find((b) => b.id === branchId));
  const setOperation = useAppStore((s) => s.setOperation);
  const reopenBranch = useAppStore((s) => s.reopenBranch);
  const easeBranch = useAppStore((s) => s.easeBranch);
  const dialLoudness = useAppStore((s) => s.dialLoudness);
  const [eased, setEased] = useState(false);
  // Reopening counts against the free open-thread limit like creating does.
  const canOpenThread = useThreadGate();
  const [paywalled, setPaywalled] = useState(false);
  // The sheet opens as a peek: the thread's name and its loudness dial only.
  // Pulling it up (or tapping the question) reveals the decisions. Coming
  // Back from a sub-panel reopens straight onto them.
  const [expanded, setExpanded] = useState(startExpanded);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const t = useT();
  const theme = useTheme();
  const inTray = useInTray();

  // Leaving the line for today: its label and actions step off the timeline
  // until tomorrow — a decision, mutually exclusive with a planned action.
  const leaveForToday = () =>
    void easeBranch(branchId, { leftOn: appNow().toISOString().slice(0, 10) }).then(() =>
      setEased(true),
    );

  // A / M / T / C / U choose directly while the menu is up — never while typing.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const action = ACTIONS.find((a) => a.key === k);
      if (action) {
        e.preventDefault();
        setOperation({ kind: action.kind, branchId });
      } else if (k === "c") {
        e.preventDefault();
        leaveForToday();
      } else if (k === "u") {
        e.preventDefault();
        setOperation({ kind: "understanding", branchId });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [branchId, setOperation, easeBranch]);

  if (!branch) return null;

  if (eased) {
    return (
      <Panel inTray={inTray}>
        <SheetTitle title={branch.title} />
        <CalmNote style={{ marginVertical: 8 }}>
          <T>
            {t(
              "You let it rest — that's a real answer. Its loudness eases; the line simply waits until something changes.",
            )}
          </T>
        </CalmNote>
        <Button
          variant="primary"
          label={t("Return to timeline")}
          onPress={() => setOperation({ kind: "idle" })}
          style={{ alignSelf: "flex-start" }}
        />
      </Panel>
    );
  }

  if (isClosed(branch)) {
    return (
      <Panel inTray={inTray}>
        <SheetTitle title={branch.title} />
        <CalmNote style={{ marginVertical: 8 }}>
          <T>
            {t(
              "This thread is complete for now. If it returns, you can meet the new version of it.",
            )}
          </T>
        </CalmNote>
        <View style={rowStyles.stageNav}>
          <Button
            variant="quiet"
            label={t("Understand this thread")}
            onPress={() => setOperation({ kind: "understanding", branchId })}
          />
          <Button
            label={t("It is back on my mind")}
            onPress={() =>
              canOpenThread ? void reopenBranch(branchId) : setPaywalled(true)
            }
          />
        </View>
        <PaywallPrompt
          reason={paywalled ? "thread-limit" : null}
          onClose={() => setPaywalled(false)}
        />
      </Panel>
    );
  }

  // Asked for from under Pip: only the dial, nothing else on the sheet.
  if (dialOnly) {
    const feltNow = effectiveLoudness(branch, appNow());
    return (
      <Panel inTray={inTray}>
        <SheetTitle title={branch.title} />
        <View style={{ flexDirection: "column", gap: 4, marginTop: 8 }}>
          <Hint style={{ marginBottom: 0 }}>{t("How loud is this thread right now?")}</Hint>
          <LoudnessSlider
            value={feltNow}
            accessibilityText={t("{word} — {level} of 5", {
              word: t(loudnessWord(feltNow)),
              level: Math.round(feltNow),
            })}
            onChange={(v) => void dialLoudness(branchId, v as Loudness)}
          />
          {feltNow > branch.loudness && (
            <Hint style={{ marginBottom: 0 }}>
              {t("Days without an answer make it ask louder.")}
            </Hint>
          )}
        </View>
        <Button
          variant="quiet"
          label={t("Return to timeline")}
          onPress={() => setOperation({ kind: "idle" })}
          style={{ alignSelf: "flex-start", marginTop: 8 }}
        />
      </Panel>
    );
  }

  // Once today's decision is taken the dial rests, so there is nothing to
  // peek at — the sheet opens straight onto the decisions.
  const decided = decidedToday(branch, appNow());
  const showAll = expanded || decided;
  // The dial shows the loudness as felt today, drift included. Moving it
  // re-anchors the drift, so pulling it down always genuinely quiets the line.
  const felt = effectiveLoudness(branch, appNow());

  return (
    <Panel inTray={inTray}>
      {/* A vertical swipe on the sheet moves between peek and full: up reveals
          the decisions, down tucks them away again. Sideways stays the slider's. */}
      <View
        onTouchStart={(e) => {
          const t0 = e.nativeEvent;
          touchRef.current = { x: t0.pageX, y: t0.pageY };
        }}
        onTouchEnd={(e) => {
          const start = touchRef.current;
          touchRef.current = null;
          const t0 = e.nativeEvent;
          if (!start) return;
          const dx = t0.pageX - start.x;
          const dy = t0.pageY - start.y;
          if (Math.abs(dy) <= Math.abs(dx)) return;
          if (dy < -40) setExpanded(true);
          else if (dy > 40 && expanded) setExpanded(false);
        }}
      >
      <SheetTitle title={branch.title} />
      {/* first, the one dial: how loud is it — the same thing as its loudness.
          Setting it is a touch, not a decision — it never quiets the day
          counter. Once a decision has been taken today, the line rests and
          the dial steps away until tomorrow (or until the thread reopens). */}
      {/* The dial belongs to the peek; once the choices unfold it steps
          aside so the whole decision fits on screen without scrolling. */}
      {!decided && !showAll && (
        <View style={{ flexDirection: "column", gap: 4, marginTop: 8 }}>
          <Hint style={{ marginBottom: 0 }}>{t("How loud is this thread right now?")}</Hint>
          <LoudnessSlider
            value={felt}
            accessibilityText={t("{word} — {level} of 5", {
              word: t(loudnessWord(felt)),
              level: Math.round(felt),
            })}
            onChange={(v) => void dialLoudness(branchId, v as Loudness)}
          />
          {felt > branch.loudness && (
            <Hint style={{ marginBottom: 0 }}>{t("Days without an answer make it ask louder.")}</Hint>
          )}
        </View>
      )}
      {!showAll ? (
        // The peek: the question itself is the handle — tap it (or pull the
        // sheet up) and the decisions unfold.
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded(true)}
          style={(s) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            width: "100%",
            minHeight: 44,
            marginTop: 4.8,
            paddingVertical: 7.2,
            paddingHorizontal: 10.4,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: (s as PressState).hovered
              ? theme.lineAxis
              : alpha(theme.lineAxis, 0.55),
            borderRadius: theme.radius,
            backgroundColor: "transparent",
          })}
        >
          <T style={{ fontSize: 14.7, flexShrink: 1 }}>
            {t("What does this thread need from you now?")}
          </T>
          <Text
            accessibilityElementsHidden
            style={{ color: theme.ink, opacity: 0.55, fontSize: 12.8 }}
          >
            ▴
          </Text>
        </Pressable>
      ) : (
        <>
          <Prompt style={{ marginTop: 8 }}>{t("What does this thread need from you now?")}</Prompt>
          {/* Verbs and icons only — each choice explains itself on its own
              screen, so no hint paragraph needs to crowd this one. */}
          <View style={{ flexDirection: "column", gap: 6.4, marginVertical: 6.4 }}>
            {ACTIONS.map((a) => (
              <Choice
                key={a.kind}
                icon={a.icon}
                title={t(a.label)}
                accessibilityHint={t(a.hint)}
                onPress={() => setOperation({ kind: a.kind, branchId })}
              />
            ))}
            <Choice
              icon={IconSetDown}
              title={t("Let it rest")}
              accessibilityHint={t("Nothing to do today — saying so is a real answer.")}
              onPress={leaveForToday}
            />
          </View>
          <View style={{ flexDirection: "column", alignItems: "flex-start", gap: 3.2, marginTop: 3.2 }}>
            <Button
              variant="quiet"
              icon={<IconEye size={16} color={theme.inkSoft} />}
              label={t("Understand this thread")}
              onPress={() => setOperation({ kind: "understanding", branchId })}
            />
            <Button
              variant="quiet"
              icon={<IconHeart size={16} color={theme.inkSoft} />}
              label={t("Too heavy to carry alone")}
              onPress={() => setOperation({ kind: "seeking-support", branchId })}
            />
          </View>
        </>
      )}
      </View>
    </Panel>
  );
}
