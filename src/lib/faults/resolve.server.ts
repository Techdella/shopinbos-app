import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { refundFault } from "@/lib/commerce/refunds.server";
import { readSplitPlan, type PaymentSplitPlan } from "@/lib/wallet/rules";
import { readDeliveryPlan } from "@shared/delivery-market";
import { isPayOnDelivery, payAtDoorPaid } from "@shared/pay-at-door";
import {
  FAULT_LABELS,
  resolveFault,
  faultProblem,
  type FaultEvent,
  type FaultEvidence,
  type FaultOrder,
  type FaultOutcome,
  type FaultPart,
  type Party,
  type Remedy,
} from "@shared/fault-matrix";
import { addStrike } from "./strikes.server";

// Who pays when things go wrong, server side (shared/fault-matrix.ts has the rules): reads an order into the
// resolver's facts (each parcel's goods, the split's shares, delivery fees and the partner's rate card), resolves an
// event and applies it once (FaultCase.key): the customer's refund through the refund route, money owed between the
// businesses (BusinessDebt, taken from their next payments automatically), strikes, return trips and replacements,
// and a line for everyone. Money never moves any other way: Shopinbos holds nobody's money.

export type FaultSource = "out_of_stock" | "late_cancel" | "failed_delivery" | "pod_refused" | "report" | "return";

