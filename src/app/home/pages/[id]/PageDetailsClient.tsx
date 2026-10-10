"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icon, Badge } from "@/components/ui";
import type { IconName } from "@/components/ui/Icon";
import { toast } from "@/hooks/use-toast";

type PageStatus = "draft" | "published" | "hidden" | "scheduled" | "archived";

interface PageData {
  id: string;
  storeId: string;
  type: string;
  title: string;
  slug: string;
  content: Record<string, unknown>;
  draftContent: Record<string, unknown> | null;
  publishedContent: Record<string, unknown> | null;
  isPublished: boolean;
  status: PageStatus;
  publishAt: string | null;
  archivedAt: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  page: PageData;
  storeId: string;
  storeSlug: string;
  storeStatus: string;
}

const PAGE_ICONS: Record<string, IconName> = {
  home: "store",
  about: "info",
  contact: "mail",
  faq: "info",
  blog: "document",
};

function getStatusBadge(status: PageStatus, storeIsLive: boolean): { label: string; variant: "mint" | "warn" | "soft" | "danger" | "info" } {
  if (!storeIsLive && status === "published") return { label: "Draft · Store Not Live", variant: "warn" };
  switch (status) {
    case "published": return { label: "Published", variant: "mint" };
    case "draft": return { label: "Draft", variant: "warn" };
    case "hidden": return { label: "Hidden", variant: "soft" };
    case "scheduled": return { label: "Scheduled", variant: "info" };
    case "archived": return { label: "Archived", variant: "danger" };
    default: return { label: "Draft", variant: "warn" };
  }
}

function hasUnsavedDraft(page: PageData): boolean {
  const dc = page.draftContent;
  const pc = page.publishedContent ?? page.content;
  if (!dc) return false;
  if (!pc) return true;
  return JSON.stringify(dc) !== JSON.stringify(pc);
}

