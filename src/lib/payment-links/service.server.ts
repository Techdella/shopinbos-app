import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { PAID_RETAIL_STATUSES } from "@/lib/supplier-orders/pure";
import { checkoutPaymentOptions, checkoutPaymentSettings, paystackSecretReady } from "@shared/checkout-payments";
import { normalizeVariants, resolveLineVariant } from "@shared/product-variants";
import { storeTakesCards, storeTakesKorapay } from "@/lib/wallet/wallet.server";
import {
  CUSTOMER_LINK_LIMITS,
  customerLinkProblem,
  customerLinkQuantity,
  expiryFor,
  linkCheckoutLines,
  linkPayBlock,
  linkStatus,
  linkTitle,
  newLinkCode,
  PAY_BLOCK_MESSAGE,
  readLinkItems,
  type BuyerChoice,
  type CreatePaymentLinkInput,
  type CustomerLinkProblem,
  type LinkItem,
  type PaymentLinkCreator,
} from "./pure";
import { DEFAULT_PAGE_SIZE, pageWindow } from "@/lib/pagination";

// Payment links on the server: making them (seller, Peggy in seller chat, Peggy in a customer chat, link in bio),
// listing and cancelling them, turning one into checkout lines, and marking it paid once its order is paid. Every
// query is scoped to the store; products must be the store's own published ones and prices come from the database.

export interface LinkStore {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  currency: string;
}

export const LINK_STORE_SELECT = { id: true, name: true, slug: true, customDomain: true, currency: true } as const;

export function paymentLinkUrl(store: { slug: string; customDomain?: string | null }, code: string) {
  return buildStorefrontUrl(store, `/pay/${code}`);
}

export type LinkResult<T> = { ok: true } & T;
export type LinkFailure = { ok: false; message: string };

/**
 * The store's own published products for these items, with each line's option checked and its price and photo
 * snapshotted (what the seller's list shows; checkout prices again from the database).
 */
export async function snapshotItems(storeId: string, items: Array<{ productId: string; variantId?: string | null; quantity: number }>): Promise<LinkResult<{ items: LinkItem[]; total: number }> | LinkFailure> {
  const ids = [...new Set(items.map((item) => item.productId))];
  const products = await db.storeProduct.findMany({
    where: { storeId, id: { in: ids }, status: "published" },
    select: { id: true, name: true, retailPrice: true, variants: true, images: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const out: LinkItem[] = [];
  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product) return { ok: false, message: "One of those products isn't in your shop or isn't published. Publish it first." };
    let price = Number(product.retailPrice) || 0;
    let variantName: string | null = null;
    let image = product.images[0] ?? null;
    if (item.variantId) {
      const choice = resolveLineVariant(product, { variantId: item.variantId });
      if (!choice.ok) return { ok: false, message: `That option of ${product.name} isn't available. Pick another one.` };
      price = choice.price;
      variantName = choice.variant?.name ?? null;
      image = choice.variant?.imageUrl ?? image;
    } else if (normalizeVariants(product.variants).filter((variant) => variant.enabled).length > 0) {
      // Left open: the buyer picks on the page. Show the lowest price meanwhile.
      const prices = normalizeVariants(product.variants).filter((variant) => variant.enabled).map((variant) => variant.price ?? price);
      price = Math.min(...prices);
    }
    out.push({ productId: product.id, ...(item.variantId ? { variantId: item.variantId } : {}), quantity: item.quantity, name: variantName ? `${product.name} · ${variantName}` : product.name, price, image, variant: variantName });
  }
  const total = out.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0);
  return { ok: true, items: out, total };
}

