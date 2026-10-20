import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { storeUrl } from "@/lib/marketing/brand";
import { orderStatusSideEffects } from "@/lib/orders/status-effects";
import { activeReplacement, canUndoSwitch, costChangeWords, nameWords, orderParts, retailStatusFromParts, stageFromParts, switchedMessage, type OrderPartsSummary } from "@shared/order-parts";
import { orderLines } from "./views.server";
import { keptDeliveryPlan } from "@shared/delivery-market";

// A shop order sent in more than one parcel: one per supplier, plus the lines the seller sends from their own
// stock. The order's status is worked out from its parts (shared/order-parts.ts) inside a transaction that locks
// the order's row, so two parcels picked up at the same moment can't both decide, and running it again changes
// nothing. "shipped" (and the customer's "on its way" messages) only once every parcel has left; when the first
// of several leaves, the customer is told "Part of your order is on its way" once (partlySentAt).

const PART_SELECT = {
  id: true, status: true, items: true, trackingCode: true, carrier: true, replacesId: true, undoneAt: true, supplierId: true, costTotal: true,
  rejectReason: true, shippedAt: true, deliveredAt: true, expiredAt: true, createdAt: true, supplier: { select: { id: true, displayName: true } },
} as const satisfies Prisma.SupplierOrderSelect;

type PartRow = Prisma.SupplierOrderGetPayload<{ select: typeof PART_SELECT }>;

/** Lines of the shop order no supplier order covers: the seller sends them. */
export function ownLineCount(orderItems: unknown, supplierOrders: Array<{ items: unknown }>) {
  const covered = new Set(supplierOrders.flatMap((row) => orderLines(row.items).map((line) => line.storeProductId)));
  return (Array.isArray(orderItems) ? orderItems : []).filter((item) => !covered.has(String((item as { productId?: unknown })?.productId ?? ""))).length;
}

function summarise(order: { items: unknown; ownShippedAt: Date | null; ownDeliveredAt: Date | null }, rows: PartRow[]) {
  return orderParts({
    supplierOrders: rows.map((row) => ({ id: row.id, status: row.status, replacesId: row.replacesId, supplierName: row.supplier.displayName })),
    ownLines: ownLineCount(order.items, rows),
    ownShippedAt: order.ownShippedAt,
    ownDeliveredAt: order.ownDeliveredAt,
  });
}

async function lockOrder(tx: Prisma.TransactionClient, retailOrderId: string) {
  await tx.$queryRaw`SELECT "id" FROM "RetailOrder" WHERE "id" = ${retailOrderId} FOR UPDATE`;
  return tx.retailOrder.findUnique({ where: { id: retailOrderId } });
}

/**
 * Moves the shop order to where its parts say (only forward) and marks the first partial send. Idempotent and
 * race-safe: the order's row is locked while it decides. Side effects (automations, customer messages) run once,
 * by the call that moved it.
 */
export async function recomputeOrderStatus(retailOrderId: string, now = new Date()) {
  const outcome = await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, retailOrderId);
    if (!order) return null;
    const rows = await tx.supplierOrder.findMany({ where: { retailOrderId }, orderBy: { createdAt: "asc" }, select: PART_SELECT });
    if (!rows.length) return null;
    const summary = summarise(order, rows);
    const target = retailStatusFromParts(order.status, summary);
    const data: Prisma.RetailOrderUpdateManyMutationInput = {};
    if (target) {
      data.status = target;
      if (target === "shipped" || target === "delivered") {
        if (!order.shippedAt) data.shippedAt = now;
        const codes = [...new Set(rows.map((row) => row.trackingCode).filter((code): code is string => Boolean(code)))];
        if (codes.length && !order.trackingCode) data.trackingCode = codes.join(", ").slice(0, 200);
      }
      if (target === "delivered") data.deliveredAt = now;
    }
    const after = target ?? order.status;
    const firstPartial = summary.partial && !order.partlySentAt && !["shipped", "delivered", "cancelled"].includes(after);
    if (firstPartial) data.partlySentAt = now;
    if (!Object.keys(data).length) return { order, summary, target: null, firstPartial: false };
    const moved = await tx.retailOrder.updateMany({ where: { id: order.id, status: order.status }, data });
    if (moved.count !== 1) return { order, summary, target: null, firstPartial: false };
    return { order, summary, target, firstPartial };
  });
  if (!outcome || (!outcome.target && !outcome.firstPartial)) return outcome;
  const store = await db.store.findUnique({ where: { id: outcome.order.storeId }, select: { id: true, name: true } });
  if (store && outcome.target) await orderStatusSideEffects(store, outcome.order, outcome.target).catch((error) => console.error("[order parts] side effects failed", error));
  if (outcome.firstPartial) await tellCustomerPartlySent(outcome.order.id, outcome.summary).catch((error) => console.error("[order parts] partly sent message failed", error));
  return outcome;
}

