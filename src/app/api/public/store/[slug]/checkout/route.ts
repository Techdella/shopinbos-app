import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, created, apiError } from "@/lib/api/response";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { z } from "zod";
import { LINK_CHANNELS } from "@shared/channels";
import { randomBytes } from "crypto";
import { sendOrderConfirmationEmail, sendSellerNotification } from "@/lib/notifications/resend";
import { triggerAutomations } from "@/lib/automations/engine";
import { redemptionError } from "@/lib/discounts";
import { validCampaignToken } from "@/lib/campaigns/send";
import { cleanAffiliateCode, commissionFor } from "@shared/affiliates";
import {
  checkoutPaymentOptions,
  checkoutPaymentSettings,
  deliveryFeeFor,
  normalizeCheckoutMethod,
  paymentChoiceText,
  payOnDeliveryBlock,
  paystackSecretReady,
  readTransferAccount,
} from "@shared/checkout-payments";

const CHECKOUT_CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CHECKOUT_CORS);
}

const CheckoutSchema = z.object({
  buyerName: z.string().min(1),
  buyerEmail: z.string().email(),
  buyerPhone: z.string().optional(),
  deliveryAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional(),
  }),
  items: z.array(z.object({
    productId: z.string(),
    name: z.string().optional(),
    price: z.number().positive().optional(),
    quantity: z.number().int().positive(),
    image: z.string().optional(),
  })).min(1),
  notes: z.string().optional(),
  // "redirect" and "inline" are older clients asking for Paystack.
  paymentMethod: z.enum(["paystack", "transfer", "pay_on_delivery", "redirect", "inline"]).optional(),
  discountCode: z.string().optional(),
  campaignToken: z.string().max(64).optional(),
  channel: z.enum(LINK_CHANNELS).optional(),
  affiliateCode: z.string().max(32).optional(),
  adCode: z.string().max(32).optional(),
});

