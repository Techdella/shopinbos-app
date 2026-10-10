"use client";

import { useEffect, useState } from "react";
import { StorefrontClient } from "@/app/s/[slug]/StorefrontClient";
import type { StoreEditorSnapshot } from "@/lib/store-templates";

interface Props {
  slug: string;
  pageId: string;
}

export function PreviewPageClient({ slug, pageId }: Props) {
  const [page, setPage] = useState<Record<string, unknown> | null>(null);
  const [store, setStore] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const pageRes = await fetch(`/api/store/pages/${pageId}`, { cache: "no-store" });
        if (!pageRes.ok) {
          if (!cancelled) setError("Could not load page. You may need to log in.");
          return;
        }
        const pageJson = await pageRes.json();
        if (cancelled) return;

        const pageData = pageJson.data ?? pageJson;
        setPage(pageData);

        const storeData = {
          id: pageData.storeId,
          name: pageData.storeName ?? "Preview",
          slug,
          currency: "NGN",
          brandSettings: {},
          storeProducts: [],
        };
        setStore(storeData);
      } catch {
        if (!cancelled) setError("Failed to load preview data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => { cancelled = true; };
  }, [slug, pageId]);

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

  if (error) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F7F8FA", color: "#6B7385", fontFamily: "'DM Sans',sans-serif", fontSize: 14, flexDirection: "column", gap: 12,
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        {error}
      </div>
    );
  }

  if (!page) return null;

  const draftContent = (page.draftContent ?? page.content ?? {}) as Record<string, unknown>;
  const sections = (draftContent.sections ?? []) as StoreEditorSnapshot["pages"][number]["sections"];
  const rawSeo = draftContent.seo as Record<string, string> | undefined;
  const seo = rawSeo ? { metaTitle: rawSeo.metaTitle ?? "", metaDescription: rawSeo.metaDescription ?? "" } : undefined;

  if (sections.length === 0) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F7F8FA", color: "#6B7385", fontFamily: "'DM Sans',sans-serif", fontSize: 14, flexDirection: "column", gap: 8,
      }}>
        This page has no sections yet. Add content in the page builder.
      </div>
    );
  }

  const previewSnapshot: StoreEditorSnapshot = {
    templateId: "preview",
    templateName: (page.title as string) ?? "Preview",
    layoutFamily: "editorial-boutique",
    themeTokens: {
      heroBg: "#1A3528",
      heroText: "#FFFFFF",
      accent: "#0E9E85",
      ctaBg: "#0E9E85",
      ctaText: "#FFFFFF",
      paperBg: "#FAF7F2",
      cardBg: "#FFFFFF",
      ink: "#1A1A18",
      muted: "#6B7280",
      border: "#E5E7EB",
      headingStyle: "serif",
      radius: "rounded",
    },
    pages: [
      {
        id: page.id as string,
        pageType: (page.type as StoreEditorSnapshot["pages"][number]["pageType"]) ?? "home",
        title: (page.title as string) ?? "Preview",
        slug: (page.slug as string) ?? "",
        sections,
        seo,
      },
    ],
    updatedAt: new Date().toISOString(),
  };

  const storeBasePath = `/${slug}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div style={{
        background: "#0E9E85",
        color: "#fff", padding: "8px 16px", textAlign: "center",
        fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        flexShrink: 0, position: "sticky", top: 0, zIndex: 999,
      }}>
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM7 4h2v5H7V4zm0 6h2v2H7v-2z"/>
        </svg>
        <span>Preview Mode — "{page.title as string}" (draft)</span>
        <a href={`/${slug}/${page.slug as string}`} style={{ color: "rgba(255,255,255,.7)", marginLeft: 8, textDecoration: "underline", fontSize: 11 }}>
          View published
        </a>
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <StorefrontClient
          store={store as unknown as Parameters<typeof StorefrontClient>[0]["store"]}
          storeBasePath={storeBasePath}
          previewSnapshot={previewSnapshot}
          previewMode
        />
      </div>
    </div>
  );
}
