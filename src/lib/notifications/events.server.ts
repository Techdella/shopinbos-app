import "server-only";
import { db } from "@/lib/db/client";
import { notify, notifyAdmins, notifyRider } from "./notify.server";

// The notifications each role needs that weren't sent before notify(): written once here and called from where the
// thing happens (checkout, the Paystack webhook, delivery jobs, quotes, reviews, campaigns, admin decisions).
// Every helper never throws, so a notification problem can't break the action that triggered it.

function naira(amount: number, currency = "NGN") {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-NG")}`;
  }
}

function short(text: string | null | undefined, max = 60) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function safely(label: string, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    console.error(`[notify] ${label}`, error);
  }
}

// ─── Sellers ──────────────────────────────────────────────────────────────────

/** Checkout: the seller's "New order" (the order email is sent separately by the checkout route). */
export function notifyNewOrder(input: { sellerId: string; orderId: string; orderNumber: string; description: string; paymentMethod?: string | null }) {
  return safely("new order", () =>
    notify({
      userId: input.sellerId,
      event: "order.new",
      type: "order",
      title: `New order ${input.orderNumber}`,
      description: input.description,
      link: `/home/orders/${input.orderId}`,
      actionLabel: "Open the order",
      metadata: { orderId: input.orderId, paymentMethod: input.paymentMethod ?? null },
      dedupeKey: `order.new:${input.orderId}`,
    }),
  );
}

/** Card payment confirmed (Paystack webhook). */
export function notifyOrderPaid(orderId: string) {
  return safely("order paid", async () => {
    const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true, total: true, currency: true, buyerName: true, depositKobo: true, balanceKobo: true, store: { select: { userId: true } } } });
    if (!order) return;
    // A preorder deposit (shared/preorder.ts): reserved now, the rest is asked for when the seller says the stock is ready.
    const deposit = order.depositKobo > 0 && order.balanceKobo > 0;
    await notify({
      userId: order.store.userId,
      event: "order.paid",
      type: "payout",
      priority: "success",
      title: deposit ? `Pre-order deposit paid: ${order.orderNumber}` : `Payment received for ${order.orderNumber}`,
      description: deposit
        ? `${short(order.buyerName) || "Your customer"} paid a deposit of ${naira(order.depositKobo / 100, order.currency)} by card. They pay the rest (${naira(order.balanceKobo / 100, order.currency)}) when you say the stock is ready in My shop › Preorders.`
        : `${short(order.buyerName) || "Your customer"} paid ${naira(order.total, order.currency)} by card. Get the order ready.`,
      link: `/home/orders/${order.id}`,
      actionLabel: "Open the order",
      metadata: { orderId: order.id },
      dedupeKey: `order.paid:${order.id}`,
    });
  });
}

/** After a sale: products that are now low or sold out (once a day each). */
export function notifyStockAfterSale(storeId: string, productIds: string[]) {
  return safely("stock", async () => {
    const ids = [...new Set(productIds)].slice(0, 30);
    if (!ids.length) return;
    const [store, products] = await Promise.all([
      db.store.findUnique({ where: { id: storeId }, select: { userId: true } }),
      db.storeProduct.findMany({ where: { id: { in: ids }, storeId, inventoryType: "seller", trackStock: true }, select: { id: true, name: true, currentStock: true, lowStockThreshold: true } }),
    ]);
    if (!store) return;
    const day = new Date().toISOString().slice(0, 10);
    for (const product of products) {
      if (product.currentStock > product.lowStockThreshold) continue;
      const out = product.currentStock <= 0;
      await notify({
        userId: store.userId,
        event: out ? "stock.out" : "stock.low",
        type: "inventory",
        priority: out ? "critical" : "warning",
        title: out ? `${short(product.name)} is sold out` : `${short(product.name)} is running low`,
        description: out ? "Customers can't buy it until you add more stock." : `Only ${product.currentStock} left. Restock soon so you don't miss sales.`,
        link: `/products/${product.id}`,
        actionLabel: "Restock",
        metadata: { productId: product.id },
        dedupeKey: `${out ? "stock.out" : "stock.low"}:${product.id}:${day}`,
      });
    }
  });
}

