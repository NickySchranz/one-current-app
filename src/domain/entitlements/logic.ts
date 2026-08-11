import type { PsychologicalBranch } from "@/domain/branches/types";
import { isOpen } from "@/domain/branches/logic";
import type { ThemeId } from "@/visualization/theme";

/** Why the paywall opened — picks the copy the prompt shows. */
export type PaywallReason = "themes" | "thread-limit" | "share";

/** How many threads may reach Now at once without Pro. */
export const FREE_OPEN_THREAD_LIMIT = 10;

/** The plain looks stay free; the creature themes are Pro. */
export const FREE_THEME_IDS: readonly ThemeId[] = [
  "riverbed",
  "midnight",
  "sunprint",
  "duskwood",
  "porcelain",
];

export function isProTheme(id: ThemeId): boolean {
  return !FREE_THEME_IDS.includes(id);
}

/** Threads whose line still reaches Now, excluding the optimistic draft —
 * the draft is the thread being created, so counting it would gate one early. */
export function countOpenThreads(
  branches: PsychologicalBranch[],
  draftBranchId?: string | null,
): number {
  return branches.filter((b) => b.id !== draftBranchId && isOpen(b)).length;
}

/** May another thread open (created or reopened) right now? */
export function canCreateThread(
  branches: PsychologicalBranch[],
  isPro: boolean,
  draftBranchId?: string | null,
): boolean {
  return isPro || countOpenThreads(branches, draftBranchId) < FREE_OPEN_THREAD_LIMIT;
}
