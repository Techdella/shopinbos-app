import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { priceOrder } from "@/lib/commerce/pricing.server";
import { readCheckoutSettings } from "@shared/cart-checkout";
import { overPublicLimit } from "@/lib/rate-limit";
import { linkCheckout } from "@/lib/payment-links/service.server";
import { isLinkCode, linkCheckoutDelivery } from "@/lib/payment-links/pure";
import { withPointDistances } from "@/lib/delivery-market/point-distance.server";
import type { MarketOption } from "@shared/delivery-market";

// The totals the checkout API will charge for this bag, address, delivery option and code, so the checkout
// page shows exactly that (automatic discounts, buy X get Y and product-scoped codes included). Nothing is saved.

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const QuoteSchema = z.object({
  items: z.array(z.object({ productId: z.string().max(64), quantity: z.number().int().positive().max(999), variant: z.string().max(120).optional(), variantId: z.string().max(80).optional() })).max(100).default([]),
  address: z.object({ city: z.string().max(120).optional(), state: z.string().max(120).optional() }).default({}),
  deliveryOptionId: z.string().max(64).optional(),
  discountCode: z.string().max(40).optional(),
  buyerEmail: z.string().max(200).optional(),
  // Loyalty points to use (needs buyerEmail and the phone from an earlier order).
  redeemPoints: z.number().int().min(0).max(10_000_000).optional(),
  buyerPhone: z.string().max(40).optional(),
  // A payment link's totals (its own products, the buyer's open option and quantity, the agreed amount).
  paymentLinkCode: z.string().max(24).optional(),
  linkVariantId: z.string().max(80).optional(),
  linkQuantity: z.number().int().min(1).max(99).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (await overPublicLimit(req.headers, "quote")) return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429), CORS);
  const { slug } = await params;
  const store = await db.store.findUnique({
    where: { slug },
    select: { id: true, userId: true, city: true, country: true, status: true, brandSettings: true, checkoutConfig: { select: { enableCoupon: true } } },
  });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const parsed = QuoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid bag"), CORS);

  const { redeemPoints, buyerPhone, paymentLinkCode, linkVariantId, linkQuantity, ...rest } = parsed.data;
  let priced;
  // The address delivery was priced for (a payment link's saved one, else the page's).
  let quotedAddress: { city?: string; state?: string } = rest.address;
  if (paymentLinkCode !== undefined) {
    if (!isLinkCode(paymentLinkCode)) return withCors(req, apiError("NOT_FOUND", "This payment link doesn't exist.", 404), CORS);
    const link = await linkCheckout(store.id, paymentLinkCode, { variantId: linkVariantId, quantity: linkQuantity });
    if (!link.ok) return withCors(req, apiError("BAD_REQUEST", link.message), CORS);
    // Saved delivery on the link: its address and agreed fee (or option), whatever the page sends.
    const delivery = linkCheckoutDelivery(link.delivery, { address: rest.address, deliveryOptionId: rest.deliveryOptionId });
    quotedAddress = delivery.address;
    priced = await priceOrder({ store, items: link.lines, address: delivery.address, deliveryOptionId: delivery.deliveryOptionId, settings: readCheckoutSettings(store.checkoutConfig), agreedItemsTotal: link.agreedItemsTotal, agreedDeliveryFee: delivery.agreedDeliveryFee });
  } else {
    if (!rest.items.length) return withCors(req, apiError("BAD_REQUEST", "Your bag is empty."), CORS);
    priced = await priceOrder({ store, ...rest, settings: readCheckoutSettings(store.checkoutConfig), loyalty: redeemPoints ? { points: redeemPoints, phone: buyerPhone } : null });
  }
  if (!priced.ok) return withCors(req, apiError("BAD_REQUEST", priced.message), CORS);
  // Delivery partners: how far each pickup point is from the customer's area, when it can be placed quickly.
  const options = priced.delivery.market ? await withPointDistances(priced.delivery.choice.options as MarketOption[], quotedAddress, store.country) : priced.delivery.choice.options;

  const res = withCors(req, ok({
    totals: priced.totals,
    discount: priced.discount ? { code: priced.discount.code, label: priced.discount.label, automatic: priced.discount.automatic } : null,
    codeError: priced.codeError,
    points: priced.points ? { points: priced.points.points, amount: priced.points.amount, balance: priced.points.balance, max: priced.points.max } : null,
    // With delivery partners (src/lib/delivery-market) the options carry their kind, detail, pickup point and
    // whether pay on delivery is allowed; `partners` tells the page to use these options rather than its own zones.
    delivery: {
      covered: priced.delivery.choice.covered,
      optionId: priced.delivery.option?.id ?? null,
      options,
      partners: !!priced.delivery.market,
      reason: priced.delivery.market?.reason ?? null,
      shipmentCount: priced.delivery.market?.shipmentCount ?? 1,
      // Supplier parcels (shared/dropship-checkout.ts ParcelLine): "Ships from Port Harcourt · ₦4,500 · Arrives …",
      // each with what the customer pays (fee). With the store's own zones their fees are inside the totals' delivery
      // and `ownItems: false` means the zone options don't apply (every item ships from a supplier). Pay on delivery
      // isn't taken when a supplier delivers a parcel itself (bySupplier).
      parcels: priced.delivery.parcels?.lines ?? [],
      ownItems: priced.delivery.parcels ? priced.delivery.parcels.ownItems : true,
    },
    // Some items ship from a supplier: they're paid only in the app (no bank transfer marked paid by hand).
    fromSuppliers: priced.stockHolds.some((hold) => hold.source === "supplier"),
    items: priced.items.map((item) => ({ productId: item.productId, variant: item.variant ?? null, price: item.price, quantity: item.quantity, ...(item.depositPct ? { depositPct: item.depositPct } : {}) })),
    // Preorder deposits (shared/preorder.ts): paying by card charges payNow (naira) and the rest is due once the
    // stock is ready. Other ways to pay take the whole total. Null: one payment.
    deposit: priced.deposit ? { payNow: priced.deposit.payNowKobo / 100, balance: priced.deposit.balanceKobo / 100, methods: ["paystack"] } : null,
  }), CORS);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
