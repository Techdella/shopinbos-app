import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { dueDate } from "@shared/money-owed";
import {
  OPEN_PREORDER_STATUSES,
  STORE_PREORDER_OPEN,
  groupStorePreorders,
  groupSupplierPreorders,
  hasDeposit,
  preorderDay,
  stockReadyTargets,
  storeBalanceRequestTargets,
  storeStockReadyTargets,
  toKobo,
  wholesaleMoney,
  wholesalePayStep,
  wholesalePreorderStage,
  type StorePreorderGroup,
  type SupplierPreorderGroup,
} from "@shared/preorder";
import { plainText } from "./pure";
import { payableWholesaleOrders } from "./wholesale-payments.server";

// Preorder lists and "Stock is ready" (rules in shared/preorder.ts):
//   - suppliers: their open bulk preorders grouped by product (units, shops, deposit paid / balance due per shop);
//     "Stock is ready" marks each open preorder of the product ready (preorderReadyAt) and tells each shop: it ships
//     now, or once they pay the rest when the supplier asked for a deposit. "End preorders" switches them off.
//   - sellers: their bulk preorders from suppliers (with Pay deposit / Pay balance), and their own store's preorders
//     from shoppers grouped by product; "Stock is ready" there moves the paid orders to processing through the usual
//     order status flow (src/lib/orders/update-status.ts: the seller's automations and the customer's order message).
// Used by /api/mobile/supplier/preorders, /api/app/preorders, /supplier/preorders and /home/preorders.

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; code: "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT"; message: string };

// ─── Money owed back ───────────────────────────────────────────────────────────

/**
 * A bulk order cancelled after the shop paid for it by card in Shopinbos (a preorder deposit, or the whole order):
 * the supplier holds money for goods they won't send, so it's recorded as owed back to the shop (money owed,
 * src/lib/money-owed), once per order. The money already went straight to the supplier's bank; nothing moves here.
 * Payments made outside the app aren't recorded. Never throws.
 */
export async function recordWholesaleRefundOwed(orderId: string) {
  try {
    const order = await db.wholesaleOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, sellerId: true, totalPrice: true, depositKobo: true, depositRef: true, paymentRef: true, quantity: true, supplier: { select: { userId: true } }, supplierProduct: { select: { name: true } } },
    });
    if (!order || order.status !== "cancelled") return null;
    const amountKobo = order.paymentRef ? toKobo(order.totalPrice) : order.depositRef ? order.depositKobo : 0;
    if (amountKobo <= 0) return null;
    const what = `${order.quantity.toLocaleString("en-NG")} × ${plainText(order.supplierProduct.name)}`;
    const now = new Date();
    try {
      await db.businessDebt.create({
        data: {
          sourceKey: `wholesale-refund:${order.id}`,
          debtorUserId: order.supplier.userId,
          creditorUserId: order.sellerId,
          reason: "not_sent",
          amountKobo,
          status: "open",
          details: `${order.paymentRef ? "Paid" : "Preorder deposit paid"} in Shopinbos for ${what}, which was cancelled.`,
          wholesaleOrderId: order.id,
          dueAt: dueDate(now),
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return null; // already recorded
      throw error;
    }
    await Promise.allSettled([
      createNotification({
        userId: order.supplier.userId,
        type: "payout",
        priority: "warning",
        title: `Pay back ${naira(amountKobo)} for a cancelled order`,
        description: `The shop paid ${naira(amountKobo)} for ${what}, which was cancelled, so it goes back to them. Pay it in your Shopinbos Wallet within 3 days; after that it comes out of your next orders.`,
        link: "/supplier/wallet",
        event: "money_owed",
        dedupeKey: `wholesale-refund:${order.id}`,
      }),
      createNotification({
        userId: order.sellerId,
        type: "payout",
        priority: "info",
        title: `${naira(amountKobo)} is owed back to you`,
        description: `You paid ${naira(amountKobo)} for ${what}, which was cancelled. The supplier pays it back; follow it in your Shopinbos Wallet.`,
        link: "/home/wallet",
        event: "money_owed",
        dedupeKey: `wholesale-refund:${order.id}`,
      }),
    ]);
    return amountKobo;
  } catch (error) {
    console.error(`[preorders] could not record money owed back for order ${orderId}`, error);
    return null;
  }
}

// ─── Supplier: preorders by product ─────────────────────────────────────────────

export interface SupplierPreordersView {
  groups: Array<SupplierPreorderGroup & { product: SupplierPreorderGroup["product"] & { slug: string } }>;
}

export async function supplierPreorders(supplierId: string): Promise<SupplierPreordersView> {
  const [rows, products] = await Promise.all([
    db.wholesaleOrder.findMany({
      where: { supplierId, preorder: true, status: { in: [...OPEN_PREORDER_STATUSES] } },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true, status: true, quantity: true, totalPrice: true, currency: true, createdAt: true, sellerId: true,
        preorder: true, preorderReadyAt: true, depositKobo: true, depositPaidAt: true, paidAt: true, paidOutAt: true,
        seller: { select: { name: true, store: { select: { name: true } } } },
        supplierProduct: { select: { id: true, slug: true, name: true, images: true, preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderDepositPct: true } },
      },
    }),
    // Products taking preorders with no open orders yet still show (so they can be ended here).
    db.supplierProduct.findMany({
      where: { supplierId, preorderEnabled: true },
      take: 100,
      select: { id: true, slug: true, name: true, images: true, preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderDepositPct: true },
    }),
  ]);
  const productOf = (product: (typeof products)[number]) => ({ id: product.id, name: product.name, image: product.images[0] ?? null, preorderEnabled: product.preorderEnabled, preorderShipsAt: product.preorderShipsAt, preorderLimit: product.preorderLimit, preorderTaken: product.preorderTaken, preorderDepositPct: product.preorderDepositPct });
  const groups = groupSupplierPreorders(
    rows.map((row) => ({ ...row, shop: plainText(row.seller.store?.name ?? row.seller.name, 80) || "A shop", product: productOf(row.supplierProduct) })),
  );
  const slugs = new Map([...rows.map((row) => [row.supplierProduct.id, row.supplierProduct.slug] as const), ...products.map((product) => [product.id, product.slug] as const)]);
  const seen = new Set(groups.map((group) => group.product.id));
  for (const product of products) {
    if (seen.has(product.id)) continue;
    const view = productOf(product);
    groups.push({ product: { id: view.id, name: view.name, image: view.image, on: true, shipsOn: preorderDay(view.preorderShipsAt), limit: view.preorderLimit, taken: view.preorderTaken, depositPct: view.preorderDepositPct }, units: 0, shops: 0, waiting: 0, totalKobo: 0, paidKobo: 0, dueKobo: 0, orders: [] });
  }
  return { groups: groups.map((group) => ({ ...group, product: { ...group.product, slug: slugs.get(group.product.id) ?? "" } })) };
}

