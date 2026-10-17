import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { findVariant } from "@shared/cart-checkout";
import {
  chooseAlternative,
  parseVariantLabel,
  suppliersWhoMissed,
  switchAllowed,
  switchKey,
  switchSettings,
  type ProductRef,
  type SwitchCandidate,
  type SwitchChoice,
  type SwitchLine,
} from "@shared/order-parts";
import { acceptByFor, messageSupplierPhone } from "./deadline.server";
import { plainText, supplierOrderRef } from "./pure";
import { orderLines } from "./views.server";
import { readSplitPlan } from "@/lib/wallet/rules";

// Sending an expired supplier order to another supplier with the same product (build spec 7.2: "REROUTED to next
// supplier with same product (max 2)"). Called by the acceptance cron right after an order expires
// (acceptance.server.ts). The rules are in shared/order-parts.ts: same listing family, or same category with a close
// name and the customer's size and colour; verified, enough stock, within the shop's cost limit; never a supplier who
// already missed this order; at most two switches per shop order; the shop can turn it off.
//
// Idempotent: the new order's idempotencyKey is "switch:<expired order id>" and SupplierSwitch is unique on the
// expired order, both written in one transaction with the stock it takes, so a cron re-run (or two at once) can't
// make a second replacement. The seller can Undo until the new supplier accepts.

export type SwitchDecision =
  | { outcome: "switched"; switchId: string; toSupplierOrderId: string; toSupplierId: string; toName: string; costBefore: number; costAfter: number; acceptWords: string }
  | { outcome: "none" | "off" | "limit"; note: string | null }
  | { outcome: "already" };

const LIVE_RETAIL = ["pending", "awaiting_payment", "paid", "processing", "packed"];

