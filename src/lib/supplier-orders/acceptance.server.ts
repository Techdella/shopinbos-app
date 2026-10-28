import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { parseStockHold } from "@/lib/commerce/stock-holds";
import { releaseStock } from "@/lib/commerce/stock.server";
import { expiryGuard, hoursInWords, reminderDue, type SupplierOrderKind } from "@shared/supplier-pickup";
import { messageSupplierPhone } from "./deadline.server";
import { EXPIRED_WHOLESALE_REASON, plainText, supplierOrderRef } from "./pure";
import { releaseWholesaleStock, wholesaleRef } from "./wholesale.server";
import { recordWholesaleRefundOwed } from "./preorders.server";
import { switchedMessage } from "@shared/order-parts";
import type { SwitchDecision } from "./switch.server";

// The time a supplier has to accept a new order (build spec 7.2): 4 hours for an order a shop sold, 24 hours for
// a bulk order (env SUPPLIER_ACCEPT_HOURS_DROPSHIP / SUPPLIER_ACCEPT_HOURS_WHOLESALE, or the admin's setting for
// the supplier). /api/cron/supplier-acceptance (every 5 minutes) reminds them an hour before and, once the time
// is up, expires the order: its stock goes back, the shop is told what it can do, and it counts against the
// supplier. Every move is a conditional update, so an accept that lands at the same moment wins.

/** A missed order counts against the supplier: missedOrders + 1 and 2 points off the trust score (never below 0). */
async function countMissed(tx: Prisma.TransactionClient, supplierId: string) {
  await tx.$executeRaw`UPDATE "Supplier" SET "missedOrders" = "missedOrders" + 1, "trustScore" = GREATEST(0, "trustScore" - 2), "updatedAt" = NOW() WHERE "id" = ${supplierId}`;
}

/**
 * Gives back the supplier stock checkout took for this supplier order's lines, once. The store order's row is
 * locked and its saved hold rewritten without these lines, so cancelling the whole order later (releaseOrderStock)
 * gives back only what is left: nothing is released twice.
 */
export async function releaseSupplierOrderStock(tx: Prisma.TransactionClient, supplierOrder: { id: string; retailOrderId: string; items: unknown }, now = new Date()) {
  const claimed = await tx.supplierOrder.updateMany({ where: { id: supplierOrder.id, stockReleasedAt: null }, data: { stockReleasedAt: now } });
  if (claimed.count !== 1) return 0;
  await tx.$queryRaw`SELECT "id" FROM "RetailOrder" WHERE "id" = ${supplierOrder.retailOrderId} FOR UPDATE`;
  const order = await tx.retailOrder.findUnique({ where: { id: supplierOrder.retailOrderId }, select: { id: true, stockHold: true, stockReleasedAt: true } });
  if (!order || order.stockReleasedAt || order.stockHold === null) return 0;
  const mine = new Set((Array.isArray(supplierOrder.items) ? supplierOrder.items : []).map((item) => String((item as { storeProductId?: unknown })?.storeProductId ?? "")));
  const holds = parseStockHold(order.stockHold);
  const give = holds.filter((hold) => hold.source === "supplier" && mine.has(hold.productId));
  if (!give.length) return 0;
  const rest = holds.filter((hold) => !give.includes(hold));
  await releaseStock(tx, give);
  await tx.retailOrder.update({ where: { id: order.id }, data: { stockHold: JSON.parse(JSON.stringify(rest)) } });
  return give.reduce((sum, hold) => sum + hold.quantity, 0);
}

// ─── Expiring ─────────────────────────────────────────────────────────────────

export interface AcceptanceResult {
  reminded: number;
  expired: { dropship: number; wholesale: number };
  /** Expired orders sent to another supplier automatically (this run, including the catch-up). */
  switched: number;
}

/** Expires one dropship order if it is still new and past its deadline. True when this call expired it. */
export async function expireSupplierOrder(id: string, now = new Date()) {
  return (await expireAndDecide(id, now)) !== null;
}

