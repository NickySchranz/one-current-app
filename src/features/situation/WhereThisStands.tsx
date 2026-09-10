import { useMemo } from "react";
import { View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { whereThisStands, type StandsLine } from "@/domain/situations/where-this-stands";
import { formatReviewDate } from "@/domain/waiting/logic";
import { useT } from "@/i18n/i18n";
import { Card, Hint, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

/**
 * The card that answers "where does this stand?" before anything else.
 *
 * Coming back to a situation used to mean rereading a timeline to work out
 * what you had already thought — which is exactly the work the app was meant
 * to save. This is that work done once, deterministically, from saved
 * fields.
 *
 * The person's own words are shown in quotation marks; the labels beside
 * them are the app's. Nothing here is inferred, and when nothing has been
 * recorded it says so rather than inventing a next step.
 */
export function WhereThisStandsCard({ branchId }: { branchId: string }) {
  const t = useT();
  const tk = useTheme();
  const branch = useAppStore((s) => s.branches.find((b) => b.id === branchId));
  const actions = useAppStore((s) => s.actions);
  const merges = useAppStore((s) => s.merges);
  const waiting = useAppStore((s) => s.waiting);

  const stands = useMemo(
    () => (branch ? whereThisStands({ branch, actions, merges, waiting }) : null),
    [branch, actions, merges, waiting],
  );

  if (!branch || !stands) return null;

  return (
    <Card sunken style={{ gap: 8, marginBottom: 14.4 }}>
      <T style={{ fontWeight: "700" }}>{t("Where this stands")}</T>

      {stands.empty ? (
        <Hint style={{ margin: 0 }}>
          {t(
            "Nothing recorded yet beyond the situation itself. Whatever you add — a step, a note, what you are waiting for — shows up here.",
          )}
        </Hint>
      ) : (
        <View style={{ gap: 6 }}>
          {stands.lines.map((line, i) => (
            <StandsRow key={`${line.kind}-${i}`} line={line} />
          ))}
        </View>
      )}

      <Hint style={{ margin: 0, borderTopWidth: 1, borderTopColor: alpha(tk.lineAxis, 0.55), paddingTop: 6 }}>
        {t("Gathered from what you saved. Quoted text is yours.")}
      </Hint>
    </Card>
  );
}

function StandsRow({ line }: { line: StandsLine }) {
  const t = useT();
  const tk = useTheme();
  const dated =
    line.kind === "waiting" && line.on
      ? t("look again {date}", { date: formatReviewDate(line.on) })
      : undefined;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <T
        style={{
          minWidth: 116,
          fontSize: 12.5,
          letterSpacing: 0.2,
          color: tk.inkSoft,
        }}
      >
        {t(line.label)}
      </T>
      <View style={{ flex: 1, gap: 1 }}>
        {/* Quotation marks are load-bearing: they are how someone reading
            this in a difficult conversation can tell what they actually said
            from what the app arranged around it. */}
        <T style={{ fontSize: 13.6 }}>
          {line.voice === "theirs" ? `“${line.text}”` : line.text}
        </T>
        {dated && <Hint style={{ margin: 0 }}>{dated}</Hint>}
      </View>
    </View>
  );
}
