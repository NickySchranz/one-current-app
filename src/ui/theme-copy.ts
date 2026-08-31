import type { ThemeId } from "@/visualization/theme";

/**
 * Per-theme re-skin of the app's key terms. Maps an English source string to
 * the theme's own English string BEFORE dictionary lookup, so every VALUE
 * here is a first-class i18n key with its own es / es-CO entries (in
 * src/i18n/{es,es-co}/summit.ts).
 *
 * copy-lint parses this table (themeCopyValues) so a value can never ship
 * without both translations, and checks every KEY still exists in source so
 * a reworded original can't leave a dead remap behind.
 *
 * Scope (deliberate): the map, the bonk pill, the quick-action tray and its
 * flows, creation, the wholeness chip, and the map's a11y descriptions.
 * Settings, paywall, history, share, auth, the walkthrough, and Pip's
 * phrases stay theme-neutral.
 */
export const THEME_COPY: Partial<Record<ThemeId, Record<string, string>>> = {
  summit: {
    // ── the pill (VERBS has no summit entry: this remap is its verb) ──
    "Bonk!": "Chalk!",
    "SUPER BONK!": "FULL SEND!",
    "Have Pip calm this thread": "Have Pip steady this rope",
    "Super bonk: Pip calms every thread": "Full send: Pip steadies every rope",

    // ── the map + help ──
    "New thread": "New rope",
    "This thread": "This rope",
    "resting · {title}": "coiled · {title}",
    "Reading the lines": "Reading the ropes",
    "solid = active · curved back = integrated · thicker = louder · faint ✓ = decided today":
      "solid = active · curved back = integrated · thicker = louder · coiled ✓ = decided today",
    "drag or scroll sideways = move through time · along the dates = move faster":
      "drag or scroll = move along the climb · along the dates = move faster",
    "bonk = Pip soothes a thread, easing its loudness for today":
      "chalk = Pip steadies a rope, easing its loudness for today",
    "When something begins pulling part of your attention away from the present, add it as a thread with the + button. You can integrate it when it has given you what it carries.":
      "When something begins pulling part of your attention away from the present, add it as a rope with the + button. You can integrate it when it has given you what it carries.",

    // ── wholeness chip + map a11y ──
    "{decided} of {active} open threads already answered today.":
      "{decided} of {active} open ropes already answered today.",
    "Every open thread has its decision for today. Nothing more is asked of you.":
      "Every open rope has its decision for today. Nothing more is asked of you.",
    "{title} is currently the loudest thread.": "{title} is currently the loudest rope.",
    "No active threads reach today.": "No ropes reach today.",
    "One active thread reaches today.": "One rope reaches today.",
    "{n} active threads reach today.": "{n} ropes reach today.",
    "One thread has been integrated and remains part of your history.":
      "One rope has been integrated and remains part of your history.",
    "{n} threads have been integrated and remain part of your history.":
      "{n} ropes have been integrated and remain part of your history.",
    "Active thread reaching today": "Rope reaching today",
    "Currently activated thread": "Currently activated rope",
    "Explored thread, still active": "Explored rope, still active",
    "In tension with another thread": "In tension with another rope",

    // ── creation ──
    "Name the thread": "Name the rope",
    "Start the thread": "Fix the rope",
    "The new thread taking shape": "The new rope taking shape",
    "This resembles a thread you integrated before.":
      "This resembles a rope you integrated before.",

    // ── quick-action tray ──
    "What does this thread need from you now?": "What does this rope need from you now?",
    "How loud is this thread right now?": "How loud is this rope right now?",
    "Understand this thread": "Understand this rope",
    "What is true about this thread now?": "What is true about this rope now?",
    "The thread you are answering": "The rope you are answering",
    "Your threads today": "Your ropes today",

    // ── integrated panel + integrate wizard ──
    "Integrated threads": "Integrated ropes",
    "Now. Select to see integrated threads.": "Now. Select to see integrated ropes.",
    "No integrated threads yet.": "No integrated ropes yet.",
    "When you integrate a thread it appears here — tap to revisit it on the timeline.":
      "When you integrate a rope it appears here — tap to revisit it on the timeline.",
    "Tap a thread to see where it rejoined your main line.":
      "Tap a rope to see where it rejoined your main line.",
    "This thread is complete for now.": "This rope is complete for now.",
    "These threads are complete for now.": "These ropes are complete for now.",
    "This thread is complete for now. If it returns, you can meet the new version of it.":
      "This rope is complete for now. If it returns, you can meet the new version of it.",
    "{n} threads entering the present together": "{n} ropes entering the present together",
    "This thread no longer exists.": "This rope no longer exists.",
    "These threads are no longer available.": "These ropes are no longer available.",

    // ── understand flow ──
    "Two points on the same thread: where it began, and where you actually are.":
      "Two points on the same rope: where it began, and where you actually are.",
    "Tap what's true. Naming it is how the thread starts loosening.":
      "Tap what's true. Naming it is how the rope starts loosening.",
    "What this thread makes you feel": "What this rope makes you feel",
    "What feels less available while this thread is active?":
      "What feels less available while this rope is active?",
    "What feels less available while this thread is active":
      "What feels less available while this rope is active",
    "Moments on this thread": "Moments on this rope",

    // ── the cut (burn flow) ──
    "Burn it away": "Cut it away",
    "What burns with it?": "What falls with it?",
    "Burn {item}": "Cut {item} loose",
    "Take {item} back out": "Take {item} back",
    "This thread will be gone from the app — completely. No line, no history. Only the lesson stays.":
      "This rope will be gone from the app — completely. No line, no history. Only the lesson stays.",
    "Strike the match": "Cut the rope",
    "The lesson you carry out of the fire": "The lesson you carry up the mountain",
    "The fire takes the weight. You keep this.": "The drop takes the weight. You keep this.",
  },
};
