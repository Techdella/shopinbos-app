import Link from "next/link";
import { AppPage, AssistantNote, Card, CardHead, EmptyState, FilterChips, Pill, PillLink, SearchForm, StatTile, cx } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { Avatar, pillButton, sellerFrame, timeAgo } from "@/components/seller-core";
import { setReviewStatus } from "@/app/actions/reviews";
import { distributionPercents, filterReviews, parseReviewFilters, STATUS_LABEL, summarizeReviews, type ReviewSource } from "@/lib/reviews/pure";
import { loadReviews, productNames } from "@/lib/reviews/server";
import { ReviewFilters } from "./ReviewFilters";
import { ReviewTabs, SourcePill, Stars, STATUS_TONE, reviewSourceLabel, reviewsContext } from "./_components/shared";
import { getLocale, getT } from "@/lib/i18n/server";
import { pageSlice } from "@/lib/pagination";
import { Pagination } from "@/components/seller/Pagination";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 40;

export default async function SellerReviewsPage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (await searchParams) ?? {};
  const { user, store } = await reviewsContext();
  const t = await getT("reviews", "common");
  const locale = await getLocale();
  const filters = parseReviewFilters(sp);

  // Reviews come from two places (your store and imported sites), so the filters and pages run over both here.
  const [all, products] = await Promise.all([loadReviews(store.id, { take: 5000 }), productNames(store.id)]);
  const summary = summarizeReviews(all);
  const filtered = filterReviews(all, filters);
  const { rows: shown, window: paging } = pageSlice(filtered, sp.page, PAGE_SIZE);
  const percents = distributionPercents(summary.distribution);

  const base = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) if (typeof value === "string" && value && key !== "page") base.set(key, value);
  const withParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(base);
    for (const [key, value] of Object.entries(changes)) (value ? next.set(key, value) : next.delete(key));
    next.delete("page");
    const qs = next.toString();
    return `/home/reviews${qs ? `?${qs}` : ""}`;
  };
  const quick = [
    { label: t("list.all"), href: "/home/reviews", count: summary.count, active: !Object.values(filters).some(Boolean) },
    { label: t("list.needsReply"), href: "/home/reviews?reply=needed", count: summary.needsReply, active: Boolean(filters.needsReply) && !filters.status },
    { label: t("status.pending"), href: "/home/reviews?status=pending", count: summary.pending, active: filters.status === "pending" && !filters.needsReply },
    { label: t("list.withPhotos"), href: "/home/reviews?photo=1", count: summary.withPhotos, active: Boolean(filters.hasPhoto) && !filters.status },
    { label: t("list.featured"), href: "/home/reviews?featured=1", count: summary.featured, active: Boolean(filters.featured) },
    { label: t("status.rejected"), href: "/home/reviews?status=rejected", count: summary.hidden, active: filters.status === "rejected" },
  ];
  const sourceCounts = (Object.entries(summary.bySource) as Array<[ReviewSource, { count: number; average: number }]>).sort((a, b) => b[1].count - a[1].count);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={t("title")}
      sub={summary.count ? t("list.sub", { count: summary.count, sources: sourceCounts.length, average: summary.average.toFixed(1) }) : t("list.subEmpty")}
      actions={
        <>
          <PillLink href="/home/reviews/sources#import" icon="upload">{t("list.import")}</PillLink>
          <PillLink href="/home/reviews/request" tone="accent" icon="send">{t("tabs.ask")}</PillLink>
        </>
      }
    >
      <ReviewTabs active="/home/reviews" />

      {/* Overview */}
      <div className="mb-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <div>
              <div className="text-[13px] text-app-ink-soft">{t("list.average")}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[44px] font-extrabold leading-none tracking-[-1px]">{summary.rated ? summary.average.toFixed(1) : "–"}</span>
                <Stars rating={summary.rated ? Math.round(summary.average) : null} size={18} />
              </div>
              <div className="mt-1 text-[13px] text-app-ink-soft">{t("list.ratedTotal", { rated: summary.rated, total: summary.count })}</div>
            </div>
          </div>
          <div className="mt-4 grid gap-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary.distribution[star - 1];
              const active = filters.rating === star;
              return (
                <Link
                  key={star}
                  href={active ? withParam({ rating: null }) : withParam({ rating: String(star) })}
                  aria-current={active ? "true" : undefined}
                  aria-label={t("list.starRow", { star, count, action: active ? t("list.showAll") : t("list.showOnly") })}
                  className={cx("flex min-h-[32px] items-center gap-3 rounded-full px-2 text-app-ink no-underline hover:bg-app-canvas", active && "bg-app-canvas")}
                >
                  <span className="w-8 shrink-0 text-[13px] font-bold">{star} ★</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-app-track">
                    <span className={cx("block h-full rounded-full", star >= 4 ? "bg-app-success" : star === 3 ? "bg-[#F2A93B]" : "bg-app-danger")} style={{ width: `${percents[star - 1]}%` }} />
                  </span>
                  <span className="w-16 shrink-0 text-right text-[12.5px] text-app-ink-soft">{count} ({percents[star - 1]}%)</span>
                </Link>
              );
            })}
          </div>
        </Card>

        <div className="grid grid-cols-2 content-start gap-3">
          <StatTile tone="card" label={t("list.responseRate")} value={`${summary.responseRate}%`} hint={t("list.responseHint")} />
          <StatTile tone="card" label={t("list.needsReply")} value={String(summary.needsReply)} hint={<Link href="/home/reviews?reply=needed" className="font-bold text-app-accent-ink no-underline hover:underline">{t("list.replyNow")}</Link>} />
          <StatTile tone="card" label={t("status.pending")} value={String(summary.pending)} hint={t("list.notOnStore")} />
          <StatTile tone="card" label={t("list.withPhotos")} value={String(summary.withPhotos)} hint={t("list.featuredCount", { count: summary.featured })} />
        </div>

        <Card className="p-5 lg:col-span-2 2xl:col-span-1">
          <CardHead title={t("list.sources")} action={<Link href="/home/reviews/sources" className="text-[13px] font-bold text-app-accent-ink no-underline hover:underline">{t("list.connectMore")}</Link>} />
          {sourceCounts.length ? (
            <ul className="m-0 mt-3 grid list-none gap-1 p-0">
              {sourceCounts.map(([source, value]) => (
                <li key={source}>
                  <Link href={withParam({ source: filters.source === source ? null : source })} aria-current={filters.source === source ? "true" : undefined} className={cx("flex min-h-[40px] items-center justify-between gap-3 rounded-full px-3 text-app-ink no-underline hover:bg-app-canvas", filters.source === source && "bg-app-canvas")}>
                    <span className="truncate text-[14px] font-bold">{reviewSourceLabel(source, t)}</span>
                    <span className="shrink-0 text-[13px] text-app-ink-soft">{value.count} · {value.average ? `${value.average.toFixed(1)} ★` : t("list.noStars")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-2 text-[14px] text-app-ink-soft">{t("list.noSources")}</p>
          )}
        </Card>
      </div>

      {summary.needsReply > 0 ? (
        <div className="mb-5">
          <AssistantNote who="peggy" action={<PillLink href="/home/peggy?ask=Draft%20replies%20to%20my%20reviews%20that%20need%20one" size="sm">{t("list.askPeggy")}</PillLink>}>
            {t("list.peggyNote", { count: summary.needsReply })}
          </AssistantNote>
        </div>
      ) : null}

      <div className="mb-3">
        <FilterChips items={quick} />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <ReviewFilters products={[...products.entries()].map(([id, p]) => ({ id, name: p.name }))} sources={sourceCounts.map(([value, v]) => ({ value, label: reviewSourceLabel(value, t), count: v.count }))} />
          {hasFilters ? <PillLink href="/home/reviews" size="sm">{t("list.clearFilters")}</PillLink> : null}
        </div>
        <SearchForm action="/home/reviews" defaultValue={filters.q ?? ""} placeholder={t("list.search")} keep={Object.fromEntries([...base.entries()].filter(([key]) => key !== "q"))} />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="star"
          title={summary.count === 0 ? t("list.emptyTitle") : t("list.noMatch")}
          action={summary.count === 0 ? <PillLink href="/home/reviews/request" tone="accent">{t("list.askBuyers")}</PillLink> : <PillLink href="/home/reviews">{t("list.showAllReviews")}</PillLink>}
        >
          {summary.count === 0
            ? t("list.emptyBody")
            : t("list.tryOther")}
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="m-0 list-none divide-y divide-app-line p-0">
            {shown.map((item) => {
              const product = item.productId ? products.get(item.productId) : null;
              const text = (item.body || item.title).trim();
              return (
                <li key={item.key} className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-start">
                  <Link href={`/home/reviews/${item.key}`} className="flex min-w-0 flex-1 items-start gap-3.5 text-app-ink no-underline">
                    {item.authorPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.authorPhotoUrl} alt="" width={42} height={42} className="h-[42px] w-[42px] shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Avatar name={item.authorName} size={42} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="truncate text-[15px] font-extrabold">{item.authorName}</span>
                        <Stars rating={item.rating} />
                        <SourcePill item={item} />
                        {item.status !== "approved" ? <Pill tone={STATUS_TONE[item.status]}>{t.dynamic(`status.${item.status}`, STATUS_LABEL[item.status])}</Pill> : null}
                        {item.featured ? <Pill tone="accent">{t("list.featured")}</Pill> : null}
                        {item.verifiedBuyer ? <Pill tone="success">{t("list.verified")}</Pill> : null}
                      </div>
                      <div className="mt-0.5 truncate text-[13px] text-app-ink-soft">
                        {timeAgo(item.createdAt, Date.now(), locale)}
                        {product ? <> · <span className="font-semibold text-app-ink">{product.name}</span></> : null}
                        {item.images.length ? <> · {t("list.photos", { count: item.images.length })}</> : null}
                      </div>
                      {text ? <p className="m-0 mt-1.5 line-clamp-2 text-[14px] leading-[1.5]">{text}</p> : null}
                      <div className="mt-1.5 text-[13px] font-semibold">
                        {item.reply ? <span className="text-app-success">{t("list.replied")}</span> : item.status === "rejected" ? <span className="text-app-ink-soft">{t("list.hiddenFromStore")}</span> : <span className="text-app-accent-ink">{t("list.needsReply")}</span>}
                      </div>
                    </div>
                  </Link>
                  <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                    {item.status !== "approved" ? (
                      <form action={setReviewStatus}>
                        <input type="hidden" name="key" value={item.key} />
                        <input type="hidden" name="status" value="approved" />
                        <button type="submit" className={pillButton.ink} aria-label={t("list.publishBy", { name: item.authorName })}><Icon name="check" size={14} /> {t("list.publish")}</button>
                      </form>
                    ) : (
                      <form action={setReviewStatus}>
                        <input type="hidden" name="key" value={item.key} />
                        <input type="hidden" name="status" value="rejected" />
                        <button type="submit" className={pillButton.white} aria-label={t("list.hideBy", { name: item.authorName })}><Icon name="eye" size={14} /> {t("list.hide")}</button>
                      </form>
                    )}
                    <Link href={`/home/reviews/${item.key}`} className={pillButton.white}>{item.reply ? t("open") : t("list.reply")}</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Pagination {...paging} base="/home/reviews" params={Object.fromEntries(base.entries())} label={t("list.pages")} />
    </AppPage>
  );
}
