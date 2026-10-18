import { supplierPartCollect } from "@shared/cod-split";
import "server-only";
import { db } from "@/lib/db/client";
import { addressLines } from "@/lib/labels";
import { createNotification } from "@/lib/notifications/create";
import { cancelUnassignedDeliveryJob, createDeliveryJob, moveDeliveryJobWindow } from "@/lib/logistics/booking.server";
import { payWhenItArrivesWhere } from "@/lib/logistics/payin-deadline";
import { linkedPartnerIds } from "@/lib/logistics/invites.server";
import {
  buildPickupJob,
  choosePickupPartner,
  customPickupDays,
  CUSTOM_START_HOURS,
  pickupChangeable,
  pickupMessage,
  pickupSlots,
  pickupWindowText,
  resolvePickupSlot,
  type SupplierOrderKind,
} from "@shared/supplier-pickup";
import { plainText, supplierOrderRef } from "./pure";
import { messageSupplierPhone } from "./deadline.server";
import { moveSupplierOrder, type ServiceResult } from "./service.server";
import { moveWholesaleOrder, wholesaleRef } from "./wholesale.server";

// Booking a rider to collect a supplier's packed order at a set time (spec 8A: "I've packed it" brings a rider at a
// set time). The supplier picks a slot (shared/supplier-pickup.ts); we create a delivery job with the same booking
// code shops use (src/lib/logistics/booking.server.ts) for the shop's chosen delivery company, the platform's
// default, or the most reliable one covering the area. Nobody covers it: the admin team finds a rider. The
// supplier can move or cancel the pickup until a rider has the job; the job's moves (picked up, delivered,
// cancelled by the company) move the supplier order along (onDeliveryJobMoved, called from lib/logistics/jobs.ts).

type Fail = { ok: false; code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST"; message: string };

interface PickupOrder {
  kind: SupplierOrderKind;
  id: string;
  ref: string;
  status: string;
  sellerId: string;
  supplier: { id: string; userId: string; city: string; country: string; address: string | null };
  /** Ready for a rider: accepted and packed (dropship), or packed (bulk). */
  packed: boolean;
  /** Can be packed now (accepted, not yet packed). */
  packable: boolean;
  shopName: string;
  storeId: string | null;
  retailOrderId: string | null;
  dropoff: { name: string; phone: string | null; lines: string[] };
  items: Array<{ name: string; quantity: number }>;
  collect: number;
  shippingFee: number;
  currency: string;
}

/** Text for the parcel label and job (rendered escaped, so apostrophes stay: "Chioma's Collections"). */
function labelText(value: unknown, max = 120) {
  return String(value ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function loadOrder(supplierId: string, kind: SupplierOrderKind, orderId: string): Promise<PickupOrder | null> {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId }, select: { id: true, userId: true, city: true, country: true, address: true } });
  if (!supplier) return null;
  if (kind === "dropship") {
    const row = await db.supplierOrder.findFirst({
      where: { id: orderId, supplierId },
      select: {
        id: true, status: true, sellerId: true, storeId: true, retailOrderId: true, items: true, packedAt: true, currency: true, shippingAddress: true, recipientName: true, recipientPhone: true,
        retailOrder: { select: { status: true, paymentMethod: true, total: true, shippingFee: true, items: true } },
      },
    });
    if (!row) return null;
    const store = await db.store.findUnique({ where: { id: row.storeId }, select: { name: true } });
    const unpaidPod = row.retailOrder.paymentMethod === "pay_on_delivery" && ["pending", "awaiting_payment"].includes(row.retailOrder.status);
    const items = (Array.isArray(row.items) ? row.items : []) as Array<{ name?: unknown; quantity?: unknown }>;
    return {
      kind,
      id: row.id,
      ref: supplierOrderRef(row.id),
      status: row.status,
      sellerId: row.sellerId,
      supplier,
      packed: row.status === "accepted" && Boolean(row.packedAt),
      packable: row.status === "accepted" && !row.packedAt,
      shopName: labelText(store?.name) || "The shop",
      storeId: row.storeId,
      retailOrderId: row.retailOrderId,
      dropoff: { name: row.recipientName, phone: row.recipientPhone, lines: addressLines(row.shippingAddress) },
      items: items.map((item) => ({ name: labelText(item.name, 80) || "Item", quantity: Math.max(1, Number(item.quantity) || 1) })),
      // Only this supplier's share of the order total: the customer pays once across all the parcels.
      collect: unpaidPod ? supplierPartCollect(row.retailOrder.items, Number(row.retailOrder.total) || 0, row.items) : 0,
      shippingFee: Number(row.retailOrder.shippingFee) || 0,
      currency: row.currency,
    };
  }
  const row = await db.wholesaleOrder.findFirst({
    where: { id: orderId, supplierId },
    select: {
      id: true, status: true, sellerId: true, quantity: true, deliveryAddress: true, currency: true,
      seller: { select: { name: true, phone: true, store: { select: { id: true, name: true } } } },
      supplierProduct: { select: { name: true } },
    },
  });
  if (!row) return null;
  const shop = labelText(row.seller.store?.name ?? row.seller.name) || "The shop";
  return {
    kind,
    id: row.id,
    ref: wholesaleRef(row.id),
    status: row.status,
    sellerId: row.sellerId,
    supplier,
    packed: row.status === "processing",
    packable: row.status === "confirmed",
    shopName: shop,
    storeId: row.seller.store?.id ?? null,
    retailOrderId: null,
    dropoff: { name: shop, phone: row.seller.phone, lines: row.deliveryAddress ? [row.deliveryAddress] : [] },
    items: [{ name: labelText(row.supplierProduct.name, 80) || "Item", quantity: row.quantity }],
    collect: 0,
    shippingFee: 0,
    currency: row.currency,
  };
}

