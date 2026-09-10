/* Domain-level invariants, checked without a browser.
 *
 * The scripts next to this one drive the built app through Playwright, which
 * is the right tool for anything with a screen. These two invariants have no
 * screen and had no coverage — which is exactly why both regressions below
 * survived so long:
 *
 *   1. Every thread was silently typed "event"/"past" (the creation flow
 *      passes an id no BRANCH_KIND_CHOICES entry matches, and createBranch
 *      fell back to choice [0]). That made every conflict rule structurally
 *      unreachable: detectConflicts could never return anything.
 *   2. Loudness drifted +1 for every calendar day since the last decision,
 *      with no notion of the app having been closed — so a week away put
 *      every thread at maximum.
 *
 * Both run against the real domain modules, loaded via ./ts-load.mjs.
 */
import { loadDomain as load } from "./ts-load.mjs";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${ok || !detail ? "" : `\n        ${detail}`}`);
  if (!ok) failures++;
}

const { createBranch } = await load("branches/logic.mjs");
const { effectiveLoudness } = await load("branches/logic.mjs");
const { detectConflicts } = await load("conflicts/logic.mjs");
const { setPresentDays, withDay, daysAwayBefore } = await load("time/presence.mjs");
const { trackLoudness, loudnessSeries, reportedLoudnessCount, hasUnlabelledLoudness } =
  await load("branches/logic.mjs");
const { attemptAction, completeAction, handOffAction, isActionOpen } =
  await load("actions/logic.mjs");
const { applyWaitingToBranch, createWaitingContainer, isReviewDue } =
  await load("waiting/logic.mjs");
const { handledToday } = await load("feelings/logic.mjs");
const { whereThisStands, headlineOf } = await load("situations/where-this-stands.mjs");
const { buildBrief, renderBriefText } = await load("brief/build-brief.mjs");

const AT = new Date("2026-09-09T10:00:00.000Z");
const make = (title, kindChoiceId, extra = {}) => ({
  ...createBranch({ title, kindChoiceId, period: { kind: "today" }, loudness: 3 }, AT),
  ...extra,
});

console.log("\nthread kinds\n");

const unnamed = make("something on my mind", "unnamed");
check(
  'a thread created without a named kind is "unknown", not a past event',
  unnamed.type === "unknown" && unnamed.orientation === "unknown",
  `got type=${unnamed.type} orientation=${unnamed.orientation}`,
);
check(
  "an unnamed thread carries no kindChoiceId",
  unnamed.kindChoiceId === undefined,
  `got ${unnamed.kindChoiceId}`,
);

const named = make("the deadline", "project-idea");
check(
  "naming a kind at creation still resolves it",
  named.type === "project" && named.kindChoiceId === "project-idea",
  `got type=${named.type} id=${named.kindChoiceId}`,
);

console.log("\nconflict detection\n");

// The regression: with both threads typed "event"/"past", no rule can match.
const work = make("ship the release", "project-idea");
const body = make("my back", "body");
const found = detectConflicts([work, body]);
check(
  "two typed threads in tension produce a conflict",
  found.length > 0 && found.some((c) => c.type === "effort-vs-recovery"),
  `got ${found.length} conflict(s): ${found.map((c) => c.type).join(", ") || "none"}`,
);

check(
  "two unnamed threads produce none (an unnamed thread demands nothing)",
  detectConflicts([make("a", "unnamed"), make("b", "unnamed")]).length === 0,
);

check(
  "controllability alone still reaches a rule without naming a kind",
  detectConflicts([
    make("the visa", "unnamed", { controllability: "outside-control" }),
    make("the flat", "unnamed"),
  ]).some((c) => c.type === "action-vs-acceptance"),
);

console.log("\nloudness drift across absence\n");

const TODAY = AT.toISOString().slice(0, 10);
const ago = (days) => new Date(AT.getTime() - days * 86400000).toISOString().slice(0, 10);
const decided = (days) => ({
  ...make("the interview", "unnamed", { loudness: 2 }),
  lastDecisionOn: ago(days),
});

// Here every day, deciding nothing: the dial genuinely climbs. That is the
// honest half of the drift and must survive.
setPresentDays([7, 6, 5, 4, 3, 2, 1, 0].map(ago));
check(
  "one undecided day nudges the dial up",
  effectiveLoudness(decided(1), AT) === 3,
  `got ${effectiveLoudness(decided(1), AT)}`,
);
check(
  "present all week and answering nothing does reach the top",
  effectiveLoudness(decided(7), AT) === 5,
  `got ${effectiveLoudness(decided(7), AT)}`,
);

// Away the whole time: one day has passed since they were last here to answer,
// so the thread nudges once — it does not become an emergency by itself.
setPresentDays([ago(7), TODAY]);
check(
  "a week away does not push a quiet thread to maximum",
  effectiveLoudness(decided(7), AT) === 3,
  `got ${effectiveLoudness(decided(7), AT)} — a week's absence should not read as an emergency`,
);
check(
  "the gap itself is measurable, for the return card to speak to",
  daysAwayBefore(TODAY) === 6,
  `got ${daysAwayBefore(TODAY)}`,
);
check(
  "the presence log stays bounded and sorted",
  withDay([ago(3), ago(1)], TODAY, 2).join() === [ago(1), TODAY].join(),
  withDay([ago(3), ago(1)], TODAY, 2).join(),
);

