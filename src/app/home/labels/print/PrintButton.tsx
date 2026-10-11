"use client";

import { useEffect } from "react";

/** Opens the print dialog once the page (and the store logo) has loaded, and again on click. */
export function PrintButton({ disabled }: { disabled?: boolean }) {
  useEffect(() => {
    if (disabled) return;
    const print = () => window.setTimeout(() => window.print(), 300);
    if (document.readyState === "complete") print();
    else window.addEventListener("load", print, { once: true });
    return () => window.removeEventListener("load", print);
  }, [disabled]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => window.print()}
      className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white disabled:opacity-50"
    >
      Print
    </button>
  );
}
