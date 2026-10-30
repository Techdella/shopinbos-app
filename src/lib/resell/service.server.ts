import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { featuresFor, loadSwitchState } from "@/lib/feature-switches.server";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { PAID_RETAIL_STATUSES } from "@/lib/supplier-orders/pure";
import type { FeatureApp } from "@shared/feature-switches";
import { storefrontProductUrl } from "@shared/product-codes";
import {
  RESELL_FEATURE,
  RESELL_LINKS_PER_DAY,
  RESELL_PCT_DEFAULT,
  canVoidResellSale,
  cleanResellCode,
  effectiveResellStatus,
  pickResellLinks,
  resellCodeFrom,
  resellLinkUrl,
  resellSaleFor,
  resellTotals,
  statusAfterDelivered,
  statusAfterPaid,
  visibleResellSale,
  withResellParam,
  type ResellOrderLine,
} from "@shared/resell";

// Resell on the server (shared/resell.ts has the rules; docs/migrations/2026-12-14-resell.sql the tables).
// Shopinbos only RECORDS what each shop owes its resellers: no money moves here, ever.
//
//   * the shop: "Let resellers sell this" + commission per product (getProductResell / saveProductResell) and the
//     sales list (storeResellSales);
//   * the reseller: products they may resell (resellableProducts), their link (linkForReseller) and their sales;
//   * the order: checkout records the links an order came through (attachResellToOrder, awaiting payment); every
//     place an order is paid, delivered, cancelled or refunded calls syncResellSales / voidResellSales. None of these
//     throw: resell must never break a checkout, a webhook or a status change.

export class ResellNotReady extends Error {}

function missingTable(error: unknown) {
  const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined;
  return code === "P2021" || code === "P2022" || /does not exist/i.test(String((error as Error)?.message ?? ""));
}

async function ready<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (missingTable(error)) throw new ResellNotReady("Resell isn't set up yet (docs/migrations/2026-12-14-resell.sql).");
    throw error;
  }
}

const BUSINESS_APPS: FeatureApp[] = ["business_web", "business_android", "business_ios"];

/** Is resell on for this account on this app (the web when none is given)? Never throws. */
export async function resellOnFor(userId: string | null | undefined, app: FeatureApp | null = "business_web", version: string | null = null): Promise<boolean> {
  if (!userId || !app) return false;
  return (await featuresFor({ id: userId }, app, version)).includes(RESELL_FEATURE);
}

/** Is resell on for this shop owner on any business app (a shop may be in the pilot on the phone only)? */
export async function resellOnForOwner(userId: string): Promise<boolean> {
  for (const app of BUSINESS_APPS) if (await resellOnFor(userId, app)) return true;
  return false;
}

/** The master switch: resell exists, is on and isn't killed (globally or by its own kill switch). Never throws. */
export async function resellLive(): Promise<boolean> {
  try {
    const state = await loadSwitchState();
    const row = state.switches.find((entry) => entry.key === RESELL_FEATURE);
    return Boolean(row && row.enabled && !row.killed && !state.killAll);
  } catch {
    return false;
  }
}

function appOrigin() {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://app.shopinbos.com";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://app.shopinbos.com";
  }
}

const pct = (value: unknown) => Math.round(Number(value) * 100) / 100;

// ─── The shop ─────────────────────────────────────────────────────────────────

export interface ProductResell {
  enabled: boolean;
  commissionPct: number;
  links: number;
}

export async function getProductResell(storeId: string, productId: string): Promise<ProductResell> {
  return ready(async () => {
    const [setting, links] = await Promise.all([
      db.resellSetting.findUnique({ where: { productId } }),
      db.resellLink.count({ where: { storeId, productId } }),
    ]);
    if (!setting || setting.storeId !== storeId) return { enabled: false, commissionPct: RESELL_PCT_DEFAULT, links };
    return { enabled: setting.enabled, commissionPct: pct(setting.commissionPct), links };
  });
}

/** Saves the switch and the commission for one of the shop's own products (the caller checked it's theirs). */
export async function saveProductResell(storeId: string, productId: string, input: { enabled: boolean; commissionPct: number }): Promise<ProductResell> {
  return ready(async () => {
    await db.resellSetting.upsert({
      where: { productId },
      create: { productId, storeId, enabled: input.enabled, commissionPct: input.commissionPct },
      update: { enabled: input.enabled, commissionPct: input.commissionPct },
    });
    return getProductResell(storeId, productId);
  });
}