async function uniqueCode() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = newLinkCode();
    if (!(await db.paymentLink.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("Could not make a unique payment link code");
}

export interface CreatedBy {
  createdBy: PaymentLinkCreator;
  conversationId?: string | null;
  customerRef?: string | null;
  channel?: string | null;
}

/** Makes a payment link in the store (input already validated with CreatePaymentLinkSchema). */
export async function createPaymentLink(store: LinkStore, input: CreatePaymentLinkInput, by: CreatedBy, now = new Date()) {
  const snapshot = await snapshotItems(store.id, input.items);
  if (!snapshot.ok) return snapshot;
  const code = await uniqueCode();
  const single = snapshot.items.length === 1;
  const link = await db.paymentLink.create({
    data: {
      storeId: store.id,
      code,
      title: input.title ?? null,
      items: snapshot.items as unknown as Prisma.InputJsonValue,
      customAmount: input.customAmount ?? null,
      note: input.note ?? null,
      buyerName: input.buyerName ?? null,
      buyerPhone: input.buyerPhone ?? null,
      buyerEmail: input.buyerEmail ?? null,
      oneTime: input.oneTime,
      // A one-time link sells what it says unless the seller allows more; reusable ones let buyers choose.
      maxQuantity: input.maxQuantity ?? (single ? (input.oneTime ? snapshot.items[0].quantity : 10) : 1),
      expiresAt: expiryFor(input.expiry, now),
      createdBy: by.createdBy,
      conversationId: by.conversationId ?? null,
      customerRef: by.customerRef ?? null,
      channel: by.channel ?? null,
    },
  });
  return { ok: true as const, link, url: paymentLinkUrl(store, code), total: input.customAmount ?? snapshot.total, items: snapshot.items };
}

export interface LinkListRow {
  id: string;
  code: string;
  url: string;
  title: string;
  status: ReturnType<typeof linkStatus>;
  oneTime: boolean;
  amount: number;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  views: number;
  paidCount: number;
  order: { id: string; orderNumber: string } | null;
  buyerName: string | null;
  items: Array<{ name: string; quantity: number }>;
}

const LINK_STATUSES = ["active", "paid", "expired", "cancelled"] as const;
export type LinkStatusFilter = (typeof LINK_STATUSES)[number];

export function isLinkStatusFilter(value: unknown): value is LinkStatusFilter {
  return typeof value === "string" && (LINK_STATUSES as readonly string[]).includes(value);
}

/** The links whose real status (linkStatus in ./pure) is `status`, as a query, so a filter never misses older links. */
export function linkStatusWhere(status: LinkStatusFilter, now = new Date()): Prisma.PaymentLinkWhereInput {
  const paidOneTime: Prisma.PaymentLinkWhereInput = { status: "paid", oneTime: true };
  if (status === "cancelled") return { status: "cancelled" };
  if (status === "paid") return paidOneTime;
  if (status === "expired") return { AND: [{ status: { not: "cancelled" } }, { NOT: paidOneTime }, { OR: [{ status: "expired" }, { expiresAt: { lte: now } }] }] };
  return { AND: [{ status: { notIn: ["cancelled", "expired"] } }, { NOT: paidOneTime }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] };
}

/** The store's links, newest first, with their real status and the order that paid them. */
export async function listPaymentLinks(store: LinkStore, options: { limit?: number; status?: string | null } = {}): Promise<LinkListRow[]> {
  const now = new Date();
  const where: Prisma.PaymentLinkWhereInput = { storeId: store.id, ...(isLinkStatusFilter(options.status) ? linkStatusWhere(options.status, now) : {}) };
  const rows = await db.paymentLink.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(options.limit ?? 100, 300) });
  const list = await toListRows(store, rows, now);
  return options.status ? list.filter((row) => row.status === options.status) : list;
}

/** One page of the store's links (newest first), optionally only those with one status: the payment links page. */
export async function pagePaymentLinks(store: LinkStore, options: { status?: LinkStatusFilter | null; page?: string | number | null; size?: number } = {}) {
  const now = new Date();
  const where: Prisma.PaymentLinkWhereInput = { storeId: store.id, ...(options.status ? linkStatusWhere(options.status, now) : {}) };
  const [total, all] = await Promise.all([db.paymentLink.count({ where }), options.status ? db.paymentLink.count({ where: { storeId: store.id } }) : null]);
  const window = pageWindow(options.page, total, options.size ?? DEFAULT_PAGE_SIZE);
  const rows = total ? await db.paymentLink.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.take }) : [];
  return { links: await toListRows(store, rows, now), window, storeHasLinks: (all ?? total) > 0 };
}

async function toListRows(store: LinkStore, rows: Array<Prisma.PaymentLinkGetPayload<object>>, now: Date): Promise<LinkListRow[]> {
  const orderIds = rows.map((row) => row.orderId).filter((id): id is string => Boolean(id));
  const orders = orderIds.length ? await db.retailOrder.findMany({ where: { storeId: store.id, id: { in: orderIds } }, select: { id: true, orderNumber: true } }) : [];
  const orderById = new Map(orders.map((order) => [order.id, order]));
  return rows.map((row) => {
    const items = readLinkItems(row.items);
    return {
      id: row.id,
      code: row.code,
      url: paymentLinkUrl(store, row.code),
      title: linkTitle({ title: row.title, items }),
      status: linkStatus(row, now),
      oneTime: row.oneTime,
      amount: row.customAmount ?? items.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0),
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      views: row.views,
      paidCount: row.paidCount,
      order: row.orderId ? orderById.get(row.orderId) ?? null : null,
      buyerName: row.buyerName,
      items: items.map((item) => ({ name: item.name ?? "Item", quantity: item.quantity })),
    };
  });
}

