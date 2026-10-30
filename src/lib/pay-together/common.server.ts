import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { featuresFor, appFromHeaders } from "@/lib/feature-switches.server";
import { APP_VERSION_HEADER, type FeatureApp } from "@shared/feature-switches";
import { phoneVerifySecret } from "@/lib/commerce/phone-verify";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { notify } from "@/lib/notifications/notify.server";
import { reserveStock, InsufficientStockError } from "@/lib/commerce/stock.server";
import type { StockHold } from "@/lib/commerce/stock-holds";
import { storeStockMode } from "@/lib/commerce/stock-holds";
import { normalizeVariants, findProductVariant, variantPrice } from "@shared/product-variants";
import { recordShopperOrder } from "@/lib/shoppers.server";
import { afterRetailOrderPaid } from "@/lib/commerce/order-paid.server";
import type { PaymentSplitPlan } from "@/lib/wallet/rules";
import { loadOptOuts } from "@/lib/marketing/opt-outs";
import { mayText } from "@/lib/marketing/text-channels";
import { normalizePhone } from "@/lib/marketing/segment-rules";
import { textSender } from "@/lib/marketing/channels";
import { getMessagingSettings } from "@/lib/marketing/messaging-settings";
import { escapeHtml, html, storeEmail } from "@/lib/email/shell";
import { appBase, storeSender, SENDER_STORE_SELECT } from "@/lib/email/compliance.server";
import { formatFromAddress, sendEmail } from "@/lib/notifications/resend";
import { checkRateLimitShared, rateLimitKey, requestIp } from "@/lib/rate-limit";

// What Pay small small, ajo and group buy share on the server: is the pilot on for a shop, signed links for shoppers,
// the product being sold, holding stock, the paid order made at the end, and messages to shoppers and sellers.

const BUSINESS_APPS: FeatureApp[] = ["business_web", "business_android", "business_ios"];

export type TogetherFeature = "pay_small_small" | "ajo" | "group_buy";

/** Is this pilot on for the shop owner on any business app? (Storefront parts follow the shop owner's switch.) */
export async function featureOnForOwner(userId: string, key: TogetherFeature): Promise<boolean> {
  for (const app of BUSINESS_APPS) if ((await featuresFor({ id: userId }, app, null)).includes(key)) return true;
  return false;
}

export async function featureOnForStore(storeId: string, key: TogetherFeature): Promise<boolean> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { userId: true } });
  return store ? featureOnForOwner(store.userId, key) : false;
}

/** Is this pilot on for this account on the app asking (the web when it sends no app header)? */
export async function featureOnForRequest(req: NextRequest, userId: string, key: TogetherFeature): Promise<boolean> {
  const app = appFromHeaders(req.headers);
  if (!app) return false;
  const version = req.headers.get(APP_VERSION_HEADER)?.trim().slice(0, 32) || null;
  return (await featuresFor({ id: userId }, app, version)).includes(key);
}

/** Thrown before the migration has run (the tables don't exist yet). */
export function tablesMissing(error: unknown) {
  const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined;
  return code === "P2021" || code === "P2022" || /does not exist/i.test(String((error as Error)?.message ?? ""));
}

/** Per-IP limit on the public storefront actions (shared across servers; fails open so shoppers can still pay). */
export async function publicActionLimited(headers: { get(name: string): string | null }, action: string, maxRequests = 20, windowMs = 10 * 60_000) {
  const result = await checkRateLimitShared(rateLimitKey(`together:${action}`, requestIp(headers)), { maxRequests, windowMs });
  return !result.allowed;
}

// ─── Signed links (the shopper's own plan / membership) ───────────────────────

function linkSecret() {
  return process.env.PAY_LINK_SECRET || phoneVerifySecret();
}

/** A token proving the link was made by us for this one thing (no expiry: it only shows progress and a Pay button). */
export function signLink(kind: "plan" | "ajo" | "group", id: string): string {
  const secret = linkSecret();
  if (!secret) throw new Error("No secret to sign shopper links (set PAY_LINK_SECRET or JWT_SECRET).");
  return createHmac("sha256", secret).update(`${kind}:${id}`).digest("base64url").slice(0, 32);
}