/** Never let the recompute break a supplier or rider action: log it and carry on. */
export async function recomputeOrderStatusSafely(retailOrderId: string) {
  try {
    return await recomputeOrderStatus(retailOrderId);
  } catch (error) {
    console.error(`[order parts] could not recompute order ${retailOrderId}`, error);
    return null;
  }
}

/**
 * The seller sent (or delivered) their own part of an order that also has supplier parcels. Returns the updated
 * order, or null when this isn't such an order (the caller moves the whole order as before).
 */
export async function markOwnPart(
  retailOrderId: string,
  to: "shipped" | "delivered",
  extra: { trackingCode?: string | null; notes?: string | null; logisticsType?: string | null; logisticsDetails?: Record<string, unknown> | null } = {},
  now = new Date(),
) {
  const marked = await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, retailOrderId);
    if (!order) return false;
    const rows = await tx.supplierOrder.findMany({ where: { retailOrderId }, select: { items: true, status: true } });
    if (!rows.some((row) => row.status !== "cancelled")) return false;
    if (ownLineCount(order.items, rows) === 0) return false;
    const data: Prisma.RetailOrderUpdateManyMutationInput = {};
    if (!order.ownShippedAt) data.ownShippedAt = now;
    if (to === "delivered" && !order.ownDeliveredAt) data.ownDeliveredAt = now;
    if (extra.notes) data.notes = extra.notes;
    if (extra.trackingCode && !order.trackingCode) data.trackingCode = extra.trackingCode.slice(0, 200);
    // The delivery-partner plan saved at checkout (src/lib/delivery-market) stays when the seller sets how it's sent.
    if (extra.logisticsType) data.logisticsDetails = { ...keptDeliveryPlan(order.logisticsDetails), type: extra.logisticsType, ...(extra.logisticsDetails ?? {}) } as Prisma.InputJsonValue;
    if (Object.keys(data).length) await tx.retailOrder.updateMany({ where: { id: order.id }, data });
    return true;
  });
  if (!marked) return null;
  await recomputeOrderStatus(retailOrderId, now);
  return db.retailOrder.findUnique({ where: { id: retailOrderId } });
}

/** "Part of your order is on its way": email (and SMS where the seller turned on the shipped message). Once. */
async function tellCustomerPartlySent(retailOrderId: string, summary: OrderPartsSummary) {
  const order = await db.retailOrder.findUnique({ where: { id: retailOrderId }, select: { id: true, storeId: true, orderNumber: true, buyerName: true, buyerEmail: true, items: true } });
  if (!order) return;
  const rows = await db.supplierOrder.findMany({ where: { retailOrderId }, select: { id: true, items: true } });
  const sentIds = new Set(summary.parts.filter((part) => part.state === "sent" || part.state === "delivered").map((part) => part.supplierOrderId ?? "own"));
  const names = (row: { items: unknown }) => orderLines(row.items).map((line) => `${line.name}${line.quantity > 1 ? ` × ${line.quantity}` : ""}`);
  const sentItems = rows.filter((row) => sentIds.has(row.id)).flatMap(names);
  const waitingItems = rows.filter((row) => !sentIds.has(row.id) && summary.parts.some((part) => part.supplierOrderId === row.id)).flatMap(names);
  const ownPart = summary.parts.find((part) => part.kind === "own");
  if (ownPart) {
    const covered = new Set(rows.flatMap((row) => orderLines(row.items).map((line) => line.storeProductId)));
    const own = (Array.isArray(order.items) ? order.items : [])
      .map((item) => item as { productId?: unknown; name?: unknown; quantity?: unknown })
      .filter((item) => !covered.has(String(item.productId ?? "")))
      .map((item) => `${String(item.name ?? "Item")}${Number(item.quantity) > 1 ? ` × ${Number(item.quantity)}` : ""}`);
    (sentIds.has("own") ? sentItems : waitingItems).push(...own);
  }
  const store = await db.store.findUnique({ where: { id: order.storeId }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true, brandSettings: true, status: true, currency: true } });
  if (!store) return;
  const [{ sendOrderPartlySentEmail }, { notifyOrderCustomerPartlySent }] = await Promise.all([import("@/lib/email/notices.server"), import("@/lib/notifications/customer-messages")]);
  if (order.buyerEmail && order.buyerEmail.includes("@")) {
    await sendOrderPartlySentEmail({ store, to: order.buyerEmail, buyerName: order.buyerName, orderNumber: order.orderNumber, sentItems, waitingItems, partsLine: summary.line, orderUrl: storeUrl(store, `/order/${order.id}`) }).catch(() => null);
  }
  await notifyOrderCustomerPartlySent(order.id);
}

