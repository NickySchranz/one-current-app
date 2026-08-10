import type { LoudnessLogEntry, PsychologicalBranch } from "@/domain/branches/types";
import type { BranchMerge } from "@/domain/merges/types";
import type { IntegratedAction } from "@/domain/actions/types";
import type { BranchCommit } from "@/domain/moments/types";
import type { WaitingContainer } from "@/domain/waiting/types";
import { composeIntegratedAction } from "@/domain/actions/logic";
import { newId } from "@/domain/ids";

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * DAY).toISOString();
}

/** Loudness changes as [daysAgo, level] pairs, oldest first. */
function loudnessLog(entries: [number, number][]): LoudnessLogEntry[] {
  return entries.map(([n, loudness]) => ({ at: isoDaysAgo(n), loudness }));
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
  extras?: Pick<BranchCommit, "description" | "emotionalImpact" | "beliefAdded">,
): BranchCommit {
  return { id: newId("mo"), branchId, date, title, type, effect, ...extras };
}

/**
 * A believable in-use timeline: lines of every kind at different distances
 * from Now — drifting, resting, waiting with boundaries, merged, converted.
 * Every field the app tracks appears somewhere: loudness histories, beliefs,
 * felt impact on moments, a waiting container, a worked-through tension,
 * decided-and-done actions — so every view (and a share file built from
 * this data) has something real to show.
 */
