"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Pill, type Tone } from "@/components/app-kit";
import { FieldLabel, PillButton, TextInput, Toggle, cx } from "@/components/app-ui";
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

function getStatusBadge(status: PageStatus, storeIsLive: boolean): { label: string; tone: Tone } {
  if (!storeIsLive && status === "published") return { label: "Draft · store not live", tone: "warning" };
  switch (status) {
    case "published": return { label: "Live", tone: "success" };
    case "draft": return { label: "Draft", tone: "muted" };
    case "hidden": return { label: "Hidden", tone: "muted" };
    case "scheduled": return { label: "Scheduled", tone: "info" };
    case "archived": return { label: "Archived", tone: "danger" };
    default: return { label: "Draft", tone: "muted" };
  }
}

const AREA = "w-full resize-y rounded-[16px] border border-app-line bg-white px-4 py-3 text-[15px] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-ink";
const fmtDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

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
  const liveUrl = isLive && page.status === "published" ? `/s/${storeSlug}/${page.slug}` : null;

  const isArchived = page.status === "archived";

  const cancelSchedule = async () => {
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
  };

  const TABS = [
    { key: "details", label: "Details" },
    { key: "seo", label: "Search" },
    { key: "navigation", label: "Menu" },
    { key: "scheduling", label: "Schedule" },
  ] as const;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-app-line bg-white">
            <Icon name={PAGE_ICONS[page.type] ?? "document"} size={20} />
          </span>
          <div className="min-w-0">
            <h1 className="m-0 truncate text-[28px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[30px]">{page.title || "Untitled page"}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-app-ink-soft">
              <Pill tone={badge.tone} dot>{badge.label}</Pill>
              {hasDraftChanges && page.status === "published" && <Pill tone="warning">Unpublished changes</Pill>}
              <span className="truncate">/{page.slug}</span>
              {page.status === "published" && <span>· Published {fmtDate(page.updatedAt)}</span>}
            </div>
          </div>
        </div>
        {!isArchived && (
          <div className="flex flex-wrap gap-2">
            <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink no-underline hover:border-app-line-strong">
              <Icon name="eye" size={16} /> Preview
            </a>
            <a href={`/home/editor?page=${page.id}`} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white no-underline hover:bg-black">
              <Icon name="edit" size={16} /> Edit design
            </a>
          </div>
        )}
      </header>

      {isArchived ? (
        <section className="flex flex-col items-center rounded-[22px] border border-app-line bg-white px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-app-danger-tint text-app-danger"><Icon name="archive" size={22} /></span>
          <h2 className="mb-0 mt-4 text-[18px] font-extrabold">Page archived</h2>
          <p className="mb-0 mt-1.5 max-w-[460px] text-[14.5px] text-app-ink-soft">
            Archived on {page.archivedAt ? fmtDate(page.archivedAt) : "an unknown date"}. Shoppers can&apos;t see it.
          </p>
          <PillButton tone="ink" size="md" onClick={handleRestore} busy={saving} className="mt-5">Restore page</PillButton>
        </section>
      ) : (
        <>
          <div role="tablist" aria-label="Page settings" className="flex w-full gap-1 overflow-x-auto rounded-full bg-white p-1 sm:w-fit">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cx("min-h-[42px] shrink-0 rounded-full px-5 text-[14px] font-bold transition", tab === t.key ? "bg-app-ink text-white" : "text-app-ink hover:bg-app-canvas")}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "details" && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
              <section className="min-w-0 rounded-[22px] border border-app-line bg-white p-5">
                <h2 className="m-0 text-[17px] font-extrabold">Page details</h2>
                <div className="mt-4 grid gap-4">
                  <div>
                    <FieldLabel htmlFor="pg-title">Title</FieldLabel>
                    <TextInput id="pg-title" value={page.title} onChange={(e) => setPage((p) => ({ ...p, title: e.target.value }))} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="pg-slug">Web address</FieldLabel>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="max-w-[45%] shrink-0 truncate text-[14px] text-app-ink-soft">{storeSlug}/</span>
                      <TextInput id="pg-slug" value={page.slug} onChange={(e) => setPage((p) => ({ ...p, slug: e.target.value }))} />
                    </div>
                  </div>
                  <dl className="m-0 grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div>
                      <dt className="text-[13px] text-app-ink-soft">Page type</dt>
                      <dd className="m-0 mt-1 text-[14px] font-bold capitalize">{page.type}</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-app-ink-soft">Created</dt>
                      <dd className="m-0 mt-1 text-[14px] font-bold">{fmtDate(page.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-app-ink-soft">Last changed</dt>
                      <dd className="m-0 mt-1 text-[14px] font-bold">{fmtDate(page.updatedAt)}</dd>
                    </div>
                  </dl>
                </div>
              </section>

              <div className="grid min-w-0 content-start gap-5">
                <section className="rounded-[22px] border border-app-line bg-white p-5">
                  <h2 className="m-0 text-[17px] font-extrabold">Publishing</h2>
                  <dl className="m-0 mt-3 divide-y divide-app-line">
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-[14px] font-bold">Page</dt>
                      <dd className="m-0"><Pill tone={badge.tone} dot>{badge.label}</Pill></dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-[14px] font-bold">Store</dt>
                      <dd className="m-0"><Pill tone={isLive ? "success" : "warning"}>{isLive ? "Live" : "Not published"}</Pill></dd>
                    </div>
                    {hasDraftChanges && (
                      <div className="flex items-center justify-between gap-3 py-2.5">
                        <dt className="text-[14px] font-bold">Changes</dt>
                        <dd className="m-0"><Pill tone="warning" dot>Not published yet</Pill></dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-[14px] font-bold">Shoppers see it</dt>
                      <dd className="m-0 text-[14px]">
                        {liveUrl ? (
                          <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-extrabold text-app-accent-ink no-underline hover:underline">
                            <Icon name="eye" size={14} /> View live
                          </a>
                        ) : (
                          <span className="text-app-ink-soft">Not yet</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {page.status !== "published" ? (
                      <PillButton tone="accent" size="md" onClick={handlePublishNow} busy={saving} className="flex-1">Publish</PillButton>
                    ) : (
                      <PillButton tone="white" size="md" onClick={handleUnpublish} disabled={saving} className="flex-1">Unpublish</PillButton>
                    )}
                    <PillButton tone="white" size="md" onClick={handleArchive} disabled={saving}>
                      <Icon name="archive" size={15} /> Archive
                    </PillButton>
                    {page.type !== "home" && (
                      <PillButton tone="ghost" size="md" onClick={handleDelete} className="text-app-danger hover:bg-app-danger-tint">
                        <Icon name="trash" size={15} /> Delete
                      </PillButton>
                    )}
                  </div>
                </section>

                <section className="rounded-[22px] border border-app-line bg-white p-5">
                  <h2 className="m-0 text-[17px] font-extrabold">Page link</h2>
                  <p className="mb-2 mt-1 text-[13px] text-app-ink-soft">{liveUrl ? "Live link" : hasDraftChanges ? "Preview link (draft)" : "Link"}</p>
                  <div className="flex min-w-0 items-center gap-2 rounded-[14px] border border-app-line bg-app-canvas py-1.5 pl-3 pr-1.5">
                    <Icon name="link" size={14} className="shrink-0 text-app-ink-soft" />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{liveUrl ?? previewUrl}</span>
                    <PillButton
                      tone="white"
                      size="sm"
                      onClick={() => { navigator.clipboard.writeText(liveUrl ?? previewUrl); toast({ title: "Copied", variant: "success" }); }}
                    >
                      <Icon name="copy" size={14} /> Copy
                    </PillButton>
                  </div>
                </section>
              </div>
            </div>
          )}

          {tab === "seo" && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
              <section className="min-w-0 rounded-[22px] border border-app-line bg-white p-5">
                <h2 className="m-0 text-[17px] font-extrabold">Search and sharing</h2>
                <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">How this page shows up on Google and when people share it.</p>
                <div className="mt-4 grid gap-4">
                  <div>
                    <FieldLabel htmlFor="seo-title">Search title <span className="font-normal text-app-ink-soft">({localSeo.metaTitle.length}/60)</span></FieldLabel>
                    <TextInput id="seo-title" value={localSeo.metaTitle} onChange={(e) => setLocalSeo((s) => ({ ...s, metaTitle: e.target.value }))} maxLength={60} placeholder={page.title} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="seo-desc">Search description <span className="font-normal text-app-ink-soft">({localSeo.metaDescription.length}/160)</span></FieldLabel>
                    <textarea id="seo-desc" value={localSeo.metaDescription} onChange={(e) => setLocalSeo((s) => ({ ...s, metaDescription: e.target.value }))} maxLength={160} rows={3} placeholder="A short description of this page" className={AREA} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="min-w-0">
                      <FieldLabel htmlFor="seo-kw">Main search phrase</FieldLabel>
                      <TextInput id="seo-kw" value={localSeo.focusKeyword} onChange={(e) => setLocalSeo((s) => ({ ...s, focusKeyword: e.target.value }))} placeholder="e.g. handmade jewellery" />
                    </div>
                    <div className="min-w-0">
                      <FieldLabel htmlFor="seo-canon">Canonical link</FieldLabel>
                      <TextInput id="seo-canon" value={localSeo.canonicalUrl} onChange={(e) => setLocalSeo((s) => ({ ...s, canonicalUrl: e.target.value }))} placeholder="https://example.com/this-page" />
                    </div>
                  </div>

                  <h3 className="m-0 border-t border-app-line pt-4 text-[15px] font-extrabold">When shared on social</h3>
                  <div>
                    <FieldLabel htmlFor="seo-og-title">Share title</FieldLabel>
                    <TextInput id="seo-og-title" value={localSeo.socialTitle} onChange={(e) => setLocalSeo((s) => ({ ...s, socialTitle: e.target.value }))} placeholder={localSeo.metaTitle || page.title} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="seo-og-desc">Share description</FieldLabel>
                    <textarea id="seo-og-desc" value={localSeo.socialDescription} onChange={(e) => setLocalSeo((s) => ({ ...s, socialDescription: e.target.value }))} rows={2} placeholder={localSeo.metaDescription || "A short description"} className={AREA} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="seo-og-img">Share image link</FieldLabel>
                    <TextInput id="seo-og-img" value={localSeo.socialImage} onChange={(e) => setLocalSeo((s) => ({ ...s, socialImage: e.target.value }))} placeholder="https://example.com/social-image.jpg" />
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-[16px] bg-app-canvas px-4 py-3">
                    <span className="text-[14px] font-bold">Hide from search engines</span>
                    <Toggle on={localSeo.noIndex} onChange={(on) => setLocalSeo((s) => ({ ...s, noIndex: on }))} label="Hide from search engines" />
                  </div>
                </div>
              </section>

              <section className="min-w-0 self-start rounded-[22px] border border-app-line bg-white p-5">
                <h2 className="m-0 text-[17px] font-extrabold">Google preview</h2>
                <div className="mt-3 rounded-[14px] border border-app-line p-3">
                  <div className="truncate text-[12px] text-app-ink-soft">{storeSlug}</div>
                  <div className="truncate text-[15px] font-medium leading-snug text-[#1a0dab]">{localSeo.metaTitle || page.title}</div>
                  <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[#545454]">{localSeo.metaDescription || "A page on " + storeSlug}</div>
                </div>
                <div className="mt-4">
                  {!localSeo.metaTitle || !localSeo.metaDescription ? <Pill tone="warning">Add a title and description</Pill> : <Pill tone="success">Search ready</Pill>}
                </div>
              </section>
            </div>
          )}

          {tab === "navigation" && (
            <section className="rounded-[22px] border border-app-line bg-white p-5">
              <h2 className="m-0 text-[17px] font-extrabold">Menu</h2>
              <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">Where this page shows in your store menus.</p>
              <div className="mt-4 grid max-w-[640px] gap-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[14px] font-bold">Show in the main menu</span>
                  <Toggle on={localNav.showInMenu} onChange={(on) => setLocalNav((s) => ({ ...s, showInMenu: on }))} label="Show in the main menu" />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[14px] font-bold">Show in the footer</span>
                  <Toggle on={localNav.showInFooter} onChange={(on) => setLocalNav((s) => ({ ...s, showInFooter: on }))} label="Show in the footer" />
                </div>
                {localNav.showInMenu && (
                  <>
                    <div>
                      <FieldLabel htmlFor="nav-label">Menu label</FieldLabel>
                      <TextInput id="nav-label" value={localNav.menuLabel} onChange={(e) => setLocalNav((s) => ({ ...s, menuLabel: e.target.value }))} placeholder={page.title} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="nav-order">Menu position</FieldLabel>
                      <TextInput id="nav-order" type="number" min={0} value={localNav.menuOrder} onChange={(e) => setLocalNav((s) => ({ ...s, menuOrder: parseInt(e.target.value) || 0 }))} className="w-[120px]" />
                      <p className="mb-0 mt-1 text-[12.5px] text-app-ink-soft">Lower numbers come first.</p>
                    </div>
                    <div>
                      <FieldLabel htmlFor="nav-parent">Sits under</FieldLabel>
                      <select id="nav-parent" value={localNav.parentPage} onChange={(e) => setLocalNav((s) => ({ ...s, parentPage: e.target.value }))} className="h-[54px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[15px] outline-none focus:border-app-ink">
                        <option value="">Nothing (top level)</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {tab === "scheduling" && (
            <section className="rounded-[22px] border border-app-line bg-white p-5">
              <h2 className="m-0 text-[17px] font-extrabold">Schedule</h2>
              <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">Publish this page on its own at a later date.</p>
              <div className="mt-4 grid max-w-[640px] gap-4">
                <div>
                  <FieldLabel htmlFor="sched-at">Publish on</FieldLabel>
                  <TextInput
                    id="sched-at"
                    type="datetime-local"
                    value={localScheduling.publishAt ? localScheduling.publishAt.slice(0, 16) : ""}
                    onChange={(e) => setLocalScheduling((s) => ({ ...s, publishAt: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2 text-[14px]">
                  <span className="font-bold">Now:</span> <Pill tone={badge.tone} dot>{badge.label}</Pill>
                </div>
                <div className="flex flex-wrap gap-2">
                  {localScheduling.publishAt && (
                    <PillButton tone="ink" size="md" onClick={handleSchedule} busy={saving}>
                      {page.status === "scheduled" ? "Change schedule" : "Schedule"}
                    </PillButton>
                  )}
                  {page.status === "scheduled" && (
                    <PillButton tone="white" size="md" onClick={cancelSchedule} className="text-app-danger">Cancel schedule</PillButton>
                  )}
                </div>
              </div>
            </section>
          )}

          <div className="flex justify-end border-t border-app-line pt-4">
            <PillButton tone="ink" size="md" onClick={handleSave} busy={saving}>Save draft</PillButton>
          </div>
        </>
      )}
    </div>
  );
}
