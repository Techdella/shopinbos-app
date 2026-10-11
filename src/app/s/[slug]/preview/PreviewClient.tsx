"use client";

import { useEffect, useState } from "react";
import { StorefrontClient } from "@/app/s/[slug]/StorefrontClient";
import type { StoreEditorSnapshot } from "@/lib/store-templates";

interface PreviewClientProps {
  store: any;
  storeBasePath: string;
  slug: string;
}

export function PreviewClient({ store: initialStore, storeBasePath, slug }: PreviewClientProps) {
  const [draft, setDraft] = useState<StoreEditorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      try {
        const res = await fetch("/api/store/editor", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setError("Could not load draft. Preview shows published content.");
          return;
        }
        const json = (await res.json()) as { data?: { draft?: StoreEditorSnapshot | null } };
        if (!cancelled) setDraft(json.data?.draft ?? null);
      } catch {
        if (!cancelled) setError("Could not load draft data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDraft();
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

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Preview banner */}
      <div style={{
        background: draft ? "#0E9E85" : "#F5A623",
        color: "#fff", padding: "8px 16px", textAlign: "center",
        fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        flexShrink: 0, position: "sticky", top: 0, zIndex: 999,
      }}>
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM7 4h2v5H7V4zm0 6h2v2H7v-2z"/>
        </svg>
        <span>
          {draft
            ? "Preview Mode — showing your unpublished draft. Cart & checkout are active for testing."
            : "Published view — no draft session found. Log in to the builder to preview drafts."}
        </span>
        {draft && (
          <a href={storeBasePath} style={{ color: "rgba(255,255,255,.7)", marginLeft: 8, textDecoration: "underline", fontSize: 11 }}>
            View published store
          </a>
        )}
      </div>
      <div style={{ flex: 1, width: "100%", minWidth: 0 }}>
        <StorefrontClient
          store={initialStore}
          storeBasePath={storeBasePath}
          previewSnapshot={draft}
          previewMode={false}
        />
      </div>
    </div>
  );
}