/** Expires the order (if still due) and decides what happens next; null when this call didn't expire it. */
async function expireAndDecide(id: string, now: Date): Promise<SwitchDecision | null> {
  const row = await db.supplierOrder.findUnique({
    where: { id },
    select: {
      id: true, status: true, acceptBy: true, createdAt: true, items: true, retailOrderId: true, sellerId: true, supplierId: true,
      supplier: { select: { userId: true, displayName: true } }, retailOrder: { select: { orderNumber: true } },
    },
  });
  if (!row) return null;
  const released = await db.$transaction(async (tx) => {
    // Only while it's still new and late: an accept that got there first leaves this matching nothing.
    const moved = await tx.supplierOrder.updateMany({ where: expiryGuard(row.id, now), data: { status: "expired", expiredAt: now } });
    if (moved.count !== 1) return null;
    const units = await releaseSupplierOrderStock(tx, row, now);
    await countMissed(tx, row.supplierId);
    return units;
  });
  if (released === null) return null;

  // Send it to another supplier with the same product if one qualifies (switch.server.ts); otherwise the seller
  // chooses. Decided once per expired order, whatever happens to this call.
  const decision = await decideAfterExpiry(row.id, now);
  await Promise.allSettled([
    tellSellerAfterExpiry(row, decision),
    createNotification({
      userId: row.supplier.userId,
      type: "dropshipping",
      priority: "warning",
      title: `Time ran out on order ${supplierOrderRef(row.id)}`,
      description: "You didn't accept it in time, so the shop has been told. Don't send it. Accept new orders quickly so shops keep sending you work.",
      link: "/supplier/orders",
      metadata: { supplierOrderId: row.id },
      event: "supplier_order.expired",
      dedupeKey: `supplier_order.expired:${row.id}`,
    }),
  ]);
  return decision;
}

type ExpiredRow = { id: string; acceptBy: Date | null; createdAt: Date; items: unknown; retailOrderId: string; sellerId: string; supplier: { displayName: string }; retailOrder: { orderNumber: string } };

/** switchAfterExpiry, never throwing: on a failure the seller gets their choices (recorded, so it isn't retried). */
async function decideAfterExpiry(id: string, now: Date): Promise<SwitchDecision> {
  const { switchAfterExpiry } = await import("./switch.server");
  try {
    return await switchAfterExpiry(id, now);
  } catch (error) {
    console.error(`[supplier acceptance] could not look for another supplier for ${id}`, error);
    const row = await db.supplierOrder.findUnique({ where: { id }, select: { retailOrderId: true, storeId: true, supplierId: true, costTotal: true } });
    if (row) {
      await db.supplierSwitch
        .create({ data: { retailOrderId: row.retailOrderId, storeId: row.storeId, fromSupplierOrderId: id, fromSupplierId: row.supplierId, outcome: "none", costBefore: row.costTotal, note: "Looking for another supplier failed." } })
        .catch(() => null);
    }
    return { outcome: "none", note: null };
  }
}