export function PageDetailsClient({ page: initialPage, storeId, storeSlug, storeStatus }: Props) {
  const router = useRouter();
  const [page, setPage] = useState<PageData>(initialPage);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"details" | "seo" | "navigation" | "scheduling">("details");

  const effectiveContent = page.draftContent ?? page.content ?? {};
  const seo = (effectiveContent.seo as Record<string, string | boolean>) ?? {};
  const navigation = (effectiveContent.navigation as Record<string, string | number | boolean>) ?? {};

  const isLive = storeStatus === "active" || storeStatus === "published";
  const badge = getStatusBadge(page.status, isLive);
  const hasDraftChanges = hasUnsavedDraft(page);

  const [localSeo, setLocalSeo] = useState({
    metaTitle: (seo.metaTitle as string) ?? "",
    metaDescription: (seo.metaDescription as string) ?? "",
    focusKeyword: (seo.focusKeyword as string) ?? "",
    socialTitle: (seo.socialTitle as string) ?? "",
    socialDescription: (seo.socialDescription as string) ?? "",
    socialImage: (seo.socialImage as string) ?? "",
    canonicalUrl: (seo.canonicalUrl as string) ?? "",
    noIndex: (seo.noIndex as boolean) ?? false,
  });

  const [localNav, setLocalNav] = useState({
    showInMenu: (navigation.showInMenu as boolean) ?? true,
    showInFooter: (navigation.showInFooter as boolean) ?? false,
    parentPage: (navigation.parentPage as string) ?? "",
    menuLabel: (navigation.menuLabel as string) ?? page.title,
    menuOrder: (navigation.menuOrder as number) ?? 0,
  });

  const [localScheduling, setLocalScheduling] = useState({
    publishAt: page.publishAt ?? "",
    status: page.status,
  });

  useEffect(() => {
    const ec = page.draftContent ?? page.content ?? {};
    const s = (ec.seo as Record<string, string | boolean>) ?? {};
    const n = (ec.navigation as Record<string, string | number | boolean>) ?? {};
    setLocalSeo({
      metaTitle: (s.metaTitle as string) ?? "",
      metaDescription: (s.metaDescription as string) ?? "",
      focusKeyword: (s.focusKeyword as string) ?? "",
      socialTitle: (s.socialTitle as string) ?? "",
      socialDescription: (s.socialDescription as string) ?? "",
      socialImage: (s.socialImage as string) ?? "",
      canonicalUrl: (s.canonicalUrl as string) ?? "",
      noIndex: (s.noIndex as boolean) ?? false,
    });
    setLocalNav({
      showInMenu: (n.showInMenu as boolean) ?? true,
      showInFooter: (n.showInFooter as boolean) ?? false,
      parentPage: (n.parentPage as string) ?? "",
      menuLabel: (n.menuLabel as string) ?? page.title,
      menuOrder: (n.menuOrder as number) ?? 0,
    });
    setLocalScheduling({
      publishAt: page.publishAt ?? "",
      status: page.status,
    });
  }, [page.draftContent, page.content, page.title, page.publishAt, page.status]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/store/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: page.title,
          slug: page.slug,
          seo: localSeo,
          navigation: { ...localNav, menuLabel: localNav.menuLabel || page.title },
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const json = await res.json();
      setPage((prev) => ({ ...prev, ...json.data, draftContent: json.data.draftContent }));
      toast({ title: "Draft saved", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "Failed to save", variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [page.id, page.title, page.slug, localSeo, localNav, router]);

  const handlePublishNow = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/store/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPublished: true,
          content: page.draftContent ?? {},
        }),
      });
      if (!res.ok) throw new Error("Failed to publish");
      const json = await res.json();
      setPage((prev) => ({ ...prev, ...json.data }));
      toast({ title: "Page published", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "Failed to publish", variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [page.id, page.draftContent, router]);

  const handleUnpublish = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/store/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: false }),
      });
      if (!res.ok) throw new Error("Failed to unpublish");
      const json = await res.json();
      setPage((prev) => ({ ...prev, ...json.data }));
      toast({ title: "Page unpublished", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "Failed to unpublish", variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [page.id, router]);

  const handleArchive = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/store/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (!res.ok) throw new Error("Failed to archive");
      const json = await res.json();
      setPage((prev) => ({ ...prev, ...json.data }));
      toast({ title: "Page archived", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "Failed to archive", variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [page.id, router]);

  const handleRestore = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/store/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      if (!res.ok) throw new Error("Failed to restore");
      const json = await res.json();
      setPage((prev) => ({ ...prev, ...json.data }));
      toast({ title: "Page restored from archive", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "Failed to restore", variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [page.id, router]);

  const handleSchedule = useCallback(async () => {
    if (!localScheduling.publishAt) {
      toast({ title: "Select a date and time", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/store/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "scheduled",
          publishAt: new Date(localScheduling.publishAt).toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Failed to schedule");
      const json = await res.json();
      setPage((prev) => ({ ...prev, ...json.data }));
      toast({ title: "Page scheduled", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "Failed to schedule", variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [page.id, localScheduling.publishAt, router]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Are you sure you want to delete this page? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/store/pages/${page.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "Page deleted", variant: "success" });
      router.push("/home/pages");
    } catch {
      toast({ title: "Failed to delete", variant: "error" });
    }
  }, [page.id, router]);

  const previewUrl = `/preview/store/${storeSlug}/${page.id}`;
  const liveUrl = isLive && page.status === "published" ? `/${storeSlug}/${page.slug}` : null;

  const isArchived = page.status === "archived";

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: "var(--teal-100)", color: "var(--teal-700)",
            display: "grid", placeItems: "center", flexShrink: 0,
          }}>
            <Icon name={PAGE_ICONS[page.type] ?? "document"} size={18} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{page.title}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Badge variant={badge.variant} dot>{badge.label}</Badge>
              {hasDraftChanges && page.status === "published" && (
                <Badge variant="warn">Unsaved draft changes</Badge>
              )}
              <span style={{ fontSize: 12, color: "var(--ink-400)", fontFamily: "var(--font-mono)" }}>/{page.slug}</span>
              {page.status === "published" && (
                <span style={{ fontSize: 12, color: "var(--ink-400)" }}>
                  · Published {new Date(page.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </div>
        </div>

        {!isArchived && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <a href={previewUrl} target="_blank" className="dbtn dBtn-ghost" style={{ textDecoration: "none" }}>
              <Icon name="eye" size={14} /> Preview
            </a>
            <a href={`/home/editor?page=${page.id}`} className="dbtn dBtn-mint" style={{ textDecoration: "none" }}>
              <Icon name="edit" size={14} /> Edit Page Design
            </a>
          </div>
        )}
      </div>

      {isArchived ? (
        <div style={{ padding: 40, textAlign: "center", background: "var(--red-50)", borderRadius: 12, border: "1px solid var(--red-200)" }}>
          <Icon name="archive" size={28} />
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--red-700)", marginTop: 8 }}>Page Archived</div>
          <div style={{ fontSize: 13, color: "var(--red-500)", marginTop: 4 }}>
            This page was archived on {page.archivedAt ? new Date(page.archivedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "unknown date"}.
            It is not visible to customers.
          </div>
          <button onClick={handleRestore} disabled={saving} className="dbtn" style={{ marginTop: 16, background: "var(--teal-600)", color: "white", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Restore Page
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--ink-200)" }}>
            {[
              { key: "details", label: "Details" },
              { key: "seo", label: "SEO" },
              { key: "navigation", label: "Navigation" },
              { key: "scheduling", label: "Scheduling" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as typeof tab)}
                style={{
                  padding: "10px 18px",
                  fontSize: 13, fontWeight: 700,
                  background: "none", border: "none", cursor: "pointer",
                  color: tab === t.key ? "var(--teal-700)" : "var(--ink-500)",
                  borderBottom: tab === t.key ? "2px solid var(--teal-600)" : "2px solid transparent",
                  marginBottom: -1,
                  transition: "color 0.15s",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "details" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, alignItems: "start" }}>
              <div className="card" style={{ padding: 20 }}>
                <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 800 }}>Page Details</h2>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Title</label>
                    <input
                      type="text"
                      value={page.title}
                      onChange={(e) => setPage((p) => ({ ...p, title: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Slug</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--ink-500)", marginBottom: 4 }}>
                      <span>{storeSlug}</span><span>/</span>
                    </div>
                    <input
                      type="text"
                      value={page.slug}
                      onChange={(e) => setPage((p) => ({ ...p, slug: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", fontSize: 13, fontFamily: "var(--font-mono)" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Page Type</label>
                    <span className="chip" style={{ fontSize: 12, textTransform: "capitalize" }}>{page.type}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Created</label>
                      <div style={{ fontSize: 13 }}>
                        {new Date(page.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Last Modified</label>
                      <div style={{ fontSize: 13 }}>
                        {new Date(page.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div className="card" style={{ padding: 20 }}>
                  <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800 }}>Publishing</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--ink-100)" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Status</span>
                      <Badge variant={badge.variant} dot>{badge.label}</Badge>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--ink-100)" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Store Status</span>
                      <Badge variant={isLive ? "mint" : "warn"}>{isLive ? "Live" : "Not Published"}</Badge>
                    </div>
                    {hasDraftChanges && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--ink-100)" }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Unpublished changes</span>
                        <Badge variant="warn" dot>Has draft edits</Badge>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--ink-100)" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Visibility</span>
                      <span style={{ fontSize: 13 }}>
                        {liveUrl ? (
                          <a href={liveUrl} target="_blank" style={{ color: "var(--teal-600)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                            <Icon name="eye" size={12} /> View live
                          </a>
                        ) : (
                          <span style={{ color: "var(--ink-400)" }}>Hidden</span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                    {page.status !== "published" && (
                      <button
                        onClick={handlePublishNow}
                        disabled={saving}
                        className="dbtn"
                        style={{
                          flex: 1, minWidth: 120,
                          background: "var(--teal-600)", color: "white",
                          border: "none", borderRadius: 8, padding: "8px 16px",
                          fontSize: 13, fontWeight: 700, cursor: "pointer",
                          opacity: saving ? 0.6 : 1,
                        }}
                      >
                        {saving ? "..." : "Publish"}
                      </button>
                    )}
                    {page.status === "published" && (
                      <button
                        onClick={handleUnpublish}
                        disabled={saving}
                        className="dbtn"
                        style={{
                          flex: 1, minWidth: 120,
                          background: "var(--ink-200)", color: "var(--ink-700)",
                          border: "none", borderRadius: 8, padding: "8px 16px",
                          fontSize: 13, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        Unpublish
                      </button>
                    )}
                    <button
                      onClick={handleArchive}
                      disabled={saving}
                      className="dbtn"
                      style={{
                        background: "var(--red-50)", color: "var(--red-600)",
                        border: "1px solid var(--red-200)", borderRadius: 8, padding: "8px 16px",
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      Archive
                    </button>
                    {page.type !== "home" && (
                      <button
                        onClick={handleDelete}
                        className="dbtn"
                        style={{
                          background: "none", color: "var(--red-600)",
                          border: "1px solid var(--red-200)", borderRadius: 8, padding: "8px 16px",
                          fontSize: 13, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                <div className="card" style={{ padding: 20 }}>
                  <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800 }}>Page URL</h2>
                  <div style={{ fontSize: 12, color: "var(--ink-400)", marginBottom: 8 }}>
                    {liveUrl ? "Live URL" : hasDraftChanges ? "Preview URL (draft)" : "URL"}
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 10px", borderRadius: 8,
                    background: "var(--ink-50)", border: "1px solid var(--ink-100)",
                    fontSize: 12, fontFamily: "var(--font-mono)",
                    wordBreak: "break-all",
                  }}>
                    <Icon name="link" size={12} />
                    <span style={{ flex: 1 }}>{liveUrl ?? previewUrl}</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(liveUrl ?? previewUrl); toast({ title: "Copied", variant: "success" }); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--teal-600)", fontSize: 12, fontWeight: 600 }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "seo" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, alignItems: "start" }}>
              <div className="card" style={{ padding: 20 }}>
                <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>Search Engine Optimization</h2>
                <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "0 0 16px" }}>
                  Configure how this page appears in search results and social shares.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>
                      Meta Title <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>({localSeo.metaTitle.length}/60)</span>
                    </label>
                    <input
                      type="text"
                      value={localSeo.metaTitle}
                      onChange={(e) => setLocalSeo((s) => ({ ...s, metaTitle: e.target.value }))}
                      maxLength={60}
                      placeholder={page.title}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>
                      Meta Description <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>({localSeo.metaDescription.length}/160)</span>
                    </label>
                    <textarea
                      value={localSeo.metaDescription}
                      onChange={(e) => setLocalSeo((s) => ({ ...s, metaDescription: e.target.value }))}
                      maxLength={160}
                      rows={3}
                      placeholder="A brief description of this page..."
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", fontSize: 13, resize: "vertical" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Focus Keyword</label>
                    <input
                      type="text"
                      value={localSeo.focusKeyword}
                      onChange={(e) => setLocalSeo((s) => ({ ...s, focusKeyword: e.target.value }))}
                      placeholder="e.g. handmade jewelry"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Canonical URL</label>
                    <input
                      type="text"
                      value={localSeo.canonicalUrl}
                      onChange={(e) => setLocalSeo((s) => ({ ...s, canonicalUrl: e.target.value }))}
                      placeholder="https://example.com/this-page"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", fontSize: 13 }}
                    />
                  </div>

                  <div style={{ height: 1, background: "var(--ink-100)", margin: "4px 0" }} />

                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Social Share</h3>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Social Title (og:title)</label>
                    <input
                      type="text"
                      value={localSeo.socialTitle}
                      onChange={(e) => setLocalSeo((s) => ({ ...s, socialTitle: e.target.value }))}
                      placeholder={localSeo.metaTitle || page.title}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Social Description (og:description)</label>
                    <textarea
                      value={localSeo.socialDescription}
                      onChange={(e) => setLocalSeo((s) => ({ ...s, socialDescription: e.target.value }))}
                      rows={2}
                      placeholder={localSeo.metaDescription || "A brief description..."}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", fontSize: 13, resize: "vertical" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Social Image URL</label>
                    <input
                      type="text"
                      value={localSeo.socialImage}
                      onChange={(e) => setLocalSeo((s) => ({ ...s, socialImage: e.target.value }))}
                      placeholder="https://example.com/social-image.jpg"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", fontSize: 13 }}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
                    <input
                      type="checkbox"
                      id="noIndex"
                      checked={localSeo.noIndex}
                      onChange={(e) => setLocalSeo((s) => ({ ...s, noIndex: e.target.checked }))}
                      style={{ accentColor: "var(--teal-600)" }}
                    />
                    <label htmlFor="noIndex" style={{ fontSize: 13, fontWeight: 500 }}>Hide from search engines (noindex)</label>
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <h2 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Search Preview</h2>
                <div style={{
                  padding: 12, borderRadius: 8,
                  background: "white", border: "1px solid var(--ink-200)",
                }}>
                  <div style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 2 }}>{storeSlug}</div>
                  <div style={{ fontSize: 14, color: "#1a0dab", fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {localSeo.metaTitle || page.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#545454", lineHeight: 1.4, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {localSeo.metaDescription || "A page on " + storeSlug}
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: 0.5 }}>Status</h3>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(!localSeo.metaTitle || !localSeo.metaDescription) ? (
                      <Badge variant="warn">Incomplete</Badge>
                    ) : (
                      <Badge variant="mint">Complete</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "navigation" && (
            <div className="card" style={{ padding: 20, maxWidth: 600 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>Navigation Settings</h2>
              <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "0 0 16px" }}>
                Control where this page appears in your store navigation.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    id="showInMenu"
                    checked={localNav.showInMenu}
                    onChange={(e) => setLocalNav((s) => ({ ...s, showInMenu: e.target.checked }))}
                    style={{ accentColor: "var(--teal-600)" }}
                  />
                  <label htmlFor="showInMenu" style={{ fontSize: 13, fontWeight: 500 }}>Show in main navigation menu</label>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    id="showInFooter"
                    checked={localNav.showInFooter}
                    onChange={(e) => setLocalNav((s) => ({ ...s, showInFooter: e.target.checked }))}
                    style={{ accentColor: "var(--teal-600)" }}
                  />
                  <label htmlFor="showInFooter" style={{ fontSize: 13, fontWeight: 500 }}>Show in footer</label>
                </div>

                {localNav.showInMenu && (
                  <>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Menu Label</label>
                      <input
                        type="text"
                        value={localNav.menuLabel}
                        onChange={(e) => setLocalNav((s) => ({ ...s, menuLabel: e.target.value }))}
                        placeholder={page.title}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Menu Order</label>
                      <input
                        type="number"
                        value={localNav.menuOrder}
                        onChange={(e) => setLocalNav((s) => ({ ...s, menuOrder: parseInt(e.target.value) || 0 }))}
                        min={0}
                        style={{ width: 80, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", fontSize: 13 }}
                      />
                      <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 2 }}>Lower numbers appear first</div>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Parent Page</label>
                      <select
                        value={localNav.parentPage}
                        onChange={(e) => setLocalNav((s) => ({ ...s, parentPage: e.target.value }))}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", fontSize: 13 }}
                      >
                        <option value="">None (top-level)</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {tab === "scheduling" && (
            <div className="card" style={{ padding: 20, maxWidth: 600 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>Scheduling</h2>
              <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "0 0 16px" }}>
                Schedule this page to publish automatically at a future date.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Publish at</label>
                  <input
                    type="datetime-local"
                    value={localScheduling.publishAt ? localScheduling.publishAt.slice(0, 16) : ""}
                    onChange={(e) => setLocalScheduling((s) => ({ ...s, publishAt: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", fontSize: 13 }}
                  />
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 4 }}>Current status</label>
                    <Badge variant={badge.variant} dot>{badge.label}</Badge>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
                  {localScheduling.publishAt && (
                    <button
                      onClick={handleSchedule}
                      disabled={saving}
                      className="dbtn"
                      style={{
                        background: "var(--teal-600)", color: "white",
                        border: "none", borderRadius: 8, padding: "8px 20px",
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                        opacity: saving ? 0.6 : 1,
                      }}
                    >
                      {page.status === "scheduled" ? "Reschedule" : "Schedule Publish"}
                    </button>
                  )}
                  {page.status === "scheduled" && (
                    <button
                      onClick={async () => {
                        try {
                          await fetch(`/api/store/pages/${page.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "draft", publishAt: null }),
                          });
                          setPage((p) => ({ ...p, status: "draft", publishAt: null }));
                          setLocalScheduling((s) => ({ ...s, status: "draft", publishAt: "" }));
                          toast({ title: "Schedule cancelled", variant: "success" });
                          router.refresh();
                        } catch {
                          toast({ title: "Failed to cancel schedule", variant: "error" });
                        }
                      }}
                      className="dbtn"
                      style={{
                        background: "none", color: "var(--red-600)",
                        border: "1px solid var(--red-200)", borderRadius: 8, padding: "8px 20px",
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      Cancel Schedule
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--ink-100)", paddingTop: 16 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              className="dbtn"
              style={{
                background: "var(--teal-600)", color: "white",
                border: "none", borderRadius: 8, padding: "8px 20px",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving..." : "Save Draft"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
