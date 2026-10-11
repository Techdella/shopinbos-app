import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import Link from "next/link";
import { AppPage, Card, CardHead, EmptyState, Pill, PillLink, SearchForm, StatGrid, StatTile, cx } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { Avatar, field, pillButton, sellerFrame } from "@/components/seller-core";
import { moderateReview, deleteReview, replyToReview, ensureReviewTable } from "@/app/actions/reviews";
import { ReviewCardExport } from "./ReviewCardExport";
import { ReviewFilters } from "./ReviewFilters";

export const dynamic = "force-dynamic";

type SearchParams = { searchParams?: Promise<{ rating?: string; status?: string; product?: string; q?: string }> };

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const day = Math.floor(h / 24);
  if (day === 1) return "Yesterday";
  if (day < 30) return `${day}d ago`;
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-[14px] tracking-[1px] text-[#E8A23A]" role="img" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}<span className="text-app-track">{"★".repeat(Math.max(0, 5 - rating))}</span>
    </span>
  );
}

const STATUS_PILL: Record<string, { tone: "success" | "warning" | "danger" | "muted"; label: string }> = {
  approved: { tone: "success", label: "Approved" },
  pending: { tone: "warning", label: "Pending" },
  rejected: { tone: "danger", label: "Rejected" },
};

