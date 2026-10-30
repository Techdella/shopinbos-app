import "server-only";

import { db } from "@/lib/db/client";
import { normalizeEmail, normalizePhone } from "@/lib/marketing/segment-rules";
import { clearOptOut, loadOptOuts } from "@/lib/marketing/opt-outs";
import { isOptedOut } from "@/lib/marketing/text-channels";
import { contactAllows } from "@/lib/email/preferences";
import { shopperPhone } from "@shared/shoppers";
import type { FollowerReach, FollowerSource } from "@shared/follower-blasts";

// Who follows a shop (ShopFollower, docs/migrations/2026-12-14-shop-followers.sql) and how each follower may be
// reached (shared/follower-blasts.ts has the rules). Until Shopinbos Plug lets people follow a shop, everyone who
// bought from it follows it (source "order"): recordShopperOrder adds the row as each order is recorded, and
// scripts/backfill-followers.mjs adds the past ones.
//
// Privacy: a Shopper is one person across Shopinbos, so their name and email here come from their own orders at THIS
// shop (ShopperStore.lastOrderId), never from what they gave another shop.

const CHUNK = 1000;

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Makes the shopper a follower of the store (source "order") if they aren't one yet. Never throws. */
export async function addOrderFollower(storeId: string, shopperId: string): Promise<void> {
  try {
    // skipDuplicates: an existing row (including one they unfollowed) is left as it is.
    await db.shopFollower.createMany({ data: [{ storeId, shopperId, source: "order" satisfies FollowerSource }], skipDuplicates: true });
  } catch (error) {
    console.error(`[followers] could not add follower for store ${storeId}`, error);
  }
}

/** Followers who haven't unfollowed. */
export function followerCount(storeId: string) {
  return db.shopFollower.count({ where: { storeId, unfollowedAt: null } });
}

export interface ShopperAtStore {
  name: string | null;
  email: string | null;
}

/** Each shopper's name and email as they gave them on their latest order at this store. */
export async function shopperDetailsAtStore(storeId: string, shopperIds: string[]): Promise<Map<string, ShopperAtStore>> {
  const out = new Map<string, ShopperAtStore>();
  for (const ids of chunks([...new Set(shopperIds)])) {
    const links = await db.shopperStore.findMany({ where: { storeId, shopperId: { in: ids } }, select: { shopperId: true, lastOrderId: true } });
    const orderIds = links.map((link) => link.lastOrderId).filter((id): id is string => Boolean(id));
    const orders = orderIds.length ? await db.retailOrder.findMany({ where: { id: { in: orderIds }, storeId }, select: { id: true, buyerName: true, buyerEmail: true } }) : [];
    const byId = new Map(orders.map((order) => [order.id, order]));
    for (const link of links) {
      const order = link.lastOrderId ? byId.get(link.lastOrderId) : undefined;
      out.set(link.shopperId, { name: order?.buyerName?.trim() || null, email: normalizeEmail(order?.buyerEmail) });
    }
  }
  return out;
}

function lastWhatsAppConsent(metadata: unknown) {
  const record = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  const history = Array.isArray(record.consent) ? (record.consent as Array<Record<string, unknown>>) : [];
  return history[history.length - 1]?.whatsapp === true && !record.textOptOut;
}

export interface FollowerTarget {
  shopperId: string;
  phone: string;
  name: string | null;
  email: string | null;
  reach: FollowerReach;
}

/**
 * Every active follower with what they may get: WhatsApp needs their opt-in or an existing WhatsApp marketing consent
 * at this shop (and no STOP since); email needs an email from their orders here and no unsubscribe / "Promotions" off;
 * push needs a Plug device (none yet).
 */
