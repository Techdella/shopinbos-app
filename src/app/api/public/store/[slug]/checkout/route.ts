import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { created, apiError } from "@/lib/api/response";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { z } from "zod";
import { LINK_CHANNELS } from "@shared/channels";
import { randomBytes } from "crypto";
import { sendOrderConfirmationEmail, sendSellerNotification } from "@/lib/email/notices.server";
import { triggerAutomations } from "@/lib/automations/engine";
import { validCampaignToken } from "@/lib/campaigns/send";
import { notifyOrderCustomer } from "@/lib/notifications/customer-messages";
import { cleanAffiliateCode, commissionFor } from "@shared/affiliates";
import { priceOrder } from "@/lib/commerce/pricing.server";
import { markCartRecovered } from "@/lib/commerce/abandoned-cart.server";
import { spendPoints } from "@/lib/gamification/loyalty.server";
import { isPhone, orderNotes, readCheckoutSettings } from "@shared/cart-checkout";
import {
  checkoutPaymentOptions,
  checkoutPaymentSettings,
  normalizeCheckoutMethod,
  paymentChoiceText,
  payOnDeliveryBlock,
  paystackSecretReady,
  readTransferAccount,
  HOSTED_CHECKOUT_NAMES,
  isHostedCheckoutMethod,
} from "@shared/checkout-payments";
import { overPublicLimit } from "@/lib/rate-limit";
import { reserveStock } from "@/lib/commerce/stock.server";
import { checkoutPaymentDueAt } from "@/lib/commerce/order-expiry.server";
import { ensureSupplierOrdersSafely } from "@/lib/supplier-orders/service.server";
import { notifyNewOrder, notifyStockAfterSale } from "@/lib/notifications/events.server";
import { linkCheckout, settlePaymentLinkForOrder } from "@/lib/payment-links/service.server";
import { isLinkCode, linkOrderChannel } from "@/lib/payment-links/pure";
import { hostedGatewaysReady } from "@/lib/hosted-gateways";
import { releaseUnstartedHostedOrder, startHostedCheckout } from "@/lib/commerce/hosted-checkout.server";

const CHECKOUT_CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CHECKOUT_CORS);
}

const CheckoutSchema = z.object({
  buyerName: z.string().trim().min(1, "Enter your full name."),
  // Required, except on a payment link paid by transfer or on delivery (checked below).
  buyerEmail: z.string().trim().max(200),
  buyerPhone: z.string().max(40).optional(),
  deliveryAddress: z.object({
    street: z.string().trim().min(1, "Enter your street address."),
    city: z.string().trim().min(1, "Enter your area or city."),
    state: z.string().max(80).optional(),
    country: z.string().max(80).optional(),
    postalCode: z.string().max(20).optional(),
    landmark: z.string().max(160).optional(),
  }),
  items: z.array(z.object({
    productId: z.string(),
    name: z.string().optional(),
    price: z.number().nonnegative().optional(),
    quantity: z.number().int().positive().max(999),
    image: z.string().optional(),
    variant: z.string().max(120).optional(),
    variantId: z.string().max(80).optional(),
  })).max(100),
  notes: z.string().max(1000).optional(),
  giftMessage: z.string().max(500).optional(),
  deliveryOptionId: z.string().max(64).optional(),
  // "redirect" and "inline" are older clients asking for Paystack.
  paymentMethod: z.enum(["paystack", "korapay", "transfer", "pay_on_delivery", "redirect", "inline"]).optional(),
  discountCode: z.string().max(40).optional(),
  cartToken: z.string().max(64).optional(),
  campaignToken: z.string().max(64).optional(),
  channel: z.enum(LINK_CHANNELS).optional(),
  affiliateCode: z.string().max(32).optional(),
  adCode: z.string().max(32).optional(),
  // Loyalty points to use (src/lib/gamification); checked against the buyer's email and phone.
  redeemPoints: z.number().int().min(0).max(10_000_000).optional(),
  // A payment link (/pay/<code>): its own products are charged, never `items`. The buyer may pick an option the
  // link left open and a quantity within its limit.
  paymentLinkCode: z.string().max(24).optional(),
  linkVariantId: z.string().max(80).optional(),
  linkQuantity: z.number().int().min(1).max(99).optional(),
});

