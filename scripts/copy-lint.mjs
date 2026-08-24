// Copy lint (report-only): checks the app's user-facing English against the
// wording principles from the 2026-08 copy pass, and lists t() keys that the
// Spanish dictionaries don't cover (English strings ARE the keys, so any
// English edit orphans its translation silently — this surfaces the gap for
// the next translation pass).
//
// Usage: node scripts/copy-lint.mjs
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

const esDir = join(SRC, "i18n", "es");
const esKeys = new Set();
for (const f of readdirSync(esDir)) {
  if (!/\.ts$/.test(f)) continue;
  const text = readFileSync(join(esDir, f), "utf8");
  const re = /^\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([A-Za-z_$][\w$]*))\s*:/gm;
  let m;
  while ((m = re.exec(text)))
    esKeys.add((m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, "$1"));
}

let bannedHits = 0;
const missing = new Set();
for (const file of walk(SRC)) {
  const rel = relative(process.cwd(), file);
  if (rel.startsWith(join("src", "i18n") + "/")) continue;
  const text = readFileSync(file, "utf8");
  for (const { text: lit, line } of stringLiterals(text)) {
    if (ALLOW.some((rule) => rule.test(lit))) continue;
    for (const rule of BANNED) {
      if (rule.test(lit)) {
        bannedHits++;
        console.log(`BANNED  ${rel}:${line}  ${rule}  →  "${lit.slice(0, 80)}"`);
      }
    }
  }
  for (const key of tKeys(text)) if (!esKeys.has(key)) missing.add(key);
}

console.log(`\n${bannedHits} banned-word hit(s) in user-facing strings.`);
console.log(`${missing.size} t() key(s) missing from the es dictionary (fall back to English):`);
for (const key of [...missing].sort()) console.log(`  MISSING  ${key}`);
