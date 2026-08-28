import { useCallback, useRef } from "react";
import { measureNode } from "@/ui/measure";
import type { WalkthroughTargetId } from "./steps";

/**
 * Where the walkthrough's pointer can rest. Components register the node that
 * plays each role; the overlay measures whichever is currently mounted. When
 * two variants of a control exist (the bottom bar's + and the timeline's
 * floating +), the last one mounted wins — exactly the one the user can see.
 */

export type TargetRect = { x: number; y: number; w: number; h: number };

const nodes = new Map<WalkthroughTargetId, unknown[]>();
const points = new Map<WalkthroughTargetId, { x: number; y: number }>();

export function registerWalkthroughTarget(id: WalkthroughTargetId, node: unknown): () => void {
  const list = nodes.get(id) ?? [];
  list.push(node);
  nodes.set(id, list);
  return () => {
    const current = nodes.get(id) ?? [];
    const i = current.indexOf(node);
    if (i !== -1) current.splice(i, 1);
  };
}

/** Targets that live in SVG canvas space publish a window-coordinate point instead of a node. */
export function setWalkthroughPoint(
  id: WalkthroughTargetId,
  p: { x: number; y: number } | null,
) {
  if (p) points.set(id, p);
  else points.delete(id);
}

/** Measure a target: a rect for registered nodes, a zero-size rect for points, null when absent. */
export function measureWalkthroughTarget(
  id: WalkthroughTargetId,
  cb: (rect: TargetRect | null) => void,
) {
  const list = nodes.get(id) ?? [];
  const node = list[list.length - 1];
  if (node) {
    measureNode(node, (x, y, w, h) => cb({ x, y, w, h }));
    return;
  }
  const p = points.get(id);
  cb(p ? { x: p.x, y: p.y, w: 0, h: 0 } : null);
}

/** Ref callback that registers the node under the given role while mounted. */
export function useWalkthroughTarget(id: WalkthroughTargetId): (node: unknown) => void {
  const unregister = useRef<(() => void) | null>(null);
  return useCallback(
    (node: unknown) => {
      unregister.current?.();
      unregister.current = node ? registerWalkthroughTarget(id, node) : null;
    },
    [id],
  );
}
