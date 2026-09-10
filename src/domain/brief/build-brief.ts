import { newId } from "../ids";
import type { IntegratedAction } from "../actions/types";
import type { PsychologicalBranch } from "../branches/types";
import type { BranchMerge } from "../merges/types";
import type { WaitingContainer } from "../waiting/types";
import { whereThisStands } from "../situations/where-this-stands";
import { formatReviewDate } from "../waiting/logic";

/**
 * Something to say out loud, prepared from what is already written down.
 *
 * The point is the moment where someone sits down opposite a therapist, a
 * partner or a manager and has to reconstruct three weeks of thinking from
 * memory. Everything here was already saved; this only arranges it and lets
 * the person edit it before it leaves.
 *
 * Deliberately plain text, not the JSON share: the reader needs no account,
 * no app and no import step. That is the difference between a brief that
 * gets used in a room and a file that sits in an inbox.
 */
export type BriefLine = {
  id: string;
  /** The app's own label for this line. */
  label: string;
  /** Editable. Starts as the person's own words wherever there are any. */
  text: string;
  include: boolean;
  /** Whether the starting text came from the person or was assembled. */
  voice: "theirs" | "app";
};

export type BriefSection = {
  branchId: string;
  title: string;
  lines: BriefLine[];
};

export type Brief = {
  preparedOn: string;
  sections: BriefSection[];
  /** Free-form things to raise. Empty until the person writes them. */
  questions: BriefLine[];
};

export function buildBrief(input: {
  branches: PsychologicalBranch[];
  actions: IntegratedAction[];
  merges: BranchMerge[];
  waiting: WaitingContainer[];
  branchIds: readonly string[];
  now?: Date;
}): Brief {
  const now = input.now ?? new Date();
  const sections: BriefSection[] = [];

  for (const id of input.branchIds) {
    const branch = input.branches.find((b) => b.id === id);
    if (!branch) continue;
    const stands = whereThisStands({
      branch,
      actions: input.actions,
      merges: input.merges,
      waiting: input.waiting,
    });

    const lines: BriefLine[] = stands.lines.map((l) => ({
      id: newId("bl"),
      label: l.label,
      text:
        l.kind === "waiting" && l.on
          ? `${l.text} — looking again ${formatReviewDate(l.on)}`
          : l.text,
      include: true,
      voice: l.voice,
    }));

    // Said plainly rather than left blank: "nothing recorded" is itself
    // worth saying in a conversation, and an empty section looks like a
    // mistake.
    if (lines.length === 0) {
      lines.push({
        id: newId("bl"),
        label: "Where this stands",
        text: "Nothing recorded on this yet — it has just been on my mind.",
        include: true,
        voice: "app",
      });
    }

    sections.push({ branchId: branch.id, title: branch.title, lines });
  }

  return { preparedOn: now.toISOString().slice(0, 10), sections, questions: [] };
}

/** The brief as the reader will see it. Nothing here needs an app to open. */
export function renderBriefText(brief: Brief, heading = "Notes for this conversation"): string {
  const out: string[] = [`${heading} — ${brief.preparedOn}`, ""];

  for (const section of brief.sections) {
    const lines = section.lines.filter((l) => l.include && l.text.trim() !== "");
    if (lines.length === 0) continue;
    out.push(section.title);
    for (const l of lines) out.push(`  ${l.label}: ${l.text.trim()}`);
    out.push("");
  }

  const questions = brief.questions.filter((q) => q.include && q.text.trim() !== "");
  if (questions.length > 0) {
    out.push("To ask");
    for (const q of questions) out.push(`  - ${q.text.trim()}`);
    out.push("");
  }

  return out.join("\n").trimEnd() + "\n";
}

export function emptyQuestion(): BriefLine {
  return { id: newId("bq"), label: "Question", text: "", include: true, voice: "theirs" };
}
