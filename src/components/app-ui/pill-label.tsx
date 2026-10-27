import { Children, type ReactNode } from "react";

// Pill buttons keep their label on one line: the button can shrink in a tight row (min-w-0) and the words end in
// "…" instead of wrapping to a second line or pushing past the screen. Icons stay whole beside the text.
// Plain module so server components (PillLink) can use it too.

/** Classes every pill button shares: one line, never wider than its row, the same type on every screen. */
export const PILL_BASE = "inline-flex min-w-0 max-w-full items-center justify-center whitespace-nowrap rounded-full font-bold leading-none tracking-[-0.01em]";

/** Wraps the text parts of a pill's children so they truncate; icons and other elements pass through. */
export function pillLabel(children: ReactNode): ReactNode {
  return Children.map(children, (child) => (typeof child === "string" || typeof child === "number" ? (String(child).trim() ? <span className="min-w-0 truncate py-[0.12em] leading-[1.2]">{child}</span> : null) : child));
}
