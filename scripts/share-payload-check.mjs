/* What the share builder actually emits. Two things must hold: words written
   down to burn never appear at any depth, and every key the builder emits has
   a plain-English label in the "what leaves the app" list shown before sending.

   Run: node --experimental-strip-types scripts/share-payload-check.mjs */
import { buildShareExport } from "../src/domain/share/build-share-export.ts";
import { describeShareFields } from "../src/domain/share/describe-fields.ts";

const results = [];
const check = (label, ok, detail = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);

const NOW = new Date("2026-08-20T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();
const day = (daysAgo) => iso(daysAgo).slice(0, 10);

const BURNED = "I AM THE BURNED SECRET";

/** One thread carrying every field the builder can reach. */
const branch = {
  id: "b1",
  title: "The unanswered message",
  description: "It sits there every morning.",
  type: "projection",
  orientation: "future",
  status: "merged",
  forkDate: day(40),
  forkLabel: "about a month ago",
  firstCreatedAt: iso(40),
  mergeDate: day(2),
  occupies: ["dread", "shame"],
  anxieties: ["that I have already lost them"],
  originalBelief: "If I wait they will forget",
  currentBelief: "They are busy, like me",
  controllability: "influenceable",
  recurrenceCount: 2,
  loudness: 3,
  loudnessLog: [
    { at: iso(38), loudness: 2 }, // before the window: the baseline
    { at: iso(30), loudness: 3 },
    { at: iso(12), loudness: 4 },
    { at: iso(3), loudness: 1 },
  ],
  commits: [
    {
      id: "c1",
      branchId: "b1",
      type: "insight",
      date: day(10),
      title: "Saw it was not about them",
      description: "It was about being forgettable.",
      emotionalImpact: 4,
      beliefAdded: "I can be the one who reaches out",
      effect: "lighter",
    },
  ],
  storedQualities: ["connection"],
  unmetNeeds: ["to be answered"],
  burned: [BURNED],
};

const action = {
  id: "a1",
  title: "Write one line back",
  createdAt: iso(6),
  completedAt: iso(5),
  durationMinutes: 5,
  instruction: "One line, no explaining",
  minimumVersion: "Send a single sentence",
  completionDefinition: "It is sent",
  qualitiesCarried: ["connection"],
  branchesIntegrated: [
    { branchId: "b1", representedAs: "the thread that wanted answering" },
  ],
};

const merge = {
  id: "m1",
  branchIds: ["b1"],
  createdAt: iso(2),
  resultStatus: "merged",
  resolution: "Answered, and it was fine.",
  contributionKind: "lesson",
  contribution: "People are busy, not gone",
  reclaimedQualities: ["connection"],
  stillValid: ["I want to be answered"],
  outdatedBeliefs: ["Silence means loss"],
  outsideControl: ["when they reply"],
  released: ["the daily checking"],
  burned: [BURNED, "and this second one too"],
  conflicts: [
    {
      type: "value-clash",
      demandA: "Reach out now",
      demandB: "Keep my dignity",
      resolution: "One line, then let it rest.",
    },
  ],
};

const waiting = [
  {
    id: "w1",
    branchId: "b1",
    awaiting: "their reply",
    actionTaken: "sent one line",
    outsideControl: ["their timing"],
    reviewDate: day(-7),
    reopenConditions: ["a week with no word"],
    continueMeanwhile: ["my own week"],
    reclaimedNow: ["evenings"],
  },
];

/** A second thread that began inside the window, so "started" can be seen. */
const freshBranch = {
  ...branch,
  id: "b2",
  title: "The thing that started this week",
  status: "active",
  forkDate: day(4),
  firstCreatedAt: iso(4),
  mergeDate: undefined,
  commits: [],
  loudnessLog: [{ at: iso(3), loudness: 2 }],
  burned: [],
};

const share = buildShareExport({
  branches: [branch, freshBranch],
  actions: [action],
  merges: [merge],
  waiting,
  selectedIds: ["b1", "b2"],
  from: day(35),
  now: NOW,
});

const json = JSON.stringify(share);

// ── 1. burned words never travel ────────────────────────────────────────
check("no 'burned' key anywhere in the payload", !/"burned"/.test(json));
check(
  "the burned words themselves are absent",
  !json.includes(BURNED),
  json.includes(BURNED) ? "found in payload" : "",
);
// The fixture really did carry them, or the check above proves nothing.
check(
  "the fixture did carry burned words to begin with",
  branch.burned.includes(BURNED) && merge.burned.includes(BURNED),
);

// ── 2. everything that does travel is described to the user ─────────────
const described = describeShareFields(share);
check(
  "no share field leaves the app undescribed",
  described.unlabelled.length === 0,
  described.unlabelled.join(", "),
);
check(
  "the description is not empty for a full thread",
  described.threadFields.length > 10 && described.eventFields.length > 10,
  `thread=${described.threadFields.length} event=${described.eventFields.length}`,
);

// ── 3. the payload carries what a session needs ─────────────────────────
const thread = share.threads.find((th) => th.id === "b1");
const fresh = share.threads.find((th) => th.id === "b2");
const kinds = thread.events.map((e) => e.kind);
for (const kind of ["moment", "action-decided", "action-done", "integrated"]) {
  check(`the window carries its '${kind}' event`, kinds.includes(kind));
}
check(
  "a thread that began inside the window carries its 'started' event",
  fresh.events.some((e) => e.kind === "started"),
);
check(
  "a thread that began before the window carries no 'started' event",
  !kinds.includes("started"),
);
// The curve cannot be drawn from the window alone: the last rating before it
// is carried as a baseline. That is deliberate, and the "what leaves the app"
// list discloses it as "every loudness rating you set, with its date".
check(
  "the loudness log carries a pre-window baseline",
  thread.loudness.length >= 2 && thread.loudness[0].at.slice(0, 10) < share.from,
  `first=${thread.loudness[0]?.at} from=${share.from}`,
);
check(
  "only one entry predates the window",
  thread.loudness.filter((e) => e.at.slice(0, 10) < share.from).length === 1,
);

// ── 4. a share of nothing is still a valid document ─────────────────────
const empty = buildShareExport({
  branches: [branch],
  actions: [],
  merges: [],
  waiting: [],
  selectedIds: [],
  from: day(35),
  now: NOW,
});
check("selecting nothing shares no threads", empty.threads.length === 0);
check("an empty share is still a v1 document", empty.app === "one-current-share" && empty.version === 1);

console.log(results.join("\n"));
const failures = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures > 0 ? 1 : 0);
