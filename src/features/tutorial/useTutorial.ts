import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';
import type { FrameName } from '@/features/life-timeline/mascot-frames';

const TUTORIAL_KEY = 'one-current-tutorial-v1';

export type TutorialStep = {
  id: string;
  text: string;
  subtext?: string;
  frame: FrameName;
  highlight?: 'fab' | 'now' | 'branch' | 'history' | 'more' | 'add' | null;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    text: "Hi! I'm Pip!",
    subtext:
      "I live on your timelines and help you manage what's on your mind. Let me show you around.",
    frame: 'REACT',
    highlight: null,
  },
  {
    id: 'main-line',
    text: "This horizontal line is your 'Now'.",
    subtext:
      "Your present moment flows along it. Everything else branches off from here.",
    frame: 'INSPECT_A',
    highlight: 'now',
  },
  {
    id: 'branches',
    text: 'These branching lines are your threads.',
    subtext:
      'Each one is something pulling your attention — a worry, project, or waiting situation.',
    frame: 'INSPECT_B',
    highlight: 'branch',
  },
  {
    id: 'tap',
    text: 'Tap any thread to work with it.',
    subtext:
      'You can add notes, make a decision, set how loud it feels, or let it go.',
    frame: 'TALK_A',
    highlight: 'branch',
  },
  {
    id: 'loudness',
    text: 'Drag a thread up or down to adjust its loudness.',
    subtext:
      'Louder means it\'s taking more mental space right now. Setting it honestly helps you see clearly.',
    frame: 'INSPECT_A',
    highlight: 'branch',
  },
  {
    id: 'add',
    text: 'The + button adds a new thread.',
    subtext:
      'When something new lands on your mind, name it here. Named things are easier to work with.',
    frame: 'REACT',
    highlight: 'add',
  },
  {
    id: 'merge',
    text: 'When a thread is resolved, merge it back.',
    subtext:
      'It rejoins your main line. The mental energy you were spending on it comes home.',
    frame: 'TALK_B',
    highlight: 'branch',
  },
  {
    id: 'history',
    text: "History shows each day's progress.",
    subtext:
      'Merges, notes, actions taken — all recorded. Reviewing it builds self-knowledge.',
    frame: 'INSPECT_B',
    highlight: 'history',
  },
  {
    id: 'more',
    text: 'More holds settings and your companion.',
    subtext:
      'Change theme, language, or swap me out for another companion character.',
    frame: 'IDLE_A',
    highlight: 'more',
  },
  {
    id: 'done',
    text: "That's everything!",
    subtext:
      "I'll keep watch over your threads. Tap me anytime to interact with a specific thread. You've got this.",
    frame: 'REACT',
    highlight: null,
  },
];

export function useTutorial() {
  const [step, setStep] = useState<number | null>(null); // null = not loaded yet
  const [done, setDone] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_KEY)
      .then((v) => {
        if (v === 'done') {
          setDone(true);
          setStep(null);
        } else {
          setStep(0);
        }
      })
      .catch(() => {
        setStep(0);
      });
  }, []);

  const next = () => {
    setStep((s) => {
      if (s === null) return null;
      if (s >= TUTORIAL_STEPS.length - 1) {
        AsyncStorage.setItem(TUTORIAL_KEY, 'done').catch(() => {});
        setDone(true);
        return null;
      }
      return s + 1;
    });
  };

  const skip = () => {
    AsyncStorage.setItem(TUTORIAL_KEY, 'done').catch(() => {});
    setDone(true);
    setStep(null);
  };

  const restart = () => {
    AsyncStorage.removeItem(TUTORIAL_KEY).catch(() => {});
    setDone(false);
    setStep(0);
  };

  const active = step !== null && !done;
  const currentStep = active && step !== null ? TUTORIAL_STEPS[step] : null;

  return {
    active,
    currentStep,
    stepIndex: step ?? 0,
    totalSteps: TUTORIAL_STEPS.length,
    next,
    skip,
    restart,
  };
}
