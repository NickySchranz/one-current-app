import { useEffect, useState, type ComponentType } from "react";
import { Platform } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { RopeSpec } from "./rope-spec";

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
export function useSummitRopesCanvas(enabled: boolean): ComponentType<SummitRopesProps> | null {
  const [comp, setComp] = useState<ComponentType<SummitRopesProps> | null>(null);

  useEffect(() => {
    if (!enabled || comp) return;
    let live = true;
    void (async () => {
      try {
        if (Platform.OS === "web") {
          const { LoadSkiaWeb } = await import("@shopify/react-native-skia/lib/module/web");
          await LoadSkiaWeb();
        }
        const mod = await import("./SummitRopesCanvas");
        if (live) setComp(() => mod.SummitRopesCanvas as ComponentType<SummitRopesProps>);
      } catch {
        // No CanvasKit — an old browser, a blocked fetch, a missing wasm on
        // the host. The SVG ropes are still there and still correct; the app
        // is simply not faster. Never a blank map.
      }
    })();
    return () => {
      live = false;
    };
  }, [enabled, comp]);

  return enabled ? comp : null;
}