export function checkLink(kind: "plan" | "ajo" | "group", id: string, token: unknown): boolean {
  if (typeof token !== "string" || token.length !== 32) return false;
  const secret = linkSecret();
  if (!secret) return false;
  const expected = Buffer.from(signLink(kind, id));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function newReference(prefix: string) {
  return `${prefix}${randomBytes(10).toString("hex")}`;
}

// ─── The store and the product ────────────────────────────────────────────────

export async function liveStore(slug: string) {
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, userId: true, name: true, slug: true, customDomain: true, status: true, currency: true } });
  return store && store.status === "active" ? store : null;
}

export type StoreRef = { id: string; slug: string; customDomain: string | null; name: string };

export function storeLink(store: { slug: string; customDomain: string | null }, path: string) {
  return buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain }, path);
}

export interface SaleProduct {
  id: string;
  storeId: string;
  name: string;
  image: string | null;
  /** The unit price (the chosen version's, else the product's), in kobo. */
  unitKobo: number;
  retailKobo: number;
  variantId: string | null;
  variantLabel: string | null;
  /** Tracked stock that refuses to oversell: plans hold units of it (StoreProduct.reservedStock). */
  holdsStock: boolean;
  available: number | null;
}

/**
 * A published product of the store's OWN stock (not dropship: a dropship sale needs the supplier paid in the same
 * split, which a saved-card charge can't do), with the chosen version's price. Null when it can't be sold this way.
 */
export async function loadSaleProduct(storeId: string, productId: string, variantId?: string | null): Promise<SaleProduct | { problem: string } | null> {
  const product = await db.storeProduct.findFirst({
    where: { id: productId, storeId },
    select: { id: true, storeId: true, name: true, images: true, retailPrice: true, status: true, fulfillmentType: true, supplierProductId: true, variants: true, trackStock: true, continueSellingWhenOut: true, preorderEnabled: true, currentStock: true, reservedStock: true },
  });
  if (!product || product.status !== "published") return null;
  if (product.fulfillmentType === "dropship" || product.supplierProductId) return { problem: "This product ships from a supplier, so it can't be paid this way." };
  const variants = normalizeVariants(product.variants).filter((variant) => variant.enabled);
  let variant = null;
  if (variants.length) {
    variant = variantId ? findProductVariant(variants, { variantId }) : null;
    if (!variant) return { problem: "Choose a size or colour first." };
  }
  const unit = variant ? variantPrice(variant, product.retailPrice) : product.retailPrice;
  const mode = storeStockMode(product);
  return {
    id: product.id,
    storeId: product.storeId,
    name: product.name,
    image: variant?.imageUrl ?? product.images[0] ?? null,
    unitKobo: Math.round(unit * 100),
    retailKobo: Math.round(product.retailPrice * 100),
    variantId: variant?.id ?? null,
    variantLabel: variant?.name ?? null,
    holdsStock: mode === "strict",
    available: mode === "strict" ? product.currentStock - Math.max(0, product.reservedStock) : null,
  };
}

/**
 * Sets units aside while a plan runs (tracked stock only): reservedStock goes up only while enough is free, so two
 * plans can't hold the last unit. Returns the units held (0 when the product isn't tracked).
 */
export async function holdUnits(productId: string, quantity: number): Promise<number | "sold_out"> {
  const product = await db.storeProduct.findUnique({ where: { id: productId }, select: { trackStock: true, continueSellingWhenOut: true, preorderEnabled: true } });
  if (!product || storeStockMode(product) !== "strict") return 0;
  const updated = await db.$executeRaw`
    UPDATE "StoreProduct" SET "reservedStock" = GREATEST("reservedStock", 0) + ${quantity}, "updatedAt" = NOW()
    WHERE id = ${productId} AND "currentStock" - GREATEST("reservedStock", 0) >= ${quantity}`;
  return updated === 1 ? quantity : "sold_out";
}

/** Gives held units back (a plan cancelled or defaulted). Never below zero. */
export async function releaseUnits(productId: string, quantity: number) {
  if (quantity <= 0) return;
  await db.storeProduct.updateMany({ where: { id: productId, reservedStock: { gte: quantity } }, data: { reservedStock: { decrement: quantity } } });
}