const kobo = (naira: unknown) => Math.max(0, Math.round((Number(naira) || 0) * 100));
const naira = (value: number) => `₦${(value / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

function lines(items: unknown) {
  return (Array.isArray(items) ? items : []) as Array<{ productId?: unknown; storeProductId?: unknown; price?: unknown; quantity?: unknown; name?: unknown }>;
}

/** What the split settled to a supplier (their share plus anything taken from it for their own debts). */
function supplierShare(plan: PaymentSplitPlan | null, supplierId: string) {
  if (!plan) return { paid: 0, commission: 0 };
  const share = plan.suppliers.find((row) => row.supplierId === supplierId);
  if (!share) return { paid: 0, commission: 0 };
  const taken = (plan.deductions ?? []).filter((row) => row.from === supplierId).reduce((sum, row) => sum + row.kobo, 0);
  return { paid: share.kobo + taken, commission: share.commissionKobo ?? 0 };
}

function partnerShare(plan: PaymentSplitPlan | null, shipmentKey: string, partnerId: string) {
  const share = plan?.delivery?.find((row) => row.shipmentKey === shipmentKey);
  if (!share) return 0;
  const taken = (plan?.deductions ?? []).filter((row) => row.from === `partner:${partnerId}`).reduce((sum, row) => sum + row.kobo, 0);
  return share.kobo + taken;
}

const ORDER_SELECT = {
  id: true, orderNumber: true, storeId: true, items: true, total: true, shippingFee: true, status: true, paymentMethod: true, paystackStatus: true,
  paystackRef: true, paymentSplit: true, balanceSplit: true, logisticsDetails: true, depositPaidAt: true, deliveredAt: true, buyerEmail: true,
  store: { select: { userId: true, name: true, slug: true, returnShippingPayer: true } },
} as const satisfies Prisma.RetailOrderSelect;

/** The order as the resolver sees it, with each part's evidence and who's who. Null when there's no such order. */
export async function loadFaultFacts(retailOrderId: string) {
  const order = await db.retailOrder.findUnique({ where: { id: retailOrderId }, select: ORDER_SELECT });
  if (!order) return null;
  const [supplierOrders, bookings] = await Promise.all([
    db.supplierOrder.findMany({
      where: { retailOrderId },
      orderBy: { createdAt: "asc" },
      select: { id: true, supplierId: true, items: true, status: true, replacesId: true, idempotencyKey: true, costTotal: true, contentsPhotoUrl: true, packPhotoUrl: true, packedAt: true, shippedAt: true, deliveredAt: true, shipBy: true, lateAt: true, supplier: { select: { userId: true, displayName: true } } },
    }),
    db.deliveryBooking.findMany({
      where: { orderId: retailOrderId, tripKind: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, logisticsPartnerId: true, shipmentKey: true, deliveryFee: true, rateCardId: true, status: true, pickupPhotoUrl: true, proofUrl: true, pickedUpAt: true, deliveredAt: true, replacedById: true, pickupLocation: true, destination: true, packageDetails: true, logisticsPartner: { select: { userId: true, displayName: true } } },
    }),
  ]);
  const plan = readSplitPlan(order.paymentSplit);
  const balance = readSplitPlan(order.balanceSplit);
  const delivery = readDeliveryPlan(order.logisticsDetails);
  const pod = isPayOnDelivery(order);
  const goodsPaid = pod ? payAtDoorPaid(order) : order.paystackStatus === "success" || (order.paymentMethod !== null && order.paymentMethod !== "paystack" && order.paymentMethod !== "korapay") || ["paid", "processing", "packed", "shipped", "delivered"].includes(order.status);
  // Pay on delivery: the goods are split when the door payment comes in (balanceSplit); the fee at checkout.
  const goodsPlan = pod ? balance : plan;

  // The parts: one per supplier (its first order; a replacement isn't a new part) and the seller's own lines.
  const originals = supplierOrders.filter((row) => !row.replacesId);
  const productSupplier = new Map<string, string>();
  for (const row of originals) for (const line of lines(row.items)) if (typeof line.storeProductId === "string") productSupplier.set(line.storeProductId, row.supplierId);
  const goodsBy = new Map<string, number>();
  for (const line of lines(order.items)) {
    const key = typeof line.productId === "string" && productSupplier.has(line.productId) ? `supplier:${productSupplier.get(line.productId)}` : "own";
    goodsBy.set(key, (goodsBy.get(key) ?? 0) + kobo(line.price) * Math.max(1, Math.floor(Number(line.quantity) || 1)));
  }
  // A discount makes the order cost less than its lines: the parts' goods shrink in proportion.
  const deliveryKobo = delivery ? delivery.shipments.reduce((sum, part) => sum + kobo(part.charge ?? part.price), 0) : kobo(order.shippingFee);
  const goodsTotal = [...goodsBy.values()].reduce((sum, value) => sum + value, 0);
  const paidGoods = Math.max(0, kobo(order.total) - deliveryKobo);
  const scale = goodsTotal > paidGoods && goodsTotal > 0 ? paidGoods / goodsTotal : 1;

  const commissions = goodsPlan ? goodsPlan.suppliers.reduce((sum, row) => sum + (row.commissionKobo ?? 0), 0) : 0;
  const toShopinbos = goodsPlan ? (goodsPlan.deductions ?? []).filter((row) => row.to === null).reduce((sum, row) => sum + row.kobo, 0) : 0;
  const ownFee = goodsPlan ? Math.max(0, (goodsPlan.platformKobo ?? 0) - commissions - toShopinbos) : 0;

  const cards = await db.logisticsRateCard.findMany({
    where: { OR: [{ id: { in: bookings.flatMap((row) => (row.rateCardId ? [row.rateCardId] : [])) } }, { logisticsPartnerId: { in: bookings.map((row) => row.logisticsPartnerId) } }] },
    select: { id: true, logisticsPartnerId: true, failedAttemptFee: true, returnFee: true },
  }).catch(() => []);

  const keys = [...new Set([...originals.map((row) => `supplier:${row.supplierId}`), ...(goodsBy.has("own") ? ["own"] : [])])];
  const parts: FaultPart[] = keys.map((key) => {
    const supplierId = key.startsWith("supplier:") ? key.slice(9) : null;
    const shipment = delivery?.shipments.find((part) => part.shipmentKey === key) ?? (delivery?.shipments.length === 1 && keys.length === 1 ? delivery.shipments[0] : undefined);
    const job = bookings.find((row) => !row.replacedById && (row.shipmentKey === key || (!row.shipmentKey && keys.length === 1)));
    const partnerId = shipment?.partnerId ?? job?.logisticsPartnerId ?? null;
    const card = cards.find((row) => row.id === job?.rateCardId) ?? cards.find((row) => row.id === shipment?.rateCardId) ?? cards.find((row) => row.logisticsPartnerId === partnerId);
    const share = supplierId ? supplierShare(goodsPlan, supplierId) : { paid: 0, commission: 0 };
    return {
      key,
      supplierId,
      goodsKobo: Math.round((goodsBy.get(key) ?? 0) * scale),
      supplierPaidKobo: share.paid,
      platformKobo: supplierId ? share.commission : ownFee,
      deliveryChargeKobo: shipment ? kobo(shipment.charge ?? shipment.price) : keys.length === 1 ? kobo(order.shippingFee) : 0,
      partner: partnerId && shipment?.service !== "supplier_self"
        ? { partnerId, paidKobo: partnerShare(plan, key, partnerId) || partnerShare(balance, key, partnerId), failedAttemptFeeKobo: kobo(card?.failedAttemptFee), returnFeeKobo: kobo(card?.returnFee) }
        : null,
    };
  });

  const faultOrder: FaultOrder = { orderNumber: order.orderNumber, goodsPaid, split: Boolean(goodsPlan), parts };
  const evidence = (partKey: string): FaultEvidence & { photos: { contents: string | null; sealed: string | null; pickup: string | null; handover: string | null } } => {
    const supplierId = partKey.startsWith("supplier:") ? partKey.slice(9) : null;
    const so = supplierId ? [...supplierOrders].reverse().find((row) => row.supplierId === supplierId) : null;
    const job = bookings.find((row) => !row.replacedById && (row.shipmentKey === partKey || (!row.shipmentKey && keys.length === 1)));
    return {
      contentsPhoto: Boolean(so?.contentsPhotoUrl),
      sealedPhoto: Boolean(so?.packPhotoUrl),
      pickupPhoto: Boolean(job?.pickupPhotoUrl),
      handoverPhoto: Boolean(job?.proofUrl),
      delivered: job ? job.status === "delivered" : order.status === "delivered",
      jobFailed: job ? ["failed", "returning", "returned"].includes(job.status) : false,
      pickedUp: job ? Boolean(job.pickedUpAt) || ["picked_up", "in_transit", "out_for_delivery", "at_pickup_point", "delivered", "failed", "returning", "returned"].includes(job.status) : Boolean(so?.shippedAt),
      photos: { contents: so?.contentsPhotoUrl ?? null, sealed: so?.packPhotoUrl ?? null, pickup: job?.pickupPhotoUrl ?? null, handover: job?.proofUrl ?? null },
    };
  };
  return { order, faultOrder, supplierOrders, bookings, evidence };
}

export type FaultFacts = NonNullable<Awaited<ReturnType<typeof loadFaultFacts>>>;

export interface ApplyInput {
  /** Once per case: oos:<soId> · late:<soId> · failed:<bookingId> · pod:<bookingId> · issue:<issueId> · return:<returnId>. */
  key: string;
  source: FaultSource;
  retailOrderId: string;
  event: FaultEvent;
  partKeys?: string[];
  remedy?: Remedy;
  returnPayer?: "customer" | "seller";
  note?: string | null;
  decidedByUserId?: string | null;
  /** Book the trips back (wrong items). Returns book theirs when approved; failed deliveries come back on their own job. */
  bookTrips?: boolean;
  /**
   * Only a suggestion: the case is recorded as "proposed" and nothing happens (no refund, money owed, strikes, trips
   * or messages) until the seller accepts it (decideFaultCase). Everything the system starts on its own is proposed;
   * the seller's own decisions apply at once. The shop is the seller's business.
   */
  propose?: boolean;
}

export type ApplyResult = { ok: true; fresh: boolean; caseId: string; outcome: FaultOutcome; proposed: boolean } | { ok: false; error: string };

async function notify(userId: string | null | undefined, title: string, description: string, link: string, priority: "info" | "warning" | "critical" = "info", dedupeKey?: string) {
  if (!userId || !description) return;
  await createNotification({ userId, type: "order", priority, title, description, link, event: "fault.outcome", dedupeKey }).catch(() => null);
}

/**
 * Works out one outcome from the matrix, once per key, and applies it, or (propose) records it for the seller to
 * decide. Safe to call again (the case already exists: nothing happens). Never throws for a known problem; a
 * database error after the case is recorded is logged.
 */
export async function applyFault(input: ApplyInput): Promise<ApplyResult> {
  const existing = await db.faultCase.findUnique({ where: { key: input.key }, select: { id: true, outcome: true, status: true } });
  if (existing) return { ok: true, fresh: false, caseId: existing.id, outcome: existing.outcome as unknown as FaultOutcome, proposed: existing.status === "proposed" };
  const facts = await loadFaultFacts(input.retailOrderId);
  if (!facts) return { ok: false, error: "We couldn't find this order." };
  const resolverInput = { event: input.event, order: facts.faultOrder, partKeys: input.partKeys, remedy: input.remedy, returnPayer: input.returnPayer ?? (facts.order.store.returnShippingPayer === "seller" ? "seller" as const : "customer" as const), partnerDepositKobo: 0 };
  const problem = faultProblem(resolverInput);
  if (problem) return { ok: false, error: problem };
  const outcome = resolveFault(resolverInput);
  const proposed = input.propose === true;

  let caseId: string;
  try {
    const created = await db.faultCase.create({
      data: {
        key: input.key,
        retailOrderId: facts.order.id,
        storeId: facts.order.storeId,
        event: outcome.event,
        remedy: outcome.remedy,
        partKeys: outcome.partKeys,
        source: input.source,
        outcome: JSON.parse(JSON.stringify(outcome)) as Prisma.InputJsonValue,
        refundKobo: outcome.refundKobo,
        note: input.note?.trim().slice(0, 1500) || null,
        decidedByUserId: input.decidedByUserId ?? null,
        status: proposed ? "proposed" : "applied",
        decidedAt: proposed ? null : new Date(),
      },
    });
    caseId = created.id;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const again = await db.faultCase.findUnique({ where: { key: input.key }, select: { id: true, outcome: true, status: true } });
      if (again) return { ok: true, fresh: false, caseId: again.id, outcome: again.outcome as unknown as FaultOutcome, proposed: again.status === "proposed" };
    }
    throw error;
  }

  if (proposed) {
    // The seller decides: what the matrix suggests, and that nothing happens until they choose.
    await notify(
      facts.order.store.userId,
      `Decide: ${FAULT_LABELS[outcome.event].toLowerCase()}, order ${facts.order.orderNumber}`,
      `Suggested: ${outcome.lines.seller} Nothing happens until you accept it or handle it yourself.`,
      `/home/orders/${facts.order.id}#problems`,
      "warning",
      `fault:${input.key}:proposed`,
    );
    return { ok: true, fresh: true, caseId, outcome, proposed: true };
  }
  await runOutcome({ key: input.key, decidedByUserId: input.decidedByUserId ?? null, bookTrips: input.bookTrips === true }, caseId, facts, outcome);
  return { ok: true, fresh: true, caseId, outcome, proposed: false };
}

