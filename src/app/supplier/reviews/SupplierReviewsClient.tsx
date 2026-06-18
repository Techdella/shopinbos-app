"use client";

import { useState } from "react";
import { Icon, Badge } from "@/components/ui";
import type { IconName } from "@/components/ui/Icon";
import { respondToSupplierReview } from "@/app/actions/supplier-reviews";

interface ReviewData {
  id: string;
  supplierId: string;
  reviewerId: string;
  targetId: string;
  targetRole: string;
  interactionType: string;
  interactionId: string;
  rating: number;
  title: string;
  comment: string | null;
  reply: string | null;
  repliedAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface OrderData {
  id: string;
  status: string;
  totalPrice: number;
  createdAt: string;
  seller: { id: string; name: string };
  supplierProduct: { name: string };
}

interface BookingData {
  id: string;
  createdAt: string;
  deliveryFee: number;
  logisticsPartner: { id: string; userId: string; displayName: string };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StarRating({ rating, size = 14, interactive, onChange }: {
  rating: number; size?: number; interactive?: boolean; onChange?: (v: number) => void;
}) {
  return (
    <span style={{ fontSize: size, letterSpacing: 2, cursor: interactive ? "pointer" : "default" }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          onClick={() => interactive && onChange?.(s)}
          style={{
            color: s <= rating ? "#f59e0b" : "var(--ink-200)",
            transition: "color 0.15s",
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string | number; sub: string; icon?: IconName; accent?: string;
}) {
  return (
    <div className="stat" style={accent ? { borderLeft: `3px solid ${accent}` } : {}}>
      {icon && <div style={{ fontSize: 12, color: "var(--ink-400)", marginBottom: 2 }}><Icon name={icon} size={14} /></div>}
      <div className="stat-val" style={{ fontSize: 22 }}>{value}</div>
      <div className="stat-lbl">{label}</div>
      <div className="stat-delta" style={{ fontSize: 11, color: "var(--ink-400)" }}>{sub}</div>
    </div>
  );
}

function DistributionBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ width: 30, textAlign: "right", color: "var(--ink-500)" }}>{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--ink-100)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: color, transition: "width 0.3s" }} />
      </div>
      <span style={{ width: 40, fontWeight: 600, color: "var(--ink-700)" }}>{count}</span>
    </div>
  );
}

