import type { FrameName } from "@/features/life-timeline/mascot-frames";

/**
 * The guided walkthrough: Pip walks a new user through creating their first
 * real thread and the core answers. Steps advance on the user's own actions
 * where one exists ("auto"), and by the Next button otherwise.
 *
 * "creating" is the silent stretch while the creation screen (which teaches
 * itself) has the shell unmounted — it has no card here on purpose.
 */

export type WalkthroughStepId =
  | "welcome"
  | "point-plus"
  | "creating"
  | "meet-thread"
  | "pip-arrives"
  | "menu"
  | "bonk"
  | "wholeness"
  | "history"
  | "more"
  | "done";

export type TutorialEvent =
  | "create-opened"
  | "create-cancelled"
  | "thread-born"
  | "thread-armed"
  | "menu-opened"
  | "menu-closed";

export type WalkthroughTargetId =
  | "new-thread"
  | "thread"
  | "bonk"
  | "wholeness"
  | "history-tab"
  | "more-tab";

export type WalkthroughStep = {
  id: WalkthroughStepId;
  text: string;
  subtext: string;
  frame: FrameName;
  /** What the pointer halo rests on; none = the card docks to an edge. */
  target?: WalkthroughTargetId;
  /** auto = the user's own action advances it; next = the Next button; finish = ends the walk. */
  advance: "auto" | "next" | "finish";
};

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: "welcome",
    text: "Hi! I'm Pip!",
    subtext:
      "This is where your threads will live — everything that pulls at part of your attention gets a line of its own. Let's start your first one together.",
    frame: "REACT",
    advance: "next",
  },
  {
    id: "point-plus",
    text: "Something on your mind right now?",
    subtext: "That's the + — tap it, and we'll give that thing its own line.",
    frame: "TALK_A",
    target: "new-thread",
    advance: "auto",
  },
  {
    id: "meet-thread",
    text: "There it is — your first thread.",
    subtext:
      "It flows beside your Now, carrying what you named so your head doesn't have to. Tap the line once.",
    frame: "REACT",
    target: "thread",
    advance: "auto",
  },
  {
    id: "pip-arrives",
    text: "One tap brings me over.",
    subtext:
      "I'll sit with the thread you picked and keep it company. Tap it once more to see what it offers.",
    frame: "TALK_B",
    target: "thread",
    advance: "auto",
  },
  {
    id: "menu",
    text: "This is how you answer a thread.",
    subtext:
      "Act takes one small step. Integrate brings a finished thread home. Note keeps a thought. Let it rest sets it down for now. Each one is a real answer.",
    frame: "INSPECT_A",
    advance: "auto",
  },
  {
    id: "bonk",
    text: "See the little pill by the dates?",
    subtext:
      "When a thread feels loud, I can give it a gentle bonk to soften it. Answers fill the meter — full, I calm everything in one run.",
    frame: "TALK_A",
    target: "bonk",
    advance: "next",
  },
  {
    id: "wholeness",
    text: "This shows how gathered you are.",
    subtext:
      "Every open thread holds a strand of you out there. As you answer them, the strands come home.",
    frame: "INSPECT_B",
    target: "wholeness",
    advance: "next",
  },
  {
    id: "history",
    text: "History keeps each day's answers.",
    subtext:
      "Notes, steps, integrations — they stay, so you can watch yourself getting better at this.",
    frame: "INSPECT_B",
    target: "history-tab",
    advance: "next",
  },
  {
    id: "more",
    text: "More holds the rest.",
    subtext:
      "Settings, language, your companion — and you can walk this walk again from there anytime.",
    frame: "IDLE_A",
    target: "more-tab",
    advance: "next",
  },
  {
    id: "done",
    text: "That's everything!",
    subtext:
      "This thread is real now — and whatever else pulls at you can have a line of its own. I'll be here.",
    frame: "REACT",
    advance: "finish",
  },
];

/** Where the Next button leads, for the manual steps. */
export const NEXT_AFTER: Partial<Record<WalkthroughStepId, WalkthroughStepId>> = {
  welcome: "point-plus",
  bonk: "wholeness",
  wholeness: "history",
  history: "more",
  more: "done",
};

export function walkthroughStep(id: WalkthroughStepId): WalkthroughStep | null {
  return WALKTHROUGH_STEPS.find((s) => s.id === id) ?? null;
}

export function walkthroughIndex(id: WalkthroughStepId): number {
  const i = WALKTHROUGH_STEPS.findIndex((s) => s.id === id);
  return i === -1 ? 0 : i;
}
