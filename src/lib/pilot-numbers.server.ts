import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { featuresFor, loadSwitchState } from "@/lib/feature-switches.server";
import { PAID_RETAIL_STATUSES } from "@/lib/supplier-orders/pure";
import type { FeatureApp } from "@shared/feature-switches";
import {
  PILOT_NUMBER_FEATURES,
  REPEAT_BUYER_ORDERS,
  followerTotals,
  lagosHitDay,
  orderProductIds,
  pilotNumbersOn,
  plugJoins,
  topVideos,
  visitTotals,
  windowStartDay,
  type PilotNumbers,
  type ShopLinkSource,
} from "@shared/pilot-numbers";
import { PLUG_LIVE } from "@shared/shop-handle";

// Pilot numbers on the server (rules: shared/pilot-numbers.ts). Counting a short-link visit (recordShopLinkHit, from
// src/app/h/[handle]/route.ts), one shop's numbers (storePilotNumbers: /home/pilot-numbers, GET /api/app/pilot-numbers)
// and every pilot shop's (pilotShopNumbers: /admin/pilot-numbers and its CSV). Every read survives a missing table
// (before docs/migrations/2026-12-16-payout-ledger.sql and the pilot migrations): that number is just 0.

const BUSINESS_APPS: FeatureApp[] = ["business_web", "business_android", "business_ios"];

function missingTable(error: unknown) {
  const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined;
  return code === "P2021" || code === "P2022" || /does not exist/i.test(String((error as Error)?.message ?? ""));
}

async function safe<T>(work: () => Promise<T>, fallback: T, what: string): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!missingTable(error)) console.error(`[pilot-numbers] couldn't read ${what}`, error);
    return fallback;
  }
}

// ─── Visits ───────────────────────────────────────────────────────────────────

/** Counts one visit to a shop's short link (link or QR) for today, Lagos time. One cheap upsert; never throws. */
export async function recordShopLinkHit(storeId: string, source: ShopLinkSource, now = new Date()) {
  const day = lagosHitDay(now);
  try {
    await db.$executeRaw`
      INSERT INTO "ShopLinkHit" ("id", "storeId", "day", "source", "count", "updatedAt")
      VALUES (${randomUUID()}, ${storeId}, ${day}::date, ${source}, 1, now())
      ON CONFLICT ("storeId", "day", "source") DO UPDATE SET "count" = "ShopLinkHit"."count" + 1, "updatedAt" = now()`;
  } catch (error) {
    if (!missingTable(error)) console.error("[pilot-numbers] couldn't count a short-link visit", error);
  }
}

// ─── Who sees them ────────────────────────────────────────────────────────────

/** Is any pilot feature (post_to_plug, resell, notify_followers, plug_follow_card) on for this account on this app? */
export async function pilotNumbersOnFor(userId: string, app: FeatureApp | null, version: string | null = null) {
  if (!app) return false;
  return pilotNumbersOn(await featuresFor({ id: userId }, app, version));
}

/** On any business app (a shop may be in the pilot on the phone only). Never throws. */
export async function pilotNumbersOnForOwner(userId: string) {
  for (const app of BUSINESS_APPS) if (await pilotNumbersOnFor(userId, app)) return true;
  return false;
}

// ─── One shop ─────────────────────────────────────────────────────────────────

/** Everything on the shop's Pilot numbers card. */
export async function storePilotNumbers(storeId: string, now = new Date()): Promise<PilotNumbers> {
  const since30 = windowStartDay(now, 30);
  const [hits, followerGroups, buyers, repeat, resellGroups, videos] = await Promise.all([
    safe(() => db.shopLinkHit.findMany({ where: { storeId, day: { gte: new Date(`${since30}T00:00:00Z`) } }, select: { day: true, source: true, count: true } }), [], "link visits"),
    safe(() => db.shopFollower.groupBy({ by: ["source"], where: { storeId, unfollowedAt: null }, _count: { _all: true } }), [], "followers"),
    safe(() => db.shopperStore.count({ where: { storeId, orderCount: { gte: 1 } } }), 0, "buyers"),
    safe(() => db.shopperStore.count({ where: { storeId, orderCount: { gte: REPEAT_BUYER_ORDERS } } }), 0, "repeat buyers"),
    safe(() => db.resellSale.groupBy({ by: ["status"], where: { storeId, status: { in: ["pending", "approved", "paid"] } }, _count: { _all: true }, _sum: { lineTotal: true, commissionAmount: true } }), [], "resell sales"),
    safe(() => db.productVideo.findMany({ where: { storeId, ownerKind: "store", status: { not: "removed" } }, select: { id: true, productId: true, caption: true, views: true, createdAt: true }, orderBy: { views: "desc" }, take: 200 }), [], "videos"),
  ]);

  const followers = followerTotals(followerGroups.map((row) => ({ source: row.source, unfollowedAt: null, count: row._count._all })));
  const resell = { sales: 0, value: 0, commission: 0 };
  for (const row of resellGroups) {
    resell.sales += row._count._all;
    resell.value += row._sum.lineTotal ?? 0;
    resell.commission += row._sum.commissionAmount ?? 0;
  }

  // Orders for each top video's product since it went up (paid orders only; not proof the video made them).
  const top = videos.slice(0, 5);
  const earliest = top.reduce<Date | null>((min, video) => (!min || video.createdAt < min ? video.createdAt : min), null);
  const orders = earliest
    ? await safe(
        () => db.retailOrder.findMany({ where: { storeId, createdAt: { gte: earliest }, status: { in: [...PAID_RETAIL_STATUSES] } }, select: { createdAt: true, items: true }, orderBy: { createdAt: "desc" }, take: 3000 }),
        [],
        "orders",
      )
    : [];
  const ranked = topVideos(top, orders.map((order) => ({ createdAt: order.createdAt, productIds: orderProductIds(order.items) })));
  const products = ranked.length ? await safe(() => db.storeProduct.findMany({ where: { id: { in: ranked.map((video) => video.productId) } }, select: { id: true, name: true } }), [], "products") : [];
  const productName = new Map(products.map((product) => [product.id, product.name]));

  return {
    plugLive: PLUG_LIVE,
    plugJoins: plugJoins(followers, PLUG_LIVE),
    visits: visitTotals(hits, now),
    followers,
    buyers: { buyers, repeat },
    resell,
    videos: ranked.map((video) => ({ id: video.id, productId: video.productId, productName: productName.get(video.productId) ?? "", caption: video.caption, views: video.views, ordersSince: video.ordersSince, createdAt: video.createdAt.toISOString() })),
    videoViews: videos.reduce((total, video) => total + (video.views || 0), 0),
  };
}

