"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Pill, type Tone } from "@/components/app-kit";
import { FieldLabel, PillButton, TextInput, Toggle, cx } from "@/components/app-ui";
import { toast } from "@/hooks/use-toast";
import { SeoTab } from "@/components/seo/SeoTab";
import { normalizeSeo } from "@/lib/seo/fields";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate, type Locale } from "@shared/i18n";
import { storefrontPageHref } from "@shared/storefront-pages";

type StoreT = ReturnType<typeof useT<["store", "common"]>>;

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

function getStatusBadge(t: StoreT, status: PageStatus, storeIsLive: boolean): { label: string; tone: Tone } {
  if (!storeIsLive && status === "published") return { label: t("pages.badge.notLive"), tone: "warning" };
  switch (status) {
    case "published": return { label: t("status.live"), tone: "success" };
    case "draft": return { label: t("status.draft"), tone: "muted" };
    case "hidden": return { label: t("pages.badge.hidden"), tone: "muted" };
    case "scheduled": return { label: t("pages.badge.scheduled"), tone: "info" };
    case "archived": return { label: t("pages.badge.archived"), tone: "danger" };
    default: return { label: t("status.draft"), tone: "muted" };
  }
}

const fmtDate = (value: string, locale: Locale) => formatDate(value, locale, { day: "numeric", month: "short", year: "numeric" });

function hasUnsavedDraft(page: PageData): boolean {
  const dc = page.draftContent;
  const pc = page.publishedContent ?? page.content;
  if (!dc) return false;
  if (!pc) return true;
  return JSON.stringify(dc) !== JSON.stringify(pc);
}

