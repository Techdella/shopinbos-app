import "server-only";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { STRIKE_DAYS, STRIKE_LABELS, STRIKES_FOR_REVIEW, activeStrikes, isShippedLate, needsReview, shipByDate, strikeExpires, type StrikeKind } from "@shared/fault-matrix";

// Supplier strikes and the ship-by deadline (shared/fault-matrix.ts). A strike counts for STRIKE_DAYS; three still
// counting flag the supplier for the team (Supplier.reviewFlaggedAt, admin › Money owed › Suppliers to review). Never
// an automatic suspension. The ship-by date is set when the supplier accepts; the cron marks late parcels, adds the
// strike and tells the customer they can cancel that part for a full refund (src/lib/faults/customer.server.ts).

/** Records a strike, once per kind and supplier order; flags the supplier for review at STRIKES_FOR_REVIEW. */
export async function addStrike(input: { supplierId: string; kind: StrikeKind; supplierOrderId: string | null; retailOrderId?: string | null; note?: string | null }, now = new Date()) {
  try {
    await db.supplierStrike.create({ data: { supplierId: input.supplierId, kind: input.kind, supplierOrderId: input.supplierOrderId, retailOrderId: input.retailOrderId ?? null, note: input.note ?? null, expiresAt: strikeExpires(now) } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { added: false };
    console.error(`[strikes] could not record a strike for ${input.supplierId}`, error);
    return { added: false };
  }
  // Late parcels count against the supplier's level (shared/dropship-rules.ts supplierLevel): recheck it now.
  if (input.kind === "late") await import("@/lib/supplier-levels.server").then((levels) => levels.refreshSupplierLevel(input.supplierId)).catch(() => undefined);
  const [supplier, strikes] = await Promise.all([
    db.supplier.findUnique({ where: { id: input.supplierId }, select: { userId: true, displayName: true, reviewFlaggedAt: true } }),
    db.supplierStrike.findMany({ where: { supplierId: input.supplierId, expiresAt: { gt: now } }, select: { expiresAt: true } }),
  ]);
  const count = activeStrikes(strikes, now).length;
  if (!supplier) return { added: true, count };
  await createNotification({
    userId: supplier.userId,
    type: "dropshipping",
    priority: "warning",
    title: `A strike: ${STRIKE_LABELS[input.kind].toLowerCase()}`,
    description: `You have ${count} ${count === 1 ? "strike" : "strikes"} in the last ${STRIKE_DAYS} days. At ${STRIKES_FOR_REVIEW}, our team reviews your account.${input.kind === "late" ? " Late parcels also count against your level." : ""} Strikes clear after ${STRIKE_DAYS} days.`,
    link: "/supplier/level",
    event: "supplier.strike",
    dedupeKey: `strike:${input.kind}:${input.supplierOrderId ?? now.toISOString()}`,
  }).catch(() => null);
  if (needsReview(count) && !supplier.reviewFlaggedAt) {
    await db.supplier.update({ where: { id: input.supplierId }, data: { reviewFlaggedAt: now, reviewNote: null } });
    const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true }, take: 20 });
    await Promise.allSettled(admins.map((admin) => createNotification({ userId: admin.id, type: "dropshipping", priority: "warning", title: `Review ${supplier.displayName}: ${count} strikes`, description: `${count} strikes in ${STRIKE_DAYS} days (late or out of stock after payment). Check their orders and decide what to do.`, link: "/admin/money-owed?show=review", event: "admin.review", dedupeKey: `strike-review:${input.supplierId}:${now.toISOString().slice(0, 10)}` })));
  }
  return { added: true, count };
}

/** The team looked: the flag comes off with a note (new strikes can raise it again). */
export async function clearSupplierReview(supplierId: string, note: string) {
  const text = note.trim().slice(0, 1000);
  if (text.length < 5) return { ok: false as const, error: "Write what you decided." };
  const moved = await db.supplier.updateMany({ where: { id: supplierId, reviewFlaggedAt: { not: null } }, data: { reviewFlaggedAt: null, reviewNote: text } });
  return moved.count ? { ok: true as const } : { ok: false as const, error: "This supplier isn't waiting for a review." };
}

/** A supplier's strikes still counting, for their level screen and the team. */
export async function supplierStrikes(supplierId: string, now = new Date()) {
  const rows = await db.supplierStrike.findMany({ where: { supplierId, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" }, take: 20 });
  return { count: rows.length, forReview: STRIKES_FOR_REVIEW, days: STRIKE_DAYS, strikes: rows.map((row) => ({ id: row.id, kind: row.kind, label: STRIKE_LABELS[row.kind as StrikeKind] ?? row.kind, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString() })) };
}

/**
 * The ship-by date for an order the supplier just accepted: the longest handling time of its products (1–3 working
 * days, shared/dropship-rules.ts), from now. Never throws.
 */
export async function setShipBy(supplierOrderId: string, acceptedAt = new Date()) {
  try {
    const row = await db.supplierOrder.findUnique({ where: { id: supplierOrderId }, select: { items: true, shipBy: true } });
    if (!row || row.shipBy) return;
    const ids = (Array.isArray(row.items) ? row.items : []).flatMap((item) => {
      const id = (item as { supplierProductId?: unknown })?.supplierProductId;
      return typeof id === "string" ? [id] : [];
    });
    const products = ids.length ? await db.supplierProduct.findMany({ where: { id: { in: ids } }, select: { handlingDays: true } }) : [];
    const days = Math.max(1, ...products.map((product) => product.handlingDays ?? 1));
    await db.supplierOrder.updateMany({ where: { id: supplierOrderId, shipBy: null }, data: { shipBy: shipByDate(acceptedAt, days) } });
  } catch (error) {
    console.error(`[strikes] could not set the ship-by date of ${supplierOrderId}`, error);
  }
}

/**
 * The cron: accepted orders past their ship-by date and not sent are late, once each: a strike for the supplier,
 * and the customer and the seller are told the customer may cancel that part for a full refund.
 */
export async function markLateOrders(now = new Date(), limit = 100) {
  const rows = await db.supplierOrder.findMany({
    where: { status: { in: ["accepted", "pending"] }, shipBy: { lt: now }, lateAt: null, shippedAt: null },
    take: limit,
    select: { id: true, status: true, shipBy: true, shippedAt: true, supplierId: true, retailOrderId: true, sellerId: true, retailOrder: { select: { orderNumber: true } }, supplier: { select: { displayName: true } } },
  });
  let late = 0;
  for (const row of rows) {
    if (!isShippedLate(row, now)) continue;
    const moved = await db.supplierOrder.updateMany({ where: { id: row.id, lateAt: null, shippedAt: null }, data: { lateAt: now } });
    if (moved.count !== 1) continue;
    late += 1;
    await addStrike({ supplierId: row.supplierId, kind: "late", supplierOrderId: row.id, retailOrderId: row.retailOrderId }, now);
    await createNotification({ userId: row.sellerId, type: "dropshipping", priority: "warning", title: `${row.supplier.displayName} is late with order ${row.retailOrder.orderNumber}`, description: "It's past the ship-by date. Your customer can now cancel that part for a full refund from their order page; if they do, you don't earn your margin on it.", link: `/home/orders/${row.retailOrderId}`, event: "supplier.late", dedupeKey: `late:${row.id}` }).catch(() => null);
    await import("@/lib/notifications/customer-messages").then((messages) => messages.textLateCancelOffer(row.retailOrderId, row.id)).catch(() => undefined);
  }
  return { late };
}
