import type React from "react";

// The owner's preview of their store: a slim bar over every shopper page saying only they can see it, with
// the next step (go live, or back to the builder). PreviewFrame sets --sb-preview-h so the shopper header
// sticks below the bar instead of under it.

export const PREVIEW_BAR_HEIGHT = 40;

/** not-live: the store isn't open yet. draft: a live store showing unpublished builder changes. published: no draft to show. */
export type PreviewBarVariant = "not-live" | "draft" | "published";

const COPY: Record<PreviewBarVariant, { lead: string; rest: string; cta: string; href: string }> = {
  "not-live": { lead: "only you can see this.", rest: " Your store isn't live yet.", cta: "Go live", href: "/home/start" },
  draft: { lead: "your unpublished changes.", rest: " Shoppers still see the live store.", cta: "Open builder", href: "/builder" },
  published: { lead: "this is the live store.", rest: " Sign in to the builder to see your draft.", cta: "Open builder", href: "/builder" },
};

export function PreviewBar({ variant = "not-live" }: { variant?: PreviewBarVariant }) {
  const copy = COPY[variant];
  return (
    <div
      role="region"
      aria-label="Store preview"
      className="sticky top-0 z-[1000] flex items-center gap-3 bg-[#0E2A38] px-4 font-app text-[13px] text-[#F4F1EA] sm:px-6"
      style={{ height: PREVIEW_BAR_HEIGHT }}
    >
      <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#73D8C8] motion-reduce:animate-none" />
      <p className="m-0 min-w-0 flex-1 truncate">
        <strong className="font-semibold">Preview</strong> · {copy.lead}<span className="hidden sm:inline">{copy.rest}</span>
      </p>
      <a
        href={copy.href}
        className="inline-flex h-7 shrink-0 items-center rounded-full bg-[#73D8C8] px-3.5 text-[12.5px] font-semibold text-[#0E2A38] no-underline hover:bg-[#B5EBE2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73D8C8]"
      >
        {copy.cta}
      </a>
    </div>
  );
}

export function PreviewFrame({ variant = "not-live", children }: { variant?: PreviewBarVariant; children: React.ReactNode }) {
  return (
    <div style={{ ["--sb-preview-h" as string]: `${PREVIEW_BAR_HEIGHT}px` } as React.CSSProperties}>
      <PreviewBar variant={variant} />
      {children}
    </div>
  );
}
