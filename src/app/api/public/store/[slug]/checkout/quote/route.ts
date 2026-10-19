import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { priceOrder } from "@/lib/commerce/pricing.server";
import { readCheckoutSettings } from "@shared/cart-checkout";
import { overPublicLimit } from "@/lib/rate-limit";
import { linkCheckout } from "@/lib/payment-links/service.server";
import { isLinkCode } from "@/lib/payment-links/pure";

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
    select: { id: true, status: true, brandSettings: true, checkoutConfig: { select: { enableCoupon: true } } },
  });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const parsed = QuoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid bag"), CORS);

  const { redeemPoints, buyerPhone, paymentLinkCode, linkVariantId, linkQuantity, ...rest } = parsed.data;
  let priced;
  if (paymentLinkCode !== undefined) {
    if (!isLinkCode(paymentLinkCode)) return withCors(req, apiError("NOT_FOUND", "This payment link doesn't exist.", 404), CORS);
    const link = await linkCheckout(store.id, paymentLinkCode, { variantId: linkVariantId, quantity: linkQuantity });
    if (!link.ok) return withCors(req, apiError("BAD_REQUEST", link.message), CORS);
    priced = await priceOrder({ store, items: link.lines, address: rest.address, deliveryOptionId: rest.deliveryOptionId, settings: readCheckoutSettings(store.checkoutConfig), agreedItemsTotal: link.agreedItemsTotal });
  } else {
    if (!rest.items.length) return withCors(req, apiError("BAD_REQUEST", "Your bag is empty."), CORS);
    priced = await priceOrder({ store, ...rest, settings: readCheckoutSettings(store.checkoutConfig), loyalty: redeemPoints ? { points: redeemPoints, phone: buyerPhone } : null });
  }
  if (!priced.ok) return withCors(req, apiError("BAD_REQUEST", priced.message), CORS);

  const res = withCors(req, ok({
    totals: priced.totals,
    discount: priced.discount ? { code: priced.discount.code, label: priced.discount.label, automatic: priced.discount.automatic } : null,
    codeError: priced.codeError,
    points: priced.points ? { points: priced.points.points, amount: priced.points.amount, balance: priced.points.balance, max: priced.points.max } : null,
    delivery: { covered: priced.delivery.choice.covered, optionId: priced.delivery.option?.id ?? null, options: priced.delivery.choice.options },
    items: priced.items.map((item) => ({ productId: item.productId, variant: item.variant ?? null, price: item.price, quantity: item.quantity })),
  }), CORS);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