export default async function SellerReviewsPage({ searchParams }: SearchParams) {
  const sp = await searchParams;
  const filterRating = sp?.rating ? parseInt(sp.rating) : 0;
  const filterStatus = sp?.status || "";
  const filterProduct = sp?.product || "";
  const searchQ = sp?.q || "";

  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");
  const storeId = workspace.store.id;

  await ensureReviewTable();

  const reviews = await db.$queryRawUnsafe<Array<{
    id: string; productId: string; orderId: string; buyerName: string; buyerEmail: string;
    rating: number; title: string; body: string; images: string; status: string;
    sellerReply: string | null; repliedAt: Date | null; createdAt: Date;
  }>>(
    `SELECT id, "productId", "orderId", "buyerName", "buyerEmail", rating, title, body,
            array_to_string(images, ',') as images, status, "sellerReply", "repliedAt", "createdAt"
     FROM "ProductReview" WHERE "storeId" = $1 ORDER BY "createdAt" DESC LIMIT 200`,
    storeId,
  );

  const productIds = [...new Set(reviews.map((r) => r.productId))];
  const products = productIds.length > 0
    ? await db.$queryRawUnsafe<Array<{ id: string; name: string; images: string }>>(
        `SELECT id, name, images[1] as images FROM "StoreProduct" WHERE id = ANY(ARRAY[${productIds.map((_, i) => `$${i + 1}`).join(",")}])`,
        ...productIds,
      )
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  const ratingCounts = [0, 0, 0, 0, 0];
  let totalRating = 0;
  for (const r of reviews) {
    if (r.rating >= 1 && r.rating <= 5) {
      ratingCounts[r.rating - 1]++;
      totalRating += r.rating;
    }
  }
  const totalReviews = reviews.length;
  const avgRating = totalReviews > 0 ? (totalRating / totalReviews).toFixed(1) : "0.0";
  const pendingCount = reviews.filter((r) => r.status === "pending").length;
  const approvedCount = reviews.filter((r) => r.status === "approved").length;

  let filtered = [...reviews];
  if (filterRating > 0) filtered = filtered.filter((r) => r.rating === filterRating);
  if (filterStatus) filtered = filtered.filter((r) => r.status === filterStatus);
  if (filterProduct) filtered = filtered.filter((r) => r.productId === filterProduct);
  if (searchQ) {
    const q = searchQ.toLowerCase();
    filtered = filtered.filter((r) =>
      r.buyerName.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q)
    );
  }

  function setParam(key: string, val: string) {
    const p = new URLSearchParams();
    if (filterRating > 0 && key !== "rating") p.set("rating", String(filterRating));
    if (filterStatus && key !== "status") p.set("status", filterStatus);
    if (filterProduct && key !== "product") p.set("product", filterProduct);
    if (searchQ && key !== "q") p.set("q", searchQ);
    if (val) p.set(key, val);
    const qs = p.toString();
    return `/home/reviews${qs ? `?${qs}` : ""}`;
  }

  const replied = reviews.filter((r) => r.sellerReply).length;
  const hasFilters = Boolean(filterRating || filterStatus || filterProduct || searchQ);

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title="Reviews"
      sub={totalReviews > 0 ? `${totalReviews} reviews · ${avgRating} average · ${pendingCount} waiting for you` : "What buyers say about your products. Approve reviews to show them on your store."}
      toolbar={
        <>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <ReviewFilters status={filterStatus} product={filterProduct} products={products} rating={filterRating} />
            {hasFilters && <PillLink href="/home/reviews" size="sm">Clear filters</PillLink>}
          </div>
          <SearchForm
            action="/home/reviews"
            defaultValue={searchQ}
            placeholder="Search reviews"
            keep={{ rating: filterRating > 0 ? String(filterRating) : undefined, status: filterStatus || undefined, product: filterProduct || undefined }}
          />
        </>
      }
    >
      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <StatGrid className="content-start md:grid-cols-3 xl:grid-cols-3">
          <StatTile tone="card" label="Total reviews" value={String(totalReviews)} hint={`${approvedCount} approved`} />
          <StatTile tone="card" label="Average rating" value={avgRating} hint="Out of 5" />
          <StatTile tone="card" label="5 stars" value={String(ratingCounts[4])} hint={`${totalReviews > 0 ? Math.round(ratingCounts[4] / totalReviews * 100) : 0}% of reviews`} />
          <StatTile tone="card" label="Waiting for you" value={String(pendingCount)} hint="Approve or reject" />
          <StatTile tone="card" label="Replied" value={String(replied)} hint="Your answers" />
        </StatGrid>

        {/* Rating distribution */}
        <Card className="p-5">
          <CardHead title="Ratings" action={filterRating > 0 ? <Link href={setParam("rating", "")} className="text-[13px] font-bold text-app-accent-ink no-underline hover:underline">Show all</Link> : undefined} />
          <div className="mt-3 grid gap-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = ratingCounts[star - 1];
              const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
              return (
                <Link
                  key={star}
                  href={setParam("rating", String(star))}
                  aria-current={filterRating === star ? "true" : undefined}
                  aria-label={`${star} stars: ${count} reviews. Show only these.`}
                  className={cx("flex min-h-[32px] items-center gap-3 rounded-full px-2 text-app-ink no-underline hover:bg-app-canvas", filterRating === star && "bg-app-canvas")}
                >
                  <span className="w-8 shrink-0 text-[13px] font-bold">{star} ★</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-app-track">
                    <span className={cx("block h-full rounded-full", star >= 4 ? "bg-app-success" : star === 3 ? "bg-[#F2A93B]" : "bg-app-danger")} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-16 shrink-0 text-right text-[12.5px] text-app-ink-soft">{count} ({Math.round(pct)}%)</span>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Reviews list */}
      {filtered.length === 0 ? (
        <EmptyState icon="star" title={totalReviews === 0 ? "No reviews yet" : "No reviews match"} action={hasFilters ? <PillLink href="/home/reviews">Show all reviews</PillLink> : undefined}>
          {totalReviews === 0 ? "Buyers can review products after their order is delivered. Their reviews will show up here." : "Try a different filter or search."}
        </EmptyState>
      ) : (
        <div className="grid gap-3 2xl:grid-cols-2">
          {filtered.map((r) => {
            const product = productMap.get(r.productId);
            const pill = STATUS_PILL[r.status] ?? { tone: "muted" as const, label: r.status };
            return (
              <article key={r.id} id={`review-${r.id}`} className="min-w-0 rounded-[22px] border border-app-line bg-white p-5">
                <div className="flex items-start gap-3.5">
                  <Avatar name={r.buyerName} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h2 className="m-0 truncate text-[15px] font-extrabold">{r.buyerName}</h2>
                      <StarRating rating={r.rating} />
                      <Pill tone={pill.tone}>{pill.label}</Pill>
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-app-ink-soft">
                      {fmtDate(r.createdAt)}
                      {product ? <> · <span className="font-semibold text-app-ink">{product.name}</span></> : null}
                    </div>
                  </div>
                </div>

                {r.title ? <h3 className="m-0 mt-3 text-[15px] font-bold">{r.title}</h3> : null}
                {r.body ? <p className="m-0 mt-1 whitespace-pre-line text-[14px] leading-[1.55]">{r.body}</p> : null}

                {r.sellerReply ? (
                  <div className="mt-3 rounded-[16px] bg-app-mint px-4 py-3">
                    <div className="text-[12.5px] font-bold text-app-forest">Your reply{r.repliedAt ? ` · ${fmtDate(r.repliedAt)}` : ""}</div>
                    <p className="m-0 mt-0.5 whitespace-pre-line text-[14px] leading-[1.5]">{r.sellerReply}</p>
                  </div>
                ) : null}

                {/* Actions */}
                <div data-export-skip="true" className="mt-4 grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.status !== "approved" ? (
                      <form action={moderateReview}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="approved" />
                        <button type="submit" className={pillButton.ink}><Icon name="check" size={14} /> Approve</button>
                      </form>
                    ) : null}
                    {r.status !== "rejected" ? (
                      <form action={moderateReview}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <button type="submit" className={pillButton.white}><Icon name="x" size={14} /> Reject</button>
                      </form>
                    ) : null}
                    {r.status !== "pending" ? (
                      <form action={moderateReview}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="pending" />
                        <button type="submit" className={pillButton.white}>Unapprove</button>
                      </form>
                    ) : null}
                    <form action={deleteReview}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className={pillButton.danger}><Icon name="trash" size={14} /> Delete</button>
                    </form>
                    <div className="ml-auto">
                      <ReviewCardExport reviewId={r.id} />
                    </div>
                  </div>
                  <details className="group">
                    <summary className={cx(pillButton.white, "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                      <Icon name="chat" size={14} /> {r.sellerReply ? "Edit reply" : "Reply"}
                    </summary>
                    <form action={replyToReview} className="mt-2 grid gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <label className="sr-only" htmlFor={`reply-${r.id}`}>Reply to {r.buyerName}</label>
                      <textarea id={`reply-${r.id}`} name="reply" rows={3} className={field.textarea} placeholder="Write your reply…" defaultValue={r.sellerReply ?? ""} />
                      <button type="submit" className={cx(pillButton.accent, "w-fit")}>Send reply</button>
                    </form>
                  </details>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppPage>
  );
}
