/**
 * Shows a list of past merged threads.
 * Opened by tapping the Now dot on the timeline.
 * Selecting a thread pans the timeline to its merge date and keeps it focused.
 */

import { Pressable, ScrollView, View, type PressableStateCallbackType } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { isClosed } from "@/domain/branches/logic";
import { useT } from "@/i18n/i18n";
import { Hint, Panel, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

type Props = {
  selectedBranchId?: string;
};

const TYPE_LABELS: Record<string, string> = {
  event:        "Event",
  waiting:      "Waiting",
  projection:   "Projection",
  identity:     "Identity",
  relationship: "Relationship",
  body:         "Body",
  project:      "Project",
};

function relativeDate(isoDate: string, locale?: string): string {
  const date = new Date(isoDate + "T12:00:00");
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "Last week";
  if (diffDays < 31) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", year: diffDays > 365 ? "numeric" : undefined });
}

export function IntegratedThreadsPanel({ selectedBranchId }: Props) {
  const t = useT();
  const tk = useTheme();
  const setOperation = useAppStore((s) => s.setOperation);
  const language = useAppStore((s) => s.language);
  const locale = language === "es" || language === "es-CO" ? language : undefined;

  const merged = useAppStore((s) =>
    s.branches
      .filter((b) => isClosed(b) && b.mergeDate)
      .sort((a, b) => (b.mergeDate! > a.mergeDate! ? 1 : -1))
  );

  if (merged.length === 0) {
    return (
      <Panel>
        <Hint style={{ textAlign: "center", marginTop: 16 }}>
          {t("No integrated threads yet.")}
        </Hint>
        <Hint style={{ textAlign: "center", marginBottom: 8 }}>
          {t("When you integrate a thread it appears here — tap to revisit it on the timeline.")}
        </Hint>
      </Panel>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
      <Panel style={{ gap: 6 }}>
        <Hint style={{ marginBottom: 4 }}>
          {t("Tap a thread to see where it rejoined your main line.")}
        </Hint>

        {merged.map((branch) => {
          const selected = branch.id === selectedBranchId;
          return (
            <Pressable
              key={branch.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setOperation({ kind: "viewing-integrated", branchId: branch.id })}
              style={({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: tk.radius,
                borderWidth: 1,
                borderColor: selected ? tk.accent : alpha(tk.lineAxis, 0.55),
                backgroundColor: selected
                  ? tk.accentSoft
                  : pressed || hovered
                    ? alpha(tk.lineAxis, 0.12)
                    : tk.bgRaised,
              })}
            >
              {/* Accent stripe — shows the branch color category */}
              <View
                style={{
                  width: 3,
                  alignSelf: "stretch",
                  borderRadius: 2,
                  backgroundColor: selected ? tk.accent : alpha(tk.inkSoft, 0.35),
                }}
              />

              <View style={{ flex: 1, gap: 2 }}>
                <T
                  style={{
                    fontSize: 14,
                    fontWeight: selected ? "700" : "600",
                    color: selected ? tk.ink : tk.inkSoft,
                  }}
                  numberOfLines={1}
                >
                  {branch.title}
                </T>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <T
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      letterSpacing: 0.3,
                      textTransform: "uppercase",
                      color: selected ? tk.accent : tk.inkFaint,
                    }}
                  >
                    {t(TYPE_LABELS[branch.type] ?? branch.type)}
                  </T>
                  <T style={{ fontSize: 12, color: tk.inkFaint }}>
                    {relativeDate(branch.mergeDate!, locale)}
                  </T>
                </View>
              </View>

              {/* Checkmark for integrated */}
              <T style={{ fontSize: 16, color: selected ? tk.accent : tk.inkFaint }}>✓</T>
            </Pressable>
          );
        })}
      </Panel>
    </ScrollView>
  );
}