/** Everything an applied outcome does: money owed, strikes, replacements, trips back, the refund and the messages. */
async function runOutcome(input: { key: string; decidedByUserId: string | null; bookTrips: boolean }, caseId: string, facts: FaultFacts, outcome: FaultOutcome) {
  const sellerId = facts.order.store.userId;
  const supplierUser = new Map(facts.supplierOrders.map((row) => [row.supplierId, row.supplier.userId]));
  const partnerIds = [...new Set(outcome.debts.flatMap((debt) => [debt.from, debt.to]).flatMap((party) => (party.role === "logistics" ? [party.partnerId] : [])))];
  const partners = partnerIds.length ? await db.logisticsPartner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, userId: true } }) : [];
  const userOf = (party: Party) => (party.role === "seller" ? sellerId : party.role === "supplier" ? supplierUser.get(party.supplierId) ?? null : partners.find((row) => row.id === party.partnerId)?.userId ?? null);
  const supplierOrderOf = (partKey: string) => {
    const supplierId = partKey.startsWith("supplier:") ? partKey.slice(9) : null;
    return supplierId ? facts.supplierOrders.find((row) => row.supplierId === supplierId && !row.replacesId) ?? null : null;
  };
  const bookingOf = (partKey: string) => facts.bookings.find((row) => !row.replacedById && (row.shipmentKey === partKey || (!row.shipmentKey && facts.faultOrder.parts.length === 1))) ?? null;

  try {
    // 1. Money owed between the businesses, owed now. A supplier's or partner's is taken from their next payments
    //    from this shop (shared/money-owed.ts deductsAutomatically); the shop's own never is (it pays in the app).
    const now = new Date();
    let index = 0;
    for (const debt of outcome.debts) {
      index += 1;
      if (debt.fromDeposit) continue; // no deposits yet (Q8): nothing to draw
      const debtorUserId = userOf(debt.from);
      const creditorUserId = userOf(debt.to);
      if (!debtorUserId || !creditorUserId || debtorUserId === creditorUserId) continue;
      const so = supplierOrderOf(debt.partKey);
      // A supplier paid at checkout who didn't send is the same record as syncNotSentDebts's (one key, never twice).
      const notSent = (outcome.event === "out_of_stock" || outcome.event === "shipped_late") && debt.from.role === "supplier" && so;
      const sourceKey = notSent ? `notsent:${so!.id}` : `fault:${input.key}:${index}`;
      try {
        await db.businessDebt.create({
          data: { sourceKey, debtorUserId, creditorUserId, reason: debt.reason, amountKobo: debt.kobo, status: "open", details: debt.why, retailOrderId: facts.order.id, supplierOrderId: so?.id ?? null, bookingId: bookingOf(debt.partKey)?.id ?? null, dueAt: now, decidedByUserId: input.decidedByUserId, decidedAt: input.decidedByUserId ? now : null },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
        // Already recorded (by the not-sent sweep): owed from now, so the next payment takes it.
        if (notSent) await db.businessDebt.updateMany({ where: { sourceKey, status: { in: ["open", "claimed"] } }, data: { status: "open", dueAt: now, details: debt.why } });
      }
    }

    // 2. Strikes (late, out of stock): three in 90 days and the team reviews the supplier.
    for (const strike of outcome.strikes) {
      const so = supplierOrderOf(`supplier:${strike.supplierId}`);
      await addStrike({ supplierId: strike.supplierId, kind: strike.kind, supplierOrderId: so?.id ?? null, retailOrderId: facts.order.id });
    }

    // 3. Replacements: the supplier gets the same order again (packed with photos, picked up as usual), not paid twice.
    for (const replacement of outcome.replacements) {
      const so = supplierOrderOf(replacement.partKey);
      if (so) await createReplacementOrder(so.id).catch((error) => console.error(`[faults] replacement for ${so.id}`, error));
    }

    // 4. Trips back, booked with the same partner and paid through money owed.
    if (input.bookTrips) {
      for (const trip of outcome.trips.filter((row) => row.kind === "return")) {
        const job = bookingOf(trip.partKey);
        if (job) await bookReturnTrip(job.id, trip.feeKobo / 100, trip.paidBy, `${FAULT_LABELS[outcome.event]}: order ${facts.order.orderNumber}`).catch((error) => console.error(`[faults] return trip for ${job.id}`, error));
      }
    }

    // 5. The customer's refund, through the refund route.
    if (outcome.refundKobo > 0) {
      const refund = await refundFault({ orderId: facts.order.id, caseKey: input.key, event: outcome.event, refundKobo: outcome.refundKobo, fromShopinbosKobo: outcome.refundFromShopinbosKobo, why: `${FAULT_LABELS[outcome.event]}.`, customerLine: outcome.lines.customer });
      await db.faultCase.update({ where: { id: caseId }, data: { refundStatus: refund.status } });
    }

    // 6. Everyone hears what it means for them.
    const title = `${FAULT_LABELS[outcome.event]}: order ${facts.order.orderNumber}`;
    await notify(sellerId, title, outcome.lines.seller, `/home/orders/${facts.order.id}`, "warning", `fault:${input.key}:seller`);
    for (const supplierId of new Set(outcome.partKeys.flatMap((key) => (key.startsWith("supplier:") ? [key.slice(9)] : [])))) {
      await notify(supplierUser.get(supplierId), title, outcome.lines.supplier ?? "", "/supplier/wallet", "warning", `fault:${input.key}:supplier:${supplierId}`);
    }
    const partnerUsers = new Set(outcome.partKeys.flatMap((key) => {
      const job = bookingOf(key);
      return job ? [job.logisticsPartner.userId] : [];
    }));
    for (const userId of partnerUsers) await notify(userId, title, outcome.lines.logistics ?? "", "/logistics/wallet", "info", `fault:${input.key}:partner:${userId}`);
  } catch (error) {
    console.error(`[faults] could not finish case ${input.key}`, error);
  }
}

/**
 * The seller's decision on a suggested outcome: accept it (it applies now, as the matrix worked it out) or handle it
 * themselves (nothing happens; between the shop and its customer, the shop decides). `beforeApply` runs what the
 * source needs first (cancel a late part the customer asked to cancel, and so on). Once per case.
 */
export async function decideFaultCase(sellerId: string, caseId: string, accept: boolean, beforeApply?: (row: { key: string; source: string; retailOrderId: string; partKeys: string[] }) => Promise<string | null>): Promise<{ ok: true; outcome: FaultOutcome } | { ok: false; error: string }> {
  const row = await db.faultCase.findUnique({ where: { id: caseId } });
  if (!row) return { ok: false, error: "We couldn't find this." };
  const store = await db.store.findUnique({ where: { id: row.storeId }, select: { userId: true } });
  if (!store || store.userId !== sellerId) return { ok: false, error: "We couldn't find this." };
  if (row.status !== "proposed") return { ok: false, error: row.status === "declined" ? "You chose to handle this yourself." : "This has already been done." };
  if (accept && beforeApply) {
    const problem = await beforeApply({ key: row.key, source: row.source, retailOrderId: row.retailOrderId, partKeys: row.partKeys });
    if (problem) return { ok: false, error: problem };
  }
  const moved = await db.faultCase.updateMany({ where: { id: row.id, status: "proposed" }, data: { status: accept ? "applied" : "declined", decidedByUserId: sellerId, decidedAt: new Date() } });
  if (moved.count !== 1) return { ok: false, error: "This has already been decided." };
  const outcome = row.outcome as unknown as FaultOutcome;
  if (!accept) return { ok: true, outcome };
  const facts = await loadFaultFacts(row.retailOrderId);
  if (!facts) return { ok: false, error: "We couldn't find this order." };
  await runOutcome({ key: row.key, decidedByUserId: sellerId, bookTrips: false }, row.id, facts, outcome);
  return { ok: true, outcome };
}

/** A replacement of a supplier's parcel: the same lines again, to accept, pack (photos) and send. Once per order. */
export async function createReplacementOrder(supplierOrderId: string) {
  const original = await db.supplierOrder.findUnique({ where: { id: supplierOrderId } });
  if (!original) return null;
  const { acceptByFor } = await import("@/lib/supplier-orders/deadline.server");
  const supplier = await db.supplier.findUnique({ where: { id: original.supplierId }, select: { acceptHoursDropship: true, acceptHoursWholesale: true, userId: true } });
  const { acceptBy } = acceptByFor("dropship", supplier);
  try {
    const created = await db.supplierOrder.create({
      data: {
        idempotencyKey: `replacement:${original.id}`,
        supplierId: original.supplierId,
        retailOrderId: original.retailOrderId,
        storeId: original.storeId,
        sellerId: original.sellerId,
        status: "pending",
        items: original.items as Prisma.InputJsonValue,
        costTotal: original.costTotal,
        currency: original.currency,
        shippingAddress: original.shippingAddress as Prisma.InputJsonValue,
        recipientName: original.recipientName,
        recipientPhone: original.recipientPhone,
        branding: original.branding as Prisma.InputJsonValue,
        replacesId: original.id,
        acceptBy,
      },
    });
    if (supplier) await notify(supplier.userId, "Send a replacement", "The customer got a wrong or damaged item. Accept, pack it with the photos and it's picked up as usual. You're not paid again for it.", `/supplier/orders/${created.id}`, "warning", `replacement:${original.id}`);
    return created;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return null;
    throw error;
  }
}

/** A trip back from the customer to whoever sent it, with the same partner, linked to the delivery it undoes. */
export async function bookReturnTrip(bookingId: string, feeNaira: number, paidBy: string, note: string) {
  const job = await db.deliveryBooking.findUnique({ where: { id: bookingId } });
  if (!job) return null;
  const already = await db.deliveryBooking.findFirst({ where: { returnOfId: job.id, tripKind: "return", status: { notIn: ["cancelled", "declined"] } }, select: { id: true } });
  if (already) return already;
  const { createDeliveryJob } = await import("@/lib/logistics/booking.server");
  const trip = await createDeliveryJob({
    sellerId: job.sellerId,
    logisticsPartnerId: job.logisticsPartnerId,
    orderId: job.orderId,
    pickupLocation: job.destination,
    destination: job.pickupLocation,
    packageDetails: job.packageDetails as Prisma.InputJsonValue,
    deliveryFee: Math.max(0, feeNaira),
    notes: `Return trip. ${note}`.slice(0, 500),
  });
  // Paid through money owed (the at-fault party's next payments), not by card.
  await db.deliveryBooking.update({ where: { id: trip.id }, data: { tripKind: "return", returnOfId: job.id, feeBearer: paidBy === "logistics" ? "logistics_partner" : paidBy === "supplier" ? "supplier" : "seller", feePaidAt: new Date(), shipmentKey: job.shipmentKey } });
  return trip;
}

/** The cases on an order, newest first, for the seller's and the customer's order pages. */
export async function faultCasesFor(retailOrderId: string) {
  const rows = await db.faultCase.findMany({ where: { retailOrderId }, orderBy: { createdAt: "desc" }, take: 20 });
  return rows.map((row) => {
    const outcome = row.outcome as unknown as FaultOutcome;
    return { id: row.id, status: row.status, source: row.source, event: row.event, label: FAULT_LABELS[row.event as FaultEvent] ?? row.event, remedy: row.remedy, refundKobo: row.refundKobo, refundStatus: row.refundStatus, lines: outcome?.lines ?? null, createdAt: row.createdAt.toISOString(), refundWords: row.refundKobo > 0 ? naira(row.refundKobo) : null };
  });
}
