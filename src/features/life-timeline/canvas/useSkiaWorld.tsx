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
  /** Once the GPU has dropped us, do not keep climbing back onto it. */
  const [lost, setLost] = useState(false);

  /**
   * A canvas whose WebGL context has gone draws NOTHING, and on the summit
   * that is every rope — the worst failure available here, and one mobile
   * Safari hands out freely when memory is tight or the tab comes back from
   * the background. The SVG ropes are still in the tree, one prop away, so
   * the answer is to stop being a canvas: dropping the component re-arms
   * `strokesOff={false}` and the map draws itself the old way.
   */
  useEffect(() => {
    if (!comp || Platform.OS !== "web" || typeof document === "undefined") return;
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    const onLost = (e: Event) => {
      e.preventDefault();
      setLost(true);
      setComp(null);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [comp]);

  useEffect(() => {
    if (!enabled || comp || lost) return;
    let live = true;
    void (async () => {
      try {
        if (Platform.OS === "web") {
          const { LoadSkiaWeb } = await import("@shopify/react-native-skia/lib/module/web");
          await LoadSkiaWeb();
        }
        const next = await load();
        if (live) setComp(() => next);
      } catch {
        // No CanvasKit — an old browser, a blocked fetch, a missing wasm on
        // the host. The SVG strokes are still there and still correct; the
        // app is simply not faster. Never a blank map.
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is a fresh closure every render by design
  }, [enabled, comp, lost]);

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
