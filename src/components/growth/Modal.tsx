"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";

/**
 * Sheet on phones, centred dialog from sm up. Closes on Escape and backdrop click,
 * and moves focus into the dialog when it opens.
 */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/40 font-app text-app-ink sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className={cx("flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[22px] bg-white sm:rounded-[22px]", wide ? "sm:max-w-[680px]" : "sm:max-w-[520px]")}
      >
        <div className="flex items-center gap-3 border-b border-app-line px-5 py-4">
          <h2 id={titleId} className="m-0 min-w-0 flex-1 truncate text-[18px] font-extrabold">{title}</h2>
          <button type="button" data-close onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
