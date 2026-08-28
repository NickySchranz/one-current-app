/** Works on native handles and raw DOM nodes alike. */
export function measureNode(
  node: unknown,
  cb: (x: number, y: number, w: number, h: number) => void,
) {
  const n = node as {
    measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    getBoundingClientRect?: () => { left: number; top: number; width: number; height: number };
  } | null;
  if (!n) return;
  if (typeof n.measureInWindow === "function") {
    n.measureInWindow(cb);
  } else if (typeof n.getBoundingClientRect === "function") {
    const r = n.getBoundingClientRect();
    cb(r.left, r.top, r.width, r.height);
  }
}