/** Finds one of the store's links by id or code. */
export async function findStoreLink(storeId: string, ref: string) {
  const value = ref.trim();
  return db.paymentLink.findFirst({ where: { storeId, OR: [{ id: value }, { code: value.toLowerCase() }] } });
}

/** Cancels an unpaid link (paid and already cancelled links stay as they are). */
export async function cancelPaymentLink(storeId: string, ref: string): Promise<{ ok: true; title: string } | LinkFailure> {
  const link = await findStoreLink(storeId, ref);
  if (!link) return { ok: false, message: "No payment link like that in your shop." };
  const status = linkStatus(link);
  if (status === "cancelled") return { ok: true, title: linkTitle({ title: link.title, items: readLinkItems(link.items) }) };
  if (status === "paid") return { ok: false, message: "This link has already been paid, so it can't be cancelled." };
  await db.paymentLink.updateMany({ where: { id: link.id, storeId }, data: { status: "cancelled", cancelledAt: new Date() } });
  return { ok: true, title: linkTitle({ title: link.title, items: readLinkItems(link.items) }) };
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

/**
 * What checkout charges for a payment link: the link's own products (the buyer may only pick an open option and a
 * quantity within the limit) and the seller's agreed amount if there is one. Refuses paid, expired and cancelled
 * links. The browser's prices never count.
 */
export async function linkCheckout(storeId: string, code: string, choice: BuyerChoice) {
  const link = await db.paymentLink.findFirst({ where: { storeId, code } });
  if (!link) return { ok: false as const, message: "This payment link doesn't exist. Ask the store for a new one." };
  const block = linkPayBlock(link);
  if (block) return { ok: false as const, message: PAY_BLOCK_MESSAGE[block] };
  const lines = linkCheckoutLines({ items: readLinkItems(link.items), maxQuantity: link.maxQuantity, customAmount: link.customAmount }, choice);
  if (!lines.ok) return lines;
  return { ok: true as const, link, lines: lines.lines, agreedItemsTotal: link.customAmount };
}

const PAID = new Set<string>(PAID_RETAIL_STATUSES);

/**
 * After an order is paid (or placed as pay on delivery): its payment link counts the sale, and a one-time link
 * closes ("Paid. Thank you!"). Idempotent: the count is worked out from the orders, so a replayed webhook is safe.
 * Never throws (logged).
 */
export async function settlePaymentLinkForOrder(orderId: string) {
  try {
    const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, storeId: true, status: true, paymentMethod: true, paymentLinkId: true } });
    if (!order?.paymentLinkId) return;
    const counts = (o: { status: string; paymentMethod: string | null }) => PAID.has(o.status) || (o.paymentMethod === "pay_on_delivery" && o.status === "pending");
    if (!counts(order)) return;
    const link = await db.paymentLink.findFirst({ where: { id: order.paymentLinkId, storeId: order.storeId } });
    if (!link) return;
    const orders = await db.retailOrder.findMany({ where: { storeId: order.storeId, paymentLinkId: link.id }, select: { status: true, paymentMethod: true } });
    const paidCount = orders.filter(counts).length;
    await db.paymentLink.update({
      where: { id: link.id },
      data: {
        paidCount,
        orderId: link.oneTime && link.orderId ? link.orderId : order.id,
        paidAt: link.paidAt ?? new Date(),
        ...(link.oneTime && link.status !== "cancelled" ? { status: "paid" } : {}),
      },
    });
  } catch (error) {
    console.error(`[payment links] could not settle the link for order ${orderId}`, error);
  }
}

/** Counts a view of the public page (not the seller's own preview). Never throws. */
export async function recordLinkView(id: string) {
  await db.paymentLink.update({ where: { id }, data: { views: { increment: 1 }, lastViewedAt: new Date() } }).catch(() => null);
}

// ─── Can this store take payment? ─────────────────────────────────────────────

export interface PaymentReadiness {
  card: boolean;
  korapay: boolean;
  transfer: boolean;
  payOnDelivery: boolean;
  /** At least one way to pay works. */
  ready: boolean;
}

