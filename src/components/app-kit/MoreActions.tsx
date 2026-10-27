"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

/**
 * Secondary page-header actions. From `sm` up they sit inline with the others; on phones they fold into a "⋯" menu
 * so the header stays one row. The children render in both places, so keep them links (a dialog a button opened
 * would close with the menu).
 */
export function MoreActions({ children }: { children: ReactNode }) {
  const t = useT("common");
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", onKey);
    const onScroll = () => setOpen(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="hidden sm:contents">{children}</div>
      <div ref={ref} className="relative sm:hidden">
        <button
          type="button"
          aria-label={t("more")}
          aria-expanded={open}
          onClick={(event) => {
            // Fixed under the button, kept inside the screen wherever the button sits in the row.
            const rect = event.currentTarget.getBoundingClientRect();
            const width = Math.min(260, window.innerWidth - 32);
            setSpot({ top: rect.bottom + 8, left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)), width });
            setOpen((value) => !value);
          }}
          className="grid h-11 w-11 place-items-center rounded-full border border-app-line bg-white text-app-ink hover:border-app-line-strong"
        >
          <Icon name="moreHorizontal" size={18} />
        </button>
        {open && spot && (
          <div
            style={{ top: spot.top, left: spot.left, width: spot.width }}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setOpen(false);
            }}
            className="fixed z-40 flex flex-col gap-1.5 rounded-[18px] border border-app-line bg-white p-2 shadow-[0_20px_40px_-20px_rgba(22,20,31,0.35)] [&>*]:w-full [&>*]:justify-start"
          >
            {children}
          </div>
        )}
      </div>
    </>
  );
}
