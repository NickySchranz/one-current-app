import { useEffect, useState } from "react";
import { Dimensions, Keyboard, Platform } from "react-native";

/**
 * The software keyboard, as bottom-anchored chrome needs to know it: `inset`
 * is how far a bottom sheet must lift off the window bottom to sit right
 * above the keys; `open` is true while the keyboard is up (used to widen
 * height caps and to hide the tab bar, which must never ride the keyboard).
 *
 * Web: the visual viewport shrinks under a mobile keyboard; the inset is the
 * layout-viewport strip it covers (0 for hardware keyboards). Note RN Web
 * already reports the visual viewport as the window height. iOS native
 * overlays the window, so the keyboard frame's top edge is tracked. Android
 * native resizes the window itself — inset stays 0, only `open` is tracked.
 */
export function useKeyboard(): { inset: number; open: boolean } {
  const [inset, setInset] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      const vv = window.visualViewport;
      // `open` must flip the instant typing starts: iOS Safari's viewport
      // events can lag behind the keyboard animation (or misfire in
      // standalone/PWA mode), so an editable being focused counts as open
      // on touch devices even before any viewport change is measured.
      const coarse =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches;
      let covered = 0;
      let editing = false;
      const apply = () => {
        setInset(covered);
        setOpen(covered > 0 || (coarse && editing));
      };
      const measure = () => {
        covered = vv
          ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
          : 0;
        apply();
      };
      const isEditable = (el: EventTarget | null) =>
        el instanceof HTMLElement &&
        (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      const onFocusIn = (e: FocusEvent) => {
        if (isEditable(e.target)) {
          editing = true;
          apply();
        }
      };
      const onFocusOut = () => {
        editing = false;
        apply();
      };
      vv?.addEventListener("resize", measure);
      vv?.addEventListener("scroll", measure);
      window.addEventListener("focusin", onFocusIn);
      window.addEventListener("focusout", onFocusOut);
      measure();
      return () => {
        vv?.removeEventListener("resize", measure);
        vv?.removeEventListener("scroll", measure);
        window.removeEventListener("focusin", onFocusIn);
        window.removeEventListener("focusout", onFocusOut);
      };
    }
    if (Platform.OS === "ios") {
      // screenY tracks the keyboard's top edge, so hide/undock land on 0.
      const sub = Keyboard.addListener("keyboardWillChangeFrame", (e) => {
        const covered = Math.max(0, Dimensions.get("window").height - e.endCoordinates.screenY);
        setInset(covered);
        setOpen(covered > 0);
      });
      return () => sub.remove();
    }
    const show = Keyboard.addListener("keyboardDidShow", () => setOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return { inset, open };
}
