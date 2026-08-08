import type { PsychologicalBranch } from "@/domain/branches/types";
import type { BranchMerge } from "@/domain/merges/types";
import type { IntegratedAction } from "@/domain/actions/types";
import type { BranchCommit } from "@/domain/moments/types";
import { composeIntegratedAction } from "@/domain/actions/logic";
import { newId } from "@/domain/ids";

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * DAY).toISOString();
}

type BranchSeed = Partial<PsychologicalBranch> &
  Pick<PsychologicalBranch, "title" | "type" | "orientation" | "forkDate" | "loudness">;

function branch(seed: BranchSeed): PsychologicalBranch {
  return {
    id: newId("br"),
    status: "active",
    storedQualities: [],
    unmetNeeds: [],
    controllability: "unclear",
    commits: [],
    mergeIds: [],
    firstCreatedAt: `${seed.forkDate}T09:00:00.000Z`,
    lastActivatedAt: new Date().toISOString(),
    recurrenceCount: 0,
    ...seed,
  };
}

function moment(
  branchId: string,
  date: string,
  title: string,
  type: BranchCommit["type"],
  effect?: BranchCommit["effect"],
): BranchCommit {
  return { id: newId("mo"), branchId, date, title, type, effect };
}

/**
 * A believable in-use timeline: lines of every kind at different distances
 * from Now — drifting, resting, merged, converted. Every open line
 * names the anxieties it stirs and the feelings those hold, so the
 * energy split and the integration summary have something real to show.
 */
