/**
 * The little "+20"s that fly off the bonk meter.
 *
 * This owns its own list. It used to live in LifeTimeline, where every pop —
 * and every one expiring 950ms later — re-rendered the entire timeline: the
 * mountain, the sky, every thread and creature. Nothing outside this overlay
 * ever reads that list, so it belongs here, behind a memo boundary, watching
 * the one number it cares about.
 */
import { memo, useEffect, useRef, useState } from "react";
import { ChargePop } from "./timeline-fx";

type Props = {
  /** The meter's current charge. A RISE in it is what earns a pop. */
  bonkCharge: number;
  /** The FAB shifts the meter left, and the pops sit with it. */
  showFab: boolean;
  color: string;
};

function ChargePopLayer__inner({ bonkCharge, showFab, color }: Props) {
  const [pops, setPops] = useState<{ key: number; amount: number }[]>([]);
  const wasRef = useRef<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const was = wasRef.current;
    wasRef.current = bonkCharge;
    // Only a gain, and never the reset a full sweep leaves behind.
    if (was === null || bonkCharge <= was) return;
    const key = Date.now();
    const amount = bonkCharge - was;
    setPops((p) => [...p, { key, amount }]);
    const id = setTimeout(() => setPops((p) => p.filter((x) => x.key !== key)), 950);
    timersRef.current.push(id);
  }, [bonkCharge]);

  // A sweep can rain several of these; unmounting mid-flight must not leave
  // their timers firing into a dead component.
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <>
      {pops.map((p, i) => (
        <ChargePop
          key={p.key}
          right={(showFab ? 92 : 8) + 12 + (i % 3) * 16}
          bottom={44}
          label={`+${p.amount}`}
          color={color}
        />
      ))}
    </>
  );
}

export const ChargePopLayer = memo(ChargePopLayer__inner);
