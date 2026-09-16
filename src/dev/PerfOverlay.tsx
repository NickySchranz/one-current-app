import { useEffect, useState } from "react";
import { View } from "react-native";
import { PERF_COUNTERS } from "@/config/flags";
import { reset, snapshot, subscribe, type PerfReading } from "./perf-counters";
import { T } from "@/ui/primitives";

/**
 * The counters, on the device, next to Reanimated's frame-rate monitor.
 *
 * Frame rate alone cannot tell a drag that rebuilds the whole scene every
 * frame from one that rebuilds nothing — both can read 60 until the device
 * is older or the scene is bigger. These are the numbers that distinguish
 * them, and during a drag the first three should be flat zero.
 */
export function PerfOverlay() {
  const [r, setR] = useState<PerfReading>(() => snapshot());

  useEffect(() => {
    if (!PERF_COUNTERS) return;
    const stop = subscribe(setR);
    // The counters roll their window on read, so a quiet app needs a nudge
    // to keep the display honest rather than frozen on the last busy second.
    const poll = setInterval(() => setR(snapshot()), 1000);
    return () => {
      stop();
      clearInterval(poll);
    };
  }, []);

  if (!PERF_COUNTERS) return null;

  const row = (label: string, n: number, bad: boolean) => (
    <T style={{ fontSize: 10, lineHeight: 13, color: bad ? "#ff8a65" : "#9ccc9c" }}>
      {`${label.padEnd(11)}${String(n).padStart(5)}/s`}
    </T>
  );

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        right: 6,
        top: 96,
        padding: 6,
        borderRadius: 6,
        backgroundColor: "rgba(0,0,0,0.72)",
        zIndex: 9999,
      }}
    >
      {/* Red is not "slow" — it is "React is working during motion", which is
          the specific thing this release is removing. */}
      {row("renders", r.perSecond.render, r.perSecond.render > 2)}
      {row("geometry", r.perSecond.geometry, r.perSecond.geometry > 2)}
      {row("commits", r.perSecond.commit, r.perSecond.commit > 4)}
      {row("paths", r.perSecond.path, r.perSecond.path > 400)}
      {/* Recordings a second, which answers a different question from paths:
          how often a frame happens at all. The sway asks for thirty; anything
          near display rate means a guard is not holding, and anything above
          zero while only the camera is moving means the world is being rebuilt
          to move it. */}
      {row("pictures", r.perSecond.picture, r.perSecond.picture > 35)}
      <T style={{ fontSize: 9, lineHeight: 12, color: "#8a8a8a", marginTop: 2 }}>
        {`${r.renderer}  ·  tap-free`}
      </T>
      {/* Reset on mount of a fresh scene keeps totals comparable run to run. */}
      {r.elapsedS > 600 ? (reset(), null) : null}
    </View>
  );
}
