import { useEffect, useState, type ComponentType } from "react";
import { Platform } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { WaveHandles } from "../useSquiggle";
import type { RopeSpec } from "./rope-spec";
import type { LineSpec } from "./line-spec";

export type SummitRopesProps = {
  ropes: RopeSpec[];
  climb: SharedValue<number>;
  rot: SharedValue<number> | null;
  pan: SharedValue<number> | null;
  clock: SharedValue<number>;
  width: number;
  height: number;
  reducedMotion: boolean;
};

export type BranchLinesProps = {
  lines: LineSpec[];
  clock: SharedValue<number>;
  wave: WaveHandles | null;
  waveNowX: number;
  wavePeriodMs: number;
  scrollY: SharedValue<number> | null;
  /** React's half of the world camera (the viewBox number) and the finger's. */
  worldX: number;
  worldShift: SharedValue<number> | null;
  dimExcept: string | null;
  keepId: string | null;
  width: number;
  height: number;
  reducedMotion: boolean;
};

/**
 * The canvas, once it can actually draw.
 *
 * Two things have to be true before a Skia component may be imported, let
 * alone rendered, and getting either wrong fails in a way that looks like
 * something else:
 *
 *  1. On web, CanvasKit must be fetched and instantiated — ~2.9MB gzipped.
 *  2. The module that touches `Skia` must not be EVALUATED before that,
 *     because `Skia` binds at module evaluation. A static import anywhere in
 *     the app's graph captures it empty, and every draw then fails with
 *     "PathBuilder of undefined" while `window.CanvasKit` is a perfectly
 *     good object and the canvas element is present. It looks like a working
 *     load right up until nothing appears.
 *
 * So the import is dynamic and happens after the load resolves. Until then
 * this returns null and the caller keeps drawing what it drew before, which
 * means the opening screen never waits on a WebAssembly download — the map
 * is the first route.
 */
function useSkiaComponent<P>(
  enabled: boolean,
  load: () => Promise<ComponentType<P>>,
): ComponentType<P> | null {
  const [comp, setComp] = useState<ComponentType<P> | null>(null);

  /**
   * The canvas does NOT hand back to the SVG, by request.
   *
   * It used to, three ways, and each of them was a kindness that made the
   * renderer impossible to look at: a lost WebGL context dropped the
   * component, a failed CanvasKit fetch was swallowed, and the window before
   * the WASM arrived drew SVG strokes that then swapped underneath you. All
   * three meant "what is on screen" and "which renderer drew it" could
   * disagree without saying so — which is the same class of problem as a
   * canvas that measures fast because it is not drawing.
   *
   * So a lost context now re-arms the canvas rather than retiring it, and a
   * failed load is reported rather than hidden. If Skia cannot draw, the map
   * is empty and that is the honest answer.
   */
  useEffect(() => {
    if (!comp || Platform.OS !== "web" || typeof document === "undefined") return;
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    const onLost = (e: Event) => {
      // Preventing the default is what makes the context restorable at all.
      e.preventDefault();
      console.warn("[one-current] WebGL context lost — rebuilding the canvas, not falling back");
    };
    const onRestored = () => {
      // A restored context needs a fresh surface, and the surface is built in
      // the component's own layout effect, so remount it.
      setComp(null);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [comp]);

  useEffect(() => {
    if (!enabled || comp) return;
    let live = true;
    void (async () => {
      try {
        if (Platform.OS === "web") {
          const { LoadSkiaWeb } = await import("@shopify/react-native-skia/lib/module/web");
          await LoadSkiaWeb();
        }
        const next = await load();
        if (live) setComp(() => next);
      } catch (err) {
        // No silent SVG underneath any more: say so, loudly, in the console
        // and on `window`, so "the map is blank" has an answer.
        console.error("[one-current] CanvasKit failed to load — the world will not draw", err);
        if (typeof window !== "undefined") {
          (window as unknown as { __ocSkiaError?: unknown }).__ocSkiaError = err;
        }
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is a fresh closure every render by design
  }, [enabled, comp]);

  return enabled ? comp : null;
}

export function useSummitRopesCanvas(enabled: boolean): ComponentType<SummitRopesProps> | null {
  return useSkiaComponent<SummitRopesProps>(
    enabled,
    async () =>
      (await import("./SummitRopesCanvas"))
        .SummitRopesCanvas as ComponentType<SummitRopesProps>,
  );
}

export function useBranchLinesCanvas(enabled: boolean): ComponentType<BranchLinesProps> | null {
  return useSkiaComponent<BranchLinesProps>(
    enabled,
    async () =>
      (await import("./BranchLinesCanvas"))
        .BranchLinesCanvas as ComponentType<BranchLinesProps>,
  );
}