/** The seller hears what happened: switched (with Undo), or their two choices. */
async function tellSellerAfterExpiry(row: ExpiredRow, decision: SwitchDecision) {
  if (decision.outcome === "already") return;
  const supplierName = plainText(row.supplier.displayName) || "The supplier";
  const ref = row.retailOrder.orderNumber;
  if (decision.outcome === "switched") {
    const { notifyNewSupplier } = await import("./switch.server");
    await Promise.allSettled([
      notifyNewSupplier(decision.toSupplierOrderId, decision.acceptWords),
      createNotification({
        userId: row.sellerId,
        type: "dropshipping",
        priority: "warning",
        title: `We sent order ${ref} to ${plainText(decision.toName) || "another supplier"}`,
        description: `${switchedMessage({ fromName: supplierName, toName: plainText(decision.toName) || "another supplier", costBefore: decision.costBefore, costAfter: decision.costAfter })} Your customer hasn't been told. Press Undo before they accept if you'd rather choose yourself.`,
        link: `/home/orders/${row.retailOrderId}`,
        actionLabel: "See the order",
        actionUrl: `/home/orders/${row.retailOrderId}#supplier-orders`,
        metadata: { supplierOrderId: row.id, retailOrderId: row.retailOrderId, replacementId: decision.toSupplierOrderId, reason: "supplier_switched" },
        sendEmail: true,
        event: "supplier.switched",
        dedupeKey: `supplier.switched:${row.id}`,
      }),
    ]);
    return;
  }
  const lines = (Array.isArray(row.items) ? row.items : []) as Array<{ name?: unknown; quantity?: unknown }>;
  const what = lines.map((line) => `${Number(line.quantity) || 1} × ${plainText(line.name, 60) || "item"}`).join(", ");
  const hours = row.acceptBy ? hoursInWords((row.acceptBy.getTime() - row.createdAt.getTime()) / 3_600_000) : "the time they had";
  const why = decision.outcome === "limit" ? " We already tried other suppliers for this order." : decision.outcome === "none" ? " No other supplier has the same product within your price limit right now." : "";
  await createNotification({
    userId: row.sellerId,
    type: "dropshipping",
    priority: "critical",
    title: `${supplierName} didn't accept order ${ref} in time`,
    description: `They had ${hours} to say yes to ${what || "these items"} and didn't answer, so we took the order back from them.${why} Your customer hasn't been told. Find another supplier, or cancel and refund the customer.`,
    link: `/home/orders/${row.retailOrderId}`,
    actionLabel: "Choose what to do",
    actionUrl: `/home/orders/${row.retailOrderId}#supplier-orders`,
    metadata: { supplierOrderId: row.id, retailOrderId: row.retailOrderId, reason: "supplier_no_answer" },
    sendEmail: true,
    event: "supplier.expired",
    dedupeKey: `supplier.expired:${row.id}`,
  });
}

/**
 * Catch-up: an expired order with no decision (the process stopped between expiring it and looking for another
 * supplier). Only recent ones, so orders that expired before switching existed keep the seller's choices.
 */
async function sweepUndecided(now: Date, limit: number) {
  const since = new Date(now.getTime() - 2 * 60 * 60_000);
  const rows = await db.supplierOrder.findMany({
    where: { status: "expired", expiredAt: { gte: since } },
    orderBy: { expiredAt: "asc" },
    take: limit,
    select: { id: true, acceptBy: true, createdAt: true, items: true, retailOrderId: true, sellerId: true, supplier: { select: { displayName: true } }, retailOrder: { select: { orderNumber: true } } },
  });
  if (!rows.length) return 0;
  const decided = new Set((await db.supplierSwitch.findMany({ where: { fromSupplierOrderId: { in: rows.map((row) => row.id) } }, select: { fromSupplierOrderId: true } })).map((row) => row.fromSupplierOrderId));
  let switched = 0;
  for (const row of rows) {
    if (decided.has(row.id)) continue;
    const decision = await decideAfterExpiry(row.id, now);
    if (decision.outcome === "switched") switched += 1;
    await tellSellerAfterExpiry(row, decision).catch(() => null);
  }
  return switched;
}