/** Buyer reviews saved from a review link or the shop. */
export function notifyReviewsSaved(input: { storeId: string; orderId: string; count: number; rating?: number | null; buyerName?: string | null }) {
  return safely("review", async () => {
    if (input.count < 1) return;
    const store = await db.store.findUnique({ where: { id: input.storeId }, select: { userId: true } });
    if (!store) return;
    const who = short(input.buyerName, 40) || "A customer";
    await notify({
      userId: store.userId,
      event: "review.new",
      type: "marketing",
      priority: input.rating && input.rating <= 2 ? "warning" : "success",
      title: input.rating ? `${who} left a ${input.rating}-star review` : `${who} left ${input.count} reviews`,
      description: input.rating && input.rating <= 2 ? "Reply kindly and offer to help. Other shoppers read your replies." : "Say thanks with a short reply. It helps new customers trust you.",
      link: "/home/reviews",
      actionLabel: "Reply",
      metadata: { orderId: input.orderId },
      dedupeKey: `review.new:${input.orderId}:${input.count}`,
    });
  });
}

/** A marketing campaign finished sending. */
export function notifyCampaignFinished(campaignId: string) {
  return safely("campaign", async () => {
    const campaign = await db.broadcastCampaign.findUnique({ where: { id: campaignId }, select: { id: true, name: true, channel: true, sentCount: true, store: { select: { userId: true } } } });
    if (!campaign) return;
    const how = campaign.channel === "sms" ? "texts" : campaign.channel === "whatsapp" ? "WhatsApp messages" : "emails";
    await notify({
      userId: campaign.store.userId,
      event: "campaign.finished",
      type: "marketing",
      priority: "success",
      title: `"${short(campaign.name, 50)}" has been sent`,
      description: `${campaign.sentCount.toLocaleString("en-NG")} ${how} went out. Check back later to see opens and sales.`,
      link: `/home/marketing/campaigns/${campaign.id}`,
      actionLabel: "See results",
      metadata: { campaignId: campaign.id },
      dedupeKey: `campaign.finished:${campaign.id}`,
    });
  });
}

/** A supplier answered the seller's quote request. */
export function notifySupplierQuoteAnswered(quoteId: string) {
  return safely("supplier quote answered", async () => {
    const quote = await db.supplierQuoteRequest.findUnique({
      where: { id: quoteId },
      select: { id: true, status: true, quantity: true, quotedPrice: true, sellerId: true, supplierProductId: true, supplier: { select: { displayName: true } }, supplierProduct: { select: { name: true, currency: true } } },
    });
    if (!quote || (quote.status !== "responded" && quote.status !== "rejected")) return;
    const supplier = short(quote.supplier.displayName, 40) || "The supplier";
    const product = short(quote.supplierProduct?.name, 50) || "your request";
    await notify({
      userId: quote.sellerId,
      event: "quote.received",
      type: "suppliers",
      priority: quote.status === "responded" ? "success" : "info",
      title: quote.status === "responded" ? `${supplier} sent you a price` : `${supplier} can't quote this time`,
      description:
        quote.status === "responded" && quote.quotedPrice != null
          ? `${naira(quote.quotedPrice, quote.supplierProduct?.currency ?? "NGN")} each for ${quote.quantity.toLocaleString("en-NG")} × ${product}.`
          : `They declined your request for ${product}. Try another supplier.`,
      // ?quote= lets the phone app open its Wholesale screen (price requests and orders); the web shows the product.
      link: quote.supplierProductId ? `/marketplace/product/${quote.supplierProductId}?quote=${quote.id}` : `/marketplace/wholesale?quote=${quote.id}`,
      actionLabel: quote.status === "responded" ? "See the price" : "Find another supplier",
      metadata: { supplierQuoteId: quote.id },
      dedupeKey: `quote.received:${quote.id}`,
      email: true,
    });
  });
}

