import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PsychologicalBranch } from "@/domain/branches/types";
import type { BranchMerge, MergeDraft } from "@/domain/merges/types";
import type { Lesson } from "@/domain/lessons/types";
import type { CoreValue } from "@/domain/values/types";
import type { WaitingContainer } from "@/domain/waiting/types";
import type { IntegratedAction } from "@/domain/actions/types";

/**
 * Cross-platform persistence: each table is one JSON document in
 * AsyncStorage (localStorage on web, native storage on iOS/Android).
 * An in-memory map fronts every table so reads are instant and writes
 * serialize the whole (small) table.
 */
const PREFIX = "one-current/table/";

export class Table<T extends { id: string }> {
  private cache: Map<string, T> | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private name: string) {}

  private async ensure(): Promise<Map<string, T>> {
    if (this.cache) return this.cache;
    const raw = await AsyncStorage.getItem(PREFIX + this.name);
    const rows: T[] = raw ? JSON.parse(raw) : [];
    this.cache = new Map(rows.map((r) => [r.id, r]));
    return this.cache;
  }

  private persist(map: Map<string, T>): Promise<void> {
    // Chain writes so concurrent mutations never interleave a stale snapshot.
    const snapshot = JSON.stringify([...map.values()]);
    this.writing = this.writing.then(() =>
      AsyncStorage.setItem(PREFIX + this.name, snapshot),
    );
    return this.writing;
  }

  async toArray(): Promise<T[]> {
    return [...(await this.ensure()).values()];
  }

  async put(item: T): Promise<void> {
    const map = await this.ensure();
    map.set(item.id, item);
    await this.persist(map);
  }

  async bulkPut(items: T[]): Promise<void> {
    const map = await this.ensure();
    for (const item of items) map.set(item.id, item);
    await this.persist(map);
  }

  async delete(id: string): Promise<void> {
    const map = await this.ensure();
    map.delete(id);
    await this.persist(map);
  }

  async clear(): Promise<void> {
    const map = await this.ensure();
    map.clear();
    await this.persist(map);
  }
}

export const db = {
  branches: new Table<PsychologicalBranch>("branches"),
  merges: new Table<BranchMerge>("merges"),
  waiting: new Table<WaitingContainer>("waiting"),
  actions: new Table<IntegratedAction>("actions"),
  drafts: new Table<MergeDraft>("drafts"),
  lessons: new Table<Lesson>("lessons"),
  values: new Table<CoreValue>("values"),
};
