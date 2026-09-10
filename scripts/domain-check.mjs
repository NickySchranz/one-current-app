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

console.log(`\n${failures} failure(s).\n`);
process.exit(failures > 0 ? 1 : 0);