/** The supplier's saved address for pickups: "12 Balogun St, Lagos". */
export function savedPickupAddress(supplier: { address: string | null; city: string }) {
  const address = supplier.address?.trim() ?? "";
  if (!address) return "";
  return address.toLowerCase().includes(supplier.city.trim().toLowerCase()) ? address : [address, supplier.city].filter(Boolean).join(", ");
}

async function loadPickup(kind: SupplierOrderKind, orderId: string) {
  const pickup = await db.supplierPickup.findUnique({ where: { orderKind_orderId: { orderKind: kind, orderId } } });
  const job = pickup?.deliveryBookingId
    ? await db.deliveryBooking.findUnique({
        where: { id: pickup.deliveryBookingId },
        select: { id: true, status: true, riderId: true, rider: { select: { name: true } }, logisticsPartner: { select: { displayName: true } } },
      })
    : null;
  return { pickup, job };
}

/** Everything the supplier's "When can a rider pick it up?" step needs, and where the pickup is. */
export async function pickupState(supplierId: string, kind: SupplierOrderKind, orderId: string, now = new Date()) {
  const order = await loadOrder(supplierId, kind, orderId);
  if (!order) return null;
  const { pickup, job } = await loadPickup(kind, orderId);
  const { slots, preselected } = pickupSlots(now);
  const open = pickup && pickup.status !== "cancelled" ? pickup : null;
  return {
    kind,
    orderId,
    packed: order.packed,
    packable: order.packable,
    address: savedPickupAddress(order.supplier),
    slots,
    preselected,
    customDays: customPickupDays(now),
    customHours: CUSTOM_START_HOURS,
    pickup: open
      ? {
          status: open.status,
          windowStart: open.windowStart.toISOString(),
          windowEnd: open.windowEnd.toISOString(),
          text: pickupWindowText(open.windowStart, open.windowEnd, now),
          address: open.pickupAddress,
          slotKey: open.slotKey,
          partner: job?.logisticsPartner.displayName ?? null,
          rider: job?.rider?.name ?? null,
          jobStatus: job?.status ?? null,
          changeable: pickupChangeable(open, job),
          ...pickupMessage(open, job ? { status: job.status, riderName: job.rider?.name ?? null } : null, now),
        }
      : null,
  };
}

