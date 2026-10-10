import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
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

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span style={{ color: "#f59e0b", fontSize: size, letterSpacing: 1 }}>
      {"★".repeat(rating)}{"☆".repeat(5 - rating)}
    </span>
  );
}

function Av({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  const colors = ["#D4A574","#195754","#E86A4F","#5b6ad0","#8aa843","#b14a8a","#e8a647"];
  const c = colors[name.length % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: c, display: "grid", placeItems: "center",
      color: "white", fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

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

  return (
    <AppFrame role="seller" chipMode="rail" chipRole="seller">
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Reviews"
          sub={`${totalReviews} total · ${avgRating} avg rating · ${pendingCount} pending`}
        />

        {/* Stats cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
          {[
            { label: "Total reviews", value: String(totalReviews), sub: `${approvedCount} approved`, color: "var(--teal-600)" },
            { label: "Average rating", value: avgRating, sub: "out of 5", color: "var(--amber-500)" },
            { label: "5-star", value: String(ratingCounts[4]), sub: `${totalReviews > 0 ? Math.round(ratingCounts[4] / totalReviews * 100) : 0}%`, color: "var(--success)" },
            { label: "Pending", value: String(pendingCount), sub: "awaiting moderation", color: "var(--warning)" },
            { label: "Replied", value: String(reviews.filter((r) => r.sellerReply).length), sub: "seller responses", color: "var(--berry-500)" },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: "12px 14px", borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 10.5, color: "var(--ink-500)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 1, color: "var(--ink-900)" }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 1 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Rating distribution */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-500)", marginBottom: 10 }}>Rating distribution</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[5, 4, 3, 2, 1].map((star) => {
              const count = ratingCounts[star - 1];
              const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
              const barColor = star >= 4 ? "var(--success)" : star === 3 ? "var(--warning)" : "var(--danger)";
              return (
                <a key={star} href={setParam("rating", String(star))} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--amber-500)", minWidth: 30 }}>{star}★</span>
                  <div style={{ flex: 1, height: 8, background: "var(--ink-100)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 999, transition: "width 0.3s" }} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--ink-600)", minWidth: 50, textAlign: "right" }}>{count} ({Math.round(pct)}%)</span>
                </a>
              );
            })}
          </div>
          <a href={setParam("rating", "")} style={{ fontSize: 11, color: "var(--teal-600)", marginTop: 6, display: "inline-block", textDecoration: "none" }}>Clear filter</a>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <form method="GET" action="/home/reviews" style={{ display: "contents" }}>
            {filterRating > 0 ? <input type="hidden" name="rating" value={filterRating} /> : null}
            {filterStatus ? <input type="hidden" name="status" value={filterStatus} /> : null}
            {filterProduct ? <input type="hidden" name="product" value={filterProduct} /> : null}
            <div className="sb-search" style={{ flex: "1 1 200px", maxWidth: 300 }}>
              <Icon name="search" size={14} />
              <input name="q" defaultValue={searchQ} placeholder="Search reviews…" style={{ border: "none", background: "none", outline: "none", flex: 1, fontSize: 13, padding: "6px 0" }} />
            </div>
          </form>
          <ReviewFilters status={filterStatus} product={filterProduct} products={products} rating={filterRating} />
        </div>

        {/* Reviews list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.length > 0 ? filtered.map((r) => {
            const product = productMap.get(r.productId);
            const isPending = r.status === "pending";
            const isRejected = r.status === "rejected";
            return (
              <div key={r.id} id={`review-${r.id}`} className="card" style={{
                padding: 18,
                borderLeft: isPending ? "3px solid var(--warning)" : isRejected ? "3px solid var(--danger)" : "3px solid var(--success)",
              }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <Av name={r.buyerName} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 6 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{r.buyerName}</span>
                          <StarRating rating={r.rating} size={13} />
                          <Badge variant={isPending ? "warn" : isRejected ? "danger" : "success"}>{r.status}</Badge>
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>
                          {fmtDate(r.createdAt)}
                          {product ? <> · <span style={{ color: "var(--teal-700)", fontWeight: 500 }}>{product.name}</span></> : null}
                        </div>
                      </div>
                    </div>

                    {/* Title & Body */}
                    {r.title ? <div style={{ fontWeight: 600, fontSize: 13.5, marginTop: 8, color: "var(--ink-800)" }}>{r.title}</div> : null}
                    {r.body ? <div style={{ fontSize: 13, color: "var(--ink-700)", lineHeight: 1.55, marginTop: 4 }}>{r.body}</div> : null}

                    {/* Seller reply */}
                    {r.sellerReply ? (
                      <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--teal-50)", borderRadius: 8, borderLeft: "2px solid var(--teal-400)" }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--teal-700)", marginBottom: 3 }}>Your reply</div>
                        <div style={{ fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.5 }}>{r.sellerReply}</div>
                        {r.repliedAt ? <div style={{ fontSize: 10.5, color: "var(--ink-500)", marginTop: 3 }}>{fmtDate(r.repliedAt)}</div> : null}
                      </div>
                    ) : null}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                      {r.status !== "approved" ? (
                        <form action={moderateReview} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="approved" />
                          <button type="submit" className="dbtn dBtn-mint dBtn-xs"><Icon name="check" size={11} /> Approve</button>
                        </form>
                      ) : null}
                      {r.status !== "rejected" ? (
                        <form action={moderateReview} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="rejected" />
                          <button type="submit" className="dbtn dBtn-ghost dBtn-xs" style={{ color: "var(--danger)" }}><Icon name="x" size={11} /> Reject</button>
                        </form>
                      ) : null}
                      {r.status !== "pending" ? (
                        <form action={moderateReview} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="pending" />
                          <button type="submit" className="dbtn dBtn-ghost dBtn-xs">Unapprove</button>
                        </form>
                      ) : null}
                      <details style={{ display: "inline-block", position: "relative" }}>
                        <summary className="dbtn dBtn-ghost dBtn-xs" style={{ cursor: "pointer", listStyle: "none" }}>Reply</summary>
                        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 10, marginTop: 4, minWidth: 280 }}>
                          <form action={replyToReview} className="card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                            <input type="hidden" name="id" value={r.id} />
                            <textarea name="reply" rows={2} className="inp" style={{ fontSize: 12, resize: "vertical" }} placeholder="Write your reply…" defaultValue={r.sellerReply ?? ""} />
                            <button type="submit" className="dbtn dBtn-mint dBtn-xs" style={{ alignSelf: "flex-end" }}>Send reply</button>
                          </form>
                        </div>
                      </details>
                      <form action={deleteReview} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="dbtn dBtn-ghost dBtn-xs" style={{ color: "var(--danger)" }}>Delete</button>
                      </form>
                      <div style={{ marginLeft: "auto" }}>
                        <ReviewCardExport reviewId={r.id} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="card" style={{ padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 14, color: "var(--ink-500)" }}>No reviews found.</div>
            </div>
          )}
        </div>
      </div>
    </AppFrame>
  );
}
