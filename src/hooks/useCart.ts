"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { readRememberedStoreVisitor, visitorStorageKey } from "./useStoreVisitor";
import { cartCount, cartSubtotal, clampQuantity, lineKey, mergeLines, sanitizeLines, type CartLine } from "@shared/cart-checkout";
import { captureCart } from "@/components/storefront/shopper/cart-capture";
import { trackStoreEvent } from "@/lib/analytics/storefront-events";

export type CartItem = CartLine;

function storageKey(slug: string) {
  return `cart:${slug}`;
}

// Every useCart on the page (header count, drawer, cart page) and every tab shares one bag.
const SYNC_EVENT = "shopinbos:cart";

/** The stored bag, or null when this browser won't let us read storage. */
function readStored(slug: string): CartItem[] | null {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    return raw ? sanitizeLines(JSON.parse(raw)) : [];
  } catch {
    return null;
  }
}

export function useCart(storeSlug: string) {
  const [items, setItemsState] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const itemsRef = useRef<CartItem[]>([]);

  useEffect(() => {
    const stored = readStored(storeSlug) ?? [];
    itemsRef.current = stored;
    setItemsState(stored);
    setLoaded(true);
    const sync = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== storageKey(storeSlug)) return;
      if (event instanceof CustomEvent && event.detail !== storeSlug) return;
      const next = readStored(storeSlug);
      if (!next) return;
      itemsRef.current = next;
      setItemsState(next);
    };
    window.addEventListener("storage", sync);
    window.addEventListener(SYNC_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(SYNC_EVENT, sync);
    };
  }, [storeSlug]);

  // Writes straight to storage (not inside a state update), so navigating right after adding keeps the item.
  const setItems = useCallback((next: (prev: CartItem[]) => CartItem[]) => {
    const prev = readStored(storeSlug) ?? itemsRef.current;
    const value = next(prev);
    if (value === prev) return;
    itemsRef.current = value;
    setItemsState(value);
    try {
      localStorage.setItem(storageKey(storeSlug), JSON.stringify(value));
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: storeSlug }));
    } catch {}
  }, [storeSlug]);

  // A returning shopper we already know (they gave an email before) gets their bag saved for reminders.
  useEffect(() => {
    if (!loaded || items.length === 0) return;
    let visitorKey = "";
    try {
      visitorKey = localStorage.getItem(visitorStorageKey(storeSlug)) ?? "";
    } catch {}
    const remembered = readRememberedStoreVisitor(storeSlug);
    if (!visitorKey || !remembered.email) return;
    const timer = window.setTimeout(() => {
      void captureCart(storeSlug, { visitorKey, email: remembered.email, name: remembered.name || undefined, items });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [items, loaded, storeSlug]);

  const add = useCallback((item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    setItems((prev) => mergeLines(prev, [{ ...item, quantity: item.quantity ?? 1 }]));
    // Add-to-bag count for the store funnel in /home/analytics.
    trackStoreEvent(storeSlug, "add_to_cart", item.productId);
  }, [setItems, storeSlug]);

  const remove = useCallback((productId: string, variant?: string) => {
    setItems((prev) => prev.filter((i) => lineKey(i) !== lineKey({ productId, variant })));
  }, [setItems]);

  const update = useCallback((productId: string, quantity: number, variant?: string) => {
    const key = lineKey({ productId, variant });
    setItems((prev) =>
      quantity <= 0 ? prev.filter((i) => lineKey(i) !== key) : prev.map((i) => (lineKey(i) === key ? { ...i, quantity: clampQuantity(quantity, i.maxQuantity) } : i)),
    );
  }, [setItems]);

  /** Swaps the whole bag, e.g. for a restored cart. */
  const replace = useCallback((next: CartItem[]) => setItems(() => sanitizeLines(next)), [setItems]);

  const clear = useCallback(() => setItems((prev) => (prev.length ? [] : prev)), [setItems]);

  return { items, add, remove, update, replace, clear, count: cartCount(items), subtotal: cartSubtotal(items), loaded };
}