// ─── The paid order at the end ────────────────────────────────────────────────

function orderNumber() {
  return `SB-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * Makes the store order once the product is fully paid (the last part of a plan, an ajo collector's week, a group-buy
 * charge): status paid, the usual follow-ups (seller told, customer messages, delivery, wallet statement). Units a
 * plan held are released and the sale takes the stock as checkout would; if the stock has meanwhile run out, the
 * order is still made (it's paid) and the seller is told to sort out the stock.
 */
export async function createPaidOrder(input: {
  storeId: string;
  product: { id: string; name: string; image: string | null; variantId: string | null; variantLabel: string | null };
  quantity: number;
  unitNaira: number;
  buyer: { name: string; email: string; phone: string | null };
  address: unknown;
  note: string;
  paystackRef: string | null;
  split: PaymentSplitPlan | null;
  releaseHeld?: number;
  logTag: string;
}): Promise<{ orderId: string; orderNumber: string; stockShort: boolean }> {
  const product = await db.storeProduct.findUnique({ where: { id: input.product.id }, select: { name: true, trackStock: true, continueSellingWhenOut: true, preorderEnabled: true, variants: true } });
  const mode = product ? storeStockMode(product) : "off";
  const variant = input.product.variantId && product ? normalizeVariants(product.variants).find((entry) => entry.id === input.product.variantId) : null;
  const hold: StockHold = {
    source: "store",
    productId: input.product.id,
    quantity: input.quantity,
    name: input.product.name,
    ...(mode !== "strict" ? { mode } : {}),
    ...(variant && variant.stock !== null && mode !== "off" && mode !== "preorder" ? { variants: [{ id: variant.id, quantity: input.quantity, name: variant.name }] } : {}),
  };
  const lineName = input.product.variantLabel ? `${input.product.name} · ${input.product.variantLabel}` : input.product.name;
  const items = [{ productId: input.product.id, name: lineName, price: input.unitNaira, quantity: input.quantity, ...(input.product.variantLabel ? { variant: input.product.variantLabel } : {}), ...(input.product.variantId ? { variantId: input.product.variantId } : {}), ...(input.product.image ? { image: input.product.image } : {}) }];
  const total = Math.round(input.unitNaira * input.quantity * 100) / 100;
  const address = input.address && typeof input.address === "object" ? (input.address as Record<string, unknown>) : {};
  const base = {
    storeId: input.storeId,
    orderNumber: orderNumber(),
    buyerName: input.buyer.name,
    buyerEmail: input.buyer.email,
    buyerPhone: input.buyer.phone,
    deliveryAddress: JSON.parse(JSON.stringify(address)),
    items: JSON.parse(JSON.stringify(items)),
    subtotal: total,
    shippingFee: 0,
    total,
    channel: "online_store",
    notes: input.note.slice(0, 1000),
    status: "paid" as const,
    paystackStatus: "success",
    paystackRef: input.paystackRef,
    ...(input.split ? { paymentSplit: JSON.parse(JSON.stringify(input.split)) } : {}),
  };
  const release = async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
    if (input.releaseHeld && input.releaseHeld > 0) await tx.storeProduct.updateMany({ where: { id: input.product.id, reservedStock: { gte: input.releaseHeld } }, data: { reservedStock: { decrement: input.releaseHeld } } });
  };
  let stockShort = false;
  let order: { id: string; orderNumber: string; storeId: string; buyerPhone: string | null; buyerName: string; buyerEmail: string; deliveryAddress: unknown; total: number; createdAt: Date };
  try {
    order = await db.$transaction(async (tx) => {
      await release(tx);
      const taken = await reserveStock(tx, input.storeId, [hold]);
      return tx.retailOrder.create({ data: { ...base, stockHold: JSON.parse(JSON.stringify(taken)) } });
    });
  } catch (error) {
    if (!(error instanceof InsufficientStockError)) throw error;
    stockShort = true;
    order = await db.$transaction(async (tx) => {
      await release(tx);
      return tx.retailOrder.create({ data: { ...base, paymentIssue: `Paid in full, but ${input.product.name} was out of stock when the order was made. Restock it or agree a swap with the customer.` } });
    });
  }
  await recordShopperOrder({ id: order.id, storeId: order.storeId, buyerPhone: order.buyerPhone, buyerName: order.buyerName, buyerEmail: order.buyerEmail, deliveryAddress: order.deliveryAddress, total: order.total, createdAt: order.createdAt });
  await afterRetailOrderPaid(order.id, true, input.logTag);
  return { orderId: order.id, orderNumber: order.orderNumber, stockShort };
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function tellSeller(storeId: string, input: { title: string; description: string; link: string; dedupeKey: string; priority?: "info" | "success" | "warning" | "critical"; event?: string }) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { userId: true } });
  if (!store) return;
  await notify({
    userId: store.userId,
    event: input.event ?? "order.update",
    type: "order",
    priority: input.priority ?? "info",
    title: input.title,
    description: input.description,
    link: input.link,
    dedupeKey: input.dedupeKey,
  }).catch((error) => console.error("[pay-together] seller notice failed", error));
}

/**
 * One message to a shopper about their own plan / group (transactional: they asked for it). SMS through the shop's
 * usual sender when the number may be texted (never after STOP), once per `event` + `refId`; email when there's no
 * number, it may not be texted, or the SMS fails. Never throws. Returns how it went out.
 */
export async function messageShopper(input: {
  storeId: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  event: string;
  refId: string;
  sms: string;
  email_: { subject: string; heading: string; body: string; cta?: { label: string; url: string } };
}): Promise<"sms" | "email" | "none"> {
  try {
    const store = await db.store.findUnique({ where: { id: input.storeId }, select: SENDER_STORE_SELECT });
    if (!store) return "none";
    const phone = normalizePhone(input.phone);
    if (phone) {
      const optOuts = await loadOptOuts(store.id);
      const allowed = mayText({ channel: "sms", phone, purpose: "transactional", consent: true, optOuts });
      if (allowed.ok) {
        const key = { storeId: store.id, event: input.event, refId: input.refId, channel: "sms" };
        const claimed = await db.customerMessage.create({ data: { ...key, to: phone }, select: { id: true } }).catch(() => null);
        if (!claimed) return "sms"; // Already sent for this event.
        const settings = await getMessagingSettings(store.id);
        const send = await textSender(store, { senderId: settings.smsSenderId });
        const outcome = await send.sms(phone, input.sms.replace(/\s{2,}/g, " ").trim()).catch((error) => ({ ok: false as const, error: String(error) }));
        await db.customerMessage.update({ where: { id: claimed.id }, data: outcome.ok ? { status: "sent", sentAt: new Date(), externalId: outcome.externalId ?? null } : { status: "failed", error: String(outcome.error).slice(0, 300) } }).catch(() => null);
        if (outcome.ok) return "sms";
      }
    }
    if (!input.email) return "none";
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey || resendKey.includes("your_")) return "none";
    const key = { storeId: store.id, event: input.event, refId: input.refId, channel: "email" };
    const claimed = await db.customerMessage.create({ data: { ...key, to: input.email }, select: { id: true } }).catch(() => null);
    if (!claimed) return "email";
    const first = String(input.name ?? "").trim().split(/\s+/)[0] || "there";
    const body = storeEmail({
      appUrl: appBase(),
      store: storeSender(store),
      kind: "transactional",
      preheader: input.email_.subject,
      heading: input.email_.heading,
      bodyHtml: html.raw(`Hi ${escapeHtml(first)}, ${escapeHtml(input.email_.body)}`),
      cta: input.email_.cta ?? null,
      reason: `you are paying for an item at ${store.name}`,
    });
    const sent = await sendEmail({ to: [input.email], subject: input.email_.subject, html: body, from: formatFromAddress(store.name) });
    await db.customerMessage.update({ where: { id: claimed.id }, data: sent.success ? { status: "sent", sentAt: new Date() } : { status: "failed", error: String(sent.message ?? "").slice(0, 300) } }).catch(() => null);
    return sent.success ? "email" : "none";
  } catch (error) {
    console.error(`[pay-together] message ${input.event} for ${input.refId} failed`, error);
    return "none";
  }
}

export const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;

export const dayText = (date: Date) => date.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" });