console.log("\nloudness provenance\n");

// The dangerous confusion: the app easing a value after a decision, then
// showing it back as though the person had said it.
const dialled = trackLoudness(
  make("the move", "unnamed", { loudness: 2 }),
  { ...make("the move", "unnamed", { loudness: 2 }), loudness: 4 },
  AT,
  "reported",
);
const eased = trackLoudness(dialled, { ...dialled, loudness: 3 }, AT, "derived");

check(
  "the dial records the person speaking",
  dialled.loudnessLog.at(-1).source === "reported",
  dialled.loudnessLog.at(-1).source,
);
check(
  "an automatic ease records the app moving",
  eased.loudnessLog.at(-1).source === "derived",
  eased.loudnessLog.at(-1).source,
);
check(
  "trackLoudness defaults to derived, so a caller cannot bank a self-report by omission",
  trackLoudness(dialled, { ...dialled, loudness: 1 }, AT).loudnessLog.at(-1).source === "derived",
);
check(
  "only the person's answers are counted as reported",
  reportedLoudnessCount(eased) === 2,
  `${reportedLoudnessCount(eased)} (creation + one dial)`,
);

// The eased value must be absent from the series drawn back to the person.
const reportedValues = loudnessSeries(eased, 3, AT, { reportedOnly: true }).filter((v) => v !== null);
check(
  "the derived ease is not drawn in the person's own curve",
  !reportedValues.includes(3),
  `drawn: ${reportedValues.join(", ")}`,
);
check(
  "the full series still holds it, for anything that needs the real record",
  loudnessSeries(eased, 3, AT).filter((v) => v !== null).includes(3),
);

// History written before provenance existed must not be claimed either way.
const legacy = {
  ...make("an old thread", "unnamed"),
  loudnessLog: [{ at: ago(5) + "T09:00:00.000Z", loudness: 4 }],
};
check(
  "an unlabelled historical entry stays unknown, not reported",
  reportedLoudnessCount(legacy) === 0 && hasUnlabelledLoudness(legacy),
);
check(
  "and it is left out of the person's own curve rather than guessed at",
  loudnessSeries(legacy, 7, AT, { reportedOnly: true }).every((v) => v === null),
);

console.log("\naction outcomes\n");

const step = {
  id: "a1",
  title: "send the email",
  instruction: "",
  durationMinutes: 5,
  minimumVersion: "",
  qualitiesCarried: [],
  branchesIntegrated: [],
  completionDefinition: "",
  createdAt: AT.toISOString(),
};

check("a fresh step is open", isActionOpen(step) && !step.completedAt);
const tried = attemptAction(step, AT);
check(
  "an attempt is recorded without claiming completion",
  !!tried.attemptedAt && !tried.completedAt && isActionOpen(tried),
);
check("and it can still be finished afterwards", !!completeAction(tried).completedAt);

const handed = handOffAction(step, AT);
check(
  "handing a step off does NOT mark it performed",
  !!handed.handedOffAt && handed.completedAt === undefined,
  `completedAt=${handed.completedAt}`,
);
check("a handed-off step is no longer open work either", !isActionOpen(handed));

console.log("\ndispositions\n");

const situation = make("their answer about the dates", "unnamed", { loudness: 4 });
const container = createWaitingContainer(
  {
    branchId: situation.id,
    awaiting: "their answer about the dates",
    reviewDate: ago(-14), // a fortnight out
    actionTaken: "",
    outsideControl: [],
    reopenConditions: [],
    continueMeanwhile: [],
    reclaimedNow: [],
  },
  AT,
);
const waiting = applyWaitingToBranch(situation, container, AT);