function ReviewCard({ review, isIncoming, onReply }: {
  review: ReviewData; isIncoming: boolean; onReply: (id: string, reply: string) => void;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState(review.reply ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.set("reviewId", review.id);
    fd.set("reply", replyText.trim());
    await onReply(review.id, replyText.trim());
    setShowReplyForm(false);
    setSubmitting(false);
  };

  const reviewerLabel = isIncoming
    ? review.targetRole === "logistics_partner" ? "Logistics partner" : "Seller"
    : review.targetRole === "logistics_partner" ? "To logistics" : "To seller";

  const interactionLabel = review.interactionType === "wholesale_order" ? "Wholesale order" : "Delivery booking";

  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: `linear-gradient(135deg, var(--teal-500), var(--teal-700))`,
            display: "grid", placeItems: "center",
            color: "white", fontWeight: 700, fontSize: 13, flexShrink: 0,
          }}>
            {review.title ? review.title.charAt(0).toUpperCase() : "?"}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink-900)" }}>
              {review.title || "Review"}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-500)", display: "flex", gap: 6, alignItems: "center" }}>
              <Badge variant="info" dot>{reviewerLabel}</Badge>
              <span>·</span>
              <span>{interactionLabel}</span>
              <span>·</span>
              <span>{fmtDate(review.createdAt)}</span>
            </div>
          </div>
        </div>
        <StarRating rating={review.rating} size={16} />
      </div>

      {review.comment && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-700)", lineHeight: 1.5 }}>
          {review.comment}
        </p>
      )}

      {isIncoming && review.reply && (
        <div style={{
          marginTop: 4, padding: "10px 12px", borderRadius: 8,
          background: "var(--teal-50)", border: "1px solid var(--teal-200)", fontSize: 13,
        }}>
          <div style={{ fontWeight: 600, fontSize: 11.5, color: "var(--teal-700)", marginBottom: 4 }}>
            Your reply · {review.repliedAt ? fmtDate(review.repliedAt) : ""}
          </div>
          {review.reply}
        </div>
      )}

      {isIncoming && !review.reply && !showReplyForm && (
        <button
          className="dbtn dBtn-ghost"
          style={{ alignSelf: "flex-start", padding: "6px 12px", fontSize: 12 }}
          onClick={() => setShowReplyForm(true)}
        >
          <Icon name="message" size={12} /> Reply
        </button>
      )}

      {isIncoming && showReplyForm && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <textarea
            className="inp"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write your reply..."
            rows={2}
            style={{ flex: 1, fontSize: 13, resize: "none" }}
          />
          <div style={{ display: "flex", gap: 4 }}>
            <button className="dbtn dBtn-mint" onClick={handleSubmit} disabled={submitting || !replyText.trim()}>
              Send
            </button>
            <button className="dbtn dBtn-ghost" onClick={() => { setShowReplyForm(false); setReplyText(review.reply ?? ""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewForm({ type, targetId, targetName, interactionId, interactionLabel, onSubmit }: {
  type: "seller" | "logistics_partner";
  targetId: string;
  targetName: string;
  interactionId: string;
  interactionLabel: string;
  onSubmit: (fd: FormData) => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (rating < 1) { setError("Please select a rating"); return; }
    setSubmitting(true);
    setError("");
    const fd = new FormData();
    if (type === "seller") {
      fd.set("sellerId", targetId);
      fd.set("orderId", interactionId);
    } else {
      fd.set("logisticsUserId", targetId);
      fd.set("bookingId", interactionId);
    }
    fd.set("rating", String(rating));
    fd.set("title", title);
    fd.set("comment", comment);
    await onSubmit(fd);
    setRating(0);
    setTitle("");
    setComment("");
    setSubmitting(false);
  };

  return (
    <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>
          Review {targetName}
        </div>
        <StarRating rating={rating} size={20} interactive onChange={setRating} />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{interactionLabel}</div>
      <input
        className="inp"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Short title (optional)"
        style={{ fontSize: 13 }}
      />
      <textarea
        className="inp"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share your experience..."
        rows={2}
        style={{ fontSize: 13, resize: "none" }}
      />
      {error && <div style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>}
      <button className="dbtn dBtn-mint" onClick={handleSubmit} disabled={submitting} style={{ alignSelf: "flex-end" }}>
        Submit review
      </button>
    </div>
  );
}

export function SupplierReviewsClient({
  supplierId,
  incoming,
  outgoing,
  unreviewedOrders,
  unreviewedBookings,
  stats,
  supplierRating,
  supplierRatingCount,
}: {
  supplierId: string;
  incoming: ReviewData[];
  outgoing: ReviewData[];
  unreviewedOrders: OrderData[];
  unreviewedBookings: BookingData[];
  stats: { total: number; avgRating: number; distribution: number[]; responded: number };
  supplierRating: number;
  supplierRatingCount: number;
}) {
  const [tab, setTab] = useState<"incoming" | "outgoing" | "pending">("incoming");
  const [reviews, setReviews] = useState(incoming);
  const [localOutgoing, setLocalOutgoing] = useState(outgoing);
  const [localUnreviewedOrders, setLocalUnreviewedOrders] = useState(unreviewedOrders);
  const [localUnreviewedBookings, setLocalUnreviewedBookings] = useState(unreviewedBookings);
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  const handleReply = async (reviewId: string, reply: string) => {
    const fd = new FormData();
    fd.set("reviewId", reviewId);
    fd.set("reply", reply);
    const result = await respondToSupplierReview(fd);
    if (result.success) {
      setReviews((prev) => prev.map((r) =>
        r.id === reviewId ? { ...r, reply, repliedAt: new Date().toISOString() } : r
      ));
    } else {
      setReplyErrors((prev) => ({ ...prev, [reviewId]: result.error ?? "Failed to reply" }));
    }
  };

  const handleReviewSubmit = async (type: "seller" | "logistics_partner", fd: FormData) => {
    const action = type === "seller"
      ? await import("@/app/actions/supplier-reviews").then((m) => m.reviewSeller)
      : await import("@/app/actions/supplier-reviews").then((m) => m.reviewLogisticsPartner);

    const result = await action(fd);
    if (result.success) {
      const newReview: ReviewData = {
        id: `new-${Date.now()}`,
        supplierId,
        reviewerId: "",
        targetId: fd.get(type === "seller" ? "sellerId" : "logisticsUserId") as string,
        targetRole: type,
        interactionType: type === "seller" ? "wholesale_order" : "delivery_booking",
        interactionId: fd.get(type === "seller" ? "orderId" : "bookingId") as string,
        rating: parseInt(fd.get("rating") as string, 10),
        title: fd.get("title") as string || "Review",
        comment: fd.get("comment") as string || null,
        reply: null,
        repliedAt: null,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setLocalOutgoing((prev) => [newReview, ...prev]);

      if (type === "seller") {
        setLocalUnreviewedOrders((prev) => prev.filter((o) => o.id !== fd.get("orderId")));
      } else {
        setLocalUnreviewedBookings((prev) => prev.filter((b) => b.id !== fd.get("bookingId")));
      }
    } else {
      setSubmitError(result.error ?? "Failed to submit review");
    }
  };

  const responseRate = stats.total > 0 ? Math.round((stats.responded / stats.total) * 100) : 0;
  const pendingCount = localUnreviewedOrders.length + localUnreviewedBookings.length;

  return (
    <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, fontFamily: "var(--font-display)" }}>
            Reviews
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
            {stats.total > 0
              ? `${stats.total} review${stats.total === 1 ? "" : "s"} · ${stats.avgRating.toFixed(1)} avg rating`
              : "No reviews yet. Reviews appear after sellers or logistics partners interact with your business."
            }
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <StarRating rating={Math.round(supplierRating)} size={18} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>{supplierRating.toFixed(1)}</span>
          <span style={{ fontSize: 12, color: "var(--ink-500)" }}>({supplierRatingCount})</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <StatCard label="Reviews received" value={stats.total} sub={`${stats.avgRating.toFixed(1)} avg`} icon="star" accent="#f59e0b" />
        <StatCard label="Response rate" value={`${responseRate}%`} sub={`${stats.responded} of ${stats.total} replied`} icon="message" accent="var(--teal-600)" />
        <StatCard label="5-star reviews" value={stats.distribution[4]} sub={`${stats.total > 0 ? Math.round(stats.distribution[4] / stats.total * 100) : 0}% of reviews`} icon="heart" accent="var(--mint-500)" />
        <StatCard label="Pending to review" value={pendingCount} sub={`${localUnreviewedOrders.length} orders · ${localUnreviewedBookings.length} deliveries`} icon="edit" accent="var(--amber-500)" />
      </div>

      {/* Rating distribution */}
      {stats.total > 0 && (
        <div className="card" style={{ padding: 14, display: "flex", gap: 24, alignItems: "center" }}>
          <div style={{ textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#f59e0b" }}>{stats.avgRating.toFixed(1)}</div>
            <StarRating rating={Math.round(stats.avgRating)} size={12} />
            <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2 }}>{stats.total} total</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
            {[5, 4, 3, 2, 1].map((star) => (
              <DistributionBar
                key={star}
                label={`${star}`}
                count={stats.distribution[star - 1]}
                total={stats.total}
                color={star >= 4 ? "var(--teal-500)" : star >= 3 ? "var(--amber-400)" : "var(--rose-400)"}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 1, borderBottom: "1px solid var(--ink-100)" }}>
        {[
          { id: "incoming" as const, label: "Reviews about you", count: incoming.length },
          { id: "outgoing" as const, label: "Your reviews", count: outgoing.length },
          { id: "pending" as const, label: "Pending review", count: pendingCount },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 16px", fontSize: 13, fontWeight: 600,
              fontFamily: "inherit", cursor: "pointer",
              color: tab === t.id ? "var(--teal-700)" : "var(--ink-500)",
              borderBottom: tab === t.id ? "2px solid var(--teal-700)" : "2px solid transparent",
              marginBottom: -1, background: "none",
              borderTop: 0, borderLeft: 0, borderRight: 0,
              whiteSpace: "nowrap", display: "flex", gap: 6, alignItems: "center",
            }}
          >
            {t.label}
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: tab === t.id ? "var(--teal-100)" : "var(--ink-75)",
              color: tab === t.id ? "var(--teal-700)" : "var(--ink-500)",
              borderRadius: 10, padding: "1px 7px",
            }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Error banner */}
      {submitError && (
        <div style={{ padding: "8px 14px", borderRadius: 8, background: "var(--rose-100)", border: "1px solid var(--rose-300)", color: "var(--rose-700)", fontSize: 12.5, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{submitError}</span>
          <button onClick={() => setSubmitError("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--rose-700)", fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Incoming tab */}
      {tab === "incoming" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reviews.length === 0 ? (
            <div className="card" style={{ padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-500)" }}>
                No reviews yet
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-400)", marginTop: 4 }}>
                When sellers or logistics partners review your business, they will appear here.
              </div>
            </div>
          ) : (
            reviews.map((review) => (
              <div key={review.id}>
                <ReviewCard review={review} isIncoming onReply={handleReply} />
                {replyErrors[review.id] && (
                  <div style={{ padding: "4px 14px", fontSize: 12, color: "var(--danger)" }}>
                    {replyErrors[review.id]}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Outgoing tab */}
      {tab === "outgoing" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {localOutgoing.length === 0 ? (
            <div className="card" style={{ padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-500)" }}>
                No reviews written yet
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-400)", marginTop: 4 }}>
                Go to the "Pending review" tab to review sellers and logistics partners you have worked with.
              </div>
            </div>
          ) : (
            localOutgoing.map((review) => (
              <ReviewCard key={review.id} review={review} isIncoming={false} onReply={() => {}} />
            ))
          )}
        </div>
      )}

      {/* Pending review tab */}
      {tab === "pending" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {pendingCount === 0 ? (
            <div className="card" style={{ padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-500)" }}>
                All caught up
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-400)", marginTop: 4 }}>
                You have reviewed every completed interaction. New orders and deliveries will appear here.
              </div>
            </div>
          ) : (
            <>
              {localUnreviewedOrders.length > 0 && (
                <div>
                  <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--ink-600)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="box" size={14} /> Wholesale orders ({localUnreviewedOrders.length})
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {localUnreviewedOrders.map((order) => (
                      <ReviewForm
                        key={order.id}
                        type="seller"
                        targetId={order.seller.id}
                        targetName={order.seller.name}
                        interactionId={order.id}
                        interactionLabel={`${order.supplierProduct.name} · ${fmtDate(order.createdAt)} · ₦${Math.round(order.totalPrice).toLocaleString()}`}
                        onSubmit={(fd) => handleReviewSubmit("seller", fd)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {localUnreviewedBookings.length > 0 && (
                <div>
                  <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--ink-600)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="truck" size={14} /> Completed deliveries ({localUnreviewedBookings.length})
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {localUnreviewedBookings.map((booking) => (
                      <ReviewForm
                        key={booking.id}
                        type="logistics_partner"
                        targetId={booking.logisticsPartner.userId}
                        targetName={booking.logisticsPartner.displayName}
                        interactionId={booking.id}
                        interactionLabel={`${fmtDate(booking.createdAt)} · ₦${Math.round(booking.deliveryFee).toLocaleString()} delivery fee`}
                        onSubmit={(fd) => handleReviewSubmit("logistics_partner", fd)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