export type PickupState = NonNullable<Awaited<ReturnType<typeof pickupState>>>;

/** "I've packed it": a dropship order keeps packedAt (it stays "accepted"); a bulk order moves confirmed → processing. */
export async function markPacked(supplierId: string, kind: SupplierOrderKind, orderId: string): Promise<ServiceResult<{ id: string }>> {
  const order = await loadOrder(supplierId, kind, orderId);
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  if (order.packed) return { ok: true, data: { id: order.id } };
  if (!order.packable) return { ok: false, code: "CONFLICT", message: "Accept the order first, then pack it." };
  const moved = kind === "dropship"
    ? await db.supplierOrder.updateMany({ where: { id: order.id, supplierId, status: "accepted", packedAt: null }, data: { packedAt: new Date() } })
    : await db.wholesaleOrder.updateMany({ where: { id: order.id, supplierId, status: "confirmed" }, data: { status: "processing" } });
  if (moved.count !== 1) return { ok: false, code: "CONFLICT", message: "This order has already moved on. Refresh to see where it is." };
  return { ok: true, data: { id: order.id } };
}

async function adminUserIds() {
  return (await db.user.findMany({ where: { role: "admin" }, select: { id: true }, take: 20 })).map((row) => row.id);
}

async function tellAdmins(order: PickupOrder, window: { start: Date; end: Date }, why: string) {
  const ids = await adminUserIds();
  await Promise.allSettled(
    ids.map((userId) =>
      createNotification({
        userId,
        type: "logistics",
        priority: "critical",
        title: `Find a rider for ${order.ref} (${plainText(order.supplier.city) || "no city"})`,
        description: `${why} The supplier asked for ${pickupWindowText(window.start, window.end)?.replace(/^Pick up /, "") ?? "a pickup"}. Book a delivery company and message the supplier.`,
        link: "/admin/supplier-pickups",
        actionLabel: "See pickups",
        actionUrl: "/admin/supplier-pickups",
        metadata: { orderKind: order.kind, orderId: order.id },
        sendEmail: true,
        event: "admin.review",
      }),
    ),
  );
}

async function pickPartner(order: PickupOrder) {
  const [store, ownIds, partners] = await Promise.all([
    order.storeId ? db.store.findUnique({ where: { id: order.storeId }, select: { brandSettings: true } }) : null,
    // Delivery companies the supplier invited (src/lib/logistics/invites.server.ts): next after the shop's choice.
    linkedPartnerIds(order.supplier.userId),
    db.logisticsPartner.findMany({
      // Pay-when-it-arrives parcels skip partners paused for a late cash pay-in (lib/logistics/payin-deadline.ts).
      // Carriers booked through their own API (lib/logistics/carriers) don't take pickup windows yet.
      where: { status: "active", verificationStatus: "verified", ownerId: null, ...payWhenItArrivesWhere(order.collect > 0) },
      select: { id: true, city: true, coverageZones: true, status: true, verificationStatus: true, reliabilityScore: true, rating: true, basePrice: true },
      take: 500,
    }),
  ]);
  const settings = store?.brandSettings && typeof store.brandSettings === "object" ? (store.brandSettings as { logistics?: { preferredPartnerId?: unknown } }) : {};
  const preferredId = typeof settings.logistics?.preferredPartnerId === "string" ? settings.logistics.preferredPartnerId : null;
  const choice = choosePickupPartner({
    preferredId,
    ownIds,
    defaultId: process.env.SHOPINBOS_DEFAULT_DELIVERY_PARTNER_ID?.trim() || null,
    partners: partners.map((partner) => ({ ...partner, verificationStatus: String(partner.verificationStatus) })),
    area: { city: order.supplier.city },
  });
  return choice ? partners.find((partner) => partner.id === choice.id) ?? null : null;
}

