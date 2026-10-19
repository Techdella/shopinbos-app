import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, SearchForm, Thumb } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import { collectionSettings, ensureLegacyBlogImported, itemOrderBy } from "@/lib/cms/server";
import { readFields } from "@/lib/cms/fields";
import { FieldsEditor } from "./FieldsEditor";
import { CollectionSettings } from "./CollectionSettings";
import { ItemActions } from "./ItemActions";
import { statusLook, studioHref } from "../shared";
import { formatDate } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/seller/Pagination";

export const dynamic = "force-dynamic";

type Search = { tab?: string; q?: string; status?: string; view?: string; page?: string };

const PAGE_SIZE = 48;

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ collectionId: string }>; searchParams: Promise<Search> }) {
  const { collectionId } = await params;
  const sp = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("cms");
  const locale = await getLocale();
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store;
  if (!store) notFound();

  let collection = await db.cmsCollection.findFirst({ where: { id: collectionId, storeId: store.id } });
  if (!collection) notFound();
  if (collection.template === "blog") collection = (await ensureLegacyBlogImported(store.id).catch(() => null)) ?? collection;

  const tab = sp.tab === "fields" || sp.tab === "settings" ? sp.tab : "items";
  const settings = collectionSettings(collection.settings);
  const view = sp.view === "grid" || sp.view === "list" ? sp.view : settings.layout;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const status = sp.status === "draft" || sp.status === "published" || sp.status === "scheduled" ? sp.status : null;
  const base = `/home/cms/${collection.id}`;
  const label = collection.itemLabel.toLowerCase();
  const origin = buildStorefrontOrigin({ slug: store.slug, customDomain: store.customDomain ?? null });

  const itemWhere = { collectionId: collection.id, ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}), ...(status ? { status } : {}) };
  const [matching, counts, others] = await Promise.all([
    tab === "items" ? db.cmsItem.count({ where: itemWhere }) : Promise.resolve(0),
    db.cmsItem.groupBy({ by: ["status"], where: { collectionId: collection.id }, _count: { _all: true } }),
    tab === "fields" ? db.cmsCollection.findMany({ where: { storeId: store.id, id: { not: collection.id } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  // One page of the items that match the search and status (a page past the end shows the last one).
  const paging = pageWindow(sp.page, matching, PAGE_SIZE);
  const items = paging.total
    ? await db.cmsItem.findMany({
        where: itemWhere,
        orderBy: [...itemOrderBy(settings.sort), { id: "asc" }],
        skip: paging.skip,
        take: paging.take,
        select: { id: true, title: true, slug: true, status: true, publishAt: true, publishedAt: true, featuredImage: true, excerpt: true, author: true, createdBy: true, updatedAt: true },
      })
    : [];
  const count = (s: string) => counts.find((row) => row.status === s)?._count._all ?? 0;
  const total = counts.reduce((sum, row) => sum + row._count._all, 0);
  const keep = { tab: undefined, status: status ?? undefined, view: sp.view };
  const chipHref = (s: string | null) => `${base}?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}), ...(sp.view ? { view: sp.view } : {}) })}`;
  const tabs = [
    { key: "items", label: t("col.tab.items", { label: collection.itemLabel }), href: base },
    { key: "fields", label: t("fields"), href: `${base}?tab=fields` },
    { key: "settings", label: t("col.tab.settings"), href: `${base}?tab=settings` },
  ];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={collection.name}
      sub={(() => {
        const [before, after = ""] = t("col.shownAt", { path: "\u0001" }).split("\u0001");
        return <>{before}<span className="font-bold text-app-ink">/{collection.slug}</span>{after}{collection.isPublished ? "" : ` ${t("col.hiddenNow")}`}. {t("itemCount", { count: total, label })}, {t("liveCount", { count: count("published") })}.</>;
      })()}
      actions={
        <>
          <PillLink href="/home/cms" icon="arrowLeft">{t("col.allContent")}</PillLink>
          {collection.isPublished && (
            <a href={`/s/${store.slug}/${collection.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink no-underline hover:border-app-line-strong">
              <Icon name="eye" size={16} /> {t("view")}
            </a>
          )}
          <PillLink href={`${base}/new`} tone="accent" icon="plus">{t("newItem", { label })}</PillLink>
        </>
      }
    >
      <nav aria-label={t("col.sections")} className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((entry) => (
          <Link key={entry.key} href={entry.href} aria-current={tab === entry.key ? "page" : undefined} className={cx("inline-flex min-h-[42px] shrink-0 items-center rounded-full border px-4 text-[14px] font-bold no-underline", tab === entry.key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}>
            {entry.label}
          </Link>
        ))}
      </nav>

      {tab === "fields" && <FieldsEditor collectionId={collection.id} initial={readFields(collection.fields)} collections={others} />}

      {tab === "settings" && (
        <CollectionSettings
          collection={{ id: collection.id, name: collection.name, slug: collection.slug, description: collection.description, itemLabel: collection.itemLabel, isPublished: collection.isPublished, seo: collection.seo, layout: settings.layout, sort: settings.sort }}
          storeOrigin={origin}
          storeName={store.name}
        />
      )}

      {tab === "items" && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterChips
              items={[
                { label: t("col.all"), href: chipHref(null), count: total, active: !status },
                { label: t("status.live"), href: chipHref("published"), count: count("published"), active: status === "published" },
                { label: t("col.drafts"), href: chipHref("draft"), count: count("draft"), active: status === "draft" },
                { label: t("status.scheduled"), href: chipHref("scheduled"), count: count("scheduled"), active: status === "scheduled" },
              ]}
            />
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <SearchForm action={base} defaultValue={q} placeholder={t("col.search", { label })} keep={keep} />
              <div className="flex rounded-full border border-app-line bg-white p-1" role="group" aria-label={t("col.viewGroup")}>
                {(["list", "grid"] as const).map((v) => (
                  <Link key={v} href={`${base}?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), view: v })}`} aria-current={view === v ? "true" : undefined} aria-label={v === "list" ? t("col.listView") : t("col.cardView")} className={cx("grid h-9 w-10 place-items-center rounded-full", view === v ? "bg-app-ink text-white" : "text-app-ink")}>
                    <Icon name={v === "list" ? "list" : "grid"} size={15} />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon="document"
              title={q || status ? t("col.noMatch", { label }) : t("col.noneYet", { label })}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <PillLink href={`${base}/new`} tone="ink" icon="plus">{t("col.writeOne")}</PillLink>
                  <PillLink href={studioHref(`Write a ${label} for my "${collection.name}" collection about `)} icon="sparkle">{t("col.askRexDraft")}</PillLink>
                </div>
              }
            >
              {q || status ? t("col.tryAnother") : t("col.writeFirst")}
            </EmptyState>
          ) : view === "grid" ? (
            <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.map((item) => {
                const look = statusLook(t, item.status, item.publishAt);
                return (
                  <li key={item.id} className="min-w-0">
                    <Card className="flex h-full flex-col overflow-hidden">
                      <Link href={`${base}/${item.id}`} className="block text-app-ink no-underline">
                        {item.featuredImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.featuredImage} alt="" className="aspect-[16/10] w-full object-cover" />
                        ) : (
                          <div className="grid aspect-[16/10] place-items-center bg-app-canvas text-app-ink-soft"><Icon name="image" size={22} /></div>
                        )}
                        <div className="px-4 pt-3">
                          <Pill tone={look.tone} dot>{look.label}</Pill>
                          <h3 className="mb-0 mt-2 line-clamp-2 text-[15.5px] font-extrabold">{item.title}</h3>
                          <p className="m-0 mt-1 line-clamp-2 text-[13px] text-app-ink-soft">{item.excerpt || `/${item.slug}`}</p>
                        </div>
                      </Link>
                      <div className="mt-auto px-4 pb-4 pt-3"><ItemActions id={item.id} title={item.title} status={item.status} editHref={`${base}/${item.id}`} /></div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ListCard>
              {items.map((item) => {
                const look = statusLook(t, item.status, item.publishAt);
                const date = item.publishedAt ?? item.updatedAt;
                return (
                  <ListRow key={item.id}>
                    <Thumb src={item.featuredImage} label={item.title} size={44} />
                    <Link href={`${base}/${item.id}`} className="min-w-0 flex-1 basis-[200px] text-app-ink no-underline hover:underline">
                      <span className="block truncate text-[14.5px] font-extrabold">{item.title}</span>
                      <span className="block truncate text-[13px] text-app-ink-soft">
                        /{item.slug}{item.author ? ` · ${item.author}` : ""}{item.createdBy === "peggy" || item.createdBy === "rex" ? ` · ${t("col.draftedBy", { who: item.createdBy === "peggy" ? "Peggy" : "Rex" })}` : ""}
                      </span>
                    </Link>
                    <Pill tone={look.tone} dot>{look.label}</Pill>
                    <span className="hidden w-[100px] shrink-0 text-[13px] text-app-ink-soft lg:block">{formatDate(date, locale, { day: "numeric", month: "short", year: "numeric" })}</span>
                    <ItemActions id={item.id} title={item.title} status={item.status} editHref={`${base}/${item.id}`} />
                  </ListRow>
                );
              })}
            </ListCard>
          )}
          {items.length ? <Pagination {...paging} base={base} params={{ q: q || undefined, status: status ?? undefined, view: sp.view }} label={t("col.pages")} className="" /> : null}

          <AssistantNote who="rex" action={<PillLink href={studioHref(`Write a ${label} for my "${collection.name}" collection about `)} size="sm" tone="ink">{t("askRex")}</PillLink>}>
            <strong>{t("col.shortLead")}</strong> {t("col.shortBody", { label })}
          </AssistantNote>
        </div>
      )}
    </SellerPage>
  );
}