function isUnique(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

class StockGone extends Error {}

async function record(data: Prisma.SupplierSwitchUncheckedCreateInput) {
  try {
    await db.supplierSwitch.create({ data });
    return true;
  } catch (error) {
    if (isUnique(error)) return false;
    throw error;
  }
}

/** Decides what happens to an expired supplier order, once. */
export async function switchAfterExpiry(expiredId: string, now = new Date()): Promise<SwitchDecision> {
  if (await db.supplierSwitch.findUnique({ where: { fromSupplierOrderId: expiredId }, select: { id: true } })) return { outcome: "already" };
  const expired = await db.supplierOrder.findUnique({
    where: { id: expiredId },
    select: {
      id: true, status: true, items: true, retailOrderId: true, storeId: true, sellerId: true, supplierId: true, costTotal: true, currency: true,
      shippingAddress: true, recipientName: true, recipientPhone: true, supplier: { select: { city: true } },
    },
  });
  if (!expired || expired.status !== "expired") return { outcome: "already" };
  const base = { retailOrderId: expired.retailOrderId, storeId: expired.storeId, fromSupplierOrderId: expired.id, fromSupplierId: expired.supplierId, costBefore: expired.costTotal };
  const stop = async (outcome: "none" | "off" | "limit", note: string | null): Promise<SwitchDecision> =>
    (await record({ ...base, outcome, note })) ? { outcome, note } : { outcome: "already" };

  const [order, store, siblings, switchesSoFar] = await Promise.all([
    db.retailOrder.findUnique({ where: { id: expired.retailOrderId }, select: { id: true, status: true, items: true, stockHold: true, stockReleasedAt: true, paymentSplit: true } }),
    db.store.findUnique({ where: { id: expired.storeId }, select: { id: true, name: true, autoSwitchSupplier: true, switchCostRule: true, switchMaxIncreasePct: true, switchMinMarginPct: true } }),
    db.supplierOrder.findMany({ where: { retailOrderId: expired.retailOrderId }, select: { supplierId: true, status: true } }),
    db.supplierSwitch.count({ where: { retailOrderId: expired.retailOrderId, outcome: { in: ["switched", "undone"] } } }),
  ]);
  if (!order || !store || !LIVE_RETAIL.includes(order.status) || order.stockReleasedAt) return stop("none", "The shop order isn't waiting any more.");
  // Paystack already settled this supplier's cost to their bank in the checkout split (src/lib/wallet): a
  // replacement supplier would be owed money nobody holds, so the order isn't moved. The supplier returns the money
  // to the shop (both wallets show it) and the shop decides what to do with the order.
  if (readSplitPlan(order.paymentSplit)?.suppliers.some((share) => share.supplierId === expired.supplierId)) {
    return stop("none", "This supplier was already paid for the order by card, so it can't move to another supplier automatically. Ask them to return the money, then refund or replace the order.");
  }
  const settings = switchSettings(store);
  const blocked = switchAllowed({ settings, switchesSoFar });
  if (blocked) return stop(blocked, blocked === "off" ? "The shop turned automatic switching off." : "Already switched twice on this order.");

  // The lines, with what the customer paid and the size and colour they picked.
  const lines = orderLines(expired.items);
  const retailItems = (Array.isArray(order.items) ? order.items : []) as Array<{ productId?: unknown; variant?: unknown; price?: unknown }>;
  const storeProducts = await db.storeProduct.findMany({ where: { id: { in: lines.map((line) => line.storeProductId) } }, select: { id: true, variants: true, retailPrice: true } });
  const switchLines: SwitchLine[] = lines.map((line) => {
    const item = retailItems.find((row) => row.productId === line.storeProductId && (row.variant ?? null) === line.variant) ?? retailItems.find((row) => row.productId === line.storeProductId);
    const product = storeProducts.find((row) => row.id === line.storeProductId);
    const variant = line.variant ? findVariant(product?.variants, line.variant) : null;
    const wanted = variant ? { size: variant.size ? String(variant.size).toLowerCase().trim() : null, color: variant.color ? String(variant.color).toLowerCase().trim() : null } : parseVariantLabel(line.variant);
    return { ...line, wanted: wanted && (wanted.size || wanted.color) ? wanted : null, sellPrice: Number(item?.price) || product?.retailPrice || 0 };
  });

  const originalRows = await db.supplierProduct.findMany({ where: { id: { in: lines.map((line) => line.supplierProductId) } }, select: { id: true, name: true, categoryId: true, familyKey: true } });
  const originals = new Map<string, ProductRef>(originalRows.map((row) => [row.id, row]));
  const families = originalRows.map((row) => row.familyKey).filter((key): key is string => Boolean(key));
  const candidateRows = await db.supplierProduct.findMany({
    where: {
      id: { notIn: originalRows.map((row) => row.id) },
      status: "published",
      dropshipAvailable: true,
      supplier: { verificationStatus: "verified", status: "active" },
      OR: [
        ...(families.length ? [{ familyKey: { in: families } }, { id: { in: families } }] : []),
        { familyKey: { in: originalRows.map((row) => row.id) } },
        { categoryId: { in: originalRows.map((row) => row.categoryId) } },
      ],
    },
    take: 300,
    select: {
      id: true, name: true, categoryId: true, familyKey: true, variants: true, stockQuantity: true, wholesalePrice: true, images: true, status: true, dropshipAvailable: true, supplierId: true,
      supplier: { select: { displayName: true, verificationStatus: true, status: true, trustScore: true, missedOrders: true, city: true } },
    },
  });
  const candidates: SwitchCandidate[] = candidateRows.map((row) => ({
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    familyKey: row.familyKey,
    variants: row.variants,
    stock: row.stockQuantity,
    wholesalePrice: row.wholesalePrice,
    image: row.images[0] ?? null,
    published: row.status === "published",
    dropship: row.dropshipAvailable,
    supplierId: row.supplierId,
    supplierName: row.supplier.displayName,
    supplierVerified: row.supplier.verificationStatus === "verified",
    supplierActive: row.supplier.status === "active",
    trustScore: row.supplier.trustScore,
    missedOrders: row.supplier.missedOrders,
    sameCity: row.supplier.city.trim().toLowerCase() === expired.supplier.city.trim().toLowerCase(),
  }));
  const excluded = new Set([...suppliersWhoMissed(siblings), expired.supplierId]);

  // A rival order can take the last units between choosing and reserving: try the next best supplier.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { choice } = chooseAlternative({ lines: switchLines, originals, candidates, excludedSupplierIds: excluded, settings });
    if (!choice) break;
    try {
      return await createReplacement(expired, order.stockHold !== null, choice, now);
    } catch (error) {
      if (error instanceof StockGone) {
        excluded.add(choice.supplierId);
        continue;
      }
      if (isUnique(error)) return { outcome: "already" };
      throw error;
    }
  }
  return stop("none", "No other verified supplier has the same product, in stock, within your price limit.");
}