export interface BookPickupInput {
  supplierId: string;
  kind: SupplierOrderKind;
  orderId: string;
  choice: { key: string; day?: string | null; startHour?: number | null };
  address?: string | null;
}

/** Books (or moves) the rider for a packed order. */
export async function bookPickup(input: BookPickupInput, now = new Date()): Promise<{ ok: true; data: PickupState } | Fail> {
  const order = await loadOrder(input.supplierId, input.kind, input.orderId);
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  if (order.packable) {
    const packed = await markPacked(input.supplierId, input.kind, input.orderId);
    if (!packed.ok) return packed;
  } else if (!order.packed) {
    return { ok: false, code: "CONFLICT", message: input.kind === "dropship" && order.status === "pending" ? "Accept the order first, then pack it." : "This order has already moved on. Refresh to see where it is." };
  }
  const slot = resolvePickupSlot(input.choice, now);
  if (!slot.ok) return { ok: false, code: "BAD_REQUEST", message: slot.error };
  const address = (input.address?.trim() || savedPickupAddress(order.supplier)).replace(/\s+/g, " ").slice(0, 300);
  if (address.length < 5) return { ok: false, code: "BAD_REQUEST", message: "Type the address where the rider collects it, with the street and area." };
  const window = { start: new Date(slot.slot.start), end: new Date(slot.slot.end) };

  // The first address a supplier types becomes their saved one.
  if (!order.supplier.address?.trim() && input.address?.trim()) {
    await db.supplier.update({ where: { id: order.supplier.id }, data: { address: address.slice(0, 200) } }).catch(() => null);
  }

  const { pickup, job } = await loadPickup(input.kind, input.orderId);
  if (pickup && pickup.status !== "cancelled") {
    // Moving the time: only while no rider has the job.
    if (!pickupChangeable(pickup, job)) return { ok: false, code: "CONFLICT", message: "A rider already has this pickup, so the time can't change here. Message the shop to change it." };
    if (job && !(await moveDeliveryJobWindow(job.id, { ...window, pickupLocation: address }))) {
      return { ok: false, code: "CONFLICT", message: "A rider just took this pickup, so the time can't change here. Message the shop to change it." };
    }
    await db.supplierPickup.update({ where: { id: pickup.id }, data: { windowStart: window.start, windowEnd: window.end, slotKey: slot.slot.key, pickupAddress: address } });
    return { ok: true, data: (await pickupState(input.supplierId, input.kind, input.orderId, now))! };
  }

  // Claim the pickup for this order first (one per order), so two taps can't book two riders.
  let pickupId: string;
  try {
    if (pickup) {
      const claimed = await db.supplierPickup.updateMany({
        where: { id: pickup.id, status: "cancelled" },
        data: { status: "booked", windowStart: window.start, windowEnd: window.end, slotKey: slot.slot.key, pickupAddress: address, deliveryBookingId: null, logisticsPartnerId: null, needsAdmin: false, adminNote: null },
      });
      if (claimed.count !== 1) return { ok: false, code: "CONFLICT", message: "This pickup was just booked. Refresh to see it." };
      pickupId = pickup.id;
    } else {
      const created = await db.supplierPickup.create({
        data: { orderKind: input.kind, orderId: order.id, supplierId: order.supplier.id, sellerId: order.sellerId, status: "booked", pickupAddress: address, slotKey: slot.slot.key, windowStart: window.start, windowEnd: window.end },
      });
      pickupId = created.id;
    }
  } catch (error) {
    if ((error as { code?: unknown })?.code === "P2002") return { ok: false, code: "CONFLICT", message: "This pickup was just booked. Refresh to see it." };
    throw error;
  }

  const partner = await pickPartner(order);
  if (!partner) {
    await db.supplierPickup.update({ where: { id: pickupId }, data: { status: "finding_rider", needsAdmin: true, adminNote: `No delivery company covers ${order.supplier.city || "this area"} yet.` } });
    await tellAdmins(order, window, `No delivery company covers ${plainText(order.supplier.city) || "the supplier's area"} yet.`);
    return { ok: true, data: (await pickupState(input.supplierId, input.kind, input.orderId, now))! };
  }

  const payload = buildPickupJob({
    kind: input.kind,
    ref: order.ref,
    shopName: order.shopName,
    pickupAddress: address,
    dropoff: order.dropoff,
    items: order.items,
    collect: order.collect,
    window,
    deliveryFee: order.shippingFee > 0 ? order.shippingFee : partner.basePrice,
    retailOrderId: order.retailOrderId,
  });
  try {
    const booking = await createDeliveryJob({ sellerId: order.sellerId, logisticsPartnerId: partner.id, currency: order.currency, ...payload });
    await db.supplierPickup.update({ where: { id: pickupId }, data: { deliveryBookingId: booking.id, logisticsPartnerId: partner.id } });
  } catch (error) {
    await db.supplierPickup.update({ where: { id: pickupId }, data: { status: "cancelled" } }).catch(() => null);
    console.error(`[supplier pickup] could not create the delivery job for ${order.ref}`, error);
    return { ok: false, code: "CONFLICT", message: "We couldn't book the rider just now. Try again in a minute." };
  }

  await createNotification({
    userId: order.sellerId,
    type: "logistics",
    priority: "info",
    title: `Rider booked for ${order.kind === "dropship" ? "order " : "your wholesale order "}${order.ref}`,
    description: `The supplier has packed it. ${pickupWindowText(window.start, window.end, now)}.`,
    link: order.retailOrderId ? `/home/orders/${order.retailOrderId}` : "/home/logistics",
    event: "delivery.update",
  }).catch(() => null);
  return { ok: true, data: (await pickupState(input.supplierId, input.kind, input.orderId, now))! };
}

