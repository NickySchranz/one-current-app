/**
 * Pip's sprite frame and facing, held OUTSIDE React.
 *
 * These two values change constantly — he blinks between IDLE_A and IDLE_B,
 * and every run, land and climb swaps the frame again. They used to be
 * useState inside useMascot, which is called from LifeTimeline, so each blink
 * re-rendered the entire timeline: the mountain, every thread, the scenery,
 * the lot. A measured forty-event drag spent eleven full renders on nothing
 * but Pip's face.
 *
 * Nothing except the sprite itself ever needs them. Holding them here lets
 * the one component that draws Pip subscribe on its own, and leaves every
 * other component — LifeTimeline above all — completely undisturbed.
 */
import type { FrameName } from "./mascot-frames";

export type FrameState = { frame: FrameName; flip: number };

export type MascotFrameStore = {
  /** Stable while nothing changes, which is what useSyncExternalStore needs. */
  get: () => FrameState;
  set: (next: Partial<FrameState>) => void;
  subscribe: (cb: () => void) => () => void;
};

export function createMascotFrameStore(): MascotFrameStore {
  let state: FrameState = { frame: "IDLE_A", flip: 1 };
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (next) => {
      const frame = next.frame ?? state.frame;
      const flip = next.flip ?? state.flip;
      // An unchanged write must not produce a new object: getSnapshot has to
      // return a stable reference or React re-renders on every store read.
      if (frame === state.frame && flip === state.flip) return;
      state = { frame, flip };
      subs.forEach((cb) => cb());
    },
    subscribe: (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
  };
}
