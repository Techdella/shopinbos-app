"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { readRememberedStoreVisitor, useStoreVisitor } from "./useStoreVisitor";

export function useWishlist(storeSlug: string) {
  const visitorKey = useStoreVisitor(storeSlug);
  const [productIds, setProductIds] = useState<string[]>([]);

  useEffect(() => {
    if (!visitorKey) return;
    let cancelled = false;
    fetch(`/api/public/store/${storeSlug}/wishlist?visitorKey=${encodeURIComponent(visitorKey)}`)
      .then((res) => res.ok ? res.json() : null)
      .then((json) => {
        if (!cancelled && Array.isArray(json?.data?.productIds)) setProductIds(json.data.productIds);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeSlug, visitorKey]);

  const toggle = useCallback(async (productId: string) => {
    if (!visitorKey) return;
    const exists = productIds.includes(productId);
    setProductIds((prev) => exists ? prev.filter((id) => id !== productId) : [...prev, productId]);
    const remembered = readRememberedStoreVisitor(storeSlug);
    await fetch(`/api/public/store/${storeSlug}/wishlist`, {
      method: exists ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorKey,
        productId,
        email: remembered.email || undefined,
        name: remembered.name || undefined,
      }),
    }).catch(() => {});
  }, [productIds, storeSlug, visitorKey]);

  return useMemo(() => ({ visitorKey, productIds, toggle }), [visitorKey, productIds, toggle]);
}