function generateOrderNumber(): string {
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `SB-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (await overPublicLimit(req.headers, "checkout")) return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429), CHECKOUT_CORS);
  const { slug } = await params;

  const store = await db.store.findUnique({
    where: { slug },
    select: {
      id: true,
      userId: true,
      name: true,
      slug: true,
      customDomain: true,
      logoUrl: true,
      currency: true,
      status: true,
      brandSettings: true,
      user: { select: { email: true } },
      checkoutConfig: { select: { requirePhone: true, enableNotes: true, enableGiftNote: true, enableCoupon: true, enableUpsells: true, enableTrustBadges: true, upsellProducts: true } },
    },
  });

  if (!store || store.status !== "active") {
    return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CHECKOUT_CORS);
  }

  const body = await req.json().catch(() => null);
  if (!body) return withCors(req, apiError("BAD_REQUEST", "Invalid JSON body"), CHECKOUT_CORS);

  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body"), CHECKOUT_CORS);
  }

  const { buyerName, buyerEmail: rawEmail, deliveryAddress, items: bagItems, notes, giftMessage, deliveryOptionId, paymentMethod: requestedMethod, discountCode, cartToken, campaignToken: rawCampaignToken, channel: linkChannel, affiliateCode, adCode } = parsed.data;
  const buyerPhone = parsed.data.buyerPhone?.trim() || undefined;
  const settings = readCheckoutSettings(store.checkoutConfig);

  // A payment link replaces the bag with the link's products (and the seller's agreed amount, if any).
  let link: Extract<Awaited<ReturnType<typeof linkCheckout>>, { ok: true }> | null = null;
  if (parsed.data.paymentLinkCode !== undefined) {
    if (!isLinkCode(parsed.data.paymentLinkCode)) return withCors(req, apiError("NOT_FOUND", "This payment link doesn't exist.", 404), CHECKOUT_CORS);
    const found = await linkCheckout(store.id, parsed.data.paymentLinkCode, { variantId: parsed.data.linkVariantId, quantity: parsed.data.linkQuantity });
    if (!found.ok) return withCors(req, apiError("BAD_REQUEST", found.message), CHECKOUT_CORS);
    link = found;
  }
  const items = link ? link.lines : bagItems;
  if (!items.length) return withCors(req, apiError("BAD_REQUEST", "Your bag is empty."), CHECKOUT_CORS);
  const buyerEmail = rawEmail;
  if (buyerEmail ? !z.string().email().safeParse(buyerEmail).success : !link || ["paystack", "korapay"].includes(normalizeCheckoutMethod(requestedMethod))) {
    return withCors(req, apiError("BAD_REQUEST", buyerEmail || !link ? "Enter a valid email address." : "Add your email to pay by card. We send the receipt there."), CHECKOUT_CORS);
  }

  if (buyerPhone && !isPhone(buyerPhone)) {
    return withCors(req, apiError("BAD_REQUEST", "Enter a phone number with 7 to 15 digits."), CHECKOUT_CORS);
  }
  if (settings.requirePhone && !buyerPhone) {
    return withCors(req, apiError("BAD_REQUEST", "Add a phone number so the store can reach you about delivery."), CHECKOUT_CORS);
  }

  // Prices, stock, delivery and the discount all come from the database (same maths as the quote the page shows).
  const priced = await priceOrder({
    store,
    items,
    address: deliveryAddress,
    deliveryOptionId,
    // Payment links charge what the seller set: no codes or points on top.
    discountCode: link ? undefined : discountCode,
    buyerEmail,
    settings,
    loyalty: parsed.data.redeemPoints && !link ? { points: parsed.data.redeemPoints, phone: buyerPhone } : null,
    agreedItemsTotal: link?.agreedItemsTotal ?? null,
  });
  if (!priced.ok) return withCors(req, apiError("BAD_REQUEST", priced.message), CHECKOUT_CORS);

  const orderItems = priced.items;
  const { subtotal, shippingFee, discountAmount, total } = priced.totals;
  const usedDiscountId = priced.discount?.kind === "discount" ? priced.discount.id : null;
  const usedCouponId = priced.discount?.kind === "coupon" ? priced.discount.id : null;
  const deliveryOption = priced.delivery.option;

  // Only the ways to pay this seller turned on (and that can work right now) are accepted.
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  const paymentMethod = normalizeCheckoutMethod(requestedMethod);
  const shippingZones = await db.shippingZone.findMany({
    where: { storeId: store.id, active: true },
    orderBy: { sortOrder: "asc" },
    select: { name: true, regions: true, rates: true },
  });
  const paymentSettings = checkoutPaymentSettings(store.brandSettings, shippingZones, paystackSecretReady(paystackSecret), hostedGatewaysReady());
  const paymentContext = { city: deliveryAddress.city, state: deliveryAddress.state, total };
  if (!checkoutPaymentOptions(paymentSettings, paymentContext).some((option) => option.key === paymentMethod)) {
    const reason = paymentMethod === "pay_on_delivery" && paymentSettings.methods?.cod ? payOnDeliveryBlock(paymentSettings, paymentContext) : null;
    return withCors(req, apiError("BAD_REQUEST", reason ?? "This store doesn't take that payment method. Choose another way to pay."), CHECKOUT_CORS);
  }
  if (paymentMethod === "pay_on_delivery" && !buyerPhone) {
    return withCors(req, apiError("BAD_REQUEST", "Add a phone number so the rider can reach you for pay on delivery."), CHECKOUT_CORS);
  }
  const transferAccount = paymentMethod === "transfer" ? readTransferAccount(store.brandSettings) : null;
  // Only keep attribution tokens issued by this store's campaigns.
  const campaignToken = await validCampaignToken(store.id, rawCampaignToken);
  const orderNumber = generateOrderNumber();

  // Creator and ad links: only codes that belong to this store count.
  const affCode = cleanAffiliateCode(affiliateCode);
  const affiliate = affCode
    ? await db.affiliate.findFirst({ where: { storeId: store.id, code: affCode, active: true }, select: { id: true, commissionRate: true } })
    : null;
  const adCampaignCode = cleanAffiliateCode(adCode);
  const adCampaign = adCampaignCode
    ? await db.adCampaign.findFirst({ where: { storeId: store.id, code: adCampaignCode }, select: { id: true } })
    : null;

  let order: Awaited<ReturnType<typeof db.retailOrder.create>>;
  try {
    order = await db.$transaction(async (tx) => {
      // Takes the stock now (the store's, or the supplier's for dropship products), conditionally so the last
      // unit can't sell twice. Unpaid card/transfer orders give it back when they expire (order-expiry.server.ts).
      const stockHolds = await reserveStock(tx, store.id, priced.stockHolds);

      if (usedDiscountId) {
        await tx.discount.update({
          where: { id: usedDiscountId },
          data: { usedCount: { increment: 1 } },
        });
      }
      if (usedCouponId) {
        await tx.coupon.update({
          where: { id: usedCouponId },
          data: { usedCount: { increment: 1 } },
        });
      }

      const created = await tx.retailOrder.create({
        data: {
          storeId: store.id,
          orderNumber,
          buyerName,
          buyerEmail,
          buyerPhone: buyerPhone ?? null,
          deliveryAddress: {
            ...deliveryAddress,
            ...(deliveryOption ? { deliveryOption: { id: deliveryOption.id, name: deliveryOption.name, estimatedDays: deliveryOption.estimatedDays, pickup: deliveryOption.pickup } } : {}),
          },
          items: JSON.parse(JSON.stringify(orderItems)),
          subtotal,
          shippingFee,
          total,
          discountCode: priced.discount?.code ?? null,
          campaignToken,
          // Email campaign clicks win; otherwise the share link's ?ref, else the online store itself.
          channel: link ? linkOrderChannel(link.link, linkChannel) : campaignToken ? "email" : linkChannel ?? "online_store",
          paymentLinkId: link?.link.id ?? null,
          affiliateId: affiliate?.id ?? null,
          affiliateCommission: affiliate ? commissionFor(subtotal, discountAmount, affiliate.commissionRate) : null,
          adCampaignId: adCampaign?.id ?? null,
          discountAmount,
          currency: store.currency,
          notes: orderNotes(settings, notes, giftMessage),
          // Null keeps meaning "Paystack checkout" for older readers; Korapay, transfer and pay on delivery wait as pending.
          paymentMethod: paymentMethod === "paystack" ? null : paymentMethod,
          status: "pending",
          // What was really taken (versions of products that keep selling at 0 may give less than asked).
          stockHold: JSON.parse(JSON.stringify(stockHolds)),
          // When it lets its stock go if still unpaid: card and Korapay 30 min, bank transfer 24 h or the seller's choice.
          paymentDueAt: checkoutPaymentDueAt(new Date(), paymentMethod === "paystack" ? null : paymentMethod, store.brandSettings),
        },
      });
      // Points used are taken off in the same transaction (fails the order if the balance changed meanwhile).
      if (priced.points) await spendPoints(tx, { storeId: store.id, accountId: priced.points.accountId, orderId: created.id, points: priced.points.points });
      return created;
    });
  } catch (error) {
    const message = error instanceof Error && (error.message.startsWith("Insufficient stock") || error.message.startsWith("Insufficient points"))
      ? error.message
      : "Could not place this order. Please try again.";
    return withCors(req, apiError("BAD_REQUEST", message), CHECKOUT_CORS);
  }

  // Korapay: open the gateway's hosted page before telling anyone about the order. If it can't, the
  // shopper can never pay this order, so it is cancelled straight away (stock and discount given back) and they
  // can try again.
  let hosted: { gateway: string; url: string } | null = null;
  if (isHostedCheckoutMethod(paymentMethod)) {
    try {
      const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const url = await startHostedCheckout(paymentMethod, { ...order, total: Number(order.total) }, store, forwarded || undefined);
      hosted = { gateway: paymentMethod, url };
    } catch (error) {
      console.error(`[checkout] ${paymentMethod} could not start order ${order.id}`, error);
      await releaseUnstartedHostedOrder(order.id, paymentMethod);
      return withCors(req, apiError("PAYMENT_UNAVAILABLE", `${HOSTED_CHECKOUT_NAMES[paymentMethod]} isn't responding right now. Try again in a moment or choose another way to pay.`, 502), CHECKOUT_CORS);
    }
  }

  // Pay on delivery: the order is live now, so suppliers of dropship items get their orders straight away
  // (card and transfer orders reach suppliers once paid: the Paystack webhook / payment return page).
  if (paymentMethod === "pay_on_delivery") await ensureSupplierOrdersSafely(order.id);
  // A payment link placed as pay on delivery counts now (a one-time link closes); card and transfer once paid.
  if (paymentMethod === "pay_on_delivery" && link) await settlePaymentLinkForOrder(order.id);

  const money = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: store.currency, maximumFractionDigits: 0 }).format(amount);
  const sellerDescription = `${buyerName} placed an order worth ${money(total)}. ${paymentChoiceText(paymentMethod)}`;

  await Promise.allSettled([
    // The bag this shopper left (by this browser's cart token, email or phone) is now an order.
    markCartRecovered({ storeId: store.id, orderId: order.id, token: cartToken, email: buyerEmail || undefined, phone: buyerPhone }),
    buyerEmail && sendOrderConfirmationEmail({
      store,
      to: buyerEmail,
      buyerName,
      orderNumber: order.orderNumber,
      items: orderItems.map((item) => ({ name: item.name, qty: item.quantity, price: money(item.price * item.quantity) })),
      total: money(total),
      orderUrl: buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain }, `/order/${order.id}`),
      paymentNote: paymentChoiceText(paymentMethod),
    }),
    sendSellerNotification(store.user.email, {
      title: `New order ${order.orderNumber}`,
      description: sellerDescription,
      type: "order",
      link: `/home/orders/${order.id}`,
      actionLabel: "Open the order",
    }, { id: store.userId, role: "seller" }),
    // The bell and a push to the seller's phone (the email just above is the order email).
    notifyNewOrder({ sellerId: store.userId, orderId: order.id, orderNumber: order.orderNumber, description: sellerDescription, paymentMethod }),
    notifyStockAfterSale(store.id, priced.stockHolds.filter((hold) => hold.source === "store").map((hold) => hold.productId)),
    notifyOrderCustomer(order.id, "order_confirmed"), // WhatsApp/SMS order confirmation, if switched on
    triggerAutomations("order_placed", {
      storeId: store.id,
      storeName: store.name,
      buyerEmail,
      buyerName,
      orderNumber: order.orderNumber,
      orderTotal: total,
      currency: store.currency,
    }),
  ]);

  // Initialize Paystack payment if keys are configured (skip for inline client-side payment, transfer and pay on delivery)
  let paystackData: { authorization_url: string; reference: string } | null = null;

  if (paymentMethod === "paystack" && requestedMethod !== "inline" && paystackSecretReady(paystackSecret)) {
    try {
      const callbackUrl = buildStorefrontUrl(store, `/order/${order.id}`);
      const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: buyerEmail,
          amount: Math.round(total * 100), // kobo
          reference: order.id,
          metadata: {
            orderId: order.id,
            orderNumber,
            storeId: store.id,
            buyerName,
          },
          callback_url: callbackUrl,
        }),
      });

      const paystackJson = await paystackRes.json();
      if (paystackJson.status) {
        paystackData = paystackJson.data;
        await db.retailOrder.update({
          where: { id: order.id },
          data: { paystackRef: paystackData!.reference },
        });
      }
    } catch {
      // Paystack failed — continue without it
    }
  }

  return withCors(req, created({
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      currency: order.currency,
      status: order.status,
      paymentMethod,
    },
    paystack: paystackData,
    // Korapay: send the shopper here to pay; the gateway brings them back to the order page.
    hosted,
    // Where to send a bank transfer: the exact total, with the order number as the reference.
    transfer: transferAccount ? { ...transferAccount, amount: order.total, reference: order.orderNumber, payBy: order.paymentDueAt?.toISOString() ?? null } : null,
  }), CHECKOUT_CORS);
}