async function createReplacement(
  expired: { id: string; retailOrderId: string; storeId: string; sellerId: string; supplierId: string; costTotal: number; currency: string; shippingAddress: Prisma.JsonValue; recipientName: string; recipientPhone: string | null },
  holdsStock: boolean,
  choice: SwitchChoice,
  now: Date,
): Promise<SwitchDecision> {
  const supplier = await db.supplier.findUnique({ where: { id: choice.supplierId }, select: { id: true, acceptHoursDropship: true, acceptHoursWholesale: true } });
  const deadline = acceptByFor("dropship", supplier, now);
  const items = choice.lines.map((line) => ({
    storeProductId: line.storeProductId,
    supplierProductId: line.newSupplierProductId,
    name: line.name,
    variant: line.variant,
    quantity: line.quantity,
    unitCost: line.newUnitCost,
    image: line.newImage,
  }));
  return db.$transaction(async (tx) => {
    const created = await tx.supplierOrder.create({
      data: {
        idempotencyKey: switchKey(expired.id),
        replacesId: expired.id,
        supplierId: choice.supplierId,
        retailOrderId: expired.retailOrderId,
        storeId: expired.storeId,
        sellerId: expired.sellerId,
        items: items as unknown as Prisma.InputJsonValue,
        costTotal: choice.costAfter,
        currency: expired.currency,
        shippingAddress: (expired.shippingAddress ?? {}) as Prisma.InputJsonValue,
        recipientName: expired.recipientName,
        recipientPhone: expired.recipientPhone,
        acceptBy: deadline.acceptBy,
      },
      select: { id: true },
    });
    // Take the new supplier's stock and add it to the order's hold, so Undo, another expiry or cancelling the
    // order gives it back exactly once. Orders from before stock holds (no hold saved) took none.
    if (holdsStock) {
      await tx.$queryRaw`SELECT "id" FROM "RetailOrder" WHERE "id" = ${expired.retailOrderId} FOR UPDATE`;
      const totals = new Map<string, number>();
      for (const line of choice.lines) totals.set(line.newSupplierProductId, (totals.get(line.newSupplierProductId) ?? 0) + line.quantity);
      for (const [id, quantity] of totals) {
        const taken = await tx.supplierProduct.updateMany({ where: { id, status: "published", stockQuantity: { gte: quantity } }, data: { stockQuantity: { decrement: quantity } } });
        if (taken.count !== 1) throw new StockGone();
      }
      for (const line of choice.lines) {
        await tx.storeProduct.updateMany({ where: { id: line.storeProductId }, data: { soldStock: { increment: line.quantity } } });
      }
      const current = await tx.retailOrder.findUnique({ where: { id: expired.retailOrderId }, select: { stockHold: true } });
      const holds = [
        ...(Array.isArray(current?.stockHold) ? current.stockHold : []),
        ...choice.lines.map((line) => ({ source: "supplier", productId: line.storeProductId, supplierProductId: line.newSupplierProductId, quantity: line.quantity, name: line.name })),
      ];
      await tx.retailOrder.update({ where: { id: expired.retailOrderId }, data: { stockHold: holds as unknown as Prisma.InputJsonValue } });
    }
    const switched = await tx.supplierSwitch.create({
      data: {
        retailOrderId: expired.retailOrderId,
        storeId: expired.storeId,
        fromSupplierOrderId: expired.id,
        fromSupplierId: expired.supplierId,
        outcome: "switched",
        toSupplierOrderId: created.id,
        toSupplierId: choice.supplierId,
        costBefore: choice.costBefore,
        costAfter: choice.costAfter,
      },
      select: { id: true },
    });
    return { outcome: "switched" as const, switchId: switched.id, toSupplierOrderId: created.id, toSupplierId: choice.supplierId, toName: choice.supplierName, costBefore: choice.costBefore, costAfter: choice.costAfter, acceptWords: deadline.words };
  });
}

function money(amount: number, currency: string) {
  if (currency === "NGN") return `₦${Math.round(amount).toLocaleString("en-NG")}`;
  return `${currency} ${Math.round(amount).toLocaleString("en-NG")}`;
}

