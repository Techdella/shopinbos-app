import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, created, apiError } from "@/lib/api/response";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { z } from "zod";
import { randomBytes } from "crypto";
import { sendOrderConfirmationEmail, sendSellerNotification } from "@/lib/notifications/resend";
import { triggerAutomations } from "@/lib/automations/engine";
import { redemptionError } from "@/lib/discounts";

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
  paymentMethod: z.enum(["redirect", "inline"]).optional(),
  discountCode: z.string().optional(),
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

  const { buyerName, buyerEmail, buyerPhone, deliveryAddress, items, notes, paymentMethod, discountCode } = parsed.data;

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

  let shippingFee = 0;
  if (shippingZones.length > 0) {
    const matchingZone = shippingZones.find(
      (z) => z.regions.length === 0 || z.regions.some((r) => deliveryAddress.city.toLowerCase().includes(r.toLowerCase()) || deliveryAddress.state?.toLowerCase().includes(r.toLowerCase())),
    );
    if (matchingZone) {
      const zoneRates = (Array.isArray(matchingZone.rates) ? matchingZone.rates : []) as Array<{ min?: number; max?: number; price?: number }>;
      const matchedRate = zoneRates.find(
        (r) => (!r.min || subtotal >= r.min) && (!r.max || subtotal <= r.max),
      );
      shippingFee = matchedRate?.price ?? 0;
    }
  } else {
    const settings = store.brandSettings as any;
    shippingFee = settings?.shippingConfig?.flatRate ?? 0;
  }

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
  const orderNumber = generateOrderNumber();

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
          discountAmount,
          currency: store.currency,
          notes: notes ?? null,
        },
      });
    });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Insufficient stock")
      ? error.message
      : "Could not place this order. Please try again.";
    return withCors(req, apiError("BAD_REQUEST", message), CHECKOUT_CORS);
  }

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
      description: `${buyerName} placed an order worth ${new Intl.NumberFormat("en-NG", { style: "currency", currency: store.currency, maximumFractionDigits: 0 }).format(total)}.`,
      type: "order",
    }),
    db.notification.create({
      data: {
        userId: store.userId,
        title: `New order ${order.orderNumber}`,
        description: `${buyerName} placed an order worth ${new Intl.NumberFormat("en-NG", { style: "currency", currency: store.currency, maximumFractionDigits: 0 }).format(total)}.`,
        type: "order",
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

  // Initialize Paystack payment if keys are configured (skip for inline client-side payment)
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  let paystackData: { authorization_url: string; reference: string } | null = null;

  if (paymentMethod !== "inline" && paystackSecret && !paystackSecret.includes("your_")) {
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
    },
    paystack: paystackData,
  }), CHECKOUT_CORS);
}
