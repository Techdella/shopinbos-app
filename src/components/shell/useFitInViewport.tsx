"use client";

import { useLayoutEffect, useRef, useState, type HTMLAttributes, type RefObject } from "react";

const GUTTER = 8;

/**
 * Keeps a fixed-position panel (menu flyout, hover tip) inside the window: it starts level with `anchorTop` and
 * moves up just enough to fit, measured from its real height (and re-measured when its content or the window
 * changes). Taller than the window: it sits at the top and scrolls (pair with `maxHeight: FIT_MAX_HEIGHT`).
 */
export function useFitInViewport(ref: RefObject<HTMLElement | null>, anchorTop: number | null) {
  const [top, setTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (anchorTop === null || !node) {
      setTop(null);
      return;
    }
    const fit = () => {
      const height = node.offsetHeight;
      setTop(Math.max(GUTTER, Math.min(anchorTop, window.innerHeight - GUTTER - height)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [ref, anchorTop]);
  // Until measured, start at the anchor (clamped to the window) so nothing flashes off-screen for long.
  return top ?? (anchorTop === null ? 0 : Math.max(GUTTER, anchorTop));
}

export const FIT_MAX_HEIGHT = `calc(100dvh - ${GUTTER * 2}px)`;

/** A fixed-position box that keeps itself inside the window (see useFitInViewport); for code past an early return. */
export function FitBox({ anchorTop, style, children, ...rest }: { anchorTop: number } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const top = useFitInViewport(ref, anchorTop);
  return (
    <div ref={ref} {...rest} style={{ ...style, top, maxHeight: FIT_MAX_HEIGHT, overflowY: "auto" }}>
      {children}
    </div>
  );
}
