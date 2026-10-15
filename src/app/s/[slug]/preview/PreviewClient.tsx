"use client";

import { useEffect, useState } from "react";
import { StorefrontClient } from "@/app/s/[slug]/StorefrontClient";
import { PreviewFrame } from "@/components/storefront/shopper/PreviewBar";
import type { StoreEditorSnapshot } from "@/lib/store-templates";

// The store with the owner's builder draft on top. Bag, wishlist and checkout links go to the store's own
// routes, which show the owner a preview too while the store isn't live (checkout takes no payment there).

interface PreviewClientProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any;
  storeBasePath: string;
  /** False while the store isn't open to shoppers (only its owner gets this far). */
  live: boolean;
  /** The store page the address names (/about), shown first. */
  initialPage?: string;
}

export function PreviewClient({ store, storeBasePath, live, initialPage }: PreviewClientProps) {
  const [draft, setDraft] = useState<StoreEditorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      try {
        const res = await fetch("/api/store/editor", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: { store?: { id?: string } | null; draft?: StoreEditorSnapshot | null } };
        // Only this store's draft (the editor API answers for the signed-in seller's own store).
        const sameStore = !json.data?.store?.id || json.data.store.id === store.id;
        if (!cancelled && sameStore) setDraft(json.data?.draft ?? null);
      } catch {
        /* the published view still renders */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, [store.id]);

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#FAF7F1] font-app text-[14px] text-[#6E6E68]" role="status">
        Loading preview…
      </div>
    );
  }

  return (
    <PreviewFrame variant={!live ? "not-live" : draft ? "draft" : "published"}>
      <StorefrontClient store={store} storeBasePath={storeBasePath} previewSnapshot={draft} previewMode={false} ownerPreview={!live} initialPage={initialPage} />
    </PreviewFrame>
  );
}
