// A product's short code ("BAG2") as a small mono badge: product rows, order lines and the record-sale picker.
export function ProductCodeBadge({ code, className = "" }: { code: string; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border border-app-line bg-app-canvas px-2 py-[1px] font-mono text-[11.5px] font-bold tracking-[0.06em] text-app-ink ${className}`}>
      {code}
    </span>
  );
}