/** Tells the new supplier about the order (as for any new order: what they get and the time to accept). */
export async function notifyNewSupplier(supplierOrderId: string, acceptWords: string) {
  const row = await db.supplierOrder.findUnique({
    where: { id: supplierOrderId },
    select: { id: true, supplierId: true, costTotal: true, currency: true, items: true, storeId: true, retailOrderId: true, shippingAddress: true, supplier: { select: { userId: true } } },
  });
  if (!row) return;
  const store = await db.store.findUnique({ where: { id: row.storeId }, select: { name: true } });
  const shop = plainText(store?.name) || "A shop";
  const ref = supplierOrderRef(row.id);
  const units = orderLines(row.items).reduce((sum, line) => sum + line.quantity, 0);
  const address = row.shippingAddress && typeof row.shippingAddress === "object" ? (row.shippingAddress as Record<string, unknown>) : {};
  const place = plainText([address.city, address.state].filter((part) => typeof part === "string" && part).join(", "), 60);
  void messageSupplierPhone(row.supplierId, `Shopinbos: new order ${ref} from ${shop}. You get ${money(row.costTotal, row.currency)}. Accept it within ${acceptWords} in the app.`);
  await createNotification({
    userId: row.supplier.userId,
    type: "dropshipping",
    priority: "warning",
    title: `New order ${ref} from ${shop}: accept within ${acceptWords}`,
    description: `${shop} sold ${units} ${units === 1 ? "piece" : "pieces"} for you${place ? `, going to ${place}` : ""}. You get ${money(row.costTotal, row.currency)}. Accept it within ${acceptWords}, or the shop will be told you didn't answer.`,
    link: `/supplier/orders/${row.id}`,
    actionLabel: "Accept order",
    actionUrl: `/supplier/orders/${row.id}`,
    metadata: { supplierOrderId: row.id, retailOrderId: row.retailOrderId },
    sendEmail: true,
    event: "supplier_order.new",
    dedupeKey: `supplier_order.new:${row.id}`,
  }).catch(() => null);
}

// ─── Undo ─────────────────────────────────────────────────────────────────────

export type UndoResult = { ok: true; data: { supplierOrderId: string } } | { ok: false; code: "NOT_FOUND" | "CONFLICT"; message: string };

/**
 * The seller takes an automatic switch back, until the new supplier accepts: the new order is cancelled, its stock
 * goes back, the new supplier is told not to send it, and the seller gets their choices again. No more automatic
 * switching for these lines. Scoped to the seller's store.
 */
export async function undoSupplierSwitch(storeId: string, replacementId: string, now = new Date()): Promise<UndoResult> {
  const replacement = await db.supplierOrder.findFirst({
    where: { id: replacementId, storeId, replacesId: { not: null } },
    select: { id: true, status: true, items: true, retailOrderId: true, supplierId: true, undoneAt: true, supplier: { select: { userId: true, displayName: true } } },
  });
  if (!replacement) return { ok: false, code: "NOT_FOUND", message: "We couldn't find that switch. Refresh to see the order." };
  const name = plainText(replacement.supplier.displayName) || "The new supplier";
  if (replacement.undoneAt) return { ok: true, data: { supplierOrderId: replacement.id } };
  const { releaseSupplierOrderStock } = await import("./acceptance.server");
  const done = await db.$transaction(async (tx) => {
    const moved = await tx.supplierOrder.updateMany({ where: { id: replacement.id, status: "pending", undoneAt: null }, data: { status: "cancelled", undoneAt: now } });
    if (moved.count !== 1) return false;
    await releaseSupplierOrderStock(tx, replacement, now);
    await tx.supplierSwitch.updateMany({ where: { toSupplierOrderId: replacement.id, outcome: "switched" }, data: { outcome: "undone", undoneAt: now } });
    return true;
  });
  if (!done) {
    const current = await db.supplierOrder.findUnique({ where: { id: replacement.id }, select: { status: true, undoneAt: true } });
    if (current?.undoneAt) return { ok: true, data: { supplierOrderId: replacement.id } };
    return { ok: false, code: "CONFLICT", message: `${name} already accepted it, so it can't be undone. Message them if you need to change something.` };
  }
  const ref = supplierOrderRef(replacement.id);
  await Promise.allSettled([
    createNotification({
      userId: replacement.supplier.userId,
      type: "dropshipping",
      priority: "warning",
      title: `Order ${ref} was taken back`,
      description: "The shop took this order back before you accepted it. Don't send it.",
      link: "/supplier/orders",
      metadata: { supplierOrderId: replacement.id },
      event: "supplier_order.cancelled",
      dedupeKey: `supplier_order.cancelled:${replacement.id}`,
      phoneHandled: true,
    }),
    messageSupplierPhone(replacement.supplierId, `Shopinbos: the shop took order ${ref} back. Don't send it.`),
  ]);
  const { recomputeOrderStatusSafely } = await import("./parts.server");
  await recomputeOrderStatusSafely(replacement.retailOrderId);
  return { ok: true, data: { supplierOrderId: replacement.id } };
}