/** Expires one bulk order if it is still new and past its deadline (it becomes cancelled, with expiredAt set). */
export async function expireWholesaleOrder(id: string, now = new Date()) {
  const row = await db.wholesaleOrder.findUnique({
    where: { id },
    select: { id: true, sellerId: true, supplierId: true, quantity: true, supplierProductId: true, depositPaidAt: true, supplier: { select: { userId: true, displayName: true } }, supplierProduct: { select: { name: true } } },
  });
  if (!row) return false;
  const done = await db.$transaction(async (tx) => {
    const moved = await tx.wholesaleOrder.updateMany({ where: expiryGuard(row.id, now) as Prisma.WholesaleOrderWhereInput, data: { status: "cancelled", expiredAt: now, rejectReason: EXPIRED_WHOLESALE_REASON } });
    if (moved.count !== 1) return false;
    await releaseWholesaleStock(tx, row.id);
    await countMissed(tx, row.supplierId);
    return true;
  });
  if (!done) return false;
  // A preorder deposit paid in the app is owed back (money owed, src/lib/supplier-orders/preorders.server.ts).
  if (row.depositPaidAt) await recordWholesaleRefundOwed(row.id);
  const supplierName = plainText(row.supplier.displayName) || "The supplier";
  const what = `${row.quantity.toLocaleString("en-NG")} × ${plainText(row.supplierProduct.name)}`;
  await Promise.allSettled([
    createNotification({
      userId: row.sellerId,
      type: "suppliers",
      priority: "warning",
      title: `${supplierName} didn't answer your wholesale order in time`,
      description: `${what}: they didn't accept it in time, so we cancelled it. ${row.depositPaidAt ? "The deposit you paid is owed back to you (see your Shopinbos Wallet)." : "You haven't paid anything."} Find another supplier for it.`,
      link: `/marketplace?q=${encodeURIComponent(row.supplierProduct.name.slice(0, 60))}`,
      actionLabel: "Find another supplier",
      actionUrl: `/marketplace?q=${encodeURIComponent(row.supplierProduct.name.slice(0, 60))}`,
      metadata: { wholesaleOrderId: row.id, reason: "supplier_no_answer" },
      sendEmail: true,
      event: "supplier.expired",
      dedupeKey: `supplier.expired:wholesale:${row.id}`,
    }),
    createNotification({
      userId: row.supplier.userId,
      type: "suppliers",
      priority: "warning",
      title: `Time ran out on wholesale order ${wholesaleRef(row.id)}`,
      description: "You didn't accept it in time, so it was cancelled and the shop was told. Accept new orders quickly so shops keep buying from you.",
      link: "/supplier/orders?kind=wholesale",
      metadata: { wholesaleOrderId: row.id },
      event: "supplier_order.expired",
      dedupeKey: `supplier_order.expired:wholesale:${row.id}`,
    }),
  ]);
  return true;
}

// ─── Reminding ────────────────────────────────────────────────────────────────

async function remind(kind: SupplierOrderKind, row: { id: string; supplierId: string; acceptBy: Date | null; supplier: { userId: string } }, shop: string, now: Date) {
  const claimed = kind === "dropship"
    ? await db.supplierOrder.updateMany({ where: { id: row.id, status: "pending", acceptReminderAt: null }, data: { acceptReminderAt: now } })
    : await db.wholesaleOrder.updateMany({ where: { id: row.id, status: "pending", acceptReminderAt: null }, data: { acceptReminderAt: now } });
  if (claimed.count !== 1) return false;
  const ref = kind === "dropship" ? supplierOrderRef(row.id) : wholesaleRef(row.id);
  const minutes = row.acceptBy ? Math.max(1, Math.round((row.acceptBy.getTime() - now.getTime()) / 60_000)) : 60;
  const left = minutes >= 55 ? "1 hour" : `${minutes} minutes`;
  const link = kind === "dropship" ? `/supplier/orders/${row.id}` : `/supplier/orders/${row.id}?kind=wholesale`;
  await createNotification({
    userId: row.supplier.userId,
    type: kind === "dropship" ? "dropshipping" : "suppliers",
    priority: "critical",
    title: `${left} left to accept order ${ref}`,
    description: `${shop} is waiting. Accept it now, or the shop will be told you didn't answer.`,
    link,
    actionLabel: "Accept order",
    actionUrl: link,
    metadata: kind === "dropship" ? { supplierOrderId: row.id } : { wholesaleOrderId: row.id },
    sendEmail: true,
    event: "supplier_order.reminder",
    dedupeKey: `supplier_order.reminder:${kind}:${row.id}`,
    phoneHandled: true,
  }).catch(() => null);
  await messageSupplierPhone(row.supplierId, `Shopinbos: ${left} left to accept order ${ref} from ${shop}. Open the app to accept it.`);
  return true;
}