function generateOrderNumber(): string {
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `SB-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const store = await db.store.findUnique({
    where: { slug },
    select: {
      id: true,
      userId: true,
      name: true,
      slug: true,
      customDomain: true,
      currency: true,
      status: true,
      brandSettings: true,
      user: { select: { email: true } },
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

  const { buyerName, buyerEmail, buyerPhone, deliveryAddress, items, notes, paymentMethod: requestedMethod, discountCode, campaignToken: rawCampaignToken, channel: linkChannel, affiliateCode, adCode } = parsed.data;

  const requestedQuantities = new Map<string, number>();
  for (const item of items) {
    requestedQuantities.set(item.productId, (requestedQuantities.get(item.productId) ?? 0) + item.quantity);
  }

  const products = await db.storeProduct.findMany({
    where: {
      storeId: store.id,
      id: { in: [...requestedQuantities.keys()] },
      status: "published",
    },
    select: {
      id: true,
      name: true,
      images: true,
      retailPrice: true,
      currency: true,
      currentStock: true,
    },
  });

  if (products.length !== requestedQuantities.size) {
    return withCors(req, apiError("BAD_REQUEST", "One or more cart items are no longer available."), CHECKOUT_CORS);
  }

  // Validate stock availability
  const insufficientStock = products
    .filter((p) => (p.currentStock ?? 0) < (requestedQuantities.get(p.id) ?? 0))
    .map((p) => p.name);
  if (insufficientStock.length > 0) {
    return withCors(
      req,
      apiError("BAD_REQUEST", `Insufficient stock for: ${insufficientStock.join(", ")}`),
      CHECKOUT_CORS,
    );
  }

  const orderItems = products.map((product) => {
    const quantity = requestedQuantities.get(product.id) ?? 0;
    const item = {
      productId: product.id,
      name: product.name,
      price: product.retailPrice,
      quantity,
    };
    return product.images[0] ? { ...item, image: product.images[0] } : item;
  });

  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Determine shipping fee: check active shipping zones first, fall back to flat rate
  const shippingZones = await db.shippingZone.findMany({
    where: { storeId: store.id, active: true },
    orderBy: { sortOrder: "asc" },
    select: { name: true, type: true, regions: true, rates: true },
  });

  const shippingFee = deliveryFeeFor(shippingZones, Number((store.brandSettings as any)?.shippingConfig?.flatRate ?? 0), deliveryAddress, subtotal);

  // Validate and apply discount
  let discountAmount = 0;
  let usedDiscountId: string | null = null;
  let usedCouponId: string | null = null;
  if (discountCode) {
    const discount = await db.discount.findUnique({
      where: { storeId_code: { storeId: store.id, code: discountCode.toUpperCase() } },
    });

    if (discount && !redemptionError(discount, subtotal)) {
      if (discount.type === "percentage") {
        discountAmount = subtotal * (discount.value / 100);
      } else if (discount.type === "fixed_amount") {
        discountAmount = discount.value;
      } else if (discount.type === "free_shipping") {
        discountAmount = shippingFee;
      } else if (discount.type === "bogo") {
        const itemPrices = orderItems.map((i) => i.price).sort((a, b) => b - a);
        discountAmount = itemPrices.length > 1 ? itemPrices[1] * (discount.value / 100) : 0;
      }
      usedDiscountId = discount.id;
    } else {
      // Try coupon
      const coupon = await db.coupon.findUnique({
        where: { code: discountCode.toUpperCase() },
      });
      if (coupon && coupon.storeId === store.id && !redemptionError(coupon, subtotal)) {
        if (coupon.type === "percentage") {
          discountAmount = subtotal * (coupon.value / 100);
        } else if (coupon.type === "fixed_amount") {
          discountAmount = coupon.value;
        }
        usedCouponId = coupon.id;
      }
    }
  }

  const total = Math.max(0, subtotal - discountAmount) + shippingFee;

  // Only the ways to pay this seller turned on (and that can work right now) are accepted.
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  const paymentMethod = normalizeCheckoutMethod(requestedMethod);
  const paymentSettings = checkoutPaymentSettings(store.brandSettings, shippingZones, paystackSecretReady(paystackSecret));
  const paymentContext = { city: deliveryAddress.city, state: deliveryAddress.state, total };
  if (!checkoutPaymentOptions(paymentSettings, paymentContext).some((option) => option.key === paymentMethod)) {
    const reason = paymentMethod === "pay_on_delivery" && paymentSettings.methods?.cod ? payOnDeliveryBlock(paymentSettings, paymentContext) : null;
    return withCors(req, apiError("BAD_REQUEST", reason ?? "This store doesn't take that payment method. Choose another way to pay."), CHECKOUT_CORS);
  }
  if (paymentMethod === "pay_on_delivery" && !buyerPhone?.trim()) {
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
      for (const item of orderItems) {
        const updated = await tx.storeProduct.updateMany({
          where: {
            id: item.productId,
            storeId: store.id,
            status: "published",
            currentStock: { gte: item.quantity },
          },
          data: {
            currentStock: { decrement: item.quantity },
            soldStock: { increment: item.quantity },
          },
        });
        if (updated.count !== 1) {
          throw new Error(`Insufficient stock for ${item.name}`);
        }
      }

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

      return tx.retailOrder.create({
        data: {
          storeId: store.id,
          orderNumber,
          buyerName,
          buyerEmail,
          buyerPhone: buyerPhone ?? null,
          deliveryAddress,
          items: orderItems,
          subtotal,
          shippingFee,
          total,
          discountCode: discountCode ?? null,
          campaignToken,
          // Email campaign clicks win; otherwise the share link's ?ref, else the online store itself.
          channel: campaignToken ? "email" : linkChannel ?? "online_store",
          affiliateId: affiliate?.id ?? null,
          affiliateCommission: affiliate ? commissionFor(subtotal, discountAmount, affiliate.commissionRate) : null,
          adCampaignId: adCampaign?.id ?? null,
          discountAmount,
          currency: store.currency,
          notes: notes ?? null,
          // Null keeps meaning "Paystack checkout" for older readers; transfer and pay on delivery wait as pending.
          paymentMethod: paymentMethod === "paystack" ? null : paymentMethod,
          status: "pending",
        },
      });
    });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Insufficient stock")
      ? error.message
      : "Could not place this order. Please try again.";
    return withCors(req, apiError("BAD_REQUEST", message), CHECKOUT_CORS);
  }

  const sellerDescription = `${buyerName} placed an order worth ${new Intl.NumberFormat("en-NG", { style: "currency", currency: store.currency, maximumFractionDigits: 0 }).format(total)}. ${paymentChoiceText(paymentMethod)}`;

  await Promise.allSettled([
    sendOrderConfirmationEmail(
      buyerEmail,
      order.orderNumber,
      store.name,
      orderItems.map((item) => ({
        name: item.name,
        qty: item.quantity,
        price: new Intl.NumberFormat("en-NG", { style: "currency", currency: store.currency, maximumFractionDigits: 0 }).format(item.price * item.quantity),
      })),
      new Intl.NumberFormat("en-NG", { style: "currency", currency: store.currency, maximumFractionDigits: 0 }).format(total),
    ),
    sendSellerNotification(store.user.email, {
      title: `New order ${order.orderNumber}`,
      description: sellerDescription,
      type: "order",
    }),
    db.notification.create({
      data: {
        userId: store.userId,
        title: `New order ${order.orderNumber}`,
        description: sellerDescription,
        type: "order",
        link: `/home/orders/${order.id}`,
        metadata: { orderId: order.id, paymentMethod },
      },
    }),
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
    // Where to send a bank transfer: the exact total, with the order number as the reference.
    transfer: transferAccount ? { ...transferAccount, amount: order.total, reference: order.orderNumber } : null,
  }), CHECKOUT_CORS);
}
