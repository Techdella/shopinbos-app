// Shoppers see the seller's store, not Shopinbos: a quiet progress line with no branding while it loads.
export default function Loading() {
  return (
    <div className="min-h-dvh bg-white" role="status" aria-label="Loading">
      <span aria-hidden className="fixed inset-x-0 top-0 block h-[3px] overflow-hidden">
        <span className="app-loading-line block h-full w-1/3 bg-neutral-800/70" />
      </span>
    </div>
  );
}
