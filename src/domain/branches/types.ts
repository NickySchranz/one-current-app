import type { BranchCommit } from "../moments/types";

export type BranchOrientation =
  | "past"
  | "future"
  | "relationship"
  | "outside-control"
  | "identity"
  | "body"
  | "project";

export type BranchType =
  | "event"
  | "waiting"
  | "projection"
  | "identity"
  | "relationship"
  | "body"
  | "project";

export type BranchStatus =
  | "active"
  | "activated"
  | "explored"
  | "ready-to-merge"
  | "merge-conflict"
  | "waiting-with-boundaries"
  | "converted-to-project"
  | "partly-integrated"
  | "merged"
  | "archived"
  | "needs-support";

export type Controllability =
  | "changeable"
  | "influenceable"
  | "outside-control"
  | "unclear";

/** How loud a thread is, from 1 (quiet) to 5. Fractional values are fine — the slider moves in fine steps. */
export type Loudness = number;

export type PsychologicalBranch = {
  id: string;
  title: string;
  description?: string;
  type: BranchType;
  orientation: BranchOrientation;
  status: BranchStatus;
  /** ISO date at which the branch forked from the main line. */
  forkDate: string;
  /** Human label for approximate periods, e.g. "around spring 2024". */
  forkLabel?: string;
  loudness: Loudness;
  originalBelief?: string;
  currentBelief?: string;
  storedQualities: string[];
  unmetNeeds: string[];
  controllability: Controllability;
  /** What this line makes you feel while it is open — named at creation, tap-only. */
  anxieties?: string[];
  /** Feelings this line occupies while it stays open — what returns to the main line when it is decided on or merged. */
  occupies?: string[];
  /** ISO date on which the user decided nothing can move today; the line rests, visibly weaker, until the next day. */
  leftOn?: string;
  /** ISO date of the most recent decision about this branch. Undecided days let the loudness drift upward. */
  lastDecisionOn?: string;
  /** ISO date the loudness dial was last set by hand. Setting it re-anchors the daily drift: what you set is what is felt. */
  loudnessSetOn?: string;
  commits: BranchCommit[];
  mergeIds: string[];
  /** ISO date at which the branch merged back; set when status is merged/partly-integrated. */
  mergeDate?: string;
  waitingContainerId?: string;
  /** What has changed since the fork (selected in the diff stage). */
  diffSelections?: string[];
  /** In-progress preserve-and-release sorting, kept until a merge carries it. */
  preserveRelease?: {
    stillValid: string[];
    outdated: string[];
    outsideControl: string[];
    reclaimable: string[];
  };
  firstCreatedAt: string;
  lastActivatedAt: string;
  recurrenceCount: number;
};

/** Coarse answers a user can give for when a branch began. */
export type ForkPeriodChoice =
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "this-week" }
  | { kind: "this-month" }
  | { kind: "approximate-date"; date: string }
  | { kind: "life-period"; label: string; approximateDate: string }
  | { kind: "unsure" };

/** The nine human framings offered at branch creation, mapped to type + orientation. */
export type BranchKindChoice = {
  id: string;
  label: string;
  type: BranchType;
  orientation: BranchOrientation;
};

export const BRANCH_KIND_CHOICES: BranchKindChoice[] = [
  { id: "something-happened", label: "Something happened", type: "event", orientation: "past" },
  { id: "waiting", label: "I am waiting for something", type: "waiting", orientation: "outside-control" },
  { id: "feared-future", label: "I am afraid of a future outcome", type: "projection", orientation: "future" },
  { id: "future-self", label: "I am attached to a future version of myself", type: "identity", orientation: "future" },
  { id: "past-self", label: "I am attached to a past version of myself", type: "identity", orientation: "past" },
  { id: "relationship", label: "A relationship remains active in my mind", type: "relationship", orientation: "relationship" },
  { id: "outside-control", label: "Something outside my control is consuming me", type: "waiting", orientation: "outside-control" },
  { id: "body", label: "My body is affecting everything", type: "body", orientation: "body" },
  { id: "project-idea", label: "An idea needs to become a real project", type: "project", orientation: "project" },
];

/** Statuses whose line still reaches Now as a separate process. */
export const OPEN_STATUSES: BranchStatus[] = [
  "active",
  "activated",
  "explored",
  "ready-to-merge",
  "merge-conflict",
  "waiting-with-boundaries",
  "partly-integrated",
  "needs-support",
];

/** Statuses that end at a merge point and no longer continue separately.
 * "converted-to-project" means handed off to real work: the app is for what
 * occupies the mind, so the line ends here — the work lives with your tasks. */
export const CLOSED_STATUSES: BranchStatus[] = ["merged", "converted-to-project", "archived"];
