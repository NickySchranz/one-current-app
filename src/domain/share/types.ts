/**
 * The share-with-psychologist file format, version 1. This is a fixed
 * contract with the psychologist companion app (one-current-psycho):
 * change it only by bumping the version on both sides.
 *
 * Importer tolerances: `loudness` may be empty (threads created before the
 * log existed), every optional field may be absent, and a merge or action
 * that spans several threads appears under each of them.
 *
 * Versioning: a NEW OPTIONAL field may be added within a version — every
 * importer already tolerates absent optionals, so an older reader simply does
 * not render it. Anything else (a renamed field, a changed meaning, a new
 * required field) bumps the version on both sides.
 */

export type SharedLoudnessEntry = {
  /** ISO timestamp of the change. */
  at: string;
  /** 1 (quiet) to 5; fractional values are fine. */
  loudness: number;
  /**
   * Who moved it. "reported" is the person's own answer; "derived" is the app
   * easing it after a decision or an integration. **Absent means unknown** —
   * written before provenance was recorded, and not safe to read as either.
   * A clinician must not read a derived value as a self-report.
   */
  source?: "reported" | "derived";
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
  /** The window's loudness in words — quiet | murmuring | speaking | calling |
   * loud — so the page names levels exactly as the person's own dial does.
   * Absent when the thread logged nothing in the window. */
  loudnessWas?: string;
  loudnessNow?: string;
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
  /** The window at a glance, so a "since last session" page can open with it
   * rather than recomputing from events. Derived — never a separate truth. */
  summary?: {
    /** Threads that started inside the window. */
    opened: number;
    /** Threads that integrated inside the window. */
    integrated: number;
    /** Feelings still held by a shared thread at the end of the window. */
    heldThrough: string[];
    /** Feelings released by threads that integrated inside the window. */
    cameBack: string[];
  };
};
