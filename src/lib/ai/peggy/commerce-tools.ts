import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { CHECKOUT_STEP_LABELS, sanitizeLines, type CheckoutStep } from "@shared/cart-checkout";
import type { PeggyToolInput } from "./pure";
import { ToolError, type PeggyToolContext, type ToolOutput } from "./tools";

async function abandonedCarts(ctx: PeggyToolContext, input: PeggyToolInput<"commerce_abandoned_carts">): Promise<ToolOutput> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const store = await db.store.findUnique({ where: { id: ctx.store.id }, select: { slug: true, customDomain: true } });
  const [waiting, recovered, recent] = await Promise.all([
    db.abandonedCartEvent.aggregate({ where: { storeId: ctx.store.id, recoveredAt: null, createdAt: { gte: since } }, _count: true, _sum: { subtotal: true } }),
    db.abandonedCartEvent.aggregate({ where: { storeId: ctx.store.id, recoveredAt: { gte: since } }, _count: true, _sum: { subtotal: true } }),
    db.abandonedCartEvent.findMany({
      where: { storeId: ctx.store.id, recoveredAt: null, createdAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: input.limit ?? 5,
      select: { name: true, email: true, phone: true, items: true, subtotal: true, checkoutStep: true, remindersSent: true, recoveryToken: true, updatedAt: true },
    }),
  ]);
  const carts = recent.map((cart) => ({
    shopper: cart.name || cart.email || cart.phone,
    email: cart.email,
    phone: cart.phone,
    items: sanitizeLines(cart.items).map((line) => `${line.quantity} × ${line.name}${line.variant ? ` (${line.variant})` : ""}`),
    value: cart.subtotal,
    leftAt: cart.checkoutStep && cart.checkoutStep in CHECKOUT_STEP_LABELS ? CHECKOUT_STEP_LABELS[cart.checkoutStep as CheckoutStep] : null,
    remindersSent: cart.remindersSent,
    lastActive: cart.updatedAt.toISOString(),
    restoreLink: store && cart.recoveryToken ? buildStorefrontUrl(store, `/cart?recover=${cart.recoveryToken}`) : null,
  }));
  return {
    content: JSON.stringify({
      last30Days: { waiting: waiting._count, waitingValue: waiting._sum.subtotal ?? 0, recovered: recovered._count, recoveredValue: recovered._sum.subtotal ?? 0 },
      carts,
      note: "restoreLink puts that shopper's bag back; the seller can send it on WhatsApp. Reminder emails are the abandoned cart automation in /home/automations.",
      link: "/home/commerce/cart",
    }),
  };
}

async function updateSettings(ctx: PeggyToolContext, input: PeggyToolInput<"commerce_update_settings">): Promise<ToolOutput> {
  const changes: string[] = [];
  if (input.afterAdd !== null || input.wishlist !== null) {
    const store = await db.store.findUnique({ where: { id: ctx.store.id }, select: { brandSettings: true } });
    const settings = (store?.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? store.brandSettings : {}) as Record<string, unknown>;
    const cartConfig = { ...((settings.cartConfig as Record<string, unknown>) ?? {}) };
    if (input.afterAdd !== null) {
      cartConfig.addToCartBehavior = input.afterAdd;
      changes.push(`after Add to bag: ${input.afterAdd === "drawer" ? "open the quick bag" : input.afterAdd === "cart_page" ? "go to the bag page" : "go straight to checkout"}`);
    }
    if (input.wishlist !== null) {
      cartConfig.enableWishlist = input.wishlist;
      changes.push(`wishlists ${input.wishlist ? "on" : "off"}`);
    }
    await db.store.update({ where: { id: ctx.store.id }, data: { brandSettings: { ...settings, cartConfig } as unknown as Prisma.InputJsonValue } });
  }

  const checkout: Record<string, boolean> = {};
  const labels: Record<string, string> = {
    requirePhone: "phone number required",
    enableCoupon: "discount code box",
    enableNotes: "order notes",
    enableGiftNote: "gift messages",
    enableTrustBadges: "secure checkout line",
    enableUpsells: "add-ons at checkout",
  };
  for (const key of Object.keys(labels) as Array<keyof typeof labels>) {
    const value = input[key as keyof typeof input];
    if (typeof value === "boolean") {
      checkout[key] = value;
      changes.push(`${labels[key]} ${value ? "on" : "off"}`);
    }
  }
  if (Object.keys(checkout).length) {
    await db.checkoutConfig.upsert({ where: { storeId: ctx.store.id }, create: { storeId: ctx.store.id, ...checkout }, update: checkout });
  }
  if (!changes.length) throw new ToolError("Nothing to change. Ask the seller which setting they want.");
  const summary = `Updated bag and checkout: ${changes.join(", ")}.`;
  return { content: summary, action: { summary, href: changes.some((c) => c.startsWith("after") || c.startsWith("wishlists")) ? "/home/commerce/cart" : "/home/checkout" } };
}

export const COMMERCE_TOOL_RUNNERS = {
  commerce_abandoned_carts: abandonedCarts,
  commerce_update_settings: updateSettings,
};
