// Copy lint (report-only): checks the app's user-facing English against the
// wording principles from the 2026-08 copy pass, and reconciles both Spanish
// dictionaries against the source (English strings ARE the keys, so any
// English edit orphans its translation silently).
//
// Checks:
//   1. banned words in user-facing string literals
//   2. t() keys missing from es and from es-CO (each dictionary separately)
//   3. dynamic keys missing (word tables the t()-regex can't see)
//   4. dead dictionary keys (their English no longer exists anywhere in src)
//
// Usage: node scripts/copy-lint.mjs   (exit code 1 if anything is off)
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(process.cwd(), "src");

// Words the app's copy avoids on purpose: controlling language (should/must),
// warning/symptom framing, clinical vocabulary, and combat framing. "merge"
// is banned in user-facing copy (the canonical verb is "integrate") but fine
// as a code identifier, so only string literals are checked.
const BANNED = [
  /\byou (should|must|need to)\b/i,
  /\bwarning\b/i,
  /\boverdue\b/i,
  /\bneglected\b/i,
  /\bignored\b/i,
  /\bfailing\b/i,
  /\banxiety\b/i,
  /\btrauma\b/i,
  /\btrigger(ed|ing)?\b/i,
  /\btoxic\b/i,
  /\bmerge[sd]? (it|back)\b/i,
];

// Defusion targets: places where the app deliberately quotes the *thread's*
// voice (example beliefs, a thread's demand) so the user can see it as a
// thought, not a truth. Banned words are the point there.
const ALLOW = [/who you are and who you should be/i];

// Keys reached through variables (t(loudnessWord(v)), t(verb), t(copy.title)…)
// that the t("literal") regex can never see. Each entry must stay translated.
const DYNAMIC_KEYS = [
  // LOUDNESS_WORDS (src/ui/LoudnessSlider.tsx)
  "quiet", "murmuring", "speaking", "calling", "loud",
  // bonk verbs + super state (src/features/life-timeline/LifeTimeline.tsx)
  "Bonk!", "Douse!", "Splash!", "Whoosh!", "Boop!", "Dim it!", "Shoo!", "Ruffle!",
  "SUPER BONK!",
  // paywall COPY table (src/features/paywall/PaywallPrompt.tsx)
  "This look is part of Pro",
  "The free current holds {n} threads",
  "Sharing is part of Pro",
  // tutorial steps render via t(step.text) (src/features/tutorial/useTutorial.ts)
  "Hi! I'm Pip!",
  "That's everything!",
  "These lines are your threads.",
  // "What leaves the app" list: labels live in
  // src/domain/share/describe-fields.ts and render via t(line). Read from that
  // file so a new share field can never ship without its translation.
  ...shareFieldLabels(),
];

/**
 * Every label string in describe-fields.ts. Parsed rather than duplicated: the
 * point of this check is that the list and the payload cannot drift apart.
 */
function shareFieldLabels() {
  const text = readFileSync(join(SRC, "domain", "share", "describe-fields.ts"), "utf8");
  const labels = new Set();
  // Table entries: `key: "label",` and `key:\n  "label",`
  const table = /^\s*(?:"[^"]+"|[A-Za-z_$][\w$]*):\s*\n?\s*"((?:[^"\\]|\\.)*)"/gm;
  let m;
  while ((m = table.exec(text))) labels.add(m[1].replace(/\\(.)/g, "$1"));
  // The SHARE_NEVER_INCLUDES array: bare strings on their own lines.
  const never = text.match(/SHARE_NEVER_INCLUDES\s*=\s*\[([\s\S]*?)\]/);
  if (never) {
    const item = /"((?:[^"\\]|\\.)*)"/g;
    while ((m = item.exec(never[1]))) labels.add(m[1].replace(/\\(.)/g, "$1"));
  }
  return [...labels];
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield p;
  }
}

// String literals only — banned words in comments or identifiers are fine.
function stringLiterals(sourceText) {
  const out = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(sourceText))) {
    const text = m[1] ?? m[2] ?? m[3];
    if (text && /[a-z].*\s.*[a-z]/i.test(text)) {
      const line = sourceText.slice(0, m.index).split("\n").length;
      out.push({ text, line });
    }
  }
  return out;
}

// Keys passed to t("...") — the English source strings.
function tKeys(sourceText) {
  const keys = new Set();
  const re = /\bt\(\s*(?:"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)')/g;
  let m;
  while ((m = re.exec(sourceText))) keys.add((m[1] ?? m[2]).replace(/\\(.)/g, "$1"));
  return keys;
}

function dictKeys(dir) {
  const keys = new Set();
  for (const f of readdirSync(dir)) {
    if (!/\.ts$/.test(f) || f === "index.ts") continue;
    const text = readFileSync(join(dir, f), "utf8");
    const re = /^\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([A-Za-z_$][\w$]*))\s*:/gm;
    let m;
    while ((m = re.exec(text)))
      keys.add((m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, "$1"));
  }
  return keys;
}

const dicts = {
  es: dictKeys(join(SRC, "i18n", "es")),
  "es-CO": dictKeys(join(SRC, "i18n", "es-co")),
};

let bannedHits = 0;
const usedKeys = new Set(DYNAMIC_KEYS);
const srcChunks = [];
for (const file of walk(SRC)) {
  const rel = relative(process.cwd(), file);
  if (rel.startsWith(join("src", "i18n") + "/")) continue;
  const text = readFileSync(file, "utf8");
  srcChunks.push(text);
  for (const { text: lit, line } of stringLiterals(text)) {
    if (ALLOW.some((rule) => rule.test(lit))) continue;
    for (const rule of BANNED) {
      if (rule.test(lit)) {
        bannedHits++;
        console.log(`BANNED  ${rel}:${line}  ${rule}  →  "${lit.slice(0, 80)}"`);
      }
    }
  }
  for (const key of tKeys(text)) usedKeys.add(key);
}
const allSrc = srcChunks.join("\n");

let problems = bannedHits;
console.log(`\n${bannedHits} banned-word hit(s) in user-facing strings.`);

for (const [name, keys] of Object.entries(dicts)) {
  const missing = [...usedKeys].filter((k) => !keys.has(k)).sort();
  problems += missing.length;
  console.log(`${missing.length} key(s) missing from the ${name} dictionary (fall back to English):`);
  for (const key of missing) console.log(`  MISSING(${name})  ${key}`);
}

// Dead keys: translations whose English source string no longer exists.
for (const [name, keys] of Object.entries(dicts)) {
  const dead = [...keys].filter((k) => !allSrc.includes(k)).sort();
  problems += dead.length;
  console.log(`${dead.length} dead key(s) in the ${name} dictionary (English source gone):`);
  for (const key of dead) console.log(`  DEAD(${name})  ${key.slice(0, 90)}`);
}

process.exit(problems > 0 ? 1 : 0);