export function PageDetailsClient({ page: initialPage, storeId, storeSlug, storeStatus }: Props) {
  const router = useRouter();
  const t = useT("store", "common");
  const locale = useLocale();
  const [page, setPage] = useState<PageData>(initialPage);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"details" | "seo" | "navigation" | "scheduling">("details");

  const effectiveContent = page.draftContent ?? page.content ?? {};
  const seo = (effectiveContent.seo as Record<string, string | boolean>) ?? {};
  const navigation = (effectiveContent.navigation as Record<string, string | number | boolean>) ?? {};

  const isLive = storeStatus === "active" || storeStatus === "published";
  const badge = getStatusBadge(t, page.status, isLive);
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
      const json = await res.json().catch(() => null);
      // The server says why (a page address another page or a store route like /links already has).
      if (!res.ok) throw new Error(typeof json?.error?.message === "string" ? json.error.message : "");
      setPage((prev) => ({ ...prev, ...json.data, draftContent: json.data.draftContent }));
      toast({ title: t("pages.draftSaved"), variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: t("pages.err.save"), description: error instanceof Error && error.message ? error.message : undefined, variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [page.id, page.title, page.slug, localSeo, localNav, router, t]);

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
      if (!res.ok) throw new Error("publish failed");
      const json = await res.json();
      setPage((prev) => ({ ...prev, ...json.data }));
      toast({ title: t("pages.publishedToast"), variant: "success" });
      router.refresh();
    } catch {
      toast({ title: t("pages.err.publish"), variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [page.id, page.draftContent, router, t]);

  const handleUnpublish = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/store/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: false }),
      });
      if (!res.ok) throw new Error("unpublish failed");
      const json = await res.json();
      setPage((prev) => ({ ...prev, ...json.data }));
      toast({ title: t("pages.unpublishedToast"), variant: "success" });
      router.refresh();
    } catch {
      toast({ title: t("pages.err.hide"), variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [page.id, router, t]);

  const handleArchive = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/store/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (!res.ok) throw new Error("archive failed");
      const json = await res.json();
      setPage((prev) => ({ ...prev, ...json.data }));
      toast({ title: t("pages.archivedToast"), variant: "success" });
      router.refresh();
    } catch {
      toast({ title: t("pages.err.archive"), variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [page.id, router, t]);

  const handleRestore = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/store/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      if (!res.ok) throw new Error("restore failed");
      const json = await res.json();
      setPage((prev) => ({ ...prev, ...json.data }));
      toast({ title: t("pages.restoredToast"), variant: "success" });
      router.refresh();
    } catch {
      toast({ title: t("pages.err.restore"), variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [page.id, router, t]);

  const handleSchedule = useCallback(async () => {
    if (!localScheduling.publishAt) {
      toast({ title: t("pages.pickDate"), variant: "error" });
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
      if (!res.ok) throw new Error("schedule failed");
      const json = await res.json();
      setPage((prev) => ({ ...prev, ...json.data }));
      toast({ title: t("pages.scheduledToast"), variant: "success" });
      router.refresh();
    } catch {
      toast({ title: t("pages.err.schedule"), variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [page.id, localScheduling.publishAt, router, t]);

  const handleDelete = useCallback(async () => {
    if (!(await confirmDialog(t("pages.confirmDelete")))) return;
    try {
      const res = await fetch(`/api/store/pages/${page.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      toast({ title: t("pages.deletedToast"), variant: "success" });
      router.push("/home/pages");
    } catch {
      toast({ title: t("pages.err.delete"), variant: "error" });
    }
  }, [page.id, router, t]);

  const previewUrl = `/preview/store/${storeSlug}/${page.id}`;
  const liveUrl = isLive && page.status === "published" ? storefrontPageHref(`/s/${storeSlug}`, page.slug) : null;

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
      toast({ title: t("pages.scheduleCancelled"), variant: "success" });
      router.refresh();
    } catch {
      toast({ title: t("pages.err.cancelSchedule"), variant: "error" });
    }
  };

  const TABS = [
    { key: "details", label: t("pages.tab.details") },
    { key: "seo", label: t("pages.tab.seo") },
    { key: "navigation", label: t("pages.tab.menu") },
    { key: "scheduling", label: t("pages.tab.schedule") },
  ] as const;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-app-line bg-white">
            <Icon name={PAGE_ICONS[page.type] ?? "document"} size={20} />
          </span>
          <div className="min-w-0">
            <h1 className="m-0 truncate text-[28px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[30px]">{page.title || t("pages.untitled")}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-app-ink-soft">
              <Pill tone={badge.tone} dot>{badge.label}</Pill>
              {hasDraftChanges && page.status === "published" && <Pill tone="warning">{t("pages.unpublishedChanges")}</Pill>}
              <span className="truncate">/{page.slug}</span>
              {page.status === "published" && <span>{t("pages.publishedOn", { date: fmtDate(page.updatedAt, locale) })}</span>}
            </div>
          </div>
        </div>
        {!isArchived && (
          <div className="flex flex-wrap gap-2">
            <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink no-underline hover:border-app-line-strong">
              <Icon name="eye" size={16} /> {t("pages.preview")}
            </a>
            <a href={`/home/editor?page=${page.id}`} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white no-underline hover:bg-black">
              <Icon name="edit" size={16} /> {t("pages.editDesign")}
            </a>
          </div>
        )}
      </header>

      {isArchived ? (
        <section className="flex flex-col items-center rounded-[22px] border border-app-line bg-white px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-app-danger-tint text-app-danger"><Icon name="archive" size={22} /></span>
          <h2 className="mb-0 mt-4 text-[18px] font-extrabold">{t("pages.archivedTitle")}</h2>
          <p className="mb-0 mt-1.5 max-w-[460px] text-[14.5px] text-app-ink-soft">
            {t("pages.archivedOn", { date: page.archivedAt ? fmtDate(page.archivedAt, locale) : t("pages.unknownDate") })}
          </p>
          <PillButton tone="ink" size="md" onClick={handleRestore} busy={saving} className="mt-5">{t("pages.restore")}</PillButton>
        </section>
      ) : (
        <>
          <div role="tablist" aria-label={t("pages.settings")} className="flex w-full gap-1 overflow-x-auto rounded-full bg-white p-1 sm:w-fit">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={cx("min-h-[42px] shrink-0 rounded-full px-5 text-[14px] font-bold transition", tab === item.key ? "bg-app-ink text-white" : "text-app-ink hover:bg-app-canvas")}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "details" && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
              <section className="min-w-0 rounded-[22px] border border-app-line bg-white p-5">
                <h2 className="m-0 text-[17px] font-extrabold">{t("pages.details")}</h2>
                <div className="mt-4 grid gap-4">
                  <div>
                    <FieldLabel htmlFor="pg-title">{t("pages.field.title")}</FieldLabel>
                    <TextInput id="pg-title" value={page.title} onChange={(e) => setPage((p) => ({ ...p, title: e.target.value }))} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="pg-slug">{t("pages.field.address")}</FieldLabel>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="max-w-[45%] shrink-0 truncate text-[14px] text-app-ink-soft">{storeSlug}/</span>
                      <TextInput id="pg-slug" value={page.slug} onChange={(e) => setPage((p) => ({ ...p, slug: e.target.value }))} />
                    </div>
                  </div>
                  <dl className="m-0 grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div>
                      <dt className="text-[13px] text-app-ink-soft">{t("pages.pageType")}</dt>
                      <dd className="m-0 mt-1 text-[14px] font-bold capitalize">{t.dynamic(`pages.type.${page.type}`, page.type)}</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-app-ink-soft">{t("pages.field.created")}</dt>
                      <dd className="m-0 mt-1 text-[14px] font-bold">{fmtDate(page.createdAt, locale)}</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-app-ink-soft">{t("pages.field.changed")}</dt>
                      <dd className="m-0 mt-1 text-[14px] font-bold">{fmtDate(page.updatedAt, locale)}</dd>
                    </div>
                  </dl>
                </div>
              </section>

              <div className="grid min-w-0 content-start gap-5">
                <section className="rounded-[22px] border border-app-line bg-white p-5">
                  <h2 className="m-0 text-[17px] font-extrabold">{t("pages.publishing")}</h2>
                  <dl className="m-0 mt-3 divide-y divide-app-line">
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-[14px] font-bold">{t("pages.row.page")}</dt>
                      <dd className="m-0"><Pill tone={badge.tone} dot>{badge.label}</Pill></dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-[14px] font-bold">{t("pages.row.store")}</dt>
                      <dd className="m-0"><Pill tone={isLive ? "success" : "warning"}>{isLive ? t("status.live") : t("pages.row.notPublished")}</Pill></dd>
                    </div>
                    {hasDraftChanges && (
                      <div className="flex items-center justify-between gap-3 py-2.5">
                        <dt className="text-[14px] font-bold">{t("pages.row.changes")}</dt>
                        <dd className="m-0"><Pill tone="warning" dot>{t("pages.row.notYetPublished")}</Pill></dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-[14px] font-bold">{t("pages.row.shoppersSee")}</dt>
                      <dd className="m-0 text-[14px]">
                        {liveUrl ? (
                          <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-extrabold text-app-accent-ink no-underline hover:underline">
                            <Icon name="eye" size={14} /> {t("pages.viewLive")}
                          </a>
                        ) : (
                          <span className="text-app-ink-soft">{t("pages.notYet")}</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {page.status !== "published" ? (
                      <PillButton tone="accent" size="md" onClick={handlePublishNow} busy={saving} className="flex-1">{t("pages.publish")}</PillButton>
                    ) : (
                      <PillButton tone="white" size="md" onClick={handleUnpublish} disabled={saving} className="flex-1">{t("pages.unpublish")}</PillButton>
                    )}
                    <PillButton tone="white" size="md" onClick={handleArchive} disabled={saving}>
                      <Icon name="archive" size={15} /> {t("pages.archive")}
                    </PillButton>
                    {page.type !== "home" && (
                      <PillButton tone="ghost" size="md" onClick={handleDelete} className="text-app-danger hover:bg-app-danger-tint">
                        <Icon name="trash" size={15} /> {t("delete")}
                      </PillButton>
                    )}
                  </div>
                </section>

                <section className="rounded-[22px] border border-app-line bg-white p-5">
                  <h2 className="m-0 text-[17px] font-extrabold">{t("pages.link")}</h2>
                  <p className="mb-2 mt-1 text-[13px] text-app-ink-soft">{liveUrl ? t("pages.liveLink") : hasDraftChanges ? t("pages.previewLink") : t("pages.linkLabel")}</p>
                  <div className="flex min-w-0 items-center gap-2 rounded-[14px] border border-app-line bg-app-canvas py-1.5 pl-3 pr-1.5">
                    <Icon name="link" size={14} className="shrink-0 text-app-ink-soft" />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{liveUrl ?? previewUrl}</span>
                    <PillButton
                      tone="white"
                      size="sm"
                      onClick={() => { navigator.clipboard.writeText(liveUrl ?? previewUrl); toast({ title: t("copied"), variant: "success" }); }}
                    >
                      <Icon name="copy" size={14} /> {t("copy")}
                    </PillButton>
                  </div>
                </section>
              </div>
            </div>
          )}

          {tab === "seo" && (
            <div className="grid gap-4">
              <SeoTab
                value={normalizeSeo(localSeo)}
                onChange={(next) => setLocalSeo(next)}
                title={page.title}
                slug={page.type === "home" ? "" : page.slug}
                urlPrefix={`${storeSlug}.shopinbos.shop/`}
                siteName={storeSlug}
              />
            </div>
          )}

          {tab === "navigation" && (
            <section className="rounded-[22px] border border-app-line bg-white p-5">
              <h2 className="m-0 text-[17px] font-extrabold">{t("pages.tab.menu")}</h2>
              <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">{t("pages.menuSub")}</p>
              <div className="mt-4 grid max-w-[640px] gap-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[14px] font-bold">{t("pages.showMain")}</span>
                  <Toggle on={localNav.showInMenu} onChange={(on) => setLocalNav((s) => ({ ...s, showInMenu: on }))} label={t("pages.showMain")} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[14px] font-bold">{t("pages.showFooter")}</span>
                  <Toggle on={localNav.showInFooter} onChange={(on) => setLocalNav((s) => ({ ...s, showInFooter: on }))} label={t("pages.showFooter")} />
                </div>
                {localNav.showInMenu && (
                  <>
                    <div>
                      <FieldLabel htmlFor="nav-label">{t("pages.menuLabel")}</FieldLabel>
                      <TextInput id="nav-label" value={localNav.menuLabel} onChange={(e) => setLocalNav((s) => ({ ...s, menuLabel: e.target.value }))} placeholder={page.title} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="nav-order">{t("pages.menuPosition")}</FieldLabel>
                      <TextInput id="nav-order" type="number" min={0} value={localNav.menuOrder} onChange={(e) => setLocalNav((s) => ({ ...s, menuOrder: parseInt(e.target.value) || 0 }))} className="w-[120px]" />
                      <p className="mb-0 mt-1 text-[12.5px] text-app-ink-soft">{t("pages.lowerFirst")}</p>
                    </div>
                    <div>
                      <FieldLabel htmlFor="nav-parent">{t("pages.sitsUnder")}</FieldLabel>
                      <select id="nav-parent" value={localNav.parentPage} onChange={(e) => setLocalNav((s) => ({ ...s, parentPage: e.target.value }))} className="h-[54px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[15px] outline-none focus:border-app-ink">
                        <option value="">{t("pages.topLevel")}</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {tab === "scheduling" && (
            <section className="rounded-[22px] border border-app-line bg-white p-5">
              <h2 className="m-0 text-[17px] font-extrabold">{t("pages.tab.schedule")}</h2>
              <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">{t("pages.scheduleSub")}</p>
              <div className="mt-4 grid max-w-[640px] gap-4">
                <div>
                  <FieldLabel htmlFor="sched-at">{t("pages.publishOn")}</FieldLabel>
                  <TextInput
                    id="sched-at"
                    type="datetime-local"
                    value={localScheduling.publishAt ? localScheduling.publishAt.slice(0, 16) : ""}
                    onChange={(e) => setLocalScheduling((s) => ({ ...s, publishAt: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2 text-[14px]">
                  <span className="font-bold">{t("pages.now")}</span> <Pill tone={badge.tone} dot>{badge.label}</Pill>
                </div>
                <div className="flex flex-wrap gap-2">
                  {localScheduling.publishAt && (
                    <PillButton tone="ink" size="md" onClick={handleSchedule} busy={saving}>
                      {page.status === "scheduled" ? t("pages.changeSchedule") : t("pages.schedule")}
                    </PillButton>
                  )}
                  {page.status === "scheduled" && (
                    <PillButton tone="white" size="md" onClick={cancelSchedule} className="text-app-danger">{t("pages.cancelSchedule")}</PillButton>
                  )}
                </div>
              </div>
            </section>
          )}

          <div className="flex justify-end border-t border-app-line pt-4">
            <PillButton tone="ink" size="md" onClick={handleSave} busy={saving}>{t("pages.saveDraft")}</PillButton>
          </div>
        </>
      )}
    </div>
  );
}