/** A delivery partner answered the seller's delivery quote request. */
export function notifyDeliveryQuoteAnswered(quoteId: string) {
  return safely("delivery quote answered", async () => {
    const quote = await db.deliveryQuoteRequest.findUnique({ where: { id: quoteId }, select: { id: true, status: true, quotedPrice: true, destination: true, sellerId: true, logisticsPartner: { select: { displayName: true } } } });
    if (!quote || (quote.status !== "responded" && quote.status !== "rejected")) return;
    const partner = short(quote.logisticsPartner.displayName, 40) || "The delivery company";
    await notify({
      userId: quote.sellerId,
      event: "delivery.quote",
      type: "logistics",
      priority: quote.status === "responded" ? "success" : "info",
      title: quote.status === "responded" ? `${partner} sent a delivery price` : `${partner} can't deliver there`,
      description: quote.status === "responded" && quote.quotedPrice != null ? `${naira(quote.quotedPrice)} to ${short(quote.destination)}. Accept it to book the delivery.` : `They can't take the delivery to ${short(quote.destination)}. Try another delivery company.`,
      link: "/home/logistics",
      actionLabel: quote.status === "responded" ? "See the price" : "Find another",
      metadata: { deliveryQuoteId: quote.id },
      dedupeKey: `delivery.quote:${quote.id}`,
    });
  });
}

/** A delivery job moved: the seller hears about pickups, deliveries and problems; the rider about cancellations. */
export function notifyJobMoved(input: { bookingId: string; to: string; actor: string; codCollected?: number | null }) {
  return safely("job moved", async () => {
    const job = await db.deliveryBooking.findUnique({
      where: { id: input.bookingId },
      select: { id: true, sellerId: true, orderId: true, riderId: true, destination: true, codAmount: true, currency: true, failedReason: true, declineReason: true, logisticsPartner: { select: { displayName: true } } },
    });
    if (!job) return;
    const partner = short(job.logisticsPartner.displayName, 40) || "The delivery company";
    const order = job.orderId ? await db.retailOrder.findUnique({ where: { id: job.orderId }, select: { orderNumber: true } }) : null;
    const what = order ? `order ${order.orderNumber}` : `the delivery to ${short(job.destination, 40)}`;
    const link = job.orderId ? `/home/orders/${job.orderId}` : "/home/logistics";
    const words: Record<string, { title: string; description: string; priority: "info" | "success" | "warning" | "critical" } | undefined> = {
      confirmed: { title: `${partner} accepted ${what}`, description: "A rider will be assigned to pick it up.", priority: "info" },
      picked_up: { title: `Rider picked up ${what}`, description: `${partner} has it and is on the way.`, priority: "info" },
      delivered: { title: `${what.charAt(0).toUpperCase()}${what.slice(1)} was delivered`, description: `${partner} dropped it off.`, priority: "success" },
      failed: { title: `Delivery problem with ${what}`, description: job.failedReason ? `${partner}: "${short(job.failedReason, 140)}". Call your customer, then ask for another try.` : `${partner} couldn't deliver it. Call your customer, then ask for another try.`, priority: "critical" },
      cancelled: input.actor === "shop" ? undefined : { title: `${partner} cancelled ${what}`, description: "Book another delivery company for it.", priority: "warning" },
      // Logistics marketplace steps (shared/delivery-market.ts).
      declined: { title: `${partner} declined ${what}`, description: `${job.declineReason ? `"${short(job.declineReason, 120)}". ` : ""}Send it to another of your delivery partners.`, priority: "critical" },
      out_for_delivery: { title: `${what.charAt(0).toUpperCase()}${what.slice(1)} is out for delivery`, description: `${partner} is taking it to your customer now.`, priority: "info" },
      at_pickup_point: { title: `${what.charAt(0).toUpperCase()}${what.slice(1)} is at the pickup point`, description: "Your customer can collect it now.", priority: "info" },
      returning: { title: `${what.charAt(0).toUpperCase()}${what.slice(1)} is coming back to you`, description: `${partner} is returning it. Their return fee applies.`, priority: "warning" },
      returned: { title: `${what.charAt(0).toUpperCase()}${what.slice(1)} was returned`, description: `${partner} brought it back.`, priority: "info" },
    };
    const note = words[input.to];
    if (note && input.actor !== "shop") {
      await notify({ userId: job.sellerId, event: "delivery.update", type: "logistics", priority: note.priority, title: note.title, description: note.description, link, metadata: { bookingId: job.id, status: input.to }, dedupeKey: `delivery.${input.to}:${job.id}`, email: input.to === "failed" || input.to === "declined" });
    }
    // Paid at the door: money in for the seller.
    if (input.to === "delivered" && job.codAmount && (input.codCollected ?? 0) > 0) {
      await notify({
        userId: job.sellerId,
        event: "order.cod_paid",
        type: "payout",
        priority: "success",
        title: `${naira(input.codCollected ?? job.codAmount, job.currency)} paid on delivery`,
        description: `Your customer paid the rider for ${what}. ${partner} pays it in to Shopinbos, then it comes to you.`,
        link,
        metadata: { bookingId: job.id },
        dedupeKey: `order.cod_paid:${job.id}`,
      });
    }
    if (input.to === "cancelled" && job.riderId && input.actor !== "rider") {
      await notifyRider({ riderId: job.riderId, event: "rider.job_cancelled", title: "A job was cancelled", body: `Don't go for the delivery to ${short(job.destination, 50)}. It was cancelled.`, route: "/rider", dedupeKey: `cancelled:${job.id}` });
    }
  });
}

