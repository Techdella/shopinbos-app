"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/hooks/useCart";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";

interface Props {
  order: {
    id: string;
    orderNumber: string;
    buyerName: string;
    buyerEmail: string;
    items: Array<{
      name: string;
      image?: string;
      quantity: number;
      price: number;
      productId?: string;
    }>;
    subtotal: number;
    shippingFee: number;
    total: number;
    currency: string;
    status: string;
    deliveryAddress: { street?: string; city?: string; state?: string } | null;
    createdAt: string;
    trackingCode?: string | null;
    logisticsDetails?: Record<string, unknown> | null;
    shippedAt?: string | null;
    deliveredAt?: string | null;
  };
  store: {
    name: string;
    slug: string;
    logoUrl?: string | null;
    currency: string;
    brandSettings: any;
  };
  storeBasePath: string;
}

function Stars({ rating, interactive = false, onChange }: {
  rating: number;
  interactive?: boolean;
  onChange?: (r: number) => void;
}) {
  return (
    <span style={{ fontSize: 22, lineHeight: 1, cursor: interactive ? "pointer" : "default" }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} onClick={() => interactive && onChange?.(star)}
          style={{ color: star <= rating ? "#c9a96e" : "#e0dcd5", transition: "color .15s" }}>
          ★
        </span>
      ))}
    </span>
  );
}

