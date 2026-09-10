import { useMemo, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useAppStore } from "@/stores/app-store";
import { isOpen } from "@/domain/branches/logic";
import { appNow } from "@/domain/time/clock";
import {
  buildBrief,
  emptyQuestion,
  renderBriefText,
  type Brief,
  type BriefLine,
} from "@/domain/brief/build-brief";
import { useT } from "@/i18n/i18n";
import {
  AppTextInput,
  Button,
  Card,
  CalmNote,
  Chip,
  H1,
  Hint,
  Panel,
  T,
  rowStyles,
} from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";

/**
 * Prepare a conversation.
 *
 * Everything shown starts as the person's own saved words, every line can be
 * edited or dropped, and the preview is exactly what will be produced — no
 * surprises about what leaves. It goes out as plain text so whoever reads it
 * needs nothing but their eyes.
 *
 * This deliberately does not touch the psychologist share (JSON, Pro, a
 * server round-trip and a redemption code). Those solve a different problem;
 * this one is free, local, and works for a partner or a manager too.
 */
export function BriefView({ branchIds }: { branchIds: string[] }) {
  const t = useT();
  const tk = useTheme();
  const branches = useAppStore((s) => s.branches);
  const actions = useAppStore((s) => s.actions);
  const merges = useAppStore((s) => s.merges);
  const waiting = useAppStore((s) => s.waiting);
  const setView = useAppStore((s) => s.setView);

  const open = useMemo(() => branches.filter(isOpen), [branches]);
  const [selected, setSelected] = useState<string[]>(() =>
    branchIds.filter((id) => open.some((b) => b.id === id)),
  );
  const [edited, setEdited] = useState<Brief | null>(null);
  const [copied, setCopied] = useState("");

  // Rebuilt whenever the selection changes; edits to the current selection
  // are kept, so changing your mind about one situation does not throw away
  // the sentences you just rewrote for another.
  const brief = useMemo(() => {
    const fresh = buildBrief({
      branches,
      actions,
      merges,
      waiting,
      branchIds: selected,
      now: appNow(),
    });
    if (!edited) return fresh;
    return {
      ...fresh,
      questions: edited.questions,
      sections: fresh.sections.map((section) => {
        const previous = edited.sections.find((s) => s.branchId === section.branchId);
        return previous ?? section;
      }),
    };
  }, [branches, actions, merges, waiting, selected, edited]);

  const text = renderBriefText(brief, t("Notes for this conversation"));

  function editLine(branchId: string | null, lineId: string, patch: Partial<BriefLine>) {
    setEdited({
      ...brief,
      sections: brief.sections.map((s) =>
        branchId !== null && s.branchId === branchId
          ? { ...s, lines: s.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }
          : s,
      ),
      questions:
        branchId === null
          ? brief.questions.map((q) => (q.id === lineId ? { ...q, ...patch } : q))
          : brief.questions,
    });
  }

  async function copy() {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(t("Copied. Paste it wherever you need it."));
        return;
      } catch {
        // Clipboard permission can simply be refused; the preview below is
        // selectable, so there is always a way to get the text out.
      }
    }
    setCopied(t("Select the preview below and copy it."));
  }

  function saveFile() {
    if (Platform.OS !== "web") return;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notes-${brief.preparedOn}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setCopied(t("Saved to your downloads."));
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <Panel style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <H1 style={{ marginBottom: 0, marginRight: "auto" }}>{t("Prepare a conversation")}</H1>
          <Button variant="quiet" label={t("Done")} onPress={() => setView({ kind: "now" })} />
        </View>

        <Hint>
          {t(
            "Everything below started as your own words. Change or drop anything, then copy it. Whoever reads it needs no app and no account.",
          )}
        </Hint>

        <T style={{ fontWeight: "700", marginTop: 4 }}>{t("Which situations?")}</T>
        <View style={rowStyles.tagRow} accessibilityLabel={t("Which situations?")}>
          {open.map((b) => (
            <Chip
              key={b.id}
              pressed={selected.includes(b.id)}
              label={b.title}
              onPress={() =>
                setSelected((prev) =>
                  prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id],
                )
              }
            />
          ))}
        </View>

        {brief.sections.map((section) => (
          <Card key={section.branchId} style={{ gap: 8 }}>
            <T style={{ fontWeight: "700" }}>{section.title}</T>
            {section.lines.map((line) => (
              <View key={line.id} style={{ gap: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Hint style={{ margin: 0, marginRight: "auto" }}>{t(line.label)}</Hint>
                  <Button
                    variant="quiet"
                    label={line.include ? t("Leave out") : t("Put back")}
                    onPress={() =>
                      editLine(section.branchId, line.id, { include: !line.include })
                    }
                  />
                </View>
                {line.include && (
                  <AppTextInput
                    multiline
                    value={line.text}
                    onChangeText={(v) => editLine(section.branchId, line.id, { text: v })}
                    accessibilityLabel={t(line.label)}
                  />
                )}
              </View>
            ))}
          </Card>
        ))}

        <Card style={{ gap: 8 }}>
          <T style={{ fontWeight: "700" }}>{t("Anything you want to ask")}</T>
          {brief.questions.map((q) => (
            <AppTextInput
              key={q.id}
              multiline
              value={q.text}
              onChangeText={(v) => editLine(null, q.id, { text: v })}
              placeholder={t("e.g. is it reasonable that this still bothers me?")}
              accessibilityLabel={t("Question")}
            />
          ))}
          <View style={rowStyles.filterRow}>
            <Button
              label={t("Add a question")}
              onPress={() => setEdited({ ...brief, questions: [...brief.questions, emptyQuestion()] })}
            />
          </View>
        </Card>

        <T style={{ fontWeight: "700", marginTop: 4 }}>{t("What you will hand over")}</T>
        <View accessibilityLabel={t("Preview of the notes")}>
          <Card sunken style={{ borderWidth: 1, borderColor: alpha(tk.lineAxis, 0.55) }}>
            {/* The preview is the artefact itself, not a summary of it. */}
            <T style={{ fontFamily: tk.fontBody, fontSize: 13, lineHeight: 19 }}>{text}</T>
          </Card>
        </View>

        <View style={rowStyles.filterRow}>
          <Button variant="primary" label={t("Copy")} onPress={() => void copy()} />
          {Platform.OS === "web" && (
            <Button label={t("Save as a file")} onPress={saveFile} />
          )}
        </View>
        {copied !== "" && (
          <CalmNote>
            <T>{copied}</T>
          </CalmNote>
        )}
        <Hint style={{ marginBottom: 0 }}>
          {t("Nothing here is sent anywhere. Copying and saving both happen on this device.")}
        </Hint>
      </Panel>
    </ScrollView>
  );
}