/** A rider got a job (and the rider who had it before was told it moved). */
export function notifyRiderAssigned(input: { bookingId: string; riderId: string | null; previousRiderId: string | null }) {
  return safely("rider assigned", async () => {
    if (input.riderId === input.previousRiderId) return;
    const job = await db.deliveryBooking.findUnique({ where: { id: input.bookingId }, select: { id: true, pickupLocation: true, destination: true, codAmount: true, currency: true } });
    if (!job) return;
    if (input.riderId) {
      const collect = job.codAmount && job.codAmount > 0 ? ` Collect ${naira(job.codAmount, job.currency)}.` : "";
      await notifyRider({ riderId: input.riderId, event: "rider.job_assigned", title: "New job for you", body: `Pick up at ${short(job.pickupLocation, 50)}, deliver to ${short(job.destination, 50)}.${collect}`, route: "/rider", dedupeKey: `assigned:${job.id}:${input.riderId}` });
    }
    if (input.previousRiderId) {
      await notifyRider({ riderId: input.previousRiderId, event: "rider.job_changed", title: "A job was given to another rider", body: `You don't need to do the delivery to ${short(job.destination, 50)} any more.`, route: "/rider", dedupeKey: `unassigned:${job.id}:${input.previousRiderId}` });
    }
  });
}

// ─── Delivery partners ────────────────────────────────────────────────────────

/** A new job (booking) for a delivery partner. */
export function notifyJobOffered(input: { bookingId: string; logisticsPartnerId: string; fromQuote?: boolean }) {
  return safely("job offered", async () => {
    const [partner, job] = await Promise.all([
      db.logisticsPartner.findUnique({ where: { id: input.logisticsPartnerId }, select: { userId: true } }),
      db.deliveryBooking.findUnique({ where: { id: input.bookingId }, select: { id: true, pickupLocation: true, destination: true, deliveryFee: true, currency: true, codAmount: true } }),
    ]);
    if (!partner || !job) return;
    const cod = job.codAmount && job.codAmount > 0 ? ` Collect ${naira(job.codAmount, job.currency)} from the customer.` : "";
    await notify({
      userId: partner.userId,
      event: input.fromQuote ? "job.quote_accepted" : "job.new",
      type: "logistics",
      priority: "warning",
      title: input.fromQuote ? `Your price was accepted: ${naira(job.deliveryFee, job.currency)}` : `New job: ${naira(job.deliveryFee, job.currency)}`,
      description: `${short(job.pickupLocation, 50)} to ${short(job.destination, 50)}.${cod} Accept it and pick a rider.`,
      link: `/logistics/bookings?job=${job.id}`,
      actionLabel: "See the job",
      metadata: { bookingId: job.id },
      dedupeKey: `job.new:${job.id}`,
      email: true,
    });
  });
}

