"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/app-ui/cx";
import { useT } from "@/components/i18n/I18nProvider";

// Folded-away details (simplicity rules, section 8A): optional or technical things stay one tap away, closed by
// default. A plain <details>, so it works without JavaScript; a client component (for the translated summaries) that
// server pages can render as usual.
//
// Use `Fold` for "Advanced (optional)" settings and `TechFold` for things only "the person who set it up" needs
// (records, keys, links for Facebook or Google). Text inside a TechFold may use technical words.

export function Fold({
  summary,
  hint,
  children,
  className,
  defaultOpen,
  testId,
}: {
  summary: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  testId?: string;
}) {
  return (
    <details className={cx("group min-w-0 rounded-[18px] border border-app-line bg-white", className)} open={defaultOpen} data-fold={testId}>
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[14.5px] font-bold text-app-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-app-canvas text-[12px] transition group-open:rotate-90">›</span>
        <span className="min-w-0 flex-1">
          {summary}
          {hint && <span className="block text-[12.5px] font-normal text-app-ink-soft">{hint}</span>}
        </span>
      </summary>
      <div className="min-w-0 border-t border-app-line px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}

/** "Show the technical details (for …)": only for the person who manages the technical side. */
export function TechFold({ forWho, children, className, testId }: { forWho: string; children: ReactNode; className?: string; testId?: string }) {
  const t = useT("ui");
  // "Show the technical details (for {forWho})" in English (ui catalog).
  return (
    <Fold className={className} testId={testId ?? "technical"} summary={t("techDetails", { forWho })}>
      {children}
    </Fold>
  );
}

/** "Advanced (optional)" settings most sellers never change. */
export function AdvancedFold({ children, className, hint, label }: { children: ReactNode; className?: string; hint?: ReactNode; label?: string }) {
  const t = useT("ui");
  label ??= t("advanced");
  return (
    <Fold className={className} testId="advanced" summary={label} hint={hint}>
      {children}
    </Fold>
  );
}
