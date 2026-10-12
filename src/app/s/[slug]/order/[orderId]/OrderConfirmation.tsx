"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/hooks/useCart";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { ItemThumb, Panel, ShopperShell } from "@/components/storefront/shopper/ShopperShell";
import { resolveShopperTheme, type ShopperTheme } from "@/components/storefront/shopper/theme";
import { TransferInstructions, payByText, type TransferDetails } from "./TransferInstructions";
import { OrderRewardsPanel, type OrderRewards } from "@/components/storefront/gamification/Rewards";
import { shopperGameColors } from "@/components/storefront/gamification/client";

interface Props {
  order: {
    id: string;
    orderNumber: string;
    buyerName: string;
    buyerEmail: string;
    buyerPhone?: string | null;
    items: Array<{
      name: string;
      image?: string;
      quantity: number;
      price: number;
      productId?: string;
      variant?: string;
    }>;
    subtotal: number;
    shippingFee: number;
    discountAmount?: number | null;
    discountCode?: string | null;
    total: number;
    currency: string;
    status: string;
    /** null or "paystack" for Paystack checkout; "transfer" or "pay_on_delivery" otherwise. */
    paymentMethod?: string | null;
    deliveryAddress: { street?: string; city?: string; state?: string; country?: string; landmark?: string; deliveryOption?: { name?: string; estimatedDays?: string | null; pickup?: boolean } } | null;
    notes?: string | null;
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
  /** Account details while a bank-transfer order is unpaid. */
  transfer?: TransferDetails | null;
  /** Code the buyer gives the rider, once a delivery is booked. */
  deliveryCode?: string | null;
  /** Loyalty points and the post-purchase spin, when the store has them on. */
  rewards?: OrderRewards | null;
}

const PAID = ["paid", "processing", "packed", "shipped", "delivered"];

export function OrderConfirmation({ order, store, storeBasePath, transfer = null, deliveryCode = null, rewards = null }: Props) {
  const cart = useCart(store.slug);
  const theme = useMemo(() => resolveShopperTheme(store.brandSettings), [store.brandSettings]);
  const clearCart = cart.clear;

  const method = order.paymentMethod === "transfer" || order.paymentMethod === "pay_on_delivery" ? order.paymentMethod : "paystack";
  const isPaid = PAID.includes(order.status);
  const isOpen = !["cancelled", "returned", "refunded", "partially_refunded", "delivered"].includes(order.status);
  const money = (amount: number) => formatStoreMoney(Number(amount), order.currency);
  const amount = money(order.total);
  const firstName = order.buyerName.split(" ")[0] || "there";

  // Transfer and pay-on-delivery orders are placed without paying online, so the bag is done with either way.
  useEffect(() => {
    if (isPaid || method !== "paystack") clearCart();
  }, [clearCart, isPaid, method]);

  const headline = order.status === "cancelled" ? "Order cancelled" : isPaid ? `Thank you, ${firstName}` : method === "paystack" ? "Waiting for payment" : `Thank you, ${firstName}`;
  const subline = order.status === "cancelled"
    ? "This order was cancelled. Contact the store if you think this is a mistake."
    : isPaid
      ? `Your order is confirmed. We've sent the details to ${order.buyerEmail}.`
      : method === "transfer"
        ? transfer?.payBy
          ? `Your order is placed. Send your bank transfer below by ${payByText(transfer.payBy)} (Lagos time), or the order is cancelled and its items go back on sale. The store confirms it once the money arrives.`
          : "Your order is placed. Send your bank transfer below. The store confirms it once the money arrives."
        : method === "pay_on_delivery"
          ? `Your order is placed. You pay ${amount} when it arrives.`
          : "We haven't received your payment yet. If you paid, this page updates once Paystack confirms it.";

  const address = order.deliveryAddress;
  const option = address?.deliveryOption;
  const pointsOff = rewards?.loyalty?.usedValue ?? 0;
  const productDiscount = Math.max(0, Number(order.discountAmount ?? 0) - pointsOff);

  return (
    <ShopperShell theme={theme} storeName={store.name} logoUrl={store.logoUrl} basePath={storeBasePath} title="Order">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] xl:gap-12">
        <div className="grid min-w-0 gap-5">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold" style={isPaid ? { background: "#E7F5EC", color: "#14532D" } : { background: "#FFF4E0", color: "#7A4A00" }}>
              <Icon name={isPaid ? "checkCircle" : "clock"} size={14} /> {isPaid ? "Payment confirmed" : order.status === "cancelled" ? "Cancelled" : "Order received"}
            </span>
            <h1 className="mt-3 text-[30px] font-semibold leading-tight sm:text-[36px]" style={{ fontFamily: theme.heading }}>{headline}</h1>
            <p className="mt-2 max-w-[60ch] text-[15.5px] leading-7" style={{ color: theme.muted }} suppressHydrationWarning>{subline}</p>
            <p className="mt-2 text-[14px]">Order number <strong className="tabular-nums">{order.orderNumber}</strong></p>
          </div>

          <NextSteps
            theme={theme}
            method={method}
            isPaid={isPaid}
            isOpen={isOpen}
            amount={amount}
            orderId={order.id}
            currency={order.currency}
            transfer={transfer}
            deliveryCode={deliveryCode}
          />

          {rewards && (rewards.loyalty || rewards.postPurchase) && order.status !== "cancelled" ? (
            <OrderRewardsPanel rewards={rewards} storeSlug={store.slug} orderId={order.id} currency={order.currency} colors={shopperGameColors(theme)} />
          ) : null}

          <Panel theme={theme} className="p-5" aria-labelledby="whats-next">
            <h2 id="whats-next" className="text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>What happens next</h2>
            <Timeline theme={theme} status={order.status} createdAt={order.createdAt} shippedAt={order.shippedAt} deliveredAt={order.deliveredAt} isPaid={isPaid} method={method} />
            <p className="mt-4 text-[13.5px] leading-6" style={{ color: theme.muted }}>
              Keep your order number. You can come back to this page any time, or use <strong>Track an order</strong> in the store menu with your email or phone.
            </p>
            {order.trackingCode ? (
              <p className="mt-3 rounded-[14px] px-4 py-3 text-[14px]" style={{ background: theme.paper }}>
                Tracking code <strong className="tabular-nums">{order.trackingCode}</strong>
                {order.logisticsDetails?.type === "pickup" ? <><br /><span style={{ color: theme.muted }}>You chose to pick up. Contact the store to arrange collection.</span></> : null}
              </p>
            ) : null}
          </Panel>

          {isPaid && order.items.some((item) => item.productId) ? (
            <section aria-labelledby="review-heading" className="grid gap-3">
              <h2 id="review-heading" className="text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>Tell others what you think</h2>
              {order.items.filter((item) => item.productId).map((item, idx) => (
                <ReviewForm key={`${item.productId}-${idx}`} item={item} storeSlug={store.slug} orderId={order.id} buyerName={order.buyerName} buyerEmail={order.buyerEmail} />
              ))}
            </section>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Link href={getPublicStorefrontPath(storeBasePath, "/")} className="inline-flex min-h-12 items-center rounded-full px-7 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: theme.cta, color: theme.ctaText }}>
              Continue shopping
            </Link>
          </div>
        </div>

        <Panel theme={theme} as="aside" className="grid gap-4 p-5 lg:sticky lg:top-24" aria-label="Order summary">
          <h2 className="text-[17px] font-semibold" style={{ fontFamily: theme.heading }}>Order summary</h2>
          <ul className="m-0 grid list-none gap-3 p-0">
            {order.items.map((item, idx) => (
              <li key={`${item.name}-${idx}`} className="flex items-center gap-3">
                <ItemThumb theme={theme} src={item.image} alt="" size={52} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{item.name}</span>
                  <span className="block text-[12.5px]" style={{ color: theme.muted }}>Qty {item.quantity}</span>
                </span>
                <span className="text-[14px] font-medium tabular-nums">{money(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="grid gap-2 border-t pt-4 text-[14.5px]" style={{ borderColor: theme.border }}>
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="m-0 tabular-nums">{money(order.subtotal)}</dd></div>
            {productDiscount > 0 ? <div className="flex justify-between"><dt>Discount{order.discountCode ? ` (${order.discountCode})` : ""}</dt><dd className="m-0 tabular-nums">−{money(productDiscount)}</dd></div> : null}
            {pointsOff > 0 ? <div className="flex justify-between"><dt>Loyalty points</dt><dd className="m-0 tabular-nums">−{money(pointsOff)}</dd></div> : null}
            <div className="flex justify-between"><dt>Delivery</dt><dd className="m-0 tabular-nums">{Number(order.shippingFee) === 0 ? "Free" : money(order.shippingFee)}</dd></div>
            <div className="mt-1 flex justify-between border-t pt-3 text-[17px] font-semibold" style={{ borderColor: theme.border }}><dt>Total</dt><dd className="m-0 tabular-nums">{amount}</dd></div>
          </dl>
          {address ? (
            <div className="border-t pt-4 text-[14px] leading-6" style={{ borderColor: theme.border }}>
              <h3 className="text-[13.5px] font-semibold" style={{ color: theme.muted }}>Delivering to</h3>
              <p>{order.buyerName}<br />{[address.street, address.city, address.state].filter(Boolean).join(", ")}{address.landmark ? <><br />Near {address.landmark}</> : null}</p>
              {option?.name ? <p style={{ color: theme.muted }}>{option.name}{option.estimatedDays ? ` · ${option.estimatedDays}` : ""}</p> : null}
            </div>
          ) : null}
          {order.notes ? (
            <div className="border-t pt-4 text-[14px] leading-6" style={{ borderColor: theme.border }}>
              <h3 className="text-[13.5px] font-semibold" style={{ color: theme.muted }}>Your note</h3>
              <p className="whitespace-pre-line">{order.notes}</p>
            </div>
          ) : null}
        </Panel>
      </div>
    </ShopperShell>
  );
}

function Timeline({ theme, status, createdAt, shippedAt, deliveredAt, isPaid, method }: { theme: ShopperTheme; status: string; createdAt: string; shippedAt?: string | null; deliveredAt?: string | null; isPaid: boolean; method: string }) {
  const date = (value?: string | null) => (value ? new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short" }) : null);
  const steps = [
    { label: "Order placed", done: true, when: date(createdAt) },
    { label: method === "pay_on_delivery" ? "Pay when it arrives" : "Payment confirmed", done: isPaid, when: null },
    { label: "Being prepared", done: ["processing", "packed", "shipped", "delivered"].includes(status), when: null },
    { label: "On the way", done: ["shipped", "delivered"].includes(status), when: date(shippedAt) },
    { label: "Delivered", done: status === "delivered", when: date(deliveredAt) },
  ];
  return (
    <ol className="m-0 mt-4 grid list-none gap-0 p-0">
      {steps.map((step, index) => (
        <li key={step.label} className="flex gap-3">
          <span className="flex w-5 flex-col items-center">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: step.done ? theme.cta : theme.border, color: theme.ctaText }}>
              {step.done ? <Icon name="check" size={11} /> : null}
            </span>
            {index < steps.length - 1 ? <span className="w-0.5 flex-1" style={{ background: step.done ? theme.cta : theme.border, minHeight: 18 }} /> : null}
          </span>
          <span className="pb-4 text-[14.5px]" style={{ color: step.done ? theme.ink : theme.muted, fontWeight: step.done ? 600 : 400 }}>
            {step.label}{step.when ? <span className="font-normal" style={{ color: theme.muted }}> · {step.when}</span> : null}
            <span className="sr-only">{step.done ? " (done)" : " (not yet)"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function NextSteps({ theme, method, isPaid, isOpen, amount, orderId, currency, transfer, deliveryCode }: {
  theme: ShopperTheme;
  method: "paystack" | "transfer" | "pay_on_delivery";
  isPaid: boolean;
  isOpen: boolean;
  amount: string;
  orderId: string;
  currency: string;
  transfer: TransferDetails | null;
  deliveryCode: string | null;
}) {
  const blocks: React.ReactNode[] = [];

  if (method === "transfer" && !isPaid && isOpen) {
    blocks.push(transfer
      ? <TransferInstructions key="transfer" orderId={orderId} currency={currency} details={transfer} ctaBg={theme.cta} ctaText={theme.ctaText} />
      : (
        <Panel key="transfer" theme={theme} className="p-5">
          <h2 className="text-[18px] font-semibold">Pay by bank transfer</h2>
          <p className="mt-1 text-[14.5px] leading-6" style={{ color: theme.muted }}>The store will send you their account details. Send exactly {amount} and use your order number as the reference.</p>
        </Panel>
      ));
  } else if (method === "pay_on_delivery" && !isPaid && isOpen) {
    blocks.push(
      <Panel key="pod" theme={theme} className="p-5">
        <h2 className="text-[18px] font-semibold">Have {amount} ready</h2>
        <p className="mt-1 text-[14.5px] leading-6" style={{ color: theme.muted }}>Pay the rider in cash or by transfer when your order arrives. Check your items before you pay.</p>
      </Panel>,
    );
  }

  if (deliveryCode && isOpen) {
    blocks.push(
      <Panel key="code" theme={theme} className="p-5" aria-labelledby="delivery-code-heading">
        <h2 id="delivery-code-heading" className="text-[18px] font-semibold">Your delivery code</h2>
        <p className="mt-1 text-[14.5px]" style={{ color: theme.muted }}>Give this code to the rider only when you have your order.</p>
        <p className="mt-2 font-mono text-[28px] font-bold tracking-[0.2em]">{deliveryCode}</p>
      </Panel>,
    );
  }

  if (blocks.length === 0) return null;
  return <div className="grid gap-4">{blocks}</div>;
}

function Stars({ rating, onChange }: { rating: number; onChange: (r: number) => void }) {
  return (
    <span role="radiogroup" aria-label="Your rating" className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={rating === star}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          onClick={() => onChange(star)}
          className="grid h-10 w-10 place-items-center rounded-full text-[24px] leading-none focus-visible:outline focus-visible:outline-2"
          style={{ color: star <= rating ? "#C9A96E" : "#E0DCD5" }}
        >
          ★
        </button>
      ))}
    </span>
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
      setError(typeof data?.error === "string" ? data.error : data?.error?.message ?? "Couldn't send your review. Try again.");
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
        <Stars rating={rating} onChange={setRating} />
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
