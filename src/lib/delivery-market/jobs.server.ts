import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { announceDeliveryJob, saveDeliveryJob, type DeliveryJobInput } from "@/lib/logistics/booking.server";
import { emitPartnerEvent } from "@/lib/logistics/webhooks";
import { createNotification } from "@/lib/notifications/create";
import { updateOrderStatus } from "@/lib/orders/update-status";
import {
  ACCEPT_WITHIN_HOURS,
  canReassign,
  jobException,
  partnerShipments,
  placeOf,
  quoteFor,
  readDeliveryPlan,
  type DeliveryPlan,
  type RateService,
  type SizeBand,
} from "@shared/delivery-market";
import { deliverySettingsFor, marketConnectionsFor, originOf } from "./market.server";

// Delivery jobs from the logistics marketplace: an order's parcels become partner jobs once the order is live (paid,
// or placed as pay on delivery); the partner accepts or declines; the shop marks the parcel ready; a declined or
// late job moves to the shop's exceptions and the shop sends it to another connected partner.
//
// The shop's own parcel is booked here. A dropship parcel is the supplier's: it's booked when the supplier packs it
// and picks a pickup time (src/lib/supplier-orders/pickup.server.ts), with the partner and fee from this plan.

export type JobResult = { ok: true; bookingId?: string } | { ok: false; error: string };

const money = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

function addressText(address: unknown) {
  const a = (address && typeof address === "object" ? address : {}) as Record<string, unknown>;
  const text = (key: string) => (typeof a[key] === "string" ? (a[key] as string).trim() : "");
  return [text("street"), text("city"), text("state")].filter(Boolean).join(", ") + (text("landmark") ? ` (landmark: ${text("landmark")})` : "");
}

async function savePlan(orderId: string, logisticsDetails: unknown, plan: DeliveryPlan) {
  const current = logisticsDetails && typeof logisticsDetails === "object" ? (logisticsDetails as Record<string, unknown>) : {};
  await db.retailOrder.update({ where: { id: orderId }, data: { logisticsDetails: { ...current, delivery: plan } as unknown as Prisma.InputJsonValue } });
}

/** The parcel an order's plan says a supplier ships, with its partner and fee (for the supplier's pickup booking). */
export async function plannedSupplierShipment(retailOrderId: string, supplierId: string) {
  const order = await db.retailOrder.findUnique({ where: { id: retailOrderId }, select: { logisticsDetails: true, paymentSplit: true } });
  const plan = readDeliveryPlan(order?.logisticsDetails);
  const part = plan ? partnerShipments(plan).find((entry) => entry.shipmentKey === `supplier:${supplierId}`) : null;
  if (!part) return null;
  const split = order?.paymentSplit as { delivery?: Array<{ shipmentKey: string }> } | null;
  return { ...part, feePaid: !!split?.delivery?.some((share) => share.shipmentKey === part.shipmentKey) };
}

/** Marks the supplier's parcel as booked on the order's plan (so the shop sees which job carries it). */
export async function linkSupplierShipment(retailOrderId: string, supplierId: string, bookingId: string) {
  const order = await db.retailOrder.findUnique({ where: { id: retailOrderId }, select: { logisticsDetails: true } });
  const plan = readDeliveryPlan(order?.logisticsDetails);
  if (!order || !plan) return;
  const next = { ...plan, shipments: plan.shipments.map((part) => (part.shipmentKey === `supplier:${supplierId}` ? { ...part, bookingId } : part)) };
  await savePlan(retailOrderId, order.logisticsDetails, next);
  await db.deliveryBooking.update({ where: { id: bookingId }, data: { shipmentKey: `supplier:${supplierId}`, connectionId: plan.shipments.find((part) => part.shipmentKey === `supplier:${supplierId}`)?.connectionId ?? null } }).catch(() => null);
}

/**
 * Sends the shop's own parcel of a live order to its partner as a job (once: the plan remembers the job). Safe to
 * call again from every place an order goes live, and on webhook replays.
 */
