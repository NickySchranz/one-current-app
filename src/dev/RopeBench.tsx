import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from "react";
import { Platform, View } from "react-native";
import Svg, { Path as SvgPath } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { swayOffsetAt } from "@/features/life-timeline/useSquiggle";
import { countPathBuildUI } from "./perf-counters";
import { LEVEL, STEP_PX, layers, makeRopes, type Rope } from "./rope-bench-shared";

const AnimatedSvgPath = Animated.createAnimatedComponent(SvgPath);

/**
 * The decision gate, as a like-for-like scene.
 *
 * Both renderers draw the same thing: twenty ropes hanging past the viewport,
 * swaying with the app's own `swayOffsetAt`, three strokes each exactly as
 * `BranchLine` paints them. Nothing else is on screen, so what the probe
 * measures is renderer cost and nothing else.
 *
 *   svg   samples the visible slice every 20px and serialises it into a `d`
 *         string, which crosses to three native nodes to be reparsed.
 *   skia  builds one SkPath of cubics — a sine needs about four per
 *         wavelength, and only ~one wavelength is ever on screen — and paints
 *         that same path three times with different paints.
 *
 * Reached with ?bench=svg or ?bench=skia on a build carrying EXPO_PUBLIC_PERF.
 */
export function RopeBenchScreen({ mode }: { mode: "svg" | "skia" | "picture" }) {
  const [SkiaScene, setSkiaScene] = useState<ComponentType<SceneProps> | null>(null);
  const clock = useSharedValue(0);
  useMemo(() => {
    clock.value = withRepeat(withTiming(3600, { duration: 3600_000, easing: Easing.linear }), -1, false);
  }, [clock]);
  const ropes = useMemo(() => makeRopes(1200, 900), []);

  // CanvasKit first, THEN the module that touches Skia. `Skia` binds when its
  // module is evaluated, so a static import captures it before the WASM
  // exists and every draw fails with "PathBuilder of undefined".
  useEffect(() => {
    if (mode === "svg") return;
    let live = true;
    void (async () => {
      if (Platform.OS === "web") {
        const { LoadSkiaWeb } = await import("@shopify/react-native-skia/lib/module/web");
        await LoadSkiaWeb();
      }
      const mod = await import("./RopeBenchSkia");
      const next = mode === "picture" ? mod.SkiaRopesPicture : mod.SkiaRopes;
      if (live) setSkiaScene(() => next as ComponentType<SceneProps>);
    })();
    return () => {
      live = false;
    };
  }, [mode]);

  return (
    <View style={{ flex: 1, backgroundColor: "#dfe6ec" }}>
      {mode === "svg" ? (
        <Svg width={1200} height={900}>
          {ropes.map((r) => (
            <SvgRope key={r.x} rope={r} clock={clock} height={900} />
          ))}
        </Svg>
      ) : SkiaScene ? (
        <SkiaScene ropes={ropes} clock={clock} width={1200} height={900} />
      ) : null}
    </View>
  );
}

type SceneProps = { ropes: Rope[]; clock: { value: number }; width: number; height: number };

/** Today's approach: sample the visible slice, serialise, hand to three nodes. */
function SvgRope({ rope, clock, height }: { rope: Rope; clock: { value: number }; height: number }) {
  const n = useMemo(() => layers(), []);
  const total = rope.bottom - rope.top;
  const tick = useDerivedValue(() => Math.round(clock.value * 30) / 30, [clock]);
  const d = useDerivedValue(() => {
    countPathBuildUI();
    const t = tick.value;
    const from = Math.max(rope.top, -120);
    const to = Math.min(rope.bottom, height + 120);
    let out = "";
    for (let y = from; y <= to; y += STEP_PX) {
      const a = rope.bottom - y;
      const off = swayOffsetAt(a, total, LEVEL, rope.phase, t, 1);
      out += `${out ? "L" : "M"}${Math.round((rope.x + off) * 10) / 10} ${Math.round(y * 10) / 10}`;
    }
    return out;
  }, [tick]);
  const props = useAnimatedProps(() => ({ d: d.value }), [d]);
  return (
    <>
      <AnimatedSvgPath animatedProps={props} stroke="#8894a0" strokeWidth={7} fill="none" opacity={0.35} />
      {n > 1 && <AnimatedSvgPath animatedProps={props} stroke="#3d4a55" strokeWidth={3} fill="none" />}
      {n > 2 && (
        <AnimatedSvgPath animatedProps={props} stroke="#ffffff" strokeWidth={1} fill="none" opacity={0.25} />
      )}
    </>
  );
}
