import type { PsychologicalBranch } from "@/domain/branches/types";
import { isOpen, isClosed, mostActivated } from "@/domain/branches/logic";
import type { TimeWindow } from "../zoom/time-scale";

/** Translator shape: English source string in, translated sentence out. */
type Translate = (s: string, vars?: Record<string, string | number>) => string;

/** English fallback: no lookup, but placeholders still get filled in. */
const fallbackT: Translate = (s, vars) => {
  let out = s;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
};

function monthYear(iso: string): string {
  return new Date(iso.length > 10 ? iso : iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/**
 * Complete non-visual equivalent of the branching timeline.
 * Example: "Main life timeline from January 2025 to the present. Three active threads
 * reach today. Relationship separation began in February 2026 and has loudness level five."
 */
export function describeTimeline(
  branches: PsychologicalBranch[],
  window: TimeWindow,
  t: Translate = fallbackT,
): string {
  const open = branches.filter(isOpen);
  const merged = branches.filter(isClosed);

  const parts: string[] = [
    t("Main life timeline from {month} to the present.", { month: monthYear(window.start) }),
  ];

  parts.push(
    open.length === 0
      ? t("No active threads reach today.")
      : open.length === 1
        ? t("One active thread reaches today.")
        : t("{n} active threads reach today.", { n: t(numberWord(open.length)) }),
  );

  for (const b of open) {
    parts.push(
      t("{title} began {when} and has loudness level {loudness}.", {
        title: b.title,
        when: b.forkLabel ? b.forkLabel : t("in {month}", { month: monthYear(b.forkDate) }),
        loudness: t(numberWord(b.loudness)).toLowerCase(),
      }),
    );
  }

  const top = mostActivated(branches);
  if (top && open.length > 1) {
    parts.push(t("{title} is currently the most activated thread.", { title: top.title }));
  }
  if (merged.length > 0) {
    parts.push(
      merged.length === 1
        ? t("One thread has been integrated and remains part of your history.")
        : t("{n} threads have been integrated and remain part of your history.", {
            n: t(numberWord(merged.length)),
          }),
    );
  }
  return parts.join(" ");
}

export function describeBranch(branch: PsychologicalBranch, t: Translate = fallbackT): string {
  const parts: string[] = [
    `${branch.title}. ${statusText(branch, t)}.`,
    t("Began {when}.", {
      when: branch.forkLabel ?? t("in {month}", { month: monthYear(branch.forkDate) }),
    }),
    t("Loudness level {loudness}.", { loudness: t(numberWord(branch.loudness)).toLowerCase() }),
  ];
  if (branch.commits.length > 0) {
    parts.push(
      branch.commits.length === 1
        ? t("One moment recorded.")
        : t("{n} moments recorded.", { n: t(numberWord(branch.commits.length)) }),
    );
  }
  if (branch.storedQualities.length > 0) {
    parts.push(t("Carries {list}.", { list: branch.storedQualities.map((q) => t(q)).join(", ") }));
  }
  return parts.join(" ");
}

function statusText(branch: PsychologicalBranch, t: Translate): string {
  switch (branch.status) {
    case "active": return t("Active thread reaching today");
    case "activated": return t("Currently activated thread");
    case "explored": return t("Explored thread, still active");
    case "ready-to-merge": return t("Ready to integrate into Now");
    case "merge-conflict": return t("In tension with another thread");
    case "waiting-with-boundaries": return t("Active thread reaching today"); // legacy status
    case "converted-to-project": return t("Handed off to real work");
    case "partly-integrated": return t("Partly integrated");
    case "merged": return t("Integrated into your life");
    case "archived": return t("Archived");
    case "needs-support": return t("May need outside support");
  }
}

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export function numberWord(n: number): string {
  // Loudness can be fractional (the slider moves in fine steps): speak the nearest whole number.
  const whole = Math.round(n);
  return whole >= 0 && whole < WORDS.length ? WORDS[whole] : String(whole);
}
