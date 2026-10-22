// The supplier app's "Track" screen for one order (GET /api/mobile/supplier/orders/[id]/track): the steps with
// done / now / todo, and the plain-language title. With a delivery partner's job the steps are the same timeline
// shops and customers see (deliveryTimeline in ./delivery-market.ts); without one (the supplier delivers it, or no
// rider yet) they follow the supplier's own order. Pure; unit-tested in tests/status.test.mjs.

import { JOB_STATUS_WORDS, type TimelineStep } from "./delivery-market.ts";

export type TrackState = "done" | "now" | "todo";
export interface TrackStep {
  label: string;
  at: string | null;
  state: TrackState;
}

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null);

/** Done steps stay done; the first step not done is "now" (unless the order stopped); the rest are "todo". */
export function trackSteps(steps: ReadonlyArray<Pick<TimelineStep, "label" | "at" | "done">>, stopped = false): TrackStep[] {
  let current = stopped;
  return steps.map((step) => {
    if (step.done) return { label: step.label, at: step.at, state: "done" as const };
    const state: TrackState = current ? "todo" : "now";
    current = true;
    return { label: step.label, at: step.at, state };
  });
}

type When = Date | string | null | undefined;

/** A dropship order without a partner job: placed → accepted → packed → on the way → delivered. */
export function dropshipSteps(order: { status: string; createdAt: When; acceptedAt?: When; packedAt?: When; shippedAt?: When; deliveredAt?: When }) {
  const moved = ["shipped", "delivered"].includes(order.status);
  return [
    { label: "Order placed", done: true, at: iso(order.createdAt) },
    { label: "Accepted", done: !!order.acceptedAt || ["accepted", "shipped", "delivered"].includes(order.status), at: iso(order.acceptedAt) },
    { label: "Packed", done: !!order.packedAt || moved, at: iso(order.packedAt) },
    { label: "On the way", done: moved, at: iso(order.shippedAt) },
    { label: "Delivered", done: order.status === "delivered", at: iso(order.deliveredAt) },
  ];
}

/** A bulk (wholesale) order without a partner job: placed → accepted → packed → on the way → delivered. */
export function wholesaleSteps(order: { status: string; createdAt: When; shippedAt?: When; deliveredAt?: When }) {
  const rank = ["pending", "confirmed", "processing", "shipped", "delivered"].indexOf(order.status);
  return [
    { label: "Order placed", done: true, at: iso(order.createdAt) },
    { label: "Accepted", done: rank >= 1, at: null },
    { label: "Packed", done: rank >= 2, at: null },
    { label: "On the way", done: rank >= 3, at: iso(order.shippedAt) },
    { label: "Delivered", done: rank >= 4, at: iso(order.deliveredAt) },
  ];
}

const ORDER_TITLES: Record<string, string> = {
  pending: "Waiting for you to accept",
  accepted: "Accepted, pack it next",
  confirmed: "Accepted, pack it next",
  processing: "Packed, waiting for pickup",
  shipped: "On the way",
  delivered: "Delivered",
  rejected: "You declined this order",
  cancelled: "Cancelled",
  refunded: "Refunded",
  expired: "Ran out of time to accept",
};

/** Stopped orders have no "now" step. */
export const STOPPED_ORDER = new Set(["rejected", "cancelled", "refunded", "expired"]);
export const STOPPED_JOB = new Set(["cancelled", "declined", "returned"]);

/** The headline: the partner job's words while one carries it (and the order isn't stopped), else the order's. */
export function trackTitle(orderStatus: string, jobStatus: string | null, packed = false) {
  if (STOPPED_ORDER.has(orderStatus) || orderStatus === "delivered") return ORDER_TITLES[orderStatus]!;
  if (jobStatus && JOB_STATUS_WORDS[jobStatus]) return JOB_STATUS_WORDS[jobStatus]!;
  if (orderStatus === "accepted" && packed) return ORDER_TITLES.processing!;
  return ORDER_TITLES[orderStatus] ?? "In progress";
}
