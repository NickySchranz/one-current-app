import { useEffect, useRef, useState } from "react";
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
  Hint,
  Panel,
  Prompt,
  T,
  rowStyles,
  useInTray,
} from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

type PressState = PressableStateCallbackType & { hovered?: boolean };

type Props = { branchId: string };

const ACTIONS: {
  key: string;
  kind: "quick-act" | "quick-merge" | "quick-note";
  label: string;
  hint: string;
}[] = [
  { key: "a", kind: "quick-act", label: "Act", hint: "Take one small step." },
  {
    key: "m",
    kind: "quick-merge",
    label: "Integrate",
    hint: "Fold what it gave you back into your one line.",
  },
  { key: "t", kind: "quick-note", label: "Note", hint: "Add what just happened." },
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

/** The loudness dial: a thumb-sized bar — tap or drag anywhere to fill it. */
function LoudnessSlider({
  value,
  onChange,
  accessibilityText,
}: {
  value: number;
  onChange: (v: number) => void;
  accessibilityText: string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const HEIGHT = 44;
  const set = (x: number) => {
    if (width <= 0) return;
    const frac = Math.min(1, Math.max(0, x / width));
    onChange(Math.round((1 + frac * 4) * 10) / 10);
  };
  const frac = (Math.min(5, Math.max(1, value)) - 1) / 4;
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 1, max: 5, now: value, text: accessibilityText }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => set(e.nativeEvent.locationX)}
      onResponderMove={(e) => set(e.nativeEvent.locationX)}
      style={{
        height: HEIGHT,
        marginVertical: 2,
        width: "100%",
        borderRadius: theme.radius,
        borderWidth: 1,
        borderColor: alpha(theme.lineAxis, 0.55),
        backgroundColor: alpha(theme.lineAxis, 0.22),
        overflow: "hidden",
        justifyContent: "center",
      }}
    >
      {/* the fill IS the value: no small thumb to hunt for */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: Math.max(8, frac * width),
          backgroundColor: alpha(theme.accent, 0.85),
        }}
      />
      {/* quiet step marks at 2, 3 and 4 */}
      {width > 0 &&
        [0.25, 0.5, 0.75].map((f) => (
          <View
            key={f}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: f * width,
              top: 6,
              bottom: 6,
              width: 1,
              backgroundColor: alpha(theme.lineAxis, 0.6),
            }}
          />
        ))}
    </View>
  );
}

/** A cell of the quick menu (.quick-menu-item). */
function QuickMenuItem({
  title,
  hint,
  onPress,
}: {
  title: string;
  hint: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(s) => ({
        width: "48%",
        flexGrow: 1,
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 2.4,
        paddingVertical: 8,
        paddingHorizontal: 10.4,
        borderWidth: 1,
        borderColor: (s as PressState).hovered ? theme.lineAxis : alpha(theme.lineAxis, 0.55),
        borderRadius: theme.radius,
        backgroundColor: theme.bgRaised,
      })}
    >
      <T style={{ fontWeight: "600" }}>{title}</T>
      <Hint style={{ marginBottom: 0, fontSize: 12.8, lineHeight: 18 }}>{hint}</Hint>
    </Pressable>
  );
}

/** One question at the endpoint: what does this thread need from you now? */
export function QuickBranchMenu({ branchId }: Props) {
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
  // Pulling it up (or tapping the question) reveals the decisions.
  const [expanded, setExpanded] = useState(false);
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
              "Nothing can be done about it right now — and you have said so. Its loudness eases; the line simply stays until something changes.",
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
      {!decided && (
        <View style={{ flexDirection: "column", gap: 4, marginTop: 8 }}>
          <Hint style={{ marginBottom: 0 }}>{t("How loud is this thread right now?")}</Hint>
          <LoudnessSlider
            value={felt}
            accessibilityText={
              felt === 1 ? t("Quiet") : t("Loudness {level} of 5", { level: Math.round(felt) })
            }
            onChange={(v) => void dialLoudness(branchId, v as Loudness)}
          />
          {felt > branch.loudness && (
            <Hint style={{ marginBottom: 0 }}>{t("Undecided days have made it louder.")}</Hint>
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
          <Prompt>{t("What does this thread need from you now?")}</Prompt>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 6.4, marginVertical: 6.4 }}
          >
            {ACTIONS.map((a) => (
              <QuickMenuItem
                key={a.kind}
                title={t(a.label)}
                hint={t(a.hint)}
                onPress={() => setOperation({ kind: a.kind, branchId })}
              />
            ))}
            <QuickMenuItem
              title={t("Can't do anything about it now")}
              hint={t("Set it down. It stays on the line without pulling at you.")}
              onPress={leaveForToday}
            />
          </View>
          <Button
            variant="quiet"
            label={t("Understand this thread")}
            onPress={() => setOperation({ kind: "understanding", branchId })}
            style={{ marginTop: 3.2, alignSelf: "flex-start" }}
          />
          <Button
            variant="quiet"
            label={t("Too heavy to carry alone")}
            onPress={() => setOperation({ kind: "seeking-support", branchId })}
            style={{ marginTop: 3.2, alignSelf: "flex-start" }}
          />
        </>
      )}
      </View>
    </Panel>
  );
}