// ─── What the seller sees ─────────────────────────────────────────────────────

export interface SellerProblem {
  supplierOrderId: string;
  supplierName: string;
  status: string;
  items: string;
  /** The first product's name. */
  productName: string;
  /** "Find another supplier" searches for this ("classic dashiki shirt"). */
  searchQuery: string;
  /** The automatic switch, if we sent it to someone else. */
  switched: { toSupplierOrderId: string; toName: string; message: string; costWords: string; canUndo: boolean; accepted: boolean } | null;
  /** The seller pressed Undo: back to their choices. */
  undone: boolean;
  /** Find another supplier / Cancel and refund. */
  needsChoice: boolean;
}

export interface SellerPartsView {
  /** The order's stage while suppliers send it (instead of "Needs a rider"), or null. */
  stage: { label: string; tone: "accent" | "success" | "warning" | "muted" | "danger" } | null;
  line: string | null;
  total: number;
  sent: number;
  parts: Array<{ key: string; kind: "supplier" | "own"; name: string; label: string; state: string; items: string; trackingCode: string | null; supplierOrderId: string | null }>;
  problems: SellerProblem[];
  canCancelAndRefund: boolean;
}

const itemsText = (items: unknown) => orderLines(items).map((line) => `${line.name}${line.variant ? ` (${line.variant})` : ""} × ${line.quantity}`).join(", ");

/** The parcels of a shop order and anything the seller has to decide, for the web page and the mobile app. */
export async function sellerPartsView(retailOrderId: string, storeId: string): Promise<SellerPartsView | null> {
  const order = await db.retailOrder.findFirst({ where: { id: retailOrderId, storeId } });
  if (!order) return null;
  const rows = await db.supplierOrder.findMany({ where: { retailOrderId, storeId }, orderBy: { createdAt: "asc" }, select: PART_SELECT });
  if (!rows.length) return null;
  const summary = summarise(order, rows);
  const switches = await db.supplierSwitch.findMany({ where: { retailOrderId } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ownItems = (() => {
    const covered = new Set(rows.flatMap((row) => orderLines(row.items).map((line) => line.storeProductId)));
    return (Array.isArray(order.items) ? order.items : [])
      .map((item) => item as { productId?: unknown; name?: unknown; quantity?: unknown })
      .filter((item) => !covered.has(String(item.productId ?? "")))
      .map((item) => `${String(item.name ?? "Item")} × ${Number(item.quantity) || 1}`)
      .join(", ");
  })();

  const problems: SellerProblem[] = [];
  for (const row of rows) {
    if (row.status !== "expired" && row.status !== "rejected") continue;
    const replacement = activeReplacement(rows, row.id);
    const record = switches.find((item) => item.fromSupplierOrderId === row.id);
    // A replacement that itself expired shows as its own problem; the first one just shows where it went.
    const lines = orderLines(row.items);
    const fromName = row.supplier.displayName;
    const switched = replacement
      ? {
          toSupplierOrderId: replacement.id,
          toName: replacement.supplier.displayName,
          message: switchedMessage({ fromName, toName: replacement.supplier.displayName, costBefore: row.costTotal, costAfter: replacement.costTotal }),
          costWords: costChangeWords(row.costTotal, replacement.costTotal),
          canUndo: canUndoSwitch(replacement),
          accepted: !["pending", "expired", "rejected", "cancelled"].includes(replacement.status),
        }
      : null;
    problems.push({
      supplierOrderId: row.id,
      supplierName: fromName,
      status: row.status,
      items: itemsText(row.items),
      productName: lines[0]?.name ?? "",
      searchQuery: nameWords(lines[0]?.name ?? "").slice(0, 3).join(" ") || (lines[0]?.name ?? "").slice(0, 60),
      switched,
      undone: record?.outcome === "undone",
      needsChoice: !replacement,
    });
  }
  const needsChoice = problems.some((problem) => problem.needsChoice && problem.status === "expired");
  return {
    stage: stageFromParts(order.status, summary),
    line: summary.line,
    total: summary.total,
    sent: summary.sent,
    parts: summary.parts.map((part) => {
      const row = part.supplierOrderId ? byId.get(part.supplierOrderId) : null;
      return { key: part.key, kind: part.kind, name: part.kind === "own" ? "You" : part.name, label: part.label, state: part.state, items: row ? itemsText(row.items) : ownItems, trackingCode: row?.trackingCode ?? null, supplierOrderId: part.supplierOrderId };
    }),
    problems,
    canCancelAndRefund: needsChoice && !["shipped", "delivered", "cancelled", "refunded", "returned"].includes(order.status),
  };
}