export async function dispatchOrderDeliveries(orderId: string) {
  const order = await db.retailOrder.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, status: true, buyerName: true, buyerPhone: true, deliveryAddress: true, items: true, total: true, paymentMethod: true, paymentSplit: true, logisticsDetails: true, currency: true, store: { select: { id: true, name: true, userId: true, city: true } } },
  });
  const plan = readDeliveryPlan(order?.logisticsDetails);
  if (!order || !plan || order.status === "cancelled") return { created: 0 };
  const own = partnerShipments(plan).find((part) => part.shipmentKey === "own" && !part.bookingId);
  if (!own) return { created: 0 };

  const input = await marketJobInput({ order, plan, part: own });
  // One job per parcel even when the payment webhook and the return page arrive together: a lock on the order,
  // then a check for a job already made.
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`delivery-dispatch:${order.id}`}))`;
    const existing = await tx.deliveryBooking.findFirst({ where: { orderId: order.id, shipmentKey: "own" }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (existing) return { booking: null, bookingId: existing.id };
    const booking = await saveDeliveryJob(input, tx);
    return { booking, bookingId: booking.id };
  });
  await savePlan(order.id, order.logisticsDetails, { ...plan, shipments: plan.shipments.map((part) => (part.shipmentKey === "own" ? { ...part, bookingId: result.bookingId } : part)) });
  if (!result.booking) return { created: 0 };
  await announceDeliveryJob(result.booking);
  return { created: 1 };
}

/** Never let a delivery problem break a webhook or checkout. */
export async function dispatchOrderDeliveriesSafely(orderId: string) {
  try {
    return await dispatchOrderDeliveries(orderId);
  } catch (error) {
    console.error(`[delivery market] could not send order ${orderId} to its delivery partner`, error);
    return { created: 0 };
  }
}

type DispatchOrder = {
  id: string;
  orderNumber: string;
  buyerName: string;
  buyerPhone: string | null;
  deliveryAddress: unknown;
  items: unknown;
  total: number;
  paymentMethod: string | null;
  paymentSplit: unknown;
  currency: string;
  store: { id: string; name: string; userId: string; city: string | null };
};

async function marketJobInput(input: {
  order: DispatchOrder;
  plan: DeliveryPlan;
  part: DeliveryPlan["shipments"][number];
  /** A replacement: another partner at its own price. */
  override?: { connectionId: string; partnerId: string; price: number; rateCardId: string | null; minDays: number; maxDays: number };
}) {
  const { order, plan, part } = input;
  const target = input.override ?? { connectionId: part.connectionId!, partnerId: part.partnerId!, price: part.price, rateCardId: part.rateCardId, minDays: part.minDays, maxDays: part.maxDays };
  const settings = await deliverySettingsFor(order.store.userId);
  const point = part.pointId ? await db.logisticsPickupPoint.findUnique({ where: { id: part.pointId }, select: { id: true, name: true, address: true, logisticsPartnerId: true } }) : null;
  const usePoint = point && point.logisticsPartnerId === target.partnerId ? point : null;
  const items = (Array.isArray(order.items) ? order.items : []) as Array<{ name?: string; quantity?: number }>;
  const what = items.map((item) => `${Number(item.quantity ?? 1)} × ${String(item.name ?? "Item")}`).join(", ").slice(0, 200);
  const split = order.paymentSplit as { delivery?: Array<{ shipmentKey: string; partnerId: string }> } | null;
  // Paid to this partner in the customer's payment (a replacement partner isn't: the shop pays them).
  const paidInSplit = !!split?.delivery?.some((share) => share.shipmentKey === part.shipmentKey && share.partnerId === target.partnerId);
  const pod = plan.pod && order.paymentMethod === "pay_on_delivery";
  const now = new Date();
  const job: DeliveryJobInput = {
    sellerId: order.store.userId,
    logisticsPartnerId: target.partnerId,
    orderId: order.id,
    pickupLocation: (settings.originAddress || settings.pickupAddress || `${order.store.name}, ${order.store.city ?? ""}`).trim().slice(0, 300),
    destination: (usePoint ? `Pickup point: ${usePoint.name}, ${usePoint.address} — for ${order.buyerName}` : `${order.buyerName}, ${addressText(order.deliveryAddress)}`).slice(0, 300),
    packageDetails: {
      description: `Order ${order.orderNumber} from ${order.store.name}${what ? `: ${what}` : ""}`.slice(0, 240),
      label: order.store.name,
      ref: order.orderNumber,
      sizeBand: part.sizeBand,
      source: "marketplace",
      customer: { name: order.buyerName, phone: order.buyerPhone },
      ...(pod ? { payOnDelivery: { amount: Number(order.total), settledWith: "shop" } } : {}),
    },
    deliveryFee: target.price,
    currency: order.currency,
    // Pay on delivery here is between the shop and the partner (spec §8): the amount is on the job for the rider,
    // and the partner settles with the shop directly, so it isn't a Shopinbos cash pay-in (codAmount stays empty).
    codAmount: null,
    notes: [pod ? `Pay on delivery: collect ${money(Number(order.total))} and settle it with ${order.store.name} directly.` : null, order.buyerPhone ? `Customer: ${order.buyerPhone}.` : null].filter(Boolean).join(" ") || null,
    marketplace: {
      service: part.service === "pickup_point" ? "pickup_point" : "doorstep",
      sizeBand: part.sizeBand,
      pickupPointId: usePoint?.id ?? null,
      connectionId: target.connectionId,
      rateCardId: target.rateCardId,
      shipmentKey: part.shipmentKey,
      acceptBy: new Date(now.getTime() + ACCEPT_WITHIN_HOURS * 3_600_000),
      estimatedDelivery: new Date(now.getTime() + Math.max(target.maxDays, 0) * 86_400_000 + 12 * 3_600_000),
      feePaidAt: paidInSplit ? now : null,
    },
  };
  return job;
}

async function ownedJob(sellerId: string, bookingId: string) {
  return db.deliveryBooking.findFirst({ where: { id: bookingId, sellerId } });
}

/** The shop packed the parcel: the partner sees it's ready to collect (spec §9 "Ready for pickup"). */
export async function markJobReady(sellerId: string, bookingId: string): Promise<JobResult> {
  const job = await ownedJob(sellerId, bookingId);
  if (!job) return { ok: false, error: "We couldn't find that delivery." };
  if (!["pending", "confirmed"].includes(job.status)) return { ok: false, error: "This parcel has already been picked up." };
  if (job.readyAt) return { ok: true };
  await db.deliveryBooking.update({ where: { id: job.id }, data: { readyAt: new Date() } });
  void emitPartnerEvent(job.logisticsPartnerId, "job.updated", { id: job.id, status: job.status, ready: true, actor: "shop" }).catch(() => undefined);
  const partner = await db.logisticsPartner.findUnique({ where: { id: job.logisticsPartnerId }, select: { userId: true } });
  if (partner) {
    await createNotification({ userId: partner.userId, type: "logistics", priority: "info", title: "A parcel is ready for pickup", description: `${job.pickupLocation}`.slice(0, 200), link: "/logistics/bookings", event: "delivery.update" }).catch(() => null);
  }
  return { ok: true };
}

/** Connected partners that can carry this job's parcel instead, with their price (for the reassign picker). */
export async function reassignOptions(sellerId: string, bookingId: string) {
  const job = await ownedJob(sellerId, bookingId);
  if (!job || !job.orderId) return [];
  const order = await db.retailOrder.findUnique({ where: { id: job.orderId }, select: { deliveryAddress: true, store: { select: { city: true } } } });
  if (!order) return [];
  const settings = await deliverySettingsFor(sellerId);
  const connections = (await marketConnectionsFor([sellerId])).get(sellerId) ?? [];
  const service: RateService = job.service === "pickup_point" ? "pickup_point" : "doorstep";
  const shipment = { origin: originOf(settings, order.store.city), sizeBand: (job.sizeBand ?? settings.defaultSizeBand) as SizeBand };
  const destination = placeOf(order.deliveryAddress as { city?: string; state?: string });
  return connections
    .filter((connection) => connection.partner.id !== job.logisticsPartnerId)
    .map((connection) => {
      const quote = quoteFor(connection, shipment, destination, service) ?? (service === "pickup_point" ? quoteFor(connection, shipment, destination, "doorstep") : null);
      return quote ? { connectionId: connection.id, partnerId: connection.partner.id, name: connection.partner.name, price: quote.row.price, minDays: quote.row.minDays, maxDays: quote.row.maxDays, rateCardId: connection.partner.card?.id ?? null } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => !!entry)
    .sort((a, b) => a.price - b.price);
}

/**
 * Sends a declined, unaccepted or late job to another connected partner (spec §5.7). The old job is cancelled; if
 * its fee was already paid to the old partner in the customer's payment, they owe it back to the shop (money owed).
 * The new partner's fee is the shop's to pay (in the app, by card), at the new partner's own price.
 */
export async function reassignJob(sellerId: string, bookingId: string, connectionId: string): Promise<JobResult> {
  const job = await ownedJob(sellerId, bookingId);
  if (!job || !job.orderId) return { ok: false, error: "We couldn't find that delivery." };
  if (!canReassign(jobException(job))) return { ok: false, error: "You can send a job to another partner when it's declined, not accepted in time, or not picked up in time." };
  const choice = (await reassignOptions(sellerId, bookingId)).find((entry) => entry.connectionId === connectionId);
  if (!choice) return { ok: false, error: "That partner doesn't cover this delivery. Pick another, or connect a partner who does." };
  const order = await db.retailOrder.findUnique({
    where: { id: job.orderId },
    select: { id: true, orderNumber: true, status: true, buyerName: true, buyerPhone: true, deliveryAddress: true, items: true, total: true, paymentMethod: true, paymentSplit: true, logisticsDetails: true, currency: true, store: { select: { id: true, name: true, userId: true, city: true } } },
  });
  const plan = readDeliveryPlan(order?.logisticsDetails);
  const part = plan?.shipments.find((entry) => entry.shipmentKey === (job.shipmentKey ?? "own"));
  if (!order || !plan || !part) return { ok: false, error: "This order wasn't booked through your delivery partners, so book it from Logistics." };

  // Take the old job out first (only if it still hasn't moved), so a partner accepting at this moment wins.
  const stopped = await db.deliveryBooking.updateMany({ where: { id: job.id, status: { in: ["pending", "confirmed", "declined"] }, pickedUpAt: null, replacedById: null }, data: { status: job.status === "declined" ? "declined" : "cancelled" } });
  if (stopped.count !== 1) return { ok: false, error: "This job just moved on. Refresh to see where it is." };
  if (job.status !== "declined") void emitPartnerEvent(job.logisticsPartnerId, "job.cancelled", { id: job.id, status: "cancelled", actor: "shop" }).catch(() => undefined);

  const booking = await saveDeliveryJob(await marketJobInput({ order, plan, part, override: choice }));
  await announceDeliveryJob(booking);
  await db.deliveryBooking.update({ where: { id: job.id }, data: { replacedById: booking.id } });
  await savePlan(order.id, order.logisticsDetails, { ...plan, shipments: plan.shipments.map((entry) => (entry.shipmentKey === part.shipmentKey ? { ...entry, bookingId: booking.id } : entry)) });

  if (job.feePaidAt) {
    const partner = await db.logisticsPartner.findUnique({ where: { id: job.logisticsPartnerId }, select: { userId: true } });
    if (partner) {
      await db.businessDebt.upsert({
        where: { sourceKey: `delivery-refund:${job.id}` },
        update: {},
        create: {
          sourceKey: `delivery-refund:${job.id}`,
          debtorUserId: partner.userId,
          creditorUserId: sellerId,
          reason: "other",
          amountKobo: Math.round(job.deliveryFee * 100),
          status: "open",
          details: `Delivery fee for order ${order.orderNumber}, paid at checkout. The job went to another partner.`,
          retailOrderId: order.id,
          bookingId: job.id,
          dueAt: new Date(Date.now() + 3 * 86_400_000),
        },
      }).catch((error) => console.error(`[delivery market] could not record the fee owed back for job ${job.id}`, error));
    }
  }
  return { ok: true, bookingId: booking.id };
}

/** The shop cancels its own parcel's job (the order was cancelled): only before pickup. */
export async function cancelOrderDeliveries(orderId: string) {
  const jobs = await db.deliveryBooking.findMany({ where: { orderId, status: { in: ["pending", "confirmed"] }, pickedUpAt: null, shipmentKey: { not: null } }, select: { id: true, logisticsPartnerId: true } });
  for (const job of jobs) {
    const moved = await db.deliveryBooking.updateMany({ where: { id: job.id, status: { in: ["pending", "confirmed"] }, pickedUpAt: null }, data: { status: "cancelled" } });
    if (moved.count === 1) void emitPartnerEvent(job.logisticsPartnerId, "job.cancelled", { id: job.id, status: "cancelled", actor: "shop" }).catch(() => undefined);
  }
}

/** Pay on delivery between the shop and the partner: the partner says they gave the shop the cash. A record only. */
export async function partnerMarksCashRemitted(partnerId: string, bookingId: string): Promise<JobResult> {
  const moved = await db.deliveryBooking.updateMany({ where: { id: bookingId, logisticsPartnerId: partnerId, status: "delivered", codRemittedAt: null }, data: { codRemittedAt: new Date() } });
  if (moved.count !== 1) return { ok: false, error: "This delivery isn't waiting for that." };
  const job = await db.deliveryBooking.findUnique({ where: { id: bookingId }, select: { sellerId: true, orderId: true } });
  if (job) await createNotification({ userId: job.sellerId, type: "logistics", priority: "info", title: "Your partner says they paid you the cash", description: "Check you received the pay-on-delivery money, then confirm it on the order.", link: job.orderId ? `/home/orders/${job.orderId}` : "/home/logistics/exceptions", event: "delivery.update" }).catch(() => null);
  return { ok: true };
}

/** The shop confirms it got the pay-on-delivery cash from the partner: a record, and the order counts as paid. */
export async function sellerConfirmsCash(sellerId: string, bookingId: string): Promise<JobResult> {
  const job = await ownedJob(sellerId, bookingId);
  if (!job || job.status !== "delivered") return { ok: false, error: "This delivery isn't finished yet." };
  if (!job.codConfirmedAt) await db.deliveryBooking.update({ where: { id: job.id }, data: { codConfirmedAt: new Date() } });
  if (job.orderId) {
    const order = await db.retailOrder.findUnique({ where: { id: job.orderId } });
    const store = order ? await db.store.findUnique({ where: { id: order.storeId }, select: { id: true, name: true } }) : null;
    if (order && store && (order.status === "pending" || order.status === "awaiting_payment")) await updateOrderStatus(store, order, { status: "paid", paymentMethod: "cash" }).catch(() => null);
  }
  return { ok: true };
}

/**
 * Every few minutes: jobs whose partner didn't accept in time are flagged to the shop (once), so it can send them to
 * another partner. Nothing is moved automatically.
 */
export async function sweepUnacceptedJobs(now = new Date()) {
  const late = await db.deliveryBooking.findMany({
    where: { status: "pending", acceptBy: { lt: now }, replacedById: null, shipmentKey: { not: null } },
    select: { id: true, sellerId: true, orderId: true, logisticsPartner: { select: { displayName: true } } },
    take: 200,
  });
  for (const job of late) {
    await createNotification({
      userId: job.sellerId,
      type: "logistics",
      priority: "warning",
      title: `${job.logisticsPartner.displayName} hasn't accepted a delivery`,
      description: "Send it to another of your delivery partners from your delivery exceptions.",
      link: "/home/logistics/exceptions",
      actionLabel: "See exceptions",
      actionUrl: "/home/logistics/exceptions",
      event: "delivery.update",
      dedupeKey: `delivery.not_accepted:${job.id}`,
      metadata: { bookingId: job.id },
    }).catch(() => null);
  }
  return { flagged: late.length };
}

/** Jobs that need the shop now (spec §5.7), newest first, with the order they belong to. */
export async function exceptionsFor(sellerId: string, now = new Date()) {
  const jobs = await db.deliveryBooking.findMany({
    where: {
      sellerId,
      replacedById: null,
      OR: [
        { status: { in: ["declined", "failed", "returning"] } },
        { status: "pending", acceptBy: { lt: now } },
        { status: "confirmed", pickedUpAt: null },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { logisticsPartner: { select: { id: true, displayName: true, slug: true } } },
  });
  const flagged = jobs.map((job) => ({ job, kind: jobException(job, now) })).filter((entry) => entry.kind !== null);
  const orders = await db.retailOrder.findMany({ where: { id: { in: flagged.map((entry) => entry.job.orderId).filter((id): id is string => !!id) } }, select: { id: true, orderNumber: true, buyerName: true } });
  return flagged.map((entry) => ({ ...entry, order: orders.find((order) => order.id === entry.job.orderId) ?? null }));
}
