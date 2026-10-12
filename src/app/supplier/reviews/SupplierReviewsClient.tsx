"use client";

import { useState } from "react";
import { Card, EmptyState, Pill, StatGrid, StatTile } from "@/components/app-kit";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { respondToSupplierReview } from "@/app/actions/supplier-reviews";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";

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

const inputClass = "w-full rounded-[14px] border border-app-line bg-white px-4 py-3 text-[14.5px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[#F2A93B]" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Icon key={s} name="star" size={size} fill={s <= rating ? "currentColor" : "none"} className={s <= rating ? "" : "text-app-toggle-off"} />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          aria-label={`${s} star${s === 1 ? "" : "s"}`}
          onClick={() => onChange(s)}
          className={cx("grid h-10 w-10 place-items-center rounded-full transition hover:bg-app-canvas", s <= value ? "text-[#F2A93B]" : "text-app-toggle-off")}
        >
          <Icon name="star" size={22} fill={s <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

function ReviewCard({ review, isIncoming, onReply, error }: {
  review: ReviewData; isIncoming: boolean; onReply: (id: string, reply: string) => Promise<void>; error?: string;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState(review.reply ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    await onReply(review.id, replyText.trim());
    setShowReplyForm(false);
    setSubmitting(false);
  };

  const reviewerLabel = isIncoming
    ? review.targetRole === "logistics_partner" ? "Delivery partner" : "Seller"
    : review.targetRole === "logistics_partner" ? "To delivery partner" : "To seller";

  const interactionLabel = review.interactionType === "wholesale_order" ? "Wholesale order" : "Delivery";

  return (
    <Card as="article" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 truncate text-[15px] font-extrabold">{review.title || "Review"}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-app-ink-soft">
            <Pill tone="info">{reviewerLabel}</Pill>
            <span>{interactionLabel} · {fmtDate(review.createdAt)}</span>
          </div>
        </div>
        <Stars rating={review.rating} size={16} />
      </div>

      {review.comment && <p className="mb-0 mt-3 text-[14.5px] leading-[1.55]">{review.comment}</p>}

      {isIncoming && review.reply && (
        <div className="mt-3 rounded-[16px] bg-app-mint px-4 py-3 text-[14px] leading-[1.5]">
          <div className="mb-1 text-[12.5px] font-bold">Your reply{review.repliedAt ? ` · ${fmtDate(review.repliedAt)}` : ""}</div>
          {review.reply}
        </div>
      )}

      {isIncoming && !review.reply && !showReplyForm && (
        <PillButton tone="white" size="sm" className="mt-3" onClick={() => setShowReplyForm(true)}>
          <Icon name="message" size={14} /> Reply
        </PillButton>
      )}

      {isIncoming && showReplyForm && (
        <div className="mt-3 grid gap-2">
          <label htmlFor={`reply-${review.id}`} className="text-[13px] font-bold">Your reply</label>
          <textarea
            id={`reply-${review.id}`}
            className={cx(inputClass, "resize-y")}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Thank them, or explain what you'll do differently"
            rows={3}
          />
          <VoiceInputButton value={replyText} onChange={setReplyText} context="a reply to a review" />
          <div className="flex flex-wrap gap-2">
            <PillButton tone="ink" size="sm" onClick={handleSubmit} busy={submitting} disabled={!replyText.trim()}>
              Send reply
            </PillButton>
            <PillButton tone="ghost" size="sm" onClick={() => { setShowReplyForm(false); setReplyText(review.reply ?? ""); }}>
              Cancel
            </PillButton>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mb-0 mt-2 text-[13px] text-app-danger">{error}</p>}
    </Card>
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
    if (rating < 1) { setError("Pick a star rating first."); return; }
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
    <Card className="grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="m-0 truncate text-[15px] font-extrabold">Review {targetName}</h3>
          <div className="truncate text-[12.5px] text-app-ink-soft">{interactionLabel}</div>
        </div>
        <StarPicker value={rating} onChange={setRating} label={`Rating for ${targetName}`} />
      </div>
      <input
        className={inputClass}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Short title (optional)"
        aria-label="Review title"
      />
      <textarea
        className={cx(inputClass, "resize-y")}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="How did it go?"
        aria-label="Review comment"
        rows={2}
      />
      {error && <p role="alert" className="m-0 text-[13px] text-app-danger">{error}</p>}
      <div className="flex justify-end">
        <PillButton tone="ink" size="sm" onClick={handleSubmit} busy={submitting}>
          Submit review
        </PillButton>
      </div>
    </Card>
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
  const tabs = [
    { id: "incoming" as const, label: "About you", count: reviews.length },
    { id: "outgoing" as const, label: "Written by you", count: localOutgoing.length },
    { id: "pending" as const, label: "To review", count: pendingCount },
  ];

  return (
    <div className="grid gap-5">
      <StatGrid>
        <StatTile tone="card" label="Your rating" value={supplierRatingCount > 0 ? supplierRating.toFixed(1) : "—"} hint={`${supplierRatingCount} rating${supplierRatingCount === 1 ? "" : "s"} on your profile`} />
        <StatTile tone="card" label="Replied to" value={`${responseRate}%`} hint={`${stats.responded} of ${stats.total} reviews`} />
        <StatTile tone="card" label="5-star reviews" value={stats.distribution[4]} hint={`${stats.total > 0 ? Math.round((stats.distribution[4] / stats.total) * 100) : 0}% of reviews`} />
        <StatTile tone="card" label="To review" value={pendingCount} hint={`${localUnreviewedOrders.length} orders · ${localUnreviewedBookings.length} deliveries`} />
      </StatGrid>

      {stats.total > 0 && (
        <Card className="flex flex-wrap items-center gap-6 p-5">
          <div className="text-center">
            <div className="text-[36px] font-extrabold leading-none">{stats.avgRating.toFixed(1)}</div>
            <div className="mt-1.5"><Stars rating={Math.round(stats.avgRating)} size={14} /></div>
            <div className="mt-1 text-[12.5px] text-app-ink-soft">{stats.total} review{stats.total === 1 ? "" : "s"}</div>
          </div>
          <div className="grid min-w-[200px] flex-1 gap-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = stats.distribution[star - 1];
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2.5 text-[13px]">
                  <span className="w-12 shrink-0 text-app-ink-soft">{star} star</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-app-canvas">
                    <div className={cx("h-full rounded-full", star >= 4 ? "bg-app-success" : star === 3 ? "bg-[#F2A93B]" : "bg-app-danger")} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right font-bold">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div role="tablist" aria-label="Reviews" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "inline-flex min-h-[40px] items-center rounded-full border px-4 text-[14px] font-bold transition",
              tab === t.id ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
            )}
          >
            {t.label}
            <span className={cx("ml-1", tab === t.id ? "text-white" : "text-app-ink-soft")}>· {t.count}</span>
          </button>
        ))}
      </div>

      {submitError && (
        <div className="flex items-start gap-2">
          <div className="flex-1"><Notice tone="error">{submitError}</Notice></div>
          <button type="button" onClick={() => setSubmitError("")} aria-label="Close this message" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas">
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      {tab === "incoming" && (
        <div role="tabpanel" className="grid gap-3">
          {reviews.length === 0 ? (
            <EmptyState icon="star" title="No reviews yet">
              When sellers or delivery partners review your business, their reviews show up here.
            </EmptyState>
          ) : (
            reviews.map((review) => (
              <ReviewCard key={review.id} review={review} isIncoming onReply={handleReply} error={replyErrors[review.id]} />
            ))
          )}
        </div>
      )}

      {tab === "outgoing" && (
        <div role="tabpanel" className="grid gap-3">
          {localOutgoing.length === 0 ? (
            <EmptyState icon="edit" title="You haven't written any reviews">
              Open &ldquo;To review&rdquo; to rate the sellers and delivery partners you&apos;ve worked with.
            </EmptyState>
          ) : (
            localOutgoing.map((review) => (
              <ReviewCard key={review.id} review={review} isIncoming={false} onReply={async () => {}} />
            ))
          )}
        </div>
      )}

      {tab === "pending" && (
        <div role="tabpanel" className="grid gap-5">
          {pendingCount === 0 ? (
            <EmptyState icon="check" title="All caught up">
              You&apos;ve reviewed every finished order and delivery. New ones show up here.
            </EmptyState>
          ) : (
            <>
              {localUnreviewedOrders.length > 0 && (
                <section className="grid gap-3">
                  <h2 className="m-0 text-[17px] font-extrabold">Wholesale orders · {localUnreviewedOrders.length}</h2>
                  {localUnreviewedOrders.map((order) => (
                    <ReviewForm
                      key={order.id}
                      type="seller"
                      targetId={order.seller.id}
                      targetName={order.seller.name}
                      interactionId={order.id}
                      interactionLabel={`${order.supplierProduct.name} · ${fmtDate(order.createdAt)} · ₦${Math.round(order.totalPrice).toLocaleString("en-NG")}`}
                      onSubmit={(fd) => handleReviewSubmit("seller", fd)}
                    />
                  ))}
                </section>
              )}

              {localUnreviewedBookings.length > 0 && (
                <section className="grid gap-3">
                  <h2 className="m-0 text-[17px] font-extrabold">Finished deliveries · {localUnreviewedBookings.length}</h2>
                  {localUnreviewedBookings.map((booking) => (
                    <ReviewForm
                      key={booking.id}
                      type="logistics_partner"
                      targetId={booking.logisticsPartner.userId}
                      targetName={booking.logisticsPartner.displayName}
                      interactionId={booking.id}
                      interactionLabel={`${fmtDate(booking.createdAt)} · ₦${Math.round(booking.deliveryFee).toLocaleString("en-NG")} delivery fee`}
                      onSubmit={(fd) => handleReviewSubmit("logistics_partner", fd)}
                    />
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