export async function followerTargets(storeId: string): Promise<FollowerTarget[]> {
  const followers = await db.shopFollower.findMany({
    where: { storeId, unfollowedAt: null },
    select: { shopperId: true, whatsappOptIn: true, shopper: { select: { phone: true } } },
  });
  if (!followers.length) return [];
  const [details, optOuts, subscribers] = await Promise.all([
    shopperDetailsAtStore(storeId, followers.map((f) => f.shopperId)),
    loadOptOuts(storeId),
    db.subscriber.findMany({ where: { storeId }, select: { email: true, phone: true, status: true, metadata: true } }),
  ]);
  const consentByPhone = new Set<string>();
  const subscriberByEmail = new Map<string, { status: string; metadata: unknown }>();
  for (const row of subscribers) {
    const phone = normalizePhone(row.phone);
    if (phone && row.status !== "spam" && lastWhatsAppConsent(row.metadata)) consentByPhone.add(phone);
    const email = normalizeEmail(row.email);
    if (email) subscriberByEmail.set(email, { status: row.status, metadata: row.metadata });
  }
  const push = await pushTokensFor(followers.map((f) => f.shopperId));
  return followers.map((follower) => {
    const phone = follower.shopper.phone;
    const detail = details.get(follower.shopperId);
    const email = detail?.email ?? null;
    return {
      shopperId: follower.shopperId,
      phone,
      name: detail?.name ?? null,
      email,
      reach: {
        whatsappOptIn: follower.whatsappOptIn,
        whatsappConsent: consentByPhone.has(phone),
        whatsappOptedOut: isOptedOut(optOuts, "whatsapp", phone, "marketing"),
        email,
        emailSuppressed: email ? !contactAllows(subscriberByEmail.get(email) ?? null, "promotions") : false,
        pushTokens: push.get(follower.shopperId) ?? 0,
      },
    };
  });
}

/**
 * Plug devices each shopper may get a push on. Shopinbos Plug (the customer app) hasn't launched, so no shopper has a
 * device yet: this is where its push tokens will be read, and until then it is empty and push sends to nobody.
 */
export async function pushTokensFor(shopperIds: string[]): Promise<Map<string, number>> {
  void shopperIds;
  return new Map();
}

/** Push is ready once Plug can deliver to shoppers. */
export const PLUG_PUSH_READY = false;

// ─── The opt-in on the order page ─────────────────────────────────────────────

/** Whether the order's buyer already gets this shop's news on WhatsApp (null: no phone to follow with). */
export async function orderWhatsAppNews(order: { storeId: string; buyerPhone: string | null }, currency: string | null): Promise<boolean | null> {
  const phone = shopperPhone(order.buyerPhone, currency);
  if (!phone) return null;
  const shopper = await db.shopper.findUnique({ where: { phone }, select: { id: true } }).catch(() => null);
  if (!shopper) return false;
  const row = await db.shopFollower.findUnique({ where: { storeId_shopperId: { storeId: order.storeId, shopperId: shopper.id } }, select: { whatsappOptIn: true, unfollowedAt: true } }).catch(() => null);
  return Boolean(row?.whatsappOptIn && !row.unfollowedAt);
}

/**
 * The buyer taps "Get news from <shop> on WhatsApp" on their order page (the order's unguessable id is their access):
 * they follow the shop with WhatsApp news on, and a STOP they sent this shop on WhatsApp before is lifted, as a fresh
 * opt-in on a form does. `on: false` turns WhatsApp news off again (they keep following).
 */
export async function setOrderWhatsAppNews(orderId: string, on: boolean): Promise<{ ok: true; on: boolean } | { ok: false; error: string }> {
  const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, storeId: true, buyerPhone: true, store: { select: { currency: true } } } });
  if (!order) return { ok: false, error: "Order not found." };
  const phone = shopperPhone(order.buyerPhone, order.store.currency);
  if (!phone) return { ok: false, error: "This order has no phone number." };
  let shopper = await db.shopper.findUnique({ where: { phone }, select: { id: true } });
  if (!shopper) {
    shopper = await db.shopper.upsert({ where: { phone }, create: { phone }, update: {}, select: { id: true } });
  }
  const now = new Date();
  await db.shopFollower.upsert({
    where: { storeId_shopperId: { storeId: order.storeId, shopperId: shopper.id } },
    create: { storeId: order.storeId, shopperId: shopper.id, source: "order", whatsappOptIn: on, whatsappOptInAt: on ? now : null },
    update: on ? { whatsappOptIn: true, whatsappOptInAt: now, unfollowedAt: null } : { whatsappOptIn: false },
  });
  if (on) await clearOptOut(order.storeId, phone, "whatsapp", "order_page_follow").catch(() => null);
  return { ok: true, on };
}
