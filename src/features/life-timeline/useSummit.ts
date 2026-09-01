/**
 * The summit route's breathing — the vertical sibling of useCalmCurrent
 * (which stays untouched for every horizontal theme). Same choreography:
 * progress eases the wave in, each answer surges and sweeps a shimmer streak
 * up the route into the ledge, completion turns the line sacred. The only
 * difference is the axis: points are sampled down the route (y), arc length
 * runs bottom → ledge, and the wave displaces x. One shared formula —
 * calmWaveOffset — keeps the route, the fork dots and the rope ends moving
 * in the same rhythm.
 */

import { useEffect, useMemo } from "react";
import {
  cancelAnimation,
  interpolateColor,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { PathProps } from "react-native-svg";
import { type CalmCurrentProps, type WaveHandles } from "./useSquiggle";

const MAIN_STROKE = 3.25; // must match useCalmCurrent's resting width

export function useSummitCurrent(opts: {
  /** 0..1 — answered open ropes over all open ropes. */
  progress: number;
  /** Increment on each new answer to fire the shimmer sweep. */
  pulseKey: number;
  /** Screen x of the vertical route. */
  routeX: number;
  /** Screen y of Now (the ledge) — the route runs from here down to timeLen. */
  nowScreenY: number;
  timeLen: number;
  periodMs: number;
  dashDurationMs: number;
  reducedMotion: boolean;
  accentColor: string;
  shimmerColor: string;
  lineColor: string;
  sacredLineColor: string;
}): CalmCurrentProps {
  const {
    progress,
    pulseKey,
    routeX,
    nowScreenY,
    timeLen,
    periodMs,
    dashDurationMs,
    reducedMotion,
    accentColor,
    shimmerColor,
    lineColor,
    sacredLineColor,
  } = opts;
  // Arc length of the visible route, ledge to canvas bottom — the "nowX" of
  // the shared wave formula (taper zero at both ends of this span).
  const routeLen = Math.max(0, timeLen - nowScreenY);
  const complete = progress >= 0.999;
  const breathing = progress > 0.001 && !reducedMotion && routeLen > 0;

  // A straight vertical line needs no samplePath: y every 8px, normal (-1,0).

  const clock = useSharedValue(0);
  useEffect(() => {
    if (!breathing) {
      cancelAnimation(clock);
      clock.value = 0;
      return;
    }
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(3600, { duration: 3600_000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, [breathing, clock]);

  const progressSV = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      progressSV.value = withTiming(0, { duration: 300 });
      return () => cancelAnimation(progressSV);
    }
    progressSV.value = complete
      ? withSequence(
          withTiming(1.22, { duration: 900, easing: Easing.out(Easing.cubic) }),
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        )
      : withTiming(progress, { duration: 1400, easing: Easing.inOut(Easing.ease) });
    return () => cancelAnimation(progressSV);
  }, [progress, complete, reducedMotion, progressSV]);

  const haloScale = useSharedValue(0);
  useEffect(() => {
    haloScale.value = withTiming(complete && !reducedMotion ? 1 : 0, {
      duration: 1600,
      easing: Easing.inOut(Easing.ease),
    });
    return () => cancelAnimation(haloScale);
  }, [complete, reducedMotion, haloScale]);

  const surgeSV = useSharedValue(0);
  const waveTick = useDerivedValue(() => Math.round(clock.value * 30) / 30, []);

  // The path runs bottom → ledge, matching the horizontal past → Now
  // direction, so the flow dashes and the shimmer streak both travel UP.
  //
  // On the summit it does NOT wave. The mountain is what moves here; the
  // timeline holds still, and a line that swings sideways pulls away from the
  // integration points sitting on it (their dots ride the same wave, the
  // integrated threads' own curves do not). The current still gathers — in
  // thickness, colour and shimmer — it just doesn't travel.
  const d = useDerivedValue(() => {
    return `M ${routeX} ${timeLen} L ${routeX} ${nowScreenY}`;
  }, [routeX, nowScreenY, timeLen]);

  // The flourish: each answer sends a bright streak climbing the route into
  // the ledge — same dash trick as the horizontal sweep.
  const sweepOffset = useSharedValue(110);
  const sweepOpacity = useSharedValue(0);
  const flashSV = useSharedValue(0);
  useEffect(() => {
    if (pulseKey === 0 || reducedMotion || routeLen <= 0) return;
    cancelAnimation(sweepOffset);
    cancelAnimation(sweepOpacity);
    if (!complete) {
      cancelAnimation(surgeSV);
      surgeSV.value = withSequence(
        withTiming(0.35, { duration: 260, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      );
    }
    cancelAnimation(flashSV);
    flashSV.value = withSequence(
      withTiming(complete ? 0.8 : 0.55, { duration: 180, easing: Easing.out(Easing.ease) }),
      withTiming(0, { duration: complete ? 1100 : 750, easing: Easing.inOut(Easing.ease) }),
    );
    sweepOffset.value = 110;
    if (complete) {
      sweepOffset.value = withSequence(
        withTiming(-(routeLen + 130), { duration: 950, easing: Easing.out(Easing.cubic) }),
        withTiming(110, { duration: 1 }),
        withTiming(-(routeLen + 130), { duration: 1350, easing: Easing.out(Easing.ease) }),
      );
      sweepOpacity.value = 0;
      sweepOpacity.value = withSequence(
        withTiming(1, { duration: 110, easing: Easing.linear }),
        withTiming(1, { duration: 480, easing: Easing.linear }),
        withTiming(0, { duration: 340, easing: Easing.out(Easing.ease) }),
        withTiming(0.55, { duration: 160, easing: Easing.linear }),
        withTiming(0.55, { duration: 700, easing: Easing.linear }),
        withTiming(0, { duration: 450, easing: Easing.out(Easing.ease) }),
      );
    } else {
      sweepOffset.value = withTiming(-(routeLen + 130), {
        duration: 1050,
        easing: Easing.out(Easing.cubic),
      });
      sweepOpacity.value = 0;
      sweepOpacity.value = withSequence(
        withTiming(1, { duration: 120, easing: Easing.linear }),
        withTiming(1, { duration: 550, easing: Easing.linear }),
        withTiming(0, { duration: 380, easing: Easing.out(Easing.ease) }),
      );
    }
    return () => {
      cancelAnimation(sweepOffset);
      cancelAnimation(sweepOpacity);
      cancelAnimation(surgeSV);
      cancelAnimation(flashSV);
    };
  }, [pulseKey, complete, reducedMotion, routeLen, sweepOffset, sweepOpacity, surgeSV, flashSV]);

  // While sacred, the route glints now and then.
  useEffect(() => {
    if (!complete || reducedMotion || routeLen <= 0) return;
    const glint = () => {
      sweepOffset.value = 110;
      sweepOffset.value = withTiming(-(routeLen + 130), {
        duration: 1600,
        easing: Easing.inOut(Easing.ease),
      });
      sweepOpacity.value = 0;
      sweepOpacity.value = withSequence(
        withTiming(0.5, { duration: 250, easing: Easing.linear }),
        withTiming(0.5, { duration: 850, easing: Easing.linear }),
        withTiming(0, { duration: 500, easing: Easing.out(Easing.ease) }),
      );
    };
    const id = setInterval(glint, 6500);
    return () => clearInterval(id);
  }, [complete, reducedMotion, routeLen, sweepOffset, sweepOpacity]);

  const flowOffset = useSharedValue(15);
  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(flowOffset);
      flowOffset.value = 15;
      return;
    }
    flowOffset.value = 15;
    flowOffset.value = withRepeat(
      withTiming(0, { duration: dashDurationMs, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(flowOffset);
  }, [reducedMotion, dashDurationMs, flowOffset]);

  const halo = useAnimatedProps<PathProps>(() => {
    const breathe = 0.34 + 0.12 * Math.sin(((2 * Math.PI * 1000) / (periodMs * 1.4)) * waveTick.value);
    return { d: d.value, opacity: Math.max(haloScale.value * breathe, flashSV.value) };
  }, [d, periodMs]);
  const haloOuter = useAnimatedProps<PathProps>(() => {
    const breathe = 0.16 + 0.06 * Math.sin(((2 * Math.PI * 1000) / (periodMs * 1.4)) * waveTick.value + 1.2);
    return { d: d.value, opacity: Math.max(haloScale.value * breathe, flashSV.value * 0.45) };
  }, [d, periodMs]);
  const line = useAnimatedProps<PathProps>(
    () => ({
      d: d.value,
      strokeWidth: MAIN_STROKE + Math.min(progressSV.value + surgeSV.value, 1.5),
      stroke: interpolateColor(haloScale.value, [0, 1], [lineColor, sacredLineColor]),
    }),
    [d, lineColor, sacredLineColor],
  );
  const flowQ = useDerivedValue(() => Math.round(flowOffset.value * 4) / 4, []);
  const flow = useAnimatedProps<PathProps>(
    () => ({
      d: d.value,
      strokeDashoffset: flowQ.value,
      stroke: interpolateColor(haloScale.value, [0, 1], [accentColor, shimmerColor]),
    }),
    [d, flowQ, accentColor, shimmerColor],
  );
  const shimmer = useAnimatedProps<PathProps>(
    () => ({
      d: d.value,
      strokeDasharray: [110, 1e6],
      strokeDashoffset: sweepOffset.value,
      opacity: sweepOpacity.value,
    }),
    [d],
  );
  const shimmerWide = useAnimatedProps<PathProps>(
    () => ({
      d: d.value,
      strokeDasharray: [110, 1e6],
      strokeDashoffset: sweepOffset.value,
      opacity: sweepOpacity.value,
    }),
    [d],
  );
  const wave = useMemo<WaveHandles>(
    () => ({ tick: waveTick, progressSV, surgeSV }),
    [waveTick, progressSV, surgeSV],
  );

  return { halo, haloOuter, line, flow, shimmer, shimmerWide, wave };
}