/** The supplier cancels the pickup (until a rider has the job). The order stays packed; they can book again. */
export async function cancelPickup(supplierId: string, kind: SupplierOrderKind, orderId: string): Promise<{ ok: true; data: PickupState } | Fail> {
  const order = await loadOrder(supplierId, kind, orderId);
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  const { pickup, job } = await loadPickup(kind, orderId);
  if (!pickup || pickup.status === "cancelled") return { ok: false, code: "CONFLICT", message: "There's no rider booked for this order." };
  if (!pickupChangeable(pickup, job)) return { ok: false, code: "CONFLICT", message: "A rider already has this pickup, so it can't be cancelled here. Message the shop." };
  if (job && !(await cancelUnassignedDeliveryJob(job.id))) return { ok: false, code: "CONFLICT", message: "A rider just took this pickup, so it can't be cancelled here. Message the shop." };
  await db.supplierPickup.updateMany({ where: { id: pickup.id, status: { in: ["booked", "finding_rider"] } }, data: { status: "cancelled", needsAdmin: false } });
  return { ok: true, data: (await pickupState(supplierId, kind, orderId))! };
}

// ─── The delivery job moved ───────────────────────────────────────────────────

/**
 * A delivery job moved (lib/logistics/jobs.ts calls this after every move). For a supplier pickup: picked up →
 * the supplier order is sent; delivered → delivered; the company cancelled → we look for another rider (admin).
 * Never throws.
 */