export function buildExampleData(): {
  branches: PsychologicalBranch[];
  merges: BranchMerge[];
  actions: IntegratedAction[];
} {
  const today = daysAgo(0);

  // Drifting hard: nothing decided since the call. Anger locks calm and patience.
  const father = branch({
    title: "The argument with my father",
    type: "event",
    orientation: "past",
    forkDate: daysAgo(24),
    loudness: 4,
    controllability: "influenceable",
    unmetNeeds: ["being heard"],
    anxieties: ["anger", "guilt"],
    occupies: ["calm", "patience", "self-trust"],
  });
  father.commits = [
    moment(father.id, daysAgo(24), "The phone call that went wrong", "event", "stronger"),
    moment(father.id, daysAgo(10), "He texted first", "relief", "lighter"),
  ];

  // Outside her control, but decided: the scan is booked, the date is set.
  const scan = branch({
    title: "Waiting for the scan results",
    type: "waiting",
    orientation: "outside-control",
    forkDate: daysAgo(18),
    loudness: 4,
    controllability: "outside-control",
    lastDecisionOn: daysAgo(2),
    anxieties: ["worry", "dread"],
    occupies: ["calm", "sleep", "hope"],
  });
  scan.commits = [
    moment(scan.id, daysAgo(2), "Decided not to search symptoms at night", "action", "lighter"),
  ];

  // The heaviest line: money maths at 4am. Undecided, sits far from Now.
  const rent = branch({
    title: "The rent increase letter",
    type: "projection",
    orientation: "future",
    forkDate: daysAgo(9),
    loudness: 5,
    controllability: "influenceable",
    unmetNeeds: ["security"],
    anxieties: ["worry", "overwhelm"],
    occupies: ["calm", "sleep", "focus"],
  });
  rent.commits = [
    moment(rent.id, daysAgo(4), "Woke at 4am doing the maths again", "intensification", "stronger"),
  ];

  // Quiet comparison loop: scrolling an old classmate's promotion.
  const career = branch({
    title: "Everyone seems further along than me",
    type: "identity",
    orientation: "future",
    forkDate: daysAgo(45),
    loudness: 3,
    controllability: "changeable",
    anxieties: ["envy", "restlessness"],
    occupies: ["confidence", "self-trust", "presence"],
  });
  career.commits = [
    moment(career.id, daysAgo(6), "Saw the promotion post, spiralled a bit", "event", "stronger"),
  ];

  // A friendship gone quiet. A small decision three days ago eased it.
  const jonas = branch({
    title: "Jonas and the unanswered message",
    type: "relationship",
    orientation: "relationship",
    forkDate: daysAgo(70),
    forkLabel: "since his birthday",
    loudness: 3,
    controllability: "influenceable",
    lastDecisionOn: daysAgo(3),
    anxieties: ["loneliness", "sadness"],
    occupies: ["closeness", "joy"],
  });

  // An old ending that still flickers. Touched today: close to the main line.
  const ana = branch({
    title: "How things ended with Ana",
    type: "relationship",
    orientation: "past",
    forkDate: daysAgo(420),
    forkLabel: "since the breakup",
    loudness: 2,
    controllability: "outside-control",
    lastDecisionOn: today,
    anxieties: ["regret", "sadness"],
    occupies: ["presence", "self-trust"],
  });
  ana.commits = [
    moment(ana.id, daysAgo(0), "Wrote the letter I will never send", "action", "lighter"),
  ];

  // Left on purpose today: the sleep routine can wait until the deadline passes.
  const sleep = branch({
    title: "My sleep is a mess again",
    type: "body",
    orientation: "body",
    forkDate: daysAgo(30),
    loudness: 2,
    controllability: "changeable",
    leftOn: today,
    lastDecisionOn: today,
    anxieties: ["guilt", "restlessness"],
    occupies: ["energy", "lightness"],
  });

  // Handed off to real work: the dream stopped being a haunting and became tasks.
  const bakery = branch({
    title: "The little bakery idea",
    type: "project",
    orientation: "project",
    status: "converted-to-project",
    forkDate: daysAgo(300),
    forkLabel: "since the sourdough summer",
    mergeDate: daysAgo(1),
    loudness: 1,
    controllability: "changeable",
    storedQualities: ["playfulness", "patience"],
    lastDecisionOn: daysAgo(1),
    anxieties: ["restlessness"],
    occupies: ["joy"],
  });

  // Merged recently: curves back into the main line.
  const move = branch({
    title: "Should we have moved here at all",
    type: "event",
    orientation: "past",
    status: "merged",
    forkDate: daysAgo(160),
    loudness: 1,
    controllability: "outside-control",
    mergeDate: daysAgo(11),
    lastDecisionOn: daysAgo(11),
    anxieties: ["regret"],
    occupies: ["presence"],
  });
  const moveMerge: BranchMerge = {
    id: newId("mg"),
    branchIds: [move.id],
    createdAt: isoDaysAgo(11),
    stillValid: ["We chose this together, for real reasons"],
    outdatedBeliefs: ["The other city would have fixed everything"],
    outsideControl: [],
    reclaimedQualities: ["presence"],
    conflicts: [],
    resolution: "The move is done. Comparing lives that never happened kept me out of this one.",
    contributionKind: "lesson",
    contribution: "I can stop re-deciding decided things.",
    released: ["Browsing flats in the old city"],
    resultStatus: "merged",
  };
  move.mergeIds = [moveMerge.id];

  // Merged long ago: only visible when zoomed out.
  const exam = branch({
    title: "The exam I failed at twenty",
    type: "identity",
    orientation: "past",
    status: "merged",
    forkDate: daysAgo(900),
    forkLabel: "the failed year",
    loudness: 1,
    controllability: "outside-control",
    mergeDate: daysAgo(120),
    lastDecisionOn: daysAgo(120),
    storedQualities: ["persistence"],
  });
  const examMerge: BranchMerge = {
    id: newId("mg"),
    branchIds: [exam.id],
    createdAt: isoDaysAgo(120),
    stillValid: ["I retook it and passed"],
    outdatedBeliefs: ["That year proved something about my worth"],
    outsideControl: [],
    reclaimedQualities: ["persistence"],
    conflicts: [],
    resolution: "It became a story I tell, not a wound I carry.",
    contributionKind: "quality",
    contribution: "Persistence, earned the hard way.",
    released: ["Flinching whenever exams come up"],
    resultStatus: "merged",
  };
  exam.mergeIds = [examMerge.id];

  const actions = [
    composeIntegratedAction({
      branches: [rent],
      title: "Read the letter once, note the two numbers",
      instruction: "New rent, deadline to respond. Nothing else today.",
      durationMinutes: 10,
      minimumVersion: "Just the deadline date",
      qualitiesCarried: [],
      completionDefinition: "When it has been done once today",
    }),
    composeIntegratedAction({
      branches: [jonas],
      title: "Send Jonas one honest message",
      instruction: "One message. Not the whole conversation.",
      durationMinutes: 5,
      minimumVersion: "A single sentence",
      qualitiesCarried: [],
      completionDefinition: "When it has been done once today",
    }),
    composeIntegratedAction({
      branches: [father],
      title: "Reply to his text, even briefly",
      instruction: "He reached out first. A short answer keeps the door open.",
      durationMinutes: 5,
      minimumVersion: "Two sentences",
      qualitiesCarried: [],
      completionDefinition: "When it has been done once today",
    }),
  ];

  return {
    branches: [father, scan, rent, career, jonas, ana, sleep, bakery, move, exam],
    merges: [moveMerge, examMerge],
    actions,
  };
}