/**
 * "Stock is ready" for a product: every open preorder of it not marked ready yet gets preorderReadyAt (once), and
 * each shop is told: it ships now, or once they pay the rest (a deposit preorder; Pay balance on their Preorders).
 * `end`: stop taking preorders for it too.
 */
export async function supplierStockReady(supplierId: string, productId: string, options: { end?: boolean } = {}): Promise<ServiceResult<{ marked: number; told: number; ended: boolean }>> {
  const product = await db.supplierProduct.findFirst({
    where: { id: productId, supplierId },
    select: { id: true, name: true, slug: true, preorderEnabled: true, supplier: { select: { displayName: true, slug: true } }, category: { select: { slug: true } } },
  });
  if (!product) return { ok: false, code: "NOT_FOUND", message: "Product not found" };
  const orders = await db.wholesaleOrder.findMany({
    where: { supplierId, supplierProductId: product.id, preorder: true, status: { in: [...OPEN_PREORDER_STATUSES] }, preorderReadyAt: null },
    select: { id: true, status: true, sellerId: true, quantity: true, totalPrice: true, currency: true, preorder: true, preorderReadyAt: true, depositKobo: true, depositPaidAt: true, paidAt: true, paidOutAt: true },
  });
  const targets = stockReadyTargets(orders);
  const now = new Date();
  const marked = targets.length
    ? await db.wholesaleOrder.updateMany({ where: { id: { in: targets.map((order) => order.id) }, preorderReadyAt: null, status: { in: [...OPEN_PREORDER_STATUSES] } }, data: { preorderReadyAt: now } })
    : { count: 0 };
  const supplierName = plainText(product.supplier.displayName) || "Your supplier";
  let told = 0;
  for (const order of targets) {
    const ready = { ...order, preorderReadyAt: now };
    const money = wholesaleMoney(ready);
    const due = hasDeposit(ready) && money.dueKobo > 0;
    const what = `${order.quantity.toLocaleString("en-NG")} × ${plainText(product.name)}`;
    const description = due
      ? `${supplierName} has the stock for your preorder of ${what}. Pay the rest (${naira(money.dueKobo)}) and they pack and send it.`
      : order.status === "pending"
        ? `${supplierName} has the stock for your preorder of ${what}. They confirm your order and send it now.`
        : `${supplierName} has the stock for your preorder of ${what}. It ships now.`;
    const sent = await createNotification({
      userId: order.sellerId,
      type: "suppliers",
      priority: due ? "warning" : "success",
      title: due ? `Stock is ready: pay the rest of your preorder` : `Stock is ready: your preorder ships now`,
      description,
      link: "/home/preorders?view=suppliers",
      actionLabel: due ? "Pay balance" : "See my preorders",
      actionUrl: "/home/preorders?view=suppliers",
      sendEmail: true,
      event: "supplier.update",
      dedupeKey: `preorder.ready:wholesale:${order.id}`,
    }).catch(() => null);
    if (sent) told += 1;
  }
  let ended = false;
  if (options.end && product.preorderEnabled) {
    await db.supplierProduct.update({ where: { id: product.id }, data: { preorderEnabled: false } });
    invalidatePublicMarketplaceCache({ productSlug: product.slug, supplierSlug: product.supplier.slug, categorySlug: product.category?.slug ?? undefined });
    ended = true;
  }
  return { ok: true, data: { marked: marked.count, told, ended } };
}

