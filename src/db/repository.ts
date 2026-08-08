import { db } from "./database";
import type { PsychologicalBranch } from "@/domain/branches/types";
import type { BranchMerge, MergeDraft } from "@/domain/merges/types";
import type { WaitingContainer } from "@/domain/waiting/types";
import type { IntegratedAction } from "@/domain/actions/types";

export const repo = {
  async loadAll() {
    const [branches, merges, waiting, actions, drafts] = await Promise.all([
      db.branches.toArray(),
      db.merges.toArray(),
      db.waiting.toArray(),
      db.actions.toArray(),
      db.drafts.toArray(),
    ]);
    return { branches, merges, waiting, actions, drafts };
  },

  saveBranch: (b: PsychologicalBranch) => db.branches.put(b),
  saveBranches: (bs: PsychologicalBranch[]) => db.branches.bulkPut(bs),
  deleteBranch: (id: string) => db.branches.delete(id),
  saveMerge: (m: BranchMerge) => db.merges.put(m),
  saveWaiting: (w: WaitingContainer) => db.waiting.put(w),
  saveAction: (a: IntegratedAction) => db.actions.put(a),
  deleteAction: (id: string) => db.actions.delete(id),
  saveDraft: (d: MergeDraft) => db.drafts.put(d),
  deleteDraft: (id: string) => db.drafts.delete(id),

  async exportAll(): Promise<string> {
    const data = await repo.loadAll();
    return JSON.stringify({ app: "one-current", version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
  },

  async importAll(json: string): Promise<void> {
    const parsed = JSON.parse(json);
    if (parsed?.app !== "one-current" || !parsed?.data) {
      throw new Error("This file is not a One Current export.");
    }
    const d = parsed.data;
    // Older exports stored loudness as "pull" (briefly "anxietyLevel").
    const branches = (d.branches ?? []).map((b: Record<string, unknown>) => {
      const { pull, anxietyLevel, ...rest } = b;
      return { loudness: rest.loudness ?? pull ?? anxietyLevel ?? 3, ...rest };
    });
    await Promise.all([
      db.branches.bulkPut(branches),
      db.merges.bulkPut(d.merges ?? []),
      db.waiting.bulkPut(d.waiting ?? []),
      db.actions.bulkPut(d.actions ?? []),
      db.drafts.bulkPut(d.drafts ?? []),
    ]);
  },

  async deleteEverything(): Promise<void> {
    await Promise.all([
      db.branches.clear(),
      db.merges.clear(),
      db.waiting.clear(),
      db.actions.clear(),
      db.drafts.clear(),
    ]);
  },
};