check("waiting is a real state, not a rest", waiting.status === "waiting-with-boundaries");
check("it keeps its own container", waiting.waitingContainerId === container.id);
check(
  "and it stops asking every morning — otherwise waiting is just rest with extra steps",
  handledToday(waiting, new Date(AT.getTime() + 3 * 86400000)),
);
check(
  "the review is not due before its date",
  !isReviewDue(container, AT),
);
check(
  "and is due once the date arrives",
  isReviewDue(container, new Date(AT.getTime() + 15 * 86400000)),
);
check(
  "quietening the line is recorded as the app's move, not the person's",
  waiting.loudnessLog.at(-1).source === "derived",
);
check(
  "a closed wait stops being due, so it cannot revive twice",
  !isReviewDue({ ...container, closedAt: AT.toISOString() }, new Date(AT.getTime() + 99 * 86400000)),
);

console.log("\nwhere this stands\n");

const bare = make("something I keep circling", "unnamed");
const bareStands = whereThisStands({ branch: bare, actions: [], merges: [], waiting: [] });
check(
  "a situation with nothing recorded says so, rather than inventing a next step",
  bareStands.empty && bareStands.lines.length === 0,
  `${bareStands.lines.length} line(s): ${bareStands.lines.map((l) => l.label).join(", ")}`,
);
check("and offers no headline to lead with", headlineOf(bareStands) === undefined);

const lived = {
  ...make("the conversation with R", "relationship"),
  commits: [{ id: "m1", date: ago(3), title: "R brought it up first", type: "event" }],
  unmetNeeds: ["to know where I stand"],
};
const livedActions = [
  {
    id: "a1",
    title: "write down what I actually want to say",
    instruction: "",
    durationMinutes: 10,
    minimumVersion: "",
    qualitiesCarried: [],
    completionDefinition: "",
    createdAt: ago(2) + "T09:00:00.000Z",
    attemptedAt: ago(1) + "T09:00:00.000Z",
    branchesIntegrated: [{ branchId: lived.id, branchTitle: lived.title, representedAs: "" }],
  },
];
const livedStands = whereThisStands({
  branch: lived,
  actions: livedActions,
  merges: [],
  waiting: [],
});
const labels = livedStands.lines.map((l) => l.label);
check("it surfaces the latest development", labels.includes("Latest"));
check(
  "an attempt never reads as something done",
  !labels.includes("You did"),
  labels.join(", "),
);
check(
  "an attempted step that is still open says so once, as the next thing",
  livedStands.lines.some((l) => l.kind === "next" && l.label === "Still to finish") &&
    labels.filter((l) => l === "Still to finish" || l === "You tried").length === 1,
  labels.join(", "),
);
// An attempt that has since been superseded is history, and reads that way.
const supersededStands = whereThisStands({
  branch: lived,
  actions: [
    ...livedActions,
    {
      ...livedActions[0],
      id: "a2",
      title: "just say it on Tuesday",
      createdAt: ago(0) + "T09:00:00.000Z",
      attemptedAt: undefined,
    },
  ],
  merges: [],
  waiting: [],
});
const supersededLabels = supersededStands.lines.map((l) => l.label);
check(
  "and an older attempt is still shown as an attempt",
  supersededLabels.includes("You tried") && supersededLabels.includes("Next step"),
  supersededLabels.join(", "),
);
check("and what is unresolved stays visible", labels.includes("Still open"));
check(
  "every line is attributed — nothing is silently the app's opinion",
  livedStands.lines.every((l) => l.voice === "theirs" || l.voice === "app"),
);
check(
  "the person's own words are never rewritten",
  livedStands.lines.some((l) => l.text === "R brought it up first" && l.voice === "theirs"),
);

console.log("\nconversation brief\n");

const brief = buildBrief({
  branches: [lived, bare],
  actions: livedActions,
  merges: [],
  waiting: [],
  branchIds: [lived.id, bare.id],
  now: AT,
});
check("a brief covers each chosen situation", brief.sections.length === 2);
check(
  "a situation with nothing recorded still gets an honest line rather than a blank",
  brief.sections[1].lines.length === 1 && brief.sections[1].lines[0].voice === "app",
);

const rendered = renderBriefText(brief);
check("the rendered brief names the situation", rendered.includes("the conversation with R"));
check("and carries the person's words verbatim", rendered.includes("R brought it up first"));

// Dropping a line must actually drop it — the preview is the artefact.
const trimmed = {
  ...brief,
  sections: brief.sections.map((sec) => ({
    ...sec,
    lines: sec.lines.map((l) => ({ ...l, include: l.label !== "Latest" })),
  })),
};
check(
  "a line left out does not appear in what is handed over",
  !renderBriefText(trimmed).includes("R brought it up first"),
);
check(
  "an empty question is not rendered as a blank bullet",
  !renderBriefText({ ...brief, questions: [{ id: "q", label: "Question", text: "  ", include: true, voice: "theirs" }] })
    .includes("To ask"),
);

console.log(`\n${failures} failure(s).\n`);
process.exit(failures > 0 ? 1 : 0);
