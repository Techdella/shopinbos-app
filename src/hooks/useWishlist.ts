"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readRememberedStoreVisitor, useStoreVisitor } from "./useStoreVisitor";

export function useWishlist(storeSlug: string) {
  const visitorKey = useStoreVisitor(storeSlug);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const idsRef = useRef<string[]>([]);
  idsRef.current = productIds;

  useEffect(() => {
    if (!visitorKey) return;
    let cancelled = false;
    fetch(`/api/public/store/${storeSlug}/wishlist?visitorKey=${encodeURIComponent(visitorKey)}`)
      .then((res) => res.ok ? res.json() : null)
      .then((json) => {
        if (!cancelled && Array.isArray(json?.data?.productIds)) setProductIds(json.data.productIds);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storeSlug, visitorKey]);

  const send = useCallback(async (productId: string, method: "POST" | "DELETE") => {
    if (!visitorKey) return;
    const remembered = readRememberedStoreVisitor(storeSlug);
    await fetch(`/api/public/store/${storeSlug}/wishlist`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorKey,
        productId,
        email: remembered.email || undefined,
        name: remembered.name || undefined,
      }),
    }).catch(() => {});
  }, [storeSlug, visitorKey]);

  const add = useCallback(async (productId: string) => {
    if (!visitorKey || idsRef.current.includes(productId)) return;
    setProductIds((prev) => (prev.includes(productId) ? prev : [productId, ...prev]));
    await send(productId, "POST");
  }, [send, visitorKey]);

  const remove = useCallback(async (productId: string) => {
    if (!visitorKey) return;
    setProductIds((prev) => prev.filter((id) => id !== productId));
    await send(productId, "DELETE");
  }, [send, visitorKey]);

  const toggle = useCallback(async (productId: string) => {
    if (idsRef.current.includes(productId)) await remove(productId);
    else await add(productId);
  }, [add, remove]);

  return useMemo(() => ({ visitorKey, productIds, loaded, toggle, add, remove }), [visitorKey, productIds, loaded, toggle, add, remove]);
}
