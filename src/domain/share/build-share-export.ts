import type { IntegratedAction } from "../actions/types";
import type { PsychologicalBranch } from "../branches/types";
import type { BranchMerge } from "../merges/types";
import type { WaitingContainer } from "../waiting/types";
import type { ShareExport, SharedEvent, SharedThread, SharedWaiting } from "./types";

/** Tiebreak for events on the same day: a thread starts before anything else happens on it. */
const KIND_ORDER: Record<SharedEvent["kind"], number> = {
  started: 0,
  moment: 1,
  "action-decided": 2,
  "action-done": 3,
  integrated: 4,
};

function day(iso: string): string {
  return iso.slice(0, 10);
}

function inRange(dayIso: string, from: string, to: string): boolean {
  return dayIso >= from && dayIso <= to;
}

/** Lists serialize only when they carry something. */
function some<T>(list: T[] | undefined): T[] | undefined {
  return list && list.length > 0 ? list : undefined;
}

/**
 * Build the share-with-psychologist file: only the selected threads, only
 * what happened between `from` and today. Pure — pass the store's state in.
 * `JSON.stringify` drops the optional fields left undefined here.
 */
export function buildShareExport(input: {
  branches: PsychologicalBranch[];
  actions: IntegratedAction[];
  merges: BranchMerge[];
  waiting?: WaitingContainer[];
  selectedIds: readonly string[];
  from: string;
  now?: Date;
}): ShareExport {
  const now = input.now ?? new Date();
  const to = day(now.toISOString());
  const selected = input.selectedIds
    .map((id) => input.branches.find((b) => b.id === id))
    .filter((b): b is PsychologicalBranch => !!b);
  return {
    app: "one-current-share",
    version: 1,
    exportedAt: now.toISOString(),
    from: input.from,
    to,
    threads: selected.map((b) =>
      shareThread(b, input.actions, input.merges, input.waiting ?? [], input.from, to),
    ),
  };
}

function shareWaiting(
  branch: PsychologicalBranch,
  waiting: WaitingContainer[],
): SharedWaiting | undefined {
  const container =
    waiting.find((w) => w.id === branch.waitingContainerId) ??
    waiting.find((w) => w.branchId === branch.id);
  if (!container) return undefined;
  return {
    awaiting: container.awaiting,
    actionTaken: container.actionTaken || undefined,
    outsideControl: some(container.outsideControl),
    reviewDate: container.reviewDate || undefined,
    reopenConditions: some(container.reopenConditions),
    continueMeanwhile: some(container.continueMeanwhile),
    reclaimedNow: some(container.reclaimedNow),
    closedAt: container.closedAt,
  };
}

function shareThread(
  branch: PsychologicalBranch,
  actions: IntegratedAction[],
  merges: BranchMerge[],
  waiting: WaitingContainer[],
  from: string,
  to: string,
): SharedThread {
  // The loudness curve needs a starting level: the last change before the
  // window is the baseline, then every change inside it.
  const log = branch.loudnessLog ?? [];
  const baseline = log.filter((e) => day(e.at) < from).pop();
  const changes = log.filter((e) => inRange(day(e.at), from, to));
  const loudness = (baseline ? [baseline, ...changes] : changes).map((e) => ({
    at: e.at,
    loudness: e.loudness,
  }));

  const events: SharedEvent[] = [];
  if (inRange(day(branch.firstCreatedAt), from, to)) {
    events.push({ on: day(branch.firstCreatedAt), kind: "started" });
  }
  for (const m of branch.commits) {
    if (!inRange(m.date, from, to)) continue;
    events.push({
      on: m.date,
      kind: "moment",
      momentType: m.type,
      title: m.title,
      description: m.description,
      impact: m.emotionalImpact,
      beliefAdded: m.beliefAdded,
      effect: m.effect,
    });
  }
  for (const a of actions) {
    const representation = a.branchesIntegrated.find((r) => r.branchId === branch.id);
    if (!representation) continue;
    if (inRange(day(a.createdAt), from, to)) {
      events.push({
        on: day(a.createdAt),
        kind: "action-decided",
        title: a.title,
        durationMinutes: a.durationMinutes,
        instruction: a.instruction || undefined,
        minimumVersion: a.minimumVersion || undefined,
        completionDefinition: a.completionDefinition || undefined,
        qualitiesCarried: some(a.qualitiesCarried),
        representedAs: representation.representedAs || undefined,
      });
    }
    if (a.completedAt && inRange(day(a.completedAt), from, to)) {
      events.push({ on: day(a.completedAt), kind: "action-done", title: a.title });
    }
  }
  for (const g of merges) {
    if (!g.branchIds.includes(branch.id)) continue;
    if (!inRange(day(g.createdAt), from, to)) continue;
    events.push({
      on: day(g.createdAt),
      kind: "integrated",
      result: g.resultStatus,
      resolution: g.resolution || undefined,
      contributionKind: g.contributionKind,
      contribution: g.contribution,
      reclaimed: some(g.reclaimedQualities),
      stillValid: some(g.stillValid),
      outdatedBeliefs: some(g.outdatedBeliefs),
      outsideControl: some(g.outsideControl),
      released: some(g.released),
      // g.burned is deliberately not shared. The app tells the user those words
      // are let go of, so they must never leave the device.
      conflicts:
        g.conflicts.length > 0
          ? g.conflicts.map((c) => ({
              type: c.type,
              demandA: c.demandA,
              demandB: c.demandB,
              resolution: c.resolution || undefined,
            }))
          : undefined,
    });
  }
  events.sort((x, y) => x.on.localeCompare(y.on) || KIND_ORDER[x.kind] - KIND_ORDER[y.kind]);

  return {
    id: branch.id,
    title: branch.title,
    description: branch.description || undefined,
    kind: branch.type,
    orientation: branch.orientation,
    status: branch.status,
    startedOn: branch.forkDate,
    startedLabel: branch.forkLabel,
    integratedOn: branch.mergeDate,
    feelings: some(branch.occupies),
    anxieties: some(branch.anxieties),
    originalBelief: branch.originalBelief || undefined,
    currentBelief: branch.currentBelief || undefined,
    needs: some(branch.unmetNeeds),
    qualitiesReclaimed: some(branch.storedQualities),
    controllability: branch.controllability,
    returnedCount: branch.recurrenceCount > 0 ? branch.recurrenceCount : undefined,
    waiting: shareWaiting(branch, waiting),
    loudness,
    events,
  };
}