export function OrderConfirmation({ order, store, storeBasePath }: Props) {
  const cart = useCart(store.slug);
  const palette = store.brandSettings?.palette ?? {};
  const ctaBg = palette.ctaBg ?? "#73D8C8";
  const ctaText = palette.ctaText ?? "#0E2A38";
  const heroBg = palette.heroBg ?? "#0E2A38";
  const heroText = palette.heroText ?? "#F4F1EA";
  const paperBg = palette.paperBg ?? "#FAF7F1";

  useEffect(() => {
    if (["paid", "processing", "packed", "shipped", "delivered"].includes(order.status)) cart.clear();
  }, [cart, order.status]);

  const isPaid = ["paid", "processing", "packed", "shipped", "delivered"].includes(order.status);

  function statusColor(status: string): { bg: string; text: string } {
    if (["paid", "processing", "packed"].includes(status)) return { bg: "#fef3c7", text: "#92400e" };
    if (["shipped", "delivered"].includes(status)) return { bg: "#d1fae5", text: "#065f46" };
    if (status === "cancelled") return { bg: "#fee2e2", text: "#991b1b" };
    return { bg: "#fef3c7", text: "#92400e" };
  }

  return (
    <div style={{ background: paperBg, minHeight: "100vh", fontFamily: "var(--font-space-grotesk, sans-serif)" }}>
      <nav style={{ background: heroBg, padding: "0 24px", display: "flex", alignItems: "center", height: 60 }}>
        <Link href={getPublicStorefrontPath(storeBasePath, "/")} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          {store.logoUrl && <img src={store.logoUrl} alt={store.name} style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }} />}
          <span style={{ color: heroText, fontWeight: 700, fontSize: 17 }}>{store.name}</span>
        </Link>
      </nav>

      <div style={{ maxWidth: 580, margin: "0 auto", padding: "60px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div className="inline-flex rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.14em]" style={{ background: isPaid ? "#d1fae5" : "#fef3c7", color: isPaid ? "#065f46" : "#92400e" }}>
            {isPaid ? "Payment confirmed" : "Order received"}
          </div>
          <h1 style={{ margin: "16px 0 8px", fontSize: 28, fontWeight: 800, color: "#0E2A38" }}>{isPaid ? "Order Confirmed" : "Order Received"}</h1>
          <p style={{ margin: 0, color: "#6E6E68", fontSize: 16 }}>
            {isPaid ? `Thanks, ${order.buyerName.split(" ")[0]}. A confirmation has been sent to ${order.buyerEmail}.` : "Your order is being processed. Payment will be confirmed shortly."}
          </p>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 1px 6px rgba(14,42,56,0.08)", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", background: "#f4f1ea", borderBottom: "1px solid rgba(14,42,56,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#6E6E68", textTransform: "uppercase", letterSpacing: "0.1em" }}>Order Number</p>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0E2A38" }}>{order.orderNumber}</p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: statusColor(order.status).bg, color: statusColor(order.status).text }}>
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </span>
          </div>

          <div style={{ padding: "20px" }}>
            <div style={{ marginBottom: 20 }}>
              {order.items.map((item, idx) => (
                <div key={`${item.name}-${idx}`} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: "#f4f1ea", overflow: "hidden", flexShrink: 0 }}>
                    {item.image
                      ? <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#6E6E68", textTransform: "uppercase", letterSpacing: "0.12em" }}>Item</div>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#0E2A38" }}>{item.name}</p>
                    <p style={{ margin: 0, fontSize: 13, color: "#6E6E68" }}>Qty: {item.quantity}</p>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#0E2A38" }}>{order.currency} {(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px solid rgba(14,42,56,0.08)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6E6E68" }}><span>Subtotal</span><span>{order.currency} {Number(order.subtotal).toLocaleString()}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6E6E68" }}><span>Shipping</span><span>{Number(order.shippingFee) === 0 ? "Free" : `${order.currency} ${Number(order.shippingFee).toLocaleString()}`}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "#0E2A38", marginTop: 4 }}><span>Total</span><span>{order.currency} {Number(order.total).toLocaleString()}</span></div>
            </div>

            {order.deliveryAddress && (
              <div style={{ marginTop: 20, padding: 14, background: "#f9f9f7", borderRadius: 10 }}>
                <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, color: "#6E6E68", textTransform: "uppercase", letterSpacing: "0.1em" }}>Delivery To</p>
                <p style={{ margin: 0, fontSize: 14, color: "#0E2A38" }}>{[order.deliveryAddress.street, order.deliveryAddress.city, order.deliveryAddress.state].filter(Boolean).join(", ")}</p>
              </div>
            )}

            {order.trackingCode && (
              <div style={{ marginTop: 20, padding: 14, background: "#f9f9f7", borderRadius: 10 }}>
                <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, color: "#6E6E68", textTransform: "uppercase", letterSpacing: "0.1em" }}>Tracking Code</p>
                <p style={{ margin: 0, fontSize: 14, color: "#0E2A38", fontWeight: 700 }}>{order.trackingCode}</p>
                {order.logisticsDetails?.type === "pickup" && (
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6E6E68" }}>You selected buyer pickup. Contact the seller to arrange collection.</p>
                )}
              </div>
            )}

            {["paid", "processing", "packed", "shipped", "delivered"].includes(order.status) && (
              <div style={{ marginTop: 20 }}>
                <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 600, color: "#6E6E68", textTransform: "uppercase", letterSpacing: "0.1em" }}>Order Timeline</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {[
                    { label: "Order placed", done: true, time: order.createdAt },
                    { label: "Payment confirmed", done: ["paid", "processing", "packed", "shipped", "delivered"].includes(order.status), time: null },
                    { label: "Processing", done: ["processing", "packed", "shipped", "delivered"].includes(order.status), time: null },
                    { label: "Shipped", done: ["shipped", "delivered"].includes(order.status), time: order.shippedAt || null },
                    { label: "Delivered", done: order.status === "delivered", time: order.deliveredAt || null },
                  ].map((step, i, arr) => (
                    <div key={step.label} style={{ display: "flex", gap: 12 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20 }}>
                        <div style={{ width: 12, height: 12, borderRadius: "50%", background: step.done ? "#059669" : "#e0dcd5", flexShrink: 0 }} />
                        {i < arr.length - 1 && <div style={{ width: 2, flex: 1, background: step.done ? "#059669" : "#e0dcd5" }} />}
                      </div>
                      <div style={{ paddingBottom: i < arr.length - 1 ? 16 : 0 }}>
                        <div style={{ fontSize: 13, fontWeight: step.done ? 600 : 400, color: step.done ? "#065f46" : "#9ca3af" }}>{step.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {isPaid ? (
          <div style={{ marginTop: 28 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0E2A38", margin: "0 0 16px" }}>Review Your Purchase</h3>
            {order.items.filter((i) => i.productId).map((item, idx) => (
              <ReviewForm key={item.productId ?? idx} item={item} storeSlug={store.slug} orderId={order.id} buyerName={order.buyerName} buyerEmail={order.buyerEmail} />
            ))}
          </div>
        ) : null}

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <Link href={getPublicStorefrontPath(storeBasePath, "/")} style={{ display: "inline-block", background: ctaBg, color: ctaText, borderRadius: 999, padding: "13px 32px", fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

function ReviewForm({ item, storeSlug, orderId, buyerName, buyerEmail }: {
  item: { name: string; image?: string; productId?: string };
  storeSlug: string;
  orderId: string;
  buyerName: string;
  buyerEmail: string;
}) {
  if (!item.productId) return null;
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) { setError("Please select a rating"); return; }
    setError("");

    const res = await fetch(`/api/public/store/${storeSlug}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: item.productId,
        orderId,
        buyerName,
        buyerEmail,
        rating,
        title,
        body,
      }),
    });

    if (res.ok) {
      setSubmitted(true);
    } else {
      const data = await res.json();
      setError(data?.error ?? "Failed to submit review");
    }
  }

  if (submitted) {
    return (
      <div style={{ padding: 16, background: "#d1fae5", borderRadius: 10, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, color: "#065f46", marginBottom: 4 }}>Review submitted!</div>
        <p style={{ margin: 0, fontSize: 13, color: "#065f46" }}>Thanks for reviewing {item.name}. It will be published after moderation.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: "0 1px 4px rgba(14,42,56,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 6, background: "#f4f1ea", overflow: "hidden", flexShrink: 0 }}>
          {item.image ? <img src={item.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
        </div>
        <span style={{ fontWeight: 600, fontSize: 14, color: "#0E2A38" }}>{item.name}</span>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Stars rating={rating} interactive onChange={setRating} />
      </div>
      {error ? <div style={{ fontSize: 12, color: "#c0392b", marginBottom: 8 }}>{error}</div> : null}
      <input type="text" placeholder="Review title (optional)" value={title} onChange={(e) => setTitle(e.target.value)}
        style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #e0dcd5", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
      <textarea placeholder="Tell others about your experience..." value={body} onChange={(e) => setBody(e.target.value)}
        style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #e0dcd5", fontSize: 13, minHeight: 64, resize: "vertical", boxSizing: "border-box", marginBottom: 10 }} />
      <button type="submit"
        style={{ background: "#c9a96e", color: "white", border: "none", borderRadius: 6, padding: "8px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
        Submit Review
      </button>
    </form>
  );
}
