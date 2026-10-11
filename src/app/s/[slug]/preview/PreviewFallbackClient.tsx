"use client";

import { useEffect, useState } from "react";
import { StorefrontClient } from "@/app/s/[slug]/StorefrontClient";
import type { StoreEditorSnapshot } from "@/lib/store-templates";

interface PreviewFallbackClientProps {
  storeBasePath: string;
  slug: string;
}

export function PreviewFallbackClient({ storeBasePath, slug }: PreviewFallbackClientProps) {
  const [store, setStore] = useState<any>(null);
  const [draft, setDraft] = useState<StoreEditorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/store/editor", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setError("Store not found and no editor session available.");
          return;
        }
        const json = (await res.json()) as { data?: { store?: any; draft?: StoreEditorSnapshot | null } };
        if (cancelled) return;
        if (json.data?.store) {
          setStore(json.data.store);
          setDraft(json.data.draft ?? null);
        } else {
          setError("No store found. Please create a store first.");
        }
      } catch {
        if (!cancelled) setError("Could not load store data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F7F8FA", color: "#6B7385", fontFamily: "'DM Sans',sans-serif", fontSize: 14,
      }}>
        Loading preview...
      </div>
    );
  }

  if (error || !store) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
        background: "#F7F8FA", color: "#6B7385", fontFamily: "'DM Sans',sans-serif", fontSize: 14, padding: 40, textAlign: "center",
      }}>
        <svg viewBox="0 0 48 48" fill="none" width="48" height="48">
          <rect x="4" y="8" width="40" height="32" rx="4" stroke="#CCC" strokeWidth="2" fill="none"/>
          <line x1="4" y1="16" x2="44" y2="16" stroke="#CCC" strokeWidth="2"/>
          <circle cx="24" cy="28" r="4" stroke="#CCC" strokeWidth="2" fill="none"/>
        </svg>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#1C2333" }}>Preview unavailable</div>
        <p style={{ maxWidth: 400, lineHeight: 1.6 }}>{error || "Could not load store data. Make sure you are logged in and have created a store."}</p>
        <a href="/home/editor" style={{
          padding: "10px 20px", borderRadius: 8, background: "#0E9E85", color: "#fff",
          textDecoration: "none", fontWeight: 600, fontSize: 14,
        }}>Open store editor</a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div style={{
        background: "#0E9E85", color: "#fff", padding: "8px 16px", textAlign: "center",
        fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        flexShrink: 0, position: "sticky", top: 0, zIndex: 999,
      }}>
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM7 4h2v5H7V4zm0 6h2v2H7v-2z"/>
        </svg>
        <span>Preview Mode — draft store. Cart & checkout are active for testing.</span>
      </div>
      <div style={{ flex: 1, width: "100%", minWidth: 0 }}>
        <StorefrontClient
          store={store}
          storeBasePath={storeBasePath}
          previewSnapshot={draft}
          previewMode={false}
        />
      </div>
    </div>
  );
}