/** "End preorders": the product stops taking preorders (orders already placed stay as they are). */
export async function endSupplierPreorders(supplierId: string, productId: string): Promise<ServiceResult<{ ended: boolean }>> {
  const product = await db.supplierProduct.findFirst({ where: { id: productId, supplierId }, select: { id: true, slug: true, preorderEnabled: true, supplier: { select: { slug: true } }, category: { select: { slug: true } } } });
  if (!product) return { ok: false, code: "NOT_FOUND", message: "Product not found" };
  if (!product.preorderEnabled) return { ok: true, data: { ended: false } };
  await db.supplierProduct.update({ where: { id: product.id }, data: { preorderEnabled: false } });
  invalidatePublicMarketplaceCache({ productSlug: product.slug, supplierSlug: product.supplier.slug, categorySlug: product.category?.slug ?? undefined });
  return { ok: true, data: { ended: true } };
}

// ─── Seller: bulk preorders from suppliers ─────────────────────────────────────

export const SELLER_WHOLESALE_SELECT = {
  id: true, status: true, quantity: true, unitPrice: true, totalPrice: true, currency: true, rejectReason: true, trackingCode: true, createdAt: true, acceptBy: true,
  paidAt: true, paidOutAt: true, expiredAt: true, preorder: true, preorderShipsAt: true, preorderReadyAt: true, depositKobo: true, depositPaidAt: true,
  supplier: { select: { id: true, displayName: true, userId: true } },
  supplierProduct: { select: { id: true, name: true, images: true, slug: true } },
} satisfies Prisma.WholesaleOrderSelect;

