"use client";
import { useState, useEffect, useCallback } from "react";
import { readRememberedStoreVisitor, visitorStorageKey } from "./useStoreVisitor";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  variant?: string;
  maxQuantity?: number;
}

function storageKey(slug: string) {
  return `cart:${slug}`;
}

export function useCart(storeSlug: string) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(storeSlug));
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, [storeSlug]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey(storeSlug), JSON.stringify(items));
    } catch {}
  }, [items, storeSlug, loaded]);

  useEffect(() => {
    if (!loaded || items.length === 0) return;
    try {
      const visitorKey = localStorage.getItem(visitorStorageKey(storeSlug));
      const remembered = readRememberedStoreVisitor(storeSlug);
      if (!visitorKey || !remembered.email) return;
      const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
      const signature = `${remembered.email}:${items.map((item) => `${item.productId}:${item.quantity}`).join("|")}:${subtotal}`;
      const sentKey = `abandoned-cart:${storeSlug}:${signature}`;
      if (localStorage.getItem(sentKey)) return;
      const timer = window.setTimeout(() => {
        fetch(`/api/public/store/${storeSlug}/abandoned-cart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visitorKey, email: remembered.email, name: remembered.name || undefined, items, subtotal }),
        })
          .then((res) => {
            if (res.ok) localStorage.setItem(sentKey, "1");
          })
          .catch(() => {});
      }, 1200);
      return () => window.clearTimeout(timer);
    } catch {}
  }, [items, loaded, storeSlug]);

  const add = useCallback((item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    setItems(prev => {
      const existing = prev.find(i => i.productId === item.productId && i.variant === item.variant);
      if (existing) {
        return prev.map(i =>
          i.productId === item.productId && i.variant === item.variant
            ? { ...i, quantity: i.quantity + (item.quantity ?? 1) }
            : i
        );
      }
      return [...prev, { ...item, quantity: item.quantity ?? 1 }];
    });
  }, []);

  const remove = useCallback((productId: string, variant?: string) => {
    setItems(prev => prev.filter(i => !(i.productId === productId && i.variant === variant)));
  }, []);

  const update = useCallback((productId: string, quantity: number, variant?: string) => {
    if (quantity <= 0) {
      remove(productId, variant);
      return;
    }
    setItems(prev => prev.map(i => i.productId === productId && i.variant === variant ? { ...i, quantity } : i));
  }, [remove]);

  const clear = useCallback(() => setItems([]), []);

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return { items, add, remove, update, clear, count, subtotal, loaded };
}