/** Reminds suppliers an hour before the deadline and expires orders whose time is up. */
export async function runSupplierAcceptance(now = new Date(), limit = 200): Promise<AcceptanceResult> {
  const soon = new Date(now.getTime() + 60 * 60_000);
  const [dropshipDue, wholesaleDue] = await Promise.all([
    db.supplierOrder.findMany({
      where: { status: "pending", acceptReminderAt: null, acceptBy: { gt: now, lte: soon } },
      take: limit,
      select: { id: true, status: true, supplierId: true, acceptBy: true, acceptReminderAt: true, createdAt: true, storeId: true, supplier: { select: { userId: true } } },
    }),
    db.wholesaleOrder.findMany({
      where: { status: "pending", acceptReminderAt: null, acceptBy: { gt: now, lte: soon } },
      take: limit,
      select: { id: true, status: true, supplierId: true, acceptBy: true, acceptReminderAt: true, createdAt: true, seller: { select: { name: true, store: { select: { name: true } } } }, supplier: { select: { userId: true } } },
    }),
  ]);
  const storeNames = new Map(
    (await db.store.findMany({ where: { id: { in: [...new Set(dropshipDue.map((row) => row.storeId))] } }, select: { id: true, name: true } })).map((store) => [store.id, store.name]),
  );
  let reminded = 0;
  for (const row of dropshipDue) {
    if (!reminderDue(row, now)) continue;
    if (await remind("dropship", row, plainText(storeNames.get(row.storeId)) || "The shop", now)) reminded += 1;
  }
  for (const row of wholesaleDue) {
    if (!reminderDue(row, now)) continue;
    if (await remind("wholesale", row, plainText(row.seller.store?.name ?? row.seller.name) || "The shop", now)) reminded += 1;
  }

  const [dropshipLate, wholesaleLate] = await Promise.all([
    db.supplierOrder.findMany({ where: { status: "pending", acceptBy: { lte: now } }, orderBy: { acceptBy: "asc" }, take: limit, select: { id: true } }),
    db.wholesaleOrder.findMany({ where: { status: "pending", acceptBy: { lte: now } }, orderBy: { acceptBy: "asc" }, take: limit, select: { id: true } }),
  ]);
  const expired = { dropship: 0, wholesale: 0 };
  let switched = 0;
  for (const row of dropshipLate) {
    try {
      const decision = await expireAndDecide(row.id, now);
      if (decision) expired.dropship += 1;
      if (decision?.outcome === "switched") switched += 1;
    } catch (error) {
      console.error(`[supplier acceptance] could not expire supplier order ${row.id}`, error);
    }
  }
  for (const row of wholesaleLate) {
    try {
      if (await expireWholesaleOrder(row.id, now)) expired.wholesale += 1;
    } catch (error) {
      console.error(`[supplier acceptance] could not expire bulk order ${row.id}`, error);
    }
  }
  // Expired orders this run (and any a stopped run left undecided) that went to another supplier.
  try {
    switched += await sweepUndecided(now, limit);
  } catch (error) {
    console.error("[supplier acceptance] catch-up sweep failed", error);
  }
  // Who pays when things go wrong (shared/order-refunds.ts): accepted orders past their handling time, and refunds the
  // seller still hasn't sent two days after the customer gave their account.
  try {
    const { autoConfirmSentRefunds, markLateSuppliers, remindRefundsToSend } = await import("@/lib/commerce/order-refunds.server");
    await markLateSuppliers(now, limit);
    await remindRefundsToSend(now);
    await autoConfirmSentRefunds(now);
  } catch (error) {
    console.error("[supplier acceptance] late handling / refund reminders failed", error);
  }
  return { reminded, expired, switched };
}
