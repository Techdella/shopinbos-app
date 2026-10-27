// Joins class names, skipping falsy values. Plain module so server components can use it too.
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** A row of chips or tabs that stays on one line and scrolls sideways on phones, and wraps from `sm` up. Give the items `shrink-0`. */
export const PHONE_SCROLL_ROW = "max-w-full flex-nowrap overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden";
