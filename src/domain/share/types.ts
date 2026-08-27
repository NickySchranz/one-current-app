/**
 * The share-with-psychologist file format, version 1. This is a fixed
 * contract with the psychologist companion app (one-current-psycho):
 * change it only by bumping the version on both sides.
 *
 * Importer tolerances: `loudness` may be empty (threads created before the
 * log existed), every optional field may be absent, and a merge or action
 * that spans several threads appears under each of them.
 */

export type SharedLoudnessEntry = {
  /** ISO timestamp of the change. */
  at: string;
  /** 1 (quiet) to 5; fractional values are fine. */
  loudness: number;
};

/** An unresolved-tension record from an integration. */
export type SharedConflict = {
  type: string;
  demandA: string;
  demandB: string;
  resolution?: string;
};

export type SharedEvent =
  | { on: string; kind: "started" }
  | {
      on: string;
      kind: "moment";
      momentType: string;
      title: string;
      description?: string;
      impact?: number;
      beliefAdded?: string;
      /** How the moment changed the thread: stronger | lighter | different. */
      effect?: string;
    }
  | {
      on: string;
      kind: "action-decided";
      title: string;
      durationMinutes?: number;
      instruction?: string;
      minimumVersion?: string;
      completionDefinition?: string;
      qualitiesCarried?: string[];
      /** How this thread is represented inside the action. */
      representedAs?: string;
    }
  | { on: string; kind: "action-done"; title: string }
  | {
      on: string;
      kind: "integrated";
      result: string;
      resolution?: string;
      contributionKind?: string;
      contribution?: string;
      reclaimed?: string[];
      stillValid?: string[];
      outdatedBeliefs?: string[];
      outsideControl?: string[];
      released?: string[];
      // Words written down to burn with the thread are deliberately absent. The
      // app promises the user they are let go of, so they never travel in a
      // share and the receiving app never displays them.
      conflicts?: SharedConflict[];
    };

/** The waiting container attached to a waiting thread, if any. */
export type SharedWaiting = {
  awaiting: string;
  actionTaken?: string;
  outsideControl?: string[];
  reviewDate?: string;
  reopenConditions?: string[];
  continueMeanwhile?: string[];
  reclaimedNow?: string[];
  closedAt?: string;
};

export type SharedThread = {
  id: string;
  title: string;
  description?: string;
  /** The thread's kind: event | waiting | projection | identity | relationship | body | project. */
  kind: string;
  /** Where the thread points: past | future | relationship | outside-control | identity | body | project. */
  orientation?: string;
  status: string;
  /** May precede `from` — the thread's whole life is context. */
  startedOn: string;
  startedLabel?: string;
  integratedOn?: string;
  /** Feelings this thread held while open (branch.occupies). */
  feelings?: string[];
  /** What the thread makes the person feel (named at creation). */
  anxieties?: string[];
  originalBelief?: string;
  currentBelief?: string;
  /** Needs identified on this thread. */
  needs?: string[];
  /** Qualities reclaimed when the thread integrated. */
  qualitiesReclaimed?: string[];
  /** changeable | influenceable | outside-control | unclear. */
  controllability?: string;
  /** Times the thread returned after being integrated. */
  returnedCount?: number;
  waiting?: SharedWaiting;
  /** Last entry before `from` as a baseline, then every change in [from, to]. */
  loudness: SharedLoudnessEntry[];
  /** Chronological within [from, to]. */
  events: SharedEvent[];
};

export type ShareExport = {
  app: "one-current-share";
  version: 1;
  /** ISO timestamp of the export. */
  exportedAt: string;
  /** ISO date — start of the shared window, chosen by the user. */
  from: string;
  /** ISO date — the day of the export. */
  to: string;
  threads: SharedThread[];
};