export function buildExampleData(): {
  branches: PsychologicalBranch[];
  merges: BranchMerge[];
  actions: IntegratedAction[];
  waiting: WaitingContainer[];
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
    description: "Three weeks of near-silence since the phone call.",
    originalBelief: "He will never actually hear me",
    currentBelief: "He reached out first — something can move",
    unmetNeeds: ["being heard"],
    anxieties: ["anger", "guilt"],
    occupies: ["calm", "patience", "self-trust"],
    loudnessLog: loudnessLog([
      [24, 3],
      [17, 3.6],
      [10, 3.2],
      [5, 4],
    ]),
  });
  father.commits = [
    moment(father.id, daysAgo(24), "The phone call that went wrong", "event", "stronger", {
      description: "He hung up mid-sentence. I kept arguing out loud to an empty room.",
      emotionalImpact: 5,
      beliefAdded: "He will never actually hear me",
    }),
    moment(father.id, daysAgo(10), "He texted first", "relief", "lighter", {
      description: "Four words, but he wrote them.",
      emotionalImpact: 2,
    }),
  ];

  // Outside her control, but contained: the scan is done, boundaries are set.
  const scan = branch({
    title: "Waiting for the scan results",
    type: "waiting",
    orientation: "outside-control",
    status: "waiting-with-boundaries",
    forkDate: daysAgo(18),
    loudness: 4,
    controllability: "outside-control",
    description: "The clinic said ten working days.",
    originalBelief: "Not hearing anything means it is bad",
    lastDecisionOn: daysAgo(2),
    anxieties: ["worry", "dread"],
    occupies: ["calm", "sleep", "hope"],
    loudnessLog: loudnessLog([
      [18, 3.5],
      [12, 4.4],
      [6, 4.8],
      [2, 4],
    ]),
  });
  scan.commits = [
    moment(scan.id, daysAgo(2), "Decided not to search symptoms at night", "action", "lighter", {
      description: "Phone stays outside the bedroom until the results come.",
      emotionalImpact: 3,
    }),
  ];
  const scanWaiting: WaitingContainer = {
    id: newId("wt"),
    branchId: scan.id,
    createdAt: isoDaysAgo(2),
    awaiting: "The scan results from the clinic",
    actionTaken: "Scan done; asked for the results in writing",
    outsideControl: ["The lab's timeline", "The result itself"],
    reviewDate: daysAgo(-5),
    reopenConditions: ["The clinic calls earlier", "New symptoms appear"],
    continueMeanwhile: ["Morning runs", "The work project"],
    reclaimedNow: ["sleep"],
  };
  scan.waitingContainerId = scanWaiting.id;

  // The heaviest line: money maths at 4am. Undecided, sits far from Now.
  const rent = branch({
    title: "The rent increase letter",
    type: "projection",
    orientation: "future",
    forkDate: daysAgo(9),
    loudness: 5,
    controllability: "influenceable",
    description: "Opened it, saw the number, put it back in the drawer.",
    originalBelief: "We are going to lose the flat",
    unmetNeeds: ["security"],
    anxieties: ["worry", "overwhelm"],
    occupies: ["calm", "sleep", "focus"],
    loudnessLog: loudnessLog([
      [9, 4],
      [6, 4.6],
      [4, 5],
    ]),
  });
  rent.commits = [
    moment(rent.id, daysAgo(4), "Woke at 4am doing the maths again", "intensification", "stronger", {
      description: "Ran the numbers three times. Same result every time.",
      emotionalImpact: 4,
    }),
  ];

  // Quiet comparison loop: scrolling an old classmate's promotion.
  const career = branch({
    title: "Everyone seems further along than me",
    type: "identity",
    orientation: "future",
    forkDate: daysAgo(45),
    loudness: 3,
    controllability: "changeable",
    originalBelief: "I am behind for good",
    currentBelief: "Comparing timelines measures nothing real",
    anxieties: ["envy", "restlessness"],
    occupies: ["confidence", "self-trust", "presence"],
    loudnessLog: loudnessLog([
      [45, 2.5],
      [30, 2],
      [6, 3.4],
      [3, 3],
    ]),
  });
  career.commits = [
    moment(career.id, daysAgo(6), "Saw the promotion post, spiralled a bit", "event", "stronger", {
      emotionalImpact: 3,
      beliefAdded: "Everyone my age has already made it",
    }),
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
    description: "His birthday passed without a word from either side.",
    lastDecisionOn: daysAgo(3),
    anxieties: ["loneliness", "sadness"],
    occupies: ["closeness", "joy"],
    loudnessLog: loudnessLog([
      [70, 2],
      [40, 2.6],
      [12, 3.4],
      [3, 3],
    ]),
  });

  // An old ending that still flickers — it has come back twice already.
  const ana = branch({
    title: "How things ended with Ana",
    type: "relationship",
    orientation: "past",
    forkDate: daysAgo(420),
    forkLabel: "since the breakup",
    loudness: 2,
    controllability: "outside-control",
    originalBelief: "I ruined something that could have been saved",
    currentBelief: "It ended between two people, not because of one",
    recurrenceCount: 2,
    lastDecisionOn: today,
    anxieties: ["regret", "sadness"],
    occupies: ["presence", "self-trust"],
    loudnessLog: loudnessLog([
      [420, 4],
      [300, 3],
      [120, 2.2],
      [0, 2],
    ]),
  });
  ana.commits = [
    moment(ana.id, daysAgo(0), "Wrote the letter I will never send", "action", "lighter", {
      description: "Two pages. It stays in the drawer.",
      emotionalImpact: 2,
    }),
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
    loudnessLog: loudnessLog([
      [30, 3],
      [14, 2.4],
      [0, 2],
    ]),
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
    originalBelief: "It only counts if I quit everything for it",
    currentBelief: "Small real steps beat the grand fantasy",
    storedQualities: ["playfulness", "patience"],
    lastDecisionOn: daysAgo(1),
    anxieties: ["restlessness"],
    occupies: ["joy"],
    loudnessLog: loudnessLog([
      [300, 3],
      [200, 2.2],
      [60, 1.6],
      [1, 1],
    ]),
  });
  const bakeryMerge: BranchMerge = {
    id: newId("mg"),
    branchIds: [bakery.id],
    createdAt: isoDaysAgo(1),
    stillValid: ["Baking is where the joy actually lives"],
    outdatedBeliefs: ["It only counts if I quit everything for it"],
    outsideControl: [],
    reclaimedQualities: ["playfulness", "patience"],
    conflicts: [],
    resolution: "It stopped being a daydream that ached and became a plan with dates.",
    contributionKind: "project",
    contribution: "A weekend market stall, booked for next month.",
    released: ["Fantasising instead of kneading"],
    resultStatus: "converted-to-project",
  };
  bakery.mergeIds = [bakeryMerge.id];

  // Merged recently: curves back into the main line — one tension worked through.
  const move = branch({
    title: "Should we have moved here at all",
    type: "event",
    orientation: "past",
    status: "merged",
    forkDate: daysAgo(160),
    loudness: 1,
    controllability: "outside-control",
    originalBelief: "The other city would have fixed everything",
    currentBelief: "We chose this together, for real reasons",
    mergeDate: daysAgo(11),
    lastDecisionOn: daysAgo(11),
    anxieties: ["regret"],
    occupies: ["presence"],
    loudnessLog: loudnessLog([
      [160, 3.4],
      [90, 2.6],
      [11, 1],
    ]),
  });
  const moveMerge: BranchMerge = {
    id: newId("mg"),
    branchIds: [move.id],
    createdAt: isoDaysAgo(11),
    stillValid: ["We chose this together, for real reasons"],
    outdatedBeliefs: ["The other city would have fixed everything"],
    outsideControl: [],
    reclaimedQualities: ["presence"],
    conflicts: [
      {
        id: newId("cf"),
        type: "action-vs-acceptance",
        branchIds: [move.id],
        demandA: "Undo the decision — plan the move back",
        demandB: "Accept the life that is actually here",
        preservedTruths: ["Missing the people there is real"],
        rejectedExcesses: ["Re-running the decision every quiet evening"],
        resolution: "Visit twice a year; live here the rest of it.",
      },
    ],
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
    originalBelief: "That year proved something about my worth",
    currentBelief: "It became a story I tell, not a wound I carry",
    mergeDate: daysAgo(120),
    lastDecisionOn: daysAgo(120),
    storedQualities: ["persistence"],
    loudnessLog: loudnessLog([
      [900, 2],
      [120, 1],
    ]),
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
    composeIntegratedAction(
      {
        branches: [rent],
        title: "Read the letter once, note the two numbers",
        instruction: "New rent, deadline to respond. Nothing else today.",
        durationMinutes: 10,
        minimumVersion: "Just the deadline date",
        qualitiesCarried: [],
        completionDefinition: "When it has been done once today",
      },
      new Date(isoDaysAgo(1)),
    ),
    // Decided three days ago, done the day after — a full decided-and-done pair.
    {
      ...composeIntegratedAction(
        {
          branches: [jonas],
          title: "Send Jonas one honest message",
          instruction: "One message. Not the whole conversation.",
          durationMinutes: 5,
          minimumVersion: "A single sentence",
          qualitiesCarried: ["closeness"],
          completionDefinition: "When it has been done once today",
        },
        new Date(isoDaysAgo(3)),
      ),
      completedAt: isoDaysAgo(2),
    },
    composeIntegratedAction({
      branches: [father],
      title: "Reply to his text, even briefly",
      instruction: "He reached out first. A short answer keeps the door open.",
      durationMinutes: 5,
      minimumVersion: "Two sentences",
      qualitiesCarried: ["patience"],
      completionDefinition: "When it has been done once today",
    }),
  ];

  return {
    branches: [father, scan, rent, career, jonas, ana, sleep, bakery, move, exam],
    merges: [bakeryMerge, moveMerge, examMerge],
    actions,
    waiting: [scanWaiting],
  };
}
