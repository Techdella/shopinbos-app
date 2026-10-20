import "server-only";

import { db } from "@/lib/db/client";
import { readTransferAccount } from "@shared/checkout-payments";
import { orderPaymentDeadline } from "@/lib/commerce/stock-holds";
import { paymentWindows } from "@/lib/commerce/order-expiry.server";
import { deliverySettingsFor } from "@/lib/delivery-market/market.server";
import { deliveryTimeline, readDeliveryPlan, type MarketOptionKind, type TimelineStep } from "@shared/delivery-market";
import type { TransferDetails } from "./TransferInstructions";

/**
 * How the order reaches the buyer when the seller uses delivery partners (Logistics marketplace): the plain-language
 * timeline with dates, what the buyer chose at checkout (the partner's name only when checkout showed it), the
 * pickup point, or the seller's own pickup address and hours.
 */
export interface OrderDeliveryView {
  kind: MarketOptionKind;
  /** The option as chosen at checkout, e.g. "Doorstep delivery". */
  optionName: string | null;
  /** Who delivers, as checkout showed it: the partner's name, or the seller's label ("Standard delivery"). */
  carrier: string | null;
  estimatedDays: string | null;
  timeline: TimelineStep[];
  /** Pickup-point orders: where to collect. */
  point: { name: string; address: string; hours: string | null; phone: string | null } | null;
  /** Pick up from the seller: the seller's address, hours and instructions. */
  sellerPickup: { address: string | null; hours: string | null; instructions: string | null } | null;
  /** The partner job's own estimate, when booked. */
  estimatedDelivery: string | null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function loadDelivery(
  order: { id: string; createdAt: Date; deliveredAt?: Date | null; logisticsDetails?: unknown; deliveryAddress?: unknown },
  sellerId: string,
): Promise<OrderDeliveryView | null> {
  const plan = readDeliveryPlan(order.logisticsDetails);
  if (!plan) return null;
  const chosen = record(record(order.deliveryAddress).deliveryOption);
  // The latest job that wasn't handed on to another partner (a replacement carries on from the one it replaced).
  const job = plan.kind === "self_pickup"
    ? null
    : await db.deliveryBooking.findFirst({
        where: { orderId: order.id, sellerId, replacedById: null },
        orderBy: { createdAt: "desc" },
        select: {
          status: true, service: true, createdAt: true, acceptedAt: true, readyAt: true, pickedUpAt: true, outForDeliveryAt: true,
          atPickupPointAt: true, deliveredAt: true, pickupPointId: true, estimatedDelivery: true,
        },
      });
  const part = plan.shipments[0] ?? null;
  // As checkout showed it: the partner's name when the seller shows it, else the seller's label for that partner.
  const connection = part?.connectionId && plan.kind !== "multi"
    ? await db.deliveryConnection.findUnique({ where: { id: part.connectionId }, select: { showPartnerName: true, label: true, logisticsPartner: { select: { displayName: true } } } })
    : null;
  const carrier = connection
    ? connection.showPartnerName
      ? connection.logisticsPartner.displayName
      : connection.label?.trim() || (plan.kind === "same_day" ? "Same-day delivery" : plan.kind === "doorstep" ? "Standard delivery" : null)
    : null;
  const pointId = plan.kind === "pickup_point" ? job?.pickupPointId ?? part?.pointId ?? null : null;
  const point = pointId
    ? await db.logisticsPickupPoint.findUnique({ where: { id: pointId }, select: { name: true, address: true, area: true, hours: true, phone: true } })
    : null;
  const settings = plan.kind === "self_pickup" ? await deliverySettingsFor(sellerId) : null;
  const timeline = deliveryTimeline(
    { createdAt: order.createdAt, deliveredAt: order.deliveredAt ?? job?.deliveredAt ?? null },
    job ? { ...job, service: job.service ?? (plan.kind === "pickup_point" ? "pickup_point" : "doorstep") } : null,
    plan.kind,
  );
  return {
    kind: plan.kind,
    optionName: typeof chosen.name === "string" ? chosen.name : null,
    carrier,
    estimatedDays: typeof chosen.estimatedDays === "string" ? chosen.estimatedDays : null,
    timeline,
    point: point ? { name: point.name, address: [point.address, point.area].filter(Boolean).join(", "), hours: point.hours, phone: point.phone } : null,
    sellerPickup: settings ? { address: settings.pickupAddress, hours: settings.pickupHours, instructions: settings.pickupInstructions } : null,
    estimatedDelivery: job?.estimatedDelivery?.toISOString() ?? null,
  };
}

const UNPAID = ["pending", "awaiting_payment"];

/**
 * What the buyer needs next for their order: account details for an unpaid transfer, and the delivery code
 * to give the rider once a delivery is booked. Also trims brandSettings to the look, so payout details stay
 * on the server.
 */
export async function loadOrderNextSteps(
  order: { id: string; orderNumber: string; total: number; status: string; paymentMethod: string | null; createdAt: Date; paymentDueAt?: Date | null; deliveredAt?: Date | null; logisticsDetails?: unknown; deliveryAddress?: unknown },
  store: { userId: string; brandSettings: unknown },
): Promise<{ transfer: TransferDetails | null; deliveryCode: string | null; delivery: OrderDeliveryView | null; brandSettings: { palette?: Record<string, string>; themeTokens?: Record<string, unknown> } }> {
  const account = order.paymentMethod === "transfer" && UNPAID.includes(order.status) ? readTransferAccount(store.brandSettings) : null;
  const [booking, delivery] = await Promise.all([
    db.deliveryBooking.findFirst({
      where: { orderId: order.id, sellerId: store.userId, replacedById: null, deliveryCode: { not: null }, status: { notIn: ["cancelled", "delivered", "failed"] } },
      orderBy: { createdAt: "desc" },
      select: { deliveryCode: true },
    }),
    // Never blocks the order page.
    loadDelivery(order, store.userId).catch((error) => {
      console.error(`[order page] delivery for ${order.id}`, error);
      return null;
    }),
  ]);
  const settings = store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? (store.brandSettings as Record<string, unknown>) : {};
  const palette = settings.palette && typeof settings.palette === "object" ? (settings.palette as Record<string, string>) : undefined;
  // The storefront's published colours, so the confirmation looks like the store the buyer just used.
  const editor = settings.editor && typeof settings.editor === "object" ? (settings.editor as Record<string, unknown>) : {};
  const published = editor.published && typeof editor.published === "object" ? (editor.published as Record<string, unknown>) : {};
  const tokens = [published.themeTokens, settings.themeTokens].find((value) => value && typeof value === "object") as Record<string, unknown> | undefined;
  return {
    // The real deadline: what checkout saved, or for older orders the window from when it was placed.
    transfer: account ? { ...account, amount: order.total, reference: order.orderNumber, payBy: orderPaymentDeadline(order, paymentWindows())?.toISOString() ?? null } : null,
    deliveryCode: booking?.deliveryCode ?? null,
    delivery,
    brandSettings: { ...(palette ? { palette } : {}), ...(tokens ? { themeTokens: tokens } : {}) },
  };
}
