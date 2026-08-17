import { useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import type { PsychologicalBranch } from "@/domain/branches/types";
import { effectiveLoudness, isOpen } from "@/domain/branches/logic";
import { appNow } from "@/domain/time/clock";
import { useT } from "@/i18n/i18n";
import { AppTextInput, Button, Hint, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

/**
 * Thread selection for sharing. Built to stay usable with hundreds of
 * threads: a search box, open/closed sections (closed collapsed by default),
 * per-section All/None, and a virtualized list instead of a chip cloud.
 */

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 40;
const SEARCH_THRESHOLD = 8;

type Section = "open" | "closed";

type Item =
  | { kind: "header"; section: Section; count: number }
  | { kind: "row"; section: Section; branch: PsychologicalBranch };

export function ThreadPicker({
  branches,
  selected,
  onChange,
}: {
  branches: PsychologicalBranch[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const tk = useTheme();
  const t = useT();
  const [query, setQuery] = useState("");
  const [closedExpanded, setClosedExpanded] = useState(false);
  const searching = query.trim() !== "";

  const { items, openIds, closedIds } = useMemo(() => {
    const now = appNow();
    const q = query.trim().toLowerCase();
    const matches = (b: PsychologicalBranch) =>
      q === "" || b.title.toLowerCase().includes(q);

    const open = branches
      .filter((b) => isOpen(b) && matches(b))
      .sort(
        (a, b) =>
          effectiveLoudness(b, now) - effectiveLoudness(a, now) ||
          b.lastActivatedAt.localeCompare(a.lastActivatedAt),
      );
    const closed = branches
      .filter((b) => !isOpen(b) && matches(b))
      .sort((a, b) =>
        (b.mergeDate ?? b.lastActivatedAt).localeCompare(a.mergeDate ?? a.lastActivatedAt),
      );

    const list: Item[] = [];
    if (open.length > 0) {
      list.push({ kind: "header", section: "open", count: open.length });
      for (const branch of open) list.push({ kind: "row", section: "open", branch });
    }
    if (closed.length > 0) {
      list.push({ kind: "header", section: "closed", count: closed.length });
      if (closedExpanded || searching) {
        for (const branch of closed) list.push({ kind: "row", section: "closed", branch });
      }
    }
    return {
      items: list,
      openIds: open.map((b) => b.id),
      closedIds: closed.map((b) => b.id),
    };
  }, [branches, query, closedExpanded, searching]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const selectAll = (ids: string[]) => onChange(new Set([...selected, ...ids]));
  const selectNone = (ids: string[]) => {
    const next = new Set(selected);
    for (const id of ids) next.delete(id);
    onChange(next);
  };

  const sectionLabel = (section: Section, count: number) =>
    section === "open" ? `${t("Open")} (${count})` : `${t("Closed")} (${count})`;

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === "header") {
      const ids = item.section === "open" ? openIds : closedIds;
      const collapsible = item.section === "closed" && !searching;
      const expanded = item.section === "open" || closedExpanded || searching;
      return (
        <View
          style={{
            height: HEADER_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderTopWidth: item.section === "closed" ? 1 : 0,
            borderTopColor: alpha(tk.lineAxis, 0.4),
          }}
        >
          <Pressable
            accessibilityRole={collapsible ? "button" : undefined}
            accessibilityLabel={sectionLabel(item.section, item.count)}
            accessibilityState={collapsible ? { expanded } : undefined}
            disabled={!collapsible}
            onPress={() => setClosedExpanded((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, flexGrow: 1 }}
          >
            {collapsible && (
              <T style={{ color: tk.inkFaint, fontSize: 12 }}>{expanded ? "▾" : "▸"}</T>
            )}
            <T
              style={{
                color: tk.inkSoft,
                fontSize: 12,
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              {sectionLabel(item.section, item.count)}
            </T>
          </Pressable>
          {expanded && (
            <>
              <Button onPress={() => selectAll(ids)} label={t("All")} />
              <Button onPress={() => selectNone(ids)} label={t("None")} />
            </>
          )}
        </View>
      );
    }

    const { branch } = item;
    const checked = selected.has(branch.id);
    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={branch.title}
        onPress={() => toggle(branch.id)}
        style={{
          height: ROW_HEIGHT,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 2,
        }}
      >
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: checked ? tk.accent : tk.lineAxis,
            backgroundColor: checked ? tk.accentSoft : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {checked && <T style={{ color: tk.accent, fontSize: 12, lineHeight: 14 }}>✓</T>}
        </View>
        <T
          numberOfLines={1}
          style={{ flexShrink: 1, flexGrow: 1, color: item.section === "closed" ? tk.inkSoft : tk.ink }}
        >
          {branch.title}
        </T>
        {item.section === "open" && (
          <T style={{ color: tk.inkFaint, fontSize: 12 }}>
            {"●".repeat(effectiveLoudness(branch, appNow()))}
          </T>
        )}
      </Pressable>
    );
  };

  const total = branches.length;

  return (
    <View style={{ marginTop: 8 }} accessibilityLabel={t("Which threads")}>
      {total > SEARCH_THRESHOLD && (
        <AppTextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("Find a thread…")}
          accessibilityLabel={t("Find a thread…")}
          autoCapitalize="none"
          style={{ marginBottom: 6 }}
        />
      )}
      {items.length === 0 ? (
        <Hint style={{ marginBottom: 0 }}>{t("No threads match your search.")}</Hint>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) =>
            item.kind === "header" ? `h-${item.section}` : item.branch.id
          }
          renderItem={renderItem}
          getItemLayout={(_data, index) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * index,
            index,
          })}
          style={{ maxHeight: 360 }}
          nestedScrollEnabled
        />
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginTop: 6,
          paddingTop: 6,
          borderTopWidth: 1,
          borderTopColor: alpha(tk.lineAxis, 0.4),
        }}
      >
        <Hint style={{ marginBottom: 0, flexGrow: 1 }}>
          {t("{n} of {total} threads selected", { n: selected.size, total })}
        </Hint>
        {selected.size > 0 && (
          <Button variant="quiet" onPress={() => onChange(new Set())} label={t("Clear")} />
        )}
      </View>
    </View>
  );
}