export interface ResellSaleRow {
  id: string;
  storeId: string;
  orderId: string;
  orderNumber: string | null;
  productId: string;
  productName: string;
  resellerUserId: string;
  resellerName: string;
  quantity: number;
  lineTotal: number;
  commissionPct: number;
  commissionAmount: number;
  status: string;
  createdAt: string;
}

async function saleRows(where: { storeId?: string; resellerUserId?: string }, take = 200): Promise<ResellSaleRow[]> {
  const sales = await db.resellSale.findMany({ where: { ...where, status: { not: "awaiting_payment" } }, orderBy: { createdAt: "desc" }, take });
  if (!sales.length) return [];
  const [orders, products, people] = await Promise.all([
    db.retailOrder.findMany({ where: { id: { in: [...new Set(sales.map((sale) => sale.orderId))] } }, select: { id: true, orderNumber: true, status: true } }),
    db.storeProduct.findMany({ where: { id: { in: [...new Set(sales.map((sale) => sale.productId))] } }, select: { id: true, name: true } }),
    db.user.findMany({ where: { id: { in: [...new Set(sales.map((sale) => sale.resellerUserId))] } }, select: { id: true, name: true } }),
  ]);
  const orderOf = new Map(orders.map((order) => [order.id, order]));
  const productName = new Map(products.map((product) => [product.id, product.name]));
  // The shop sees the reseller's name only (never their phone or email).
  const personName = new Map(people.map((person) => [person.id, person.name]));
  return sales
    .map((sale) => {
      const order = orderOf.get(sale.orderId);
      return {
        id: sale.id,
        storeId: sale.storeId,
        orderId: sale.orderId,
        orderNumber: order?.orderNumber ?? null,
        productId: sale.productId,
        productName: productName.get(sale.productId) ?? "",
        resellerUserId: sale.resellerUserId,
        resellerName: personName.get(sale.resellerUserId) ?? "",
        quantity: sale.quantity,
        lineTotal: sale.lineTotal,
        commissionPct: pct(sale.commissionPct),
        commissionAmount: sale.commissionAmount,
        status: effectiveResellStatus(sale.status, order?.status),
        createdAt: sale.createdAt.toISOString(),
      };
    })
    .filter((row) => visibleResellSale(row.status));
}

/** The shop's resell sales (newest 200): who sold what and the commission the shop owes, with totals. */
export async function storeResellSales(storeId: string) {
  return ready(async () => {
    const sales = await saleRows({ storeId });
    return { sales, totals: resellTotals(sales) };
  });
}

// ─── The reseller ─────────────────────────────────────────────────────────────

export interface ResellableProduct {
  productId: string;
  name: string;
  image: string | null;
  price: number;
  currency: string;
  commissionPct: number;
  commissionEach: number;
  storeId: string;
  storeName: string;
  link: string | null;
  clicks: number;
}

/**
 * Products this person may resell: switched on by a live shop that is in the resell pilot, published, and not their
 * own shop's. Newest settings first, at most 100, with their own link when they already have one.
 */
export async function resellableProducts(userId: string): Promise<ResellableProduct[]> {
  return ready(async () => {
    const settings = await db.resellSetting.findMany({ where: { enabled: true }, orderBy: { updatedAt: "desc" }, take: 300 });
    if (!settings.length) return [];
    const [products, stores, links] = await Promise.all([
      db.storeProduct.findMany({ where: { id: { in: settings.map((row) => row.productId) }, status: "published" }, select: { id: true, storeId: true, name: true, images: true, retailPrice: true, currency: true } }),
      db.store.findMany({ where: { id: { in: [...new Set(settings.map((row) => row.storeId))] }, status: "active" }, select: { id: true, name: true, userId: true } }),
      db.resellLink.findMany({ where: { resellerUserId: userId, productId: { in: settings.map((row) => row.productId) } }, select: { productId: true, code: true, clicks: true } }),
    ]);
    // Only shops still in the pilot (checked once per shop owner), never the person's own shop.
    const pilotStores = new Map<string, { name: string }>();
    await Promise.all(
      stores.filter((store) => store.userId !== userId).slice(0, 60).map(async (store) => {
        if (await resellOnForOwner(store.userId)) pilotStores.set(store.id, { name: store.name });
      }),
    );
    const productOf = new Map(products.map((product) => [product.id, product]));
    const linkOf = new Map(links.map((link) => [link.productId, link]));
    const out: ResellableProduct[] = [];
    for (const setting of settings) {
      const product = productOf.get(setting.productId);
      const store = pilotStores.get(setting.storeId);
      if (!product || !store || product.storeId !== setting.storeId) continue;
      const commissionPct = pct(setting.commissionPct);
      const link = linkOf.get(product.id);
      out.push({
        productId: product.id,
        name: product.name,
        image: product.images[0] ?? null,
        price: product.retailPrice,
        currency: product.currency,
        commissionPct,
        commissionEach: Math.round((product.retailPrice * commissionPct) / 100),
        storeId: setting.storeId,
        storeName: store.name,
        link: link ? resellLinkUrl(appOrigin(), link.code) : null,
        clicks: link?.clicks ?? 0,
      });
      if (out.length >= 100) break;
    }
    return out;
  });
}

