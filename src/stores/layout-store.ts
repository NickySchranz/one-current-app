import { create } from "zustand";

/**
 * Cross-component layout coordination for the Now workspace. The web app
 * measured DOM rects (`document.querySelector(".quick-tray")`); here the
 * tray reports its own measurements and the timeline reads them.
 */
type LayoutState = {
  /** Height of the tray/sheet currently overlapping the stage bottom (0 = none). */
  trayHeight: number;
  /** True when the tray floats beside the timeline (wide screens) instead of over it. */
  traySide: boolean;
  /**
   * True while the current quick-flow step is a typing step. On narrow
   * screens the tray then anchors to the top, out of the keyboard's reach.
   */
  focusStep: boolean;
  setTray(height: number, side: boolean): void;
  setFocusStep(v: boolean): void;
  clearTray(): void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  trayHeight: 0,
  traySide: false,
  focusStep: false,
  setTray: (trayHeight, traySide) => set({ trayHeight, traySide }),
  setFocusStep: (focusStep) => set({ focusStep }),
  clearTray: () => set({ trayHeight: 0, traySide: false, focusStep: false }),
}));