export async function onDeliveryJobMoved(bookingId: string, to: string) {
  try {
    const pickup = await db.supplierPickup.findUnique({ where: { deliveryBookingId: bookingId } });
    if (!pickup) return;
    const booking = await db.deliveryBooking.findUnique({ where: { id: bookingId }, select: { id: true, trackingCode: true } });
    const tracking = booking?.trackingCode ?? `J-${bookingId.slice(-6).toUpperCase()}`;
    const kind = pickup.orderKind === "wholesale" ? "wholesale" : "dropship";
    const move = (action: "ship" | "deliver") =>
      kind === "dropship"
        ? moveSupplierOrder({ supplierId: pickup.supplierId, orderId: pickup.orderId, action, trackingCode: action === "ship" ? tracking : undefined, carrier: action === "ship" ? "Shopinbos rider" : undefined })
        : moveWholesaleOrder({ supplierId: pickup.supplierId, orderId: pickup.orderId, action, trackingCode: action === "ship" ? tracking : undefined });

    if (to === "picked_up" || to === "in_transit") {
      await db.supplierPickup.updateMany({ where: { id: pickup.id, status: { in: ["booked", "finding_rider"] } }, data: { status: "picked_up", needsAdmin: false } });
      await move("ship");
    } else if (to === "delivered") {
      await db.supplierPickup.updateMany({ where: { id: pickup.id }, data: { status: "delivered", needsAdmin: false } });
      // A job can go straight to delivered from picked up; ship first if the order hasn't moved yet.
      await move("ship");
      await move("deliver");
    } else if (to === "cancelled") {
      const moved = await db.supplierPickup.updateMany({
        where: { id: pickup.id, status: "booked", deliveryBookingId: bookingId },
        data: { status: "finding_rider", needsAdmin: true, deliveryBookingId: null, adminNote: "The delivery company cancelled the job." },
      });
      if (moved.count !== 1) return;
      const supplier = await db.supplier.findUnique({ where: { id: pickup.supplierId }, select: { userId: true } });
      const ref = kind === "dropship" ? supplierOrderRef(pickup.orderId) : wholesaleRef(pickup.orderId);
      if (supplier) {
        await createNotification({
          userId: supplier.userId,
          type: "logistics",
          priority: "warning",
          title: `We're finding another rider for ${ref}`,
          description: "The delivery company can't make it. We'll find a rider and message you. Keep the parcel ready.",
          link: kind === "dropship" ? `/supplier/orders/${pickup.orderId}` : `/supplier/orders/${pickup.orderId}?kind=wholesale`,
          event: "pickup.update",
        }).catch(() => null);
      }
      const order = await loadOrder(pickup.supplierId, kind, pickup.orderId);
      if (order) await tellAdmins(order, { start: pickup.windowStart, end: pickup.windowEnd }, "The delivery company cancelled this pickup.");
    }
  } catch (error) {
    console.error(`[supplier pickup] could not follow job ${bookingId} to ${to}`, error);
  }
}

/** A rider was put on a supplier pickup: tell the supplier who is coming. Never throws. */
export async function onDeliveryRiderAssigned(bookingId: string, riderId: string | null) {
  if (!riderId) return;
  try {
    const pickup = await db.supplierPickup.findUnique({ where: { deliveryBookingId: bookingId } });
    if (!pickup || pickup.status !== "booked") return;
    const [rider, supplier] = await Promise.all([
      db.logisticsTeamMember.findUnique({ where: { id: riderId }, select: { name: true } }),
      db.supplier.findUnique({ where: { id: pickup.supplierId }, select: { userId: true } }),
    ]);
    if (!supplier) return;
    const kind = pickup.orderKind === "wholesale" ? "wholesale" : "dropship";
    const ref = kind === "dropship" ? supplierOrderRef(pickup.orderId) : wholesaleRef(pickup.orderId);
    const when = pickupWindowText(pickup.windowStart, pickup.windowEnd)?.replace(/^Pick up/, "pick up") ?? "collect it";
    const name = plainText(rider?.name, 40) || "A rider";
    await createNotification({
      userId: supplier.userId,
      type: "logistics",
      priority: "info",
      title: `${name} is coming for ${ref}`,
      description: `${name} will ${when}. Have the parcel ready with the shop's label on it.`,
      link: kind === "dropship" ? `/supplier/orders/${pickup.orderId}` : `/supplier/orders/${pickup.orderId}?kind=wholesale`,
      event: "pickup.update",
      phoneHandled: true,
    }).catch(() => null);
    await messageSupplierPhone(pickup.supplierId, `Shopinbos: ${name} will ${when} for order ${ref}. Have the parcel ready.`);
  } catch (error) {
    console.error(`[supplier pickup] could not tell the supplier about the rider on job ${bookingId}`, error);
  }
}

