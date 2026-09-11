import type { PsychologicalBranch } from "@/domain/branches/types";
import type { BranchCommit } from "@/domain/moments/types";
import { newId } from "@/domain/ids";

/**
 * A deliberately heavy scene, for the performance harness.
 *
 * Forty-four open situations is well past what anyone will really carry, and
 * that is the point: the summit's rope length grows with the number of open
 * ropes (`peakAbove = n·step + headroom` in visualization/vertical/transpose),
 * so total sampled geometry is quadratic in branch count. Ten branches hide
 * that completely — the scene the example data draws is comfortable on any
 * device. Forty is where the architecture either holds or does not.
 *
 * Every word here is invented. No founder history, no user content.
 */

const DAY = 24 * 60 * 60 * 1000;
const iso = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const day = (n: number) => iso(n).slice(0, 10);

/** Deterministic, so two runs of the harness measure the same scene. */
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const SUBJECTS = [
  "the reorg", "Mum's scan", "the flat", "Rafa", "the invoice", "my back",
  "the interview", "Sunday lunch", "the deposit", "Nia", "the review",
  "the sleep thing", "the car", "Dad's birthday", "the contract", "Jo",
  "the move", "the dentist", "the presentation", "the loan", "Sam",
  "the wedding", "the boiler", "the appraisal", "the trip", "Kit",
  "the deadline", "the neighbours", "the diagnosis", "the offer", "Ellis",
  "the handover", "the visa", "the results", "the rent", "Mo",
  "the audit", "the christening", "the referral", "the pitch", "Robin",
  "the inspection", "the transfer", "the callback",
];

const SHAPES = [
  "Whether to say something about {s}",
  "{s}, and what I actually want",
  "How {s} keeps coming back",
  "What to do about {s}",
  "{s} — still unresolved",
];

const MOMENTS = [
  "they brought it up first",
  "went quiet again",
  "slept badly over it",
  "said the thing out loud",
  "nothing moved this week",
  "it landed better than expected",
];

/**
 * `count` situations, all open, spread across the last three months, with a
 * realistic scatter of loudness, moments and recurrence.
 */
export function stressBranches(count = 44): PsychologicalBranch[] {
  const out: PsychologicalBranch[] = [];
  for (let i = 0; i < count; i++) {
    const id = `stress-${i}`;
    const subject = SUBJECTS[i % SUBJECTS.length];
    const title = SHAPES[i % SHAPES.length].replace("{s}", subject);
    const forkDay = 2 + Math.floor(seeded(i, 3) * 88);
    const loudness = 1 + Math.floor(seeded(i, 7) * 5);
    const momentCount = Math.floor(seeded(i, 11) * 4);
    const commits: BranchCommit[] = [];
    for (let m = 0; m < momentCount; m++) {
      commits.push({
        id: newId("mo"),
        branchId: id,
        date: day(Math.max(1, forkDay - Math.floor(seeded(i * 7 + m, 13) * forkDay))),
        title: MOMENTS[(i + m) % MOMENTS.length],
        type: "event",
      });
    }
    out.push({
      id,
      title,
      type: "unknown",
      orientation: "unknown",
      status: "active",
      forkDate: day(forkDay),
      loudness,
      // Reported, so the curves have something honest to draw.
      loudnessLog: [{ at: iso(forkDay), loudness, source: "reported" }],
      storedQualities: [],
      unmetNeeds: [],
      controllability: "unclear",
      commits,
      mergeIds: [],
      firstCreatedAt: iso(forkDay),
      lastActivatedAt: iso(Math.floor(seeded(i, 17) * 3)),
      recurrenceCount: seeded(i, 19) > 0.8 ? 1 : 0,
    });
  }
  return out;
}
