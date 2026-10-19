"use client";

/** The print dialog doubles as "Save as PDF" in every modern browser. */
export function PrintSheetButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white"
    >
      {label}
    </button>
  );
}