export type LinkResult = { ok: true; link: string; code: string; created: boolean } | { ok: false; code: "NOT_FOUND" | "OWN_SHOP" | "RATE_LIMITED"; message: string };

/** The reseller's link for a product: their existing one, or a new one (rate limited). The caller checked the feature. */
export async function linkForReseller(userId: string, productId: string): Promise<LinkResult> {
  return ready(async () => {
    const existing = await db.resellLink.findUnique({ where: { resellerUserId_productId: { resellerUserId: userId, productId } } });
    if (existing) return { ok: true, link: resellLinkUrl(appOrigin(), existing.code), code: existing.code, created: false };

    const setting = await db.resellSetting.findUnique({ where: { productId } });
    const product = setting?.enabled ? await db.storeProduct.findFirst({ where: { id: productId, storeId: setting.storeId, status: "published" }, select: { id: true, storeId: true } }) : null;
    const store = product ? await db.store.findUnique({ where: { id: product.storeId }, select: { id: true, userId: true, status: true } }) : null;
    if (!setting || !product || !store || store.status !== "active" || !(await resellOnForOwner(store.userId))) {
      return { ok: false, code: "NOT_FOUND", message: "This product can't be resold right now." };
    }
    if (store.userId === userId) return { ok: false, code: "OWN_SHOP", message: "This is your own shop's product." };

    // At most RESELL_LINKS_PER_DAY new links a day, and no bursts.
    const burst = await checkRateLimitShared(rateLimitKey("resell-link", userId), { maxRequests: 10, windowMs: 60_000 });
    const today = await db.resellLink.count({ where: { resellerUserId: userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
    if (!burst.allowed || today >= RESELL_LINKS_PER_DAY) return { ok: false, code: "RATE_LIMITED", message: "You've made a lot of links today. Try again tomorrow." };

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = resellCodeFrom(randomBytes(12));
      try {
        const link = await db.resellLink.create({ data: { code, resellerUserId: userId, storeId: store.id, productId } });
        return { ok: true, link: resellLinkUrl(appOrigin(), link.code), code: link.code, created: true };
      } catch (error) {
        if ((error as { code?: string })?.code !== "P2002") throw error;
        // Made a moment ago in another request (same reseller and product): that one.
        const raced = await db.resellLink.findUnique({ where: { resellerUserId_productId: { resellerUserId: userId, productId } } });
        if (raced) return { ok: true, link: resellLinkUrl(appOrigin(), raced.code), code: raced.code, created: false };
        // Otherwise the code was taken: try another.
      }
    }
    throw new Error("Could not make a resell link code");
  });
}

/** The reseller's own sales and what they're owed (by the shops). */
export async function resellerSales(userId: string) {
  return ready(async () => {
    const sales = await saleRows({ resellerUserId: userId });
    const stores = await db.store.findMany({ where: { id: { in: [...new Set(sales.map((sale) => sale.storeId))] } }, select: { id: true, name: true } });
    const storeName = new Map(stores.map((store) => [store.id, store.name]));
    // The reseller sees the shop, never the buyer.
    const rows = sales.map(({ resellerName: _name, resellerUserId: _id, ...sale }) => ({ ...sale, storeName: storeName.get(sale.storeId) ?? "" }));
    return { sales: rows, totals: resellTotals(sales) };
  });
}

// ─── The short link (/rs/<code>) ──────────────────────────────────────────────

/** Where /rs/<code> goes: the product on its shop with ?rs=<code>, or null (unknown, switched off, not live). */
export async function resellRedirect(rawCode: string, countClick: boolean): Promise<string | null> {
  const code = cleanResellCode(rawCode);
  if (!code) return null;
  try {
    const link = await db.resellLink.findUnique({ where: { code } });
    if (!link) return null;
    const [setting, product, store] = await Promise.all([
      db.resellSetting.findUnique({ where: { productId: link.productId }, select: { enabled: true } }),
      db.storeProduct.findFirst({ where: { id: link.productId, storeId: link.storeId }, select: { id: true, status: true } }),
      db.store.findUnique({ where: { id: link.storeId }, select: { slug: true, customDomain: true, status: true } }),
    ]);
    if (!store || store.status !== "active") return null;
    const live = Boolean(product && product.status === "published");
    if (countClick && live && setting?.enabled) await db.resellLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } }).catch(() => null);
    const shop = buildStorefrontUrl(store);
    // The product when it's live (with the code only while reselling is on); else the shop's front page.
    if (!live) return shop;
    const page = storefrontProductUrl(shop, link.productId);
    return setting?.enabled ? withResellParam(page, code) : page;
  } catch (error) {
    if (!missingTable(error)) console.error("[resell] link lookup failed", error);
    return null;
  }
}

