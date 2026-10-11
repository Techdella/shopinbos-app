import Link from "next/link";
import { AppPage, AssistantNote, Card, CardHead, EmptyState, FilterChips, Pill, PillLink, SearchForm, StatTile, cx } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { Avatar, pillButton, sellerFrame, timeAgo } from "@/components/seller-core";
import { setReviewStatus } from "@/app/actions/reviews";
import { distributionPercents, filterReviews, parseReviewFilters, sourceLabel, STATUS_LABEL, summarizeReviews, type ReviewSource } from "@/lib/reviews/pure";
import { loadReviews, productNames } from "@/lib/reviews/server";
import { ReviewFilters } from "./ReviewFilters";
import { ReviewTabs, SourcePill, Stars, STATUS_TONE, reviewsContext } from "./_components/shared";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 40;

export default async function SellerReviewsPage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (await searchParams) ?? {};
  const { user, store } = await reviewsContext();
  const filters = parseReviewFilters(sp);
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);

  const [all, products] = await Promise.all([loadReviews(store.id), productNames(store.id)]);
  const summary = summarizeReviews(all);
  const filtered = filterReviews(all, filters);
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
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
  const pageHref = (n: number) => {
    const next = new URLSearchParams(base);
    if (n > 1) next.set("page", String(n));
    const qs = next.toString();
    return `/home/reviews${qs ? `?${qs}` : ""}`;
  };
  const quick = [
    { label: "All", href: "/home/reviews", count: summary.count, active: !Object.values(filters).some(Boolean) },
    { label: "Needs a reply", href: "/home/reviews?reply=needed", count: summary.needsReply, active: Boolean(filters.needsReply) && !filters.status },
    { label: "Waiting", href: "/home/reviews?status=pending", count: summary.pending, active: filters.status === "pending" && !filters.needsReply },
    { label: "With photos", href: "/home/reviews?photo=1", count: summary.withPhotos, active: Boolean(filters.hasPhoto) && !filters.status },
    { label: "Featured", href: "/home/reviews?featured=1", count: summary.featured, active: Boolean(filters.featured) },
    { label: "Hidden", href: "/home/reviews?status=rejected", count: summary.hidden, active: filters.status === "rejected" },
  ];
  const sourceCounts = (Object.entries(summary.bySource) as Array<[ReviewSource, { count: number; average: number }]>).sort((a, b) => b[1].count - a[1].count);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title="Reviews"
      sub={summary.count ? `${summary.count} reviews from ${sourceCounts.length} ${sourceCounts.length === 1 ? "source" : "sources"} · ${summary.average.toFixed(1)} average` : "Everything customers say about you, from your store, Google, WhatsApp, social and marketplaces, in one place."}
      actions={
        <>
          <PillLink href="/home/reviews/sources#import" icon="upload">Import a review</PillLink>
          <PillLink href="/home/reviews/request" tone="accent" icon="send">Ask for reviews</PillLink>
        </>
      }
    >
      <ReviewTabs active="/home/reviews" />

      {/* Overview */}
      <div className="mb-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <div>
              <div className="text-[13px] text-app-ink-soft">Average rating</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[44px] font-extrabold leading-none tracking-[-1px]">{summary.rated ? summary.average.toFixed(1) : "–"}</span>
                <Stars rating={summary.rated ? Math.round(summary.average) : null} size={18} />
              </div>
              <div className="mt-1 text-[13px] text-app-ink-soft">{summary.rated} rated · {summary.count} total</div>
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
                  aria-label={`${star} stars: ${count} reviews. ${active ? "Show all ratings" : "Show only these"}.`}
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
          <StatTile tone="card" label="Response rate" value={`${summary.responseRate}%`} hint="Reviews with your reply" />
          <StatTile tone="card" label="Needs a reply" value={String(summary.needsReply)} hint={<Link href="/home/reviews?reply=needed" className="font-bold text-app-accent-ink no-underline hover:underline">Reply now</Link>} />
          <StatTile tone="card" label="Waiting" value={String(summary.pending)} hint="Not on your store yet" />
          <StatTile tone="card" label="With photos" value={String(summary.withPhotos)} hint={`${summary.featured} featured`} />
        </div>

        <Card className="p-5 lg:col-span-2 2xl:col-span-1">
          <CardHead title="Sources" action={<Link href="/home/reviews/sources" className="text-[13px] font-bold text-app-accent-ink no-underline hover:underline">Connect more</Link>} />
          {sourceCounts.length ? (
            <ul className="m-0 mt-3 grid list-none gap-1 p-0">
              {sourceCounts.map(([source, value]) => (
                <li key={source}>
                  <Link href={withParam({ source: filters.source === source ? null : source })} aria-current={filters.source === source ? "true" : undefined} className={cx("flex min-h-[40px] items-center justify-between gap-3 rounded-full px-3 text-app-ink no-underline hover:bg-app-canvas", filters.source === source && "bg-app-canvas")}>
                    <span className="truncate text-[14px] font-bold">{sourceLabel(source)}</span>
                    <span className="shrink-0 text-[13px] text-app-ink-soft">{value.count} · {value.average ? `${value.average.toFixed(1)} ★` : "no stars"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-2 text-[14px] text-app-ink-soft">No reviews yet. Connect Google or import a screenshot to bring them in.</p>
          )}
        </Card>
      </div>

      {summary.needsReply > 0 ? (
        <div className="mb-5">
          <AssistantNote who="peggy" action={<PillLink href="/home/peggy?ask=Draft%20replies%20to%20my%20reviews%20that%20need%20one" size="sm">Ask Peggy</PillLink>}>
            {summary.needsReply === 1 ? "One review is" : `${summary.needsReply} reviews are`} waiting for a reply. Replies show customers you listen. I can draft them for you to check.
          </AssistantNote>
        </div>
      ) : null}

      <div className="mb-3">
        <FilterChips items={quick} />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <ReviewFilters products={[...products.entries()].map(([id, p]) => ({ id, name: p.name }))} sources={sourceCounts.map(([value, v]) => ({ value, label: sourceLabel(value), count: v.count }))} />
          {hasFilters ? <PillLink href="/home/reviews" size="sm">Clear filters</PillLink> : null}
        </div>
        <SearchForm action="/home/reviews" defaultValue={filters.q ?? ""} placeholder="Search reviews" keep={Object.fromEntries([...base.entries()].filter(([key]) => key !== "q"))} />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="star"
          title={summary.count === 0 ? "No reviews yet" : "No reviews match"}
          action={summary.count === 0 ? <PillLink href="/home/reviews/request" tone="accent">Ask your buyers</PillLink> : <PillLink href="/home/reviews">Show all reviews</PillLink>}
        >
          {summary.count === 0
            ? "Ask buyers after delivery, connect Google Business Profile, or import reviews customers sent you on WhatsApp or Instagram."
            : "Try a different filter or search."}
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
                        {item.status !== "approved" ? <Pill tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Pill> : null}
                        {item.featured ? <Pill tone="accent">Featured</Pill> : null}
                        {item.verifiedBuyer ? <Pill tone="success">Verified buyer</Pill> : null}
                      </div>
                      <div className="mt-0.5 truncate text-[13px] text-app-ink-soft">
                        {timeAgo(item.createdAt)}
                        {product ? <> · <span className="font-semibold text-app-ink">{product.name}</span></> : null}
                        {item.images.length ? <> · {item.images.length} photo{item.images.length === 1 ? "" : "s"}</> : null}
                      </div>
                      {text ? <p className="m-0 mt-1.5 line-clamp-2 text-[14px] leading-[1.5]">{text}</p> : null}
                      <div className="mt-1.5 text-[13px] font-semibold">
                        {item.reply ? <span className="text-app-success">Replied</span> : item.status === "rejected" ? <span className="text-app-ink-soft">Hidden from your store</span> : <span className="text-app-accent-ink">Needs a reply</span>}
                      </div>
                    </div>
                  </Link>
                  <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                    {item.status !== "approved" ? (
                      <form action={setReviewStatus}>
                        <input type="hidden" name="key" value={item.key} />
                        <input type="hidden" name="status" value="approved" />
                        <button type="submit" className={pillButton.ink} aria-label={`Publish review by ${item.authorName}`}><Icon name="check" size={14} /> Publish</button>
                      </form>
                    ) : (
                      <form action={setReviewStatus}>
                        <input type="hidden" name="key" value={item.key} />
                        <input type="hidden" name="status" value="rejected" />
                        <button type="submit" className={pillButton.white} aria-label={`Hide review by ${item.authorName}`}><Icon name="eye" size={14} /> Hide</button>
                      </form>
                    )}
                    <Link href={`/home/reviews/${item.key}`} className={pillButton.white}>{item.reply ? "Open" : "Reply"}</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[14px]">
          <span className="text-app-ink-soft">Page {page} of {pages} · {filtered.length} reviews</span>
          <div className="flex gap-2">
            {page > 1 ? <PillLink href={pageHref(page - 1)} size="sm">Previous</PillLink> : null}
            {page < pages ? <PillLink href={pageHref(page + 1)} size="sm">Next</PillLink> : null}
          </div>
        </nav>
      ) : null}
    </AppPage>
  );
}