/** Which ways to pay a payment link can offer right now (Paystack keys, the seller's methods and bank details). */
export async function paymentReadiness(storeId: string): Promise<PaymentReadiness> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { brandSettings: true } });
  // Card needs Paystack keys and the seller's wallet (payments settle straight to the seller's bank).
  const settings = checkoutPaymentSettings(store?.brandSettings, [], paystackSecretReady(process.env.PAYSTACK_SECRET_KEY) && (await storeTakesCards(storeId)), await storeTakesKorapay(storeId));
  // The same options checkout offers (card only when the wallet takes it; nothing that can't work).
  const keys = checkoutPaymentOptions(settings, {}).map((option) => option.key);
  const card = keys.includes("paystack") && settings.paystackReady;
  const korapay = keys.includes("korapay");
  const transfer = keys.includes("transfer");
  const payOnDelivery = keys.includes("pay_on_delivery");
  return { card, korapay, transfer, payOnDelivery, ready: card || korapay || transfer || payOnDelivery };
}

// ─── Peggy in a customer chat ─────────────────────────────────────────────────

export type ChatLinkResult =
  | { ok: true; url: string; productName: string; amount: number; quantity: number; expiresAt: Date; payOnDeliveryOnly: boolean }
  | { ok: false; reason: CustomerLinkProblem | "no_payment" | "error"; payOnDelivery?: boolean };

/**
 * A one-time link Peggy makes on her own in a WhatsApp or live chat, for exactly the product (and option) the
 * customer asked about. Strictly limited: the store's own published product, the database price, at most
 * CUSTOMER_LINK_LIMITS.maxQuantity, 24 hours, a few per conversation per hour. The conversation and customer are
 * recorded on the link.
 */
export async function createCustomerChatLink(input: {
  storeId: string;
  productId: string;
  variantId?: string | null;
  quantity?: number | null;
  conversationId: string;
  customerRef?: string | null;
  channel: string;
  customerName?: string | null;
}): Promise<ChatLinkResult> {
  try {
    const hourAgo = new Date(Date.now() - 3_600_000);
    const [product, recentForConversation, recentForStore, store, readiness] = await Promise.all([
      db.storeProduct.findFirst({ where: { id: input.productId, storeId: input.storeId }, select: { id: true, name: true, status: true, variants: true } }),
      db.paymentLink.count({ where: { storeId: input.storeId, conversationId: input.conversationId, createdBy: "peggy_customer", createdAt: { gte: hourAgo } } }),
      db.paymentLink.count({ where: { storeId: input.storeId, createdBy: "peggy_customer", createdAt: { gte: hourAgo } } }),
      db.store.findUnique({ where: { id: input.storeId }, select: LINK_STORE_SELECT }),
      paymentReadiness(input.storeId),
    ]);
    const problem = customerLinkProblem({ productFound: Boolean(product && store), published: product?.status === "published", recentForConversation, recentForStore });
    if (problem) return { ok: false, reason: problem };
    if (!readiness.ready) return { ok: false, reason: "no_payment", payOnDelivery: readiness.payOnDelivery };
    // Only an option of this product counts; anything else is left for the customer to pick on the page.
    const variantId = input.variantId && normalizeVariants(product!.variants).some((variant) => variant.id === input.variantId && variant.enabled) ? input.variantId : null;
    const quantity = customerLinkQuantity(input.quantity);
    const created = await createPaymentLink(
      store!,
      {
        items: [{ productId: product!.id, variantId, quantity }],
        title: null,
        note: null,
        customAmount: null,
        oneTime: true,
        expiry: "24h",
        maxQuantity: CUSTOMER_LINK_LIMITS.maxQuantity,
        buyerName: input.customerName?.slice(0, 120) ?? null,
        buyerPhone: input.channel === "whatsapp" ? input.customerRef ?? null : null,
        buyerEmail: null,
      },
      { createdBy: "peggy_customer", conversationId: input.conversationId, customerRef: input.customerRef ?? null, channel: input.channel },
    );
    if (!created.ok) return { ok: false, reason: "not_published" };
    return {
      ok: true,
      url: created.url,
      productName: created.items[0]?.name ?? product!.name,
      amount: created.total,
      quantity,
      expiresAt: created.link.expiresAt ?? new Date(Date.now() + CUSTOMER_LINK_LIMITS.expiryHours * 3_600_000),
      payOnDeliveryOnly: !readiness.card && !readiness.transfer,
    };
  } catch (error) {
    console.error("[payment links] chat link failed", error);
    return { ok: false, reason: "error" };
  }
}