// ─── Orders ───────────────────────────────────────────────────────────────────

/**
 * Checkout: records the reseller links this order came through (one per product, newest code wins), awaiting
 * payment. Only links for products the shop still resells, at the commission set now. Never throws.
 */
export async function attachResellToOrder(input: { storeId: string; ownerUserId: string; orderId: string; codes: readonly string[]; items: readonly ResellOrderLine[]; productDiscount: number }) {
  try {
    const codes = [...new Set(input.codes.map(cleanResellCode).filter((code): code is string => Boolean(code)))].slice(0, 10);
    if (!codes.length || !input.items.length) return;
    if (!(await resellLive())) return;
    const links = await db.resellLink.findMany({ where: { code: { in: codes }, storeId: input.storeId } });
    const chosen = pickResellLinks(codes, links, input.items.map((item) => item.productId), input.ownerUserId);
    if (!chosen.length) return;
    const settings = await db.resellSetting.findMany({ where: { productId: { in: chosen.map((link) => link.productId) }, storeId: input.storeId, enabled: true } });
    const settingOf = new Map(settings.map((row) => [row.productId, row]));
    if (!settings.length || !(await resellOnForOwner(input.ownerUserId))) return;
    for (const link of chosen) {
      const setting = settingOf.get(link.productId);
      if (!setting) continue;
      const sale = resellSaleFor(input.items, link.productId, input.productDiscount, pct(setting.commissionPct));
      if (!sale) continue;
      await db.resellSale
        .create({
          data: {
            linkId: link.id,
            orderId: input.orderId,
            storeId: input.storeId,
            resellerUserId: link.resellerUserId,
            productId: link.productId,
            quantity: sale.quantity,
            lineTotal: sale.lineTotal,
            commissionPct: sale.commissionPct,
            commissionAmount: sale.commissionAmount,
            status: "awaiting_payment",
          },
        })
        .catch((error: unknown) => {
          if ((error as { code?: string })?.code !== "P2002") throw error;
        });
    }
  } catch (error) {
    if (!missingTable(error)) console.error(`[resell] could not record the reseller links of order ${input.orderId}`, error);
  }
}

/**
 * Brings an order's resell sales in line with the order: paid → they count (pending); delivered → owed now
 * (approved); cancelled, refunded or returned → void (unless the shop already paid them). Idempotent; never throws.
 * Call it wherever an order is paid, delivered, cancelled or refunded.
 */
export async function syncResellSales(orderId: string) {
  try {
    const sales = await db.resellSale.findMany({ where: { orderId }, select: { id: true, status: true } });
    if (!sales.length) return;
    const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!order) return;
    const status = String(order.status);
    for (const sale of sales) {
      let next = sale.status;
      if (effectiveResellStatus(sale.status, status) === "void") next = "void";
      else if (status === "delivered") next = statusAfterDelivered(sale.status);
      else if ((PAID_RETAIL_STATUSES as readonly string[]).includes(status)) next = statusAfterPaid(sale.status);
      if (next !== sale.status) await db.resellSale.updateMany({ where: { id: sale.id, status: sale.status }, data: { status: next } });
    }
  } catch (error) {
    if (!missingTable(error)) console.error(`[resell] could not update the resell sales of order ${orderId}`, error);
  }
}

/** Voids an order's resell sales that aren't paid yet (a full refund of an order that stays "delivered"). Never throws. */
export async function voidResellSales(orderId: string) {
  try {
    const sales = await db.resellSale.findMany({ where: { orderId }, select: { id: true, status: true } });
    for (const sale of sales) {
      if (canVoidResellSale(sale.status)) await db.resellSale.updateMany({ where: { id: sale.id, status: sale.status }, data: { status: "void" } });
    }
  } catch (error) {
    if (!missingTable(error)) console.error(`[resell] could not void the resell sales of order ${orderId}`, error);
  }
}