/** Admin: books a delivery company for a pickup that was waiting for one, at the supplier's chosen time. */
export async function assignPickupPartner(pickupId: string, partnerId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const pickup = await db.supplierPickup.findUnique({ where: { id: pickupId } });
  if (!pickup || pickup.status !== "finding_rider") return { ok: false, message: "This pickup already has a rider or was cancelled. Refresh the page." };
  const kind = pickup.orderKind === "wholesale" ? "wholesale" : "dropship";
  const [order, partner] = await Promise.all([
    loadOrder(pickup.supplierId, kind, pickup.orderId),
    db.logisticsPartner.findFirst({ where: { id: partnerId, status: "active", verificationStatus: "verified" }, select: { id: true, basePrice: true, displayName: true, codPaused: true } }),
  ]);
  if (!order) return { ok: false, message: "The order for this pickup is gone." };
  if (!partner) return { ok: false, message: "That delivery company isn't verified or isn't taking jobs." };
  if (order.collect > 0 && partner.codPaused) return { ok: false, message: "That delivery company is late paying in customers' cash, so it can't take pay-when-it-arrives parcels now. Pick another." };
  const claimed = await db.supplierPickup.updateMany({ where: { id: pickup.id, status: "finding_rider" }, data: { status: "booked", needsAdmin: false, logisticsPartnerId: partner.id } });
  if (claimed.count !== 1) return { ok: false, message: "Someone else just booked this pickup. Refresh the page." };
  const payload = buildPickupJob({
    kind,
    ref: order.ref,
    shopName: order.shopName,
    pickupAddress: pickup.pickupAddress,
    dropoff: order.dropoff,
    items: order.items,
    collect: order.collect,
    window: { start: pickup.windowStart, end: pickup.windowEnd },
    deliveryFee: order.shippingFee > 0 ? order.shippingFee : partner.basePrice,
    retailOrderId: order.retailOrderId,
  });
  try {
    const booking = await createDeliveryJob({ sellerId: order.sellerId, logisticsPartnerId: partner.id, currency: order.currency, ...payload });
    await db.supplierPickup.update({ where: { id: pickup.id }, data: { deliveryBookingId: booking.id, adminNote: `Booked with ${partner.displayName} by the team.` } });
  } catch (error) {
    await db.supplierPickup.update({ where: { id: pickup.id }, data: { status: "finding_rider", needsAdmin: true, logisticsPartnerId: null } }).catch(() => null);
    console.error(`[supplier pickup] admin could not book ${pickup.id}`, error);
    return { ok: false, message: "We couldn't create the delivery job. Try again." };
  }
  const when = pickupWindowText(pickup.windowStart, pickup.windowEnd)?.replace(/^Pick up/, "pick up") ?? "collect it";
  await createNotification({
    userId: order.supplier.userId,
    type: "logistics",
    priority: "info",
    title: `Rider booked for ${order.ref}`,
    description: `Rider booked: ${when}. We'll message you when they're on the way.`,
    link: kind === "dropship" ? `/supplier/orders/${order.id}` : `/supplier/orders/${order.id}?kind=wholesale`,
    event: "pickup.update",
    phoneHandled: true,
  }).catch(() => null);
  await messageSupplierPhone(order.supplier.id, `Shopinbos: rider booked for order ${order.ref}: ${when}. We'll message you when they're on the way.`);
  return { ok: true };
}

/** Admin: pickups still waiting for a rider (no delivery company covers the area, or one cancelled). */
export async function pickupsNeedingAdmin(take = 50) {
  return db.supplierPickup.findMany({ where: { needsAdmin: true, status: "finding_rider" }, orderBy: { windowStart: "asc" }, take });
}