/** A seller asked a delivery partner for a price. */
export function notifyDeliveryQuoteRequested(quoteId: string) {
  return safely("delivery quote requested", async () => {
    const quote = await db.deliveryQuoteRequest.findUnique({ where: { id: quoteId }, select: { id: true, pickupLocation: true, destination: true, logisticsPartner: { select: { userId: true } } } });
    if (!quote) return;
    await notify({
      userId: quote.logisticsPartner.userId,
      event: "job.new",
      type: "logistics",
      priority: "info",
      title: "A shop wants a delivery price",
      description: `${short(quote.pickupLocation, 50)} to ${short(quote.destination, 50)}. Send your price.`,
      link: "/logistics/quotes",
      actionLabel: "Send a price",
      metadata: { deliveryQuoteId: quote.id },
      dedupeKey: `delivery.quote_request:${quote.id}`,
    });
  });
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

/** A seller asked a supplier for a price (marketplace API). */
export function notifySupplierQuoteRequested(quoteId: string) {
  return safely("supplier quote requested", async () => {
    const quote = await db.supplierQuoteRequest.findUnique({ where: { id: quoteId }, select: { id: true, quantity: true, supplier: { select: { userId: true } }, supplierProduct: { select: { name: true } } } });
    if (!quote) return;
    await notify({
      userId: quote.supplier.userId,
      event: "quote.request",
      type: "suppliers",
      title: "New quote request",
      description: `A shop wants ${quote.quantity.toLocaleString("en-NG")} × ${short(quote.supplierProduct?.name, 60) || "your product"}. Send your price.`,
      link: `/supplier/quotes?quote=${quote.id}`,
      actionLabel: "Send a price",
      metadata: { supplierQuoteId: quote.id },
      dedupeKey: `quote.request:${quote.id}`,
      email: true,
    });
  });
}

/** The team approved or turned down a supplier's product. */
export function notifyProductDecision(productId: string, status: string) {
  return safely("product decision", async () => {
    if (status !== "published" && status !== "rejected") return;
    const product = await db.supplierProduct.findUnique({ where: { id: productId }, select: { id: true, name: true, supplier: { select: { userId: true } } } });
    if (!product) return;
    const approved = status === "published";
    await notify({
      userId: product.supplier.userId,
      event: approved ? "product.approved" : "product.rejected",
      type: "products",
      priority: approved ? "success" : "warning",
      title: approved ? `${short(product.name)} is live` : `${short(product.name)} wasn't approved`,
      description: approved ? "Shops can now find it and sell it." : "Check the photos, price and description, then send it again. Ask us if you're not sure why.",
      link: `/supplier/products/${product.id}`,
      actionLabel: approved ? "See product" : "Fix and resend",
      metadata: { supplierProductId: product.id },
      dedupeKey: `product.${status}:${product.id}:${new Date().toISOString().slice(0, 13)}`,
      email: true,
    });
  });
}

// ─── Verification (suppliers, delivery partners, sellers) ────────────────────

const VERIFICATION_WORDS: Record<string, { title: string; description: string; priority: "success" | "warning" | "critical" | "info" } | undefined> = {
  verified: { title: "You're verified", description: "Your business is checked. You can now trade on Shopinbos.", priority: "success" },
  rejected: { title: "We couldn't verify your business", description: "Check your documents and send them again. Ask us if you need help.", priority: "warning" },
  suspended: { title: "Your account is paused", description: "Contact Shopinbos support to find out why and what to do.", priority: "critical" },
};

export function notifyVerificationDecision(input: { userId: string; status: string; portal: "supplier" | "logistics" | "seller" }) {
  return safely("verification", async () => {
    const words = VERIFICATION_WORDS[input.status];
    if (!words) return;
    await notify({
      userId: input.userId,
      event: "verification.update",
      type: "system",
      priority: words.priority,
      title: words.title,
      description: words.description,
      link: input.portal === "supplier" ? "/supplier/verification" : input.portal === "logistics" ? "/logistics/verification" : "/home/settings",
      // Picks the WhatsApp template: verified → shopinbos_account_approved, else shopinbos_account_update.
      metadata: { status: input.status },
      dedupeKey: `verification.${input.status}:${input.userId}:${new Date().toISOString().slice(0, 13)}`,
      email: true,
    });
  });
}

// ─── Admins ───────────────────────────────────────────────────────────────────

/** Something for the team to check (verification documents, a product waiting for review). */
export function notifyAdminsToReview(input: { title: string; description: string; link: string; dedupeKey: string }) {
  return safely("admin review", () => notifyAdmins({ event: "admin.review", type: "system", priority: "warning", title: input.title, description: input.description, link: input.link, actionLabel: "Review", dedupeKey: input.dedupeKey }));
}

/** A supplier sent a product for review. */
export function notifyProductForReview(productId: string, name: string, supplierName?: string | null) {
  return notifyAdminsToReview({
    title: `New product to review: ${short(name, 50)}`,
    description: `${short(supplierName, 40) || "A supplier"} sent it for review. Approve it so shops can sell it.`,
    link: "/admin/supplier-products?status=pending_review",
    dedupeKey: `admin.product:${productId}:${new Date().toISOString().slice(0, 10)}`,
  });
}