// ─── Every pilot shop (admin) ─────────────────────────────────────────────────

/**
 * The shops in the pilot: shops (or their owners) a pilot feature targets, owners who redeemed an invite for one,
 * and shops with pilot activity in the last 30 days (link visits, resell sales, videos, followers), each checked
 * against the switches. At most `limit`.
 */
export async function pilotShops(limit = 150) {
  const keys = [...PILOT_NUMBER_FEATURES] as string[];
  const since = new Date(Date.now() - 30 * 24 * 3600_000);
  const state = await safe(() => loadSwitchState(), null, "the switches");
  const targets = state?.targets.filter((target) => keys.includes(target.featureKey)) ?? [];
  const [inviteUses, hitStores, resellStores, videoStores, followerStores] = await Promise.all([
    safe(() => db.featureInviteUse.findMany({ where: { invite: { disabled: false, features: { hasSome: keys } } }, select: { userId: true }, take: 500 }), [], "invites"),
    safe(() => db.shopLinkHit.findMany({ where: { day: { gte: since } }, distinct: ["storeId"], select: { storeId: true }, take: 500 }), [], "visits"),
    safe(() => db.resellSale.findMany({ where: { createdAt: { gte: since } }, distinct: ["storeId"], select: { storeId: true }, take: 500 }), [], "resell sales"),
    safe(() => db.productVideo.findMany({ where: { ownerKind: "store", storeId: { not: null } }, distinct: ["storeId"], select: { storeId: true }, take: 500 }), [], "videos"),
    safe(() => db.shopFollower.findMany({ where: { source: { in: ["link", "qr", "plug"] } }, distinct: ["storeId"], select: { storeId: true }, take: 500 }), [], "followers"),
  ]);
  const storeIds = new Set<string>([
    ...targets.filter((target) => target.kind === "store").map((target) => target.value),
    ...hitStores.map((row) => row.storeId),
    ...resellStores.map((row) => row.storeId),
    ...videoStores.flatMap((row) => (row.storeId ? [row.storeId] : [])),
    ...followerStores.map((row) => row.storeId),
  ]);
  const ownerIds = new Set<string>([...targets.filter((target) => target.kind === "user").map((target) => target.value), ...inviteUses.map((use) => use.userId)]);
  const stores = await db.store.findMany({
    where: { OR: [{ id: { in: [...storeIds] } }, { userId: { in: [...ownerIds] } }] },
    select: { id: true, name: true, handle: true, slug: true, userId: true, status: true },
    orderBy: { createdAt: "asc" },
    take: 400,
  });
  const out: typeof stores = [];
  for (const store of stores) {
    if (out.length >= limit) break;
    if (await pilotNumbersOnForOwner(store.userId)) out.push(store);
  }
  return out;
}

/** Every pilot shop with its numbers, most link visits (30 days) first. */
export async function pilotShopNumbers(now = new Date()) {
  const shops = await pilotShops();
  const rows: Array<{ storeId: string; shopName: string; handle: string | null; status: string; numbers: PilotNumbers; videoCount: number }> = [];
  for (const shop of shops) {
    const [numbers, videoCount] = await Promise.all([
      storePilotNumbers(shop.id, now),
      safe(() => db.productVideo.count({ where: { storeId: shop.id, ownerKind: "store", status: { not: "removed" } } }), 0, "video count"),
    ]);
    rows.push({ storeId: shop.id, shopName: shop.name, handle: shop.handle, status: shop.status, numbers, videoCount });
  }
  return rows.sort((a, b) => b.numbers.visits.total30 - a.numbers.visits.total30 || b.numbers.resell.sales - a.numbers.resell.sales || a.shopName.localeCompare(b.shopName));
}
