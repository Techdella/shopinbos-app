"use client";

import { useEffect, useState } from "react";
import { landingSource } from "@/lib/analytics/storefront-events";

function makeVisitorKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function visitorStorageKey(storeSlug: string) {
  return `visitor:${storeSlug}`;
}

export function visitorEmailStorageKey(storeSlug: string) {
  return `visitor-email:${storeSlug}`;
}

export function visitorNameStorageKey(storeSlug: string) {
  return `visitor-name:${storeSlug}`;
}

export function rememberStoreVisitor(storeSlug: string, data: { email?: string; name?: string }) {
  try {
    if (data.email) localStorage.setItem(visitorEmailStorageKey(storeSlug), data.email);
    if (data.name) localStorage.setItem(visitorNameStorageKey(storeSlug), data.name);
  } catch {}
}

export function readRememberedStoreVisitor(storeSlug: string) {
  try {
    return {
      email: localStorage.getItem(visitorEmailStorageKey(storeSlug)) ?? "",
      name: localStorage.getItem(visitorNameStorageKey(storeSlug)) ?? "",
    };
  } catch {
    return { email: "", name: "" };
  }
}

export function useStoreVisitor(storeSlug: string) {
  const [visitorKey, setVisitorKey] = useState("");

  useEffect(() => {
    try {
      const key = visitorStorageKey(storeSlug);
      const existing = localStorage.getItem(key);
      if (existing) {
        setVisitorKey(existing);
        return;
      }
      const next = makeVisitorKey();
      localStorage.setItem(key, next);
      setVisitorKey(next);
    } catch {
      setVisitorKey(makeVisitorKey());
    }
  }, [storeSlug]);

  return visitorKey;
}

/** Counts this browser as a store visitor once per session (feeds "Visitors" on the seller dashboard). */
export function useStoreVisitBeacon(storeSlug: string) {
  const visitorKey = useStoreVisitor(storeSlug || "_");
  useEffect(() => {
    if (!storeSlug || !visitorKey) return;
    try {
      const flag = `visit-sent:${storeSlug}`;
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, "1");
    } catch {
      // Without sessionStorage we may count a visit twice; harmless.
    }
    void fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorKey, ...landingSource() }),
      keepalive: true,
    }).catch(() => null);
  }, [storeSlug, visitorKey]);
}