/** The seller's bulk orders in the app's shape (GET /api/app/wholesale), optionally preorders only. */
export async function sellerWholesaleRows(sellerId: string, options: { onlyPreorders?: boolean } = {}) {
  const orders = await db.wholesaleOrder.findMany({
    where: { sellerId, ...(options.onlyPreorders ? { preorder: true } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: SELLER_WHOLESALE_SELECT,
  });
  const payable = await payableWholesaleOrders(orders);
  return orders.map(({ supplier, supplierProduct, preorder, preorderShipsAt, preorderReadyAt, depositKobo, depositPaidAt, ...order }) => {
    const facts = { ...order, preorder, preorderReadyAt, depositKobo, depositPaidAt };
    const money = wholesaleMoney(facts);
    return {
      ...order,
      createdAt: order.createdAt.toISOString(),
      preorder: preorder
        ? { shipsOn: preorderDay(preorderShipsAt), stage: wholesalePreorderStage(facts), readyAt: preorderReadyAt?.toISOString() ?? null, depositKobo: money.depositKobo, depositPaid: Boolean(depositPaidAt), paidKobo: money.paidKobo, dueKobo: money.dueKobo }
        : null,
      supplier: { id: supplier.id, name: supplier.displayName, userId: supplier.userId },
      product: { id: supplierProduct.id, name: supplierProduct.name, slug: supplierProduct.slug, image: supplierProduct.images[0] ?? null },
      canPay: payable.has(order.id),
      pay: payable.has(order.id) ? wholesalePayStep(facts) : null,
    };
  });
}

export type SellerWholesaleRow = Awaited<ReturnType<typeof sellerWholesaleRows>>[number];

// ─── Seller: their store's preorders from shoppers ──────────────────────────────

export interface StorePreordersView {
  groups: Array<StorePreorderGroup & { product: { on: boolean; shipsOn: string | null; limit: number | null; taken: number; depositPct: number } | null }>;
}

const STORE_PREORDER_WINDOW_DAYS = 365;

async function openStorePreorderRows(storeId: string) {
  return db.retailOrder.findMany({
    where: {
      storeId,
      status: { in: [...STORE_PREORDER_OPEN] },
      createdAt: { gte: new Date(Date.now() - STORE_PREORDER_WINDOW_DAYS * 86_400_000) },
      // A line saved with { preorder: true } (jsonb containment).
      items: { array_contains: [{ preorder: true }] },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
}

export async function storePreorders(storeId: string): Promise<StorePreordersView> {
  const rows = await openStorePreorderRows(storeId);
  const groups = groupStorePreorders(rows);
  const products = groups.length
    ? await db.storeProduct.findMany({ where: { storeId, id: { in: groups.map((group) => group.productId) } }, select: { id: true, images: true, preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderDepositPct: true } })
    : [];
  const byId = new Map(products.map((product) => [product.id, product]));
  return {
    groups: groups.map((group) => {
      const product = byId.get(group.productId);
      return {
        ...group,
        image: group.image ?? (Array.isArray(product?.images) ? ((product.images as unknown[]).find((value): value is string => typeof value === "string") ?? null) : null),
        product: product ? { on: product.preorderEnabled, shipsOn: preorderDay(product.preorderShipsAt), limit: product.preorderLimit, taken: product.preorderTaken, depositPct: product.preorderDepositPct } : null,
      };
    }),
  };
}

/**
 * "Stock is ready" on the seller's own product: each paid order holding a preorder line of it moves to processing
 * through the usual status change (the seller's order automations and the customer's order message say it's being
 * prepared). Orders whose shopper paid a deposit and still owes the rest stay as they are and the shopper is asked
 * for it (email with the pay-the-rest link, SMS when order texts are on; due in STORE_BALANCE_DAYS); they move to
 * processing once it's paid (src/lib/commerce/store-balance.server.ts). Unpaid orders are left as they are. `end`:
 * stop taking preorders for the product too.
 */
export async function storeStockReady(store: { id: string; name: string }, productId: string, options: { end?: boolean } = {}): Promise<ServiceResult<{ moved: number; asked: number; unpaid: number; ended: boolean }>> {
  const product = await db.storeProduct.findFirst({ where: { id: productId, storeId: store.id }, select: { id: true, preorderEnabled: true } });
  const rows = await openStorePreorderRows(store.id);
  const targets = storeStockReadyTargets(rows, productId);
  if (!product && !targets.length && !storeBalanceRequestTargets(rows, productId).length) return { ok: false, code: "NOT_FOUND", message: "Product not found" };
  const { updateOrderStatus } = await import("@/lib/orders/update-status");
  let moved = 0;
  for (const order of targets) {
    const result = await updateOrderStatus(store, order, { status: "processing" }).catch((error) => {
      console.error(`[preorders] could not move order ${order.id} to processing`, error);
      return null;
    });
    if (result?.ok) moved += 1;
  }
  const { askForStoreBalances } = await import("@/lib/commerce/store-balance.server");
  const asked = await askForStoreBalances(storeBalanceRequestTargets(rows, productId).map((order) => order.id));
  const unpaid = groupStorePreorders(rows).find((group) => group.productId === productId)?.unpaid ?? 0;
  let ended = false;
  if (options.end && product?.preorderEnabled) {
    await db.storeProduct.update({ where: { id: product.id }, data: { preorderEnabled: false } });
    ended = true;
  }
  return { ok: true, data: { moved, asked, unpaid, ended } };
}

/** The seller stops taking preorders on their product. */
export async function endStorePreorders(storeId: string, productId: string): Promise<ServiceResult<{ ended: boolean }>> {
  const product = await db.storeProduct.findFirst({ where: { id: productId, storeId }, select: { id: true, preorderEnabled: true } });
  if (!product) return { ok: false, code: "NOT_FOUND", message: "Product not found" };
  if (!product.preorderEnabled) return { ok: true, data: { ended: false } };
  await db.storeProduct.update({ where: { id: product.id }, data: { preorderEnabled: false } });
  return { ok: true, data: { ended: true } };
}

