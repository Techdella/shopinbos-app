import type { RiderRow } from "./logistics";

// Pure helpers for the delivery partner screens ("Delivery partner app" prototype): the words and buttons for each
// job status, the job timeline, coverage choices ("same states / all of Nigeria / selected states") as area tokens,
// and the starter rate card built from what the partner picked. Words are m_partner keys; screens translate them.

/** Job statuses on the partner's side (DeliveryBooking.status). `pending` is a new offer. */
export type JobStatus =
  | "pending"
  | "confirmed"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "at_pickup_point"
  | "delivered"
  | "failed"
  | "returning"
  | "returned"
  | "declined"
  | "cancelled";

/** The short status word on job rows and the job header (m_partner "pst.<status>"). */
export const STATUS_WORD: Record<string, string> = {
  pending: "New",
  confirmed: "Rider on the way to pick up",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  at_pickup_point: "At pickup point",
  delivered: "Delivered",
  failed: "Failed attempt",
  returning: "Returning to sender",
  returned: "Returned",
  declined: "Declined",
  cancelled: "Cancelled",
};

/** Is this a pickup-point job? The job doesn't say its service, so a drop-off naming one of the partner's pickup
 * points (or the status itself) tells us. */
export function isPointJob(status: string, to: string, points: ReadonlyArray<{ name: string; address: string }>) {
  if (status === "at_pickup_point") return true;
  const where = to.toLowerCase();
  return points.some((point) => (point.name && where.includes(point.name.toLowerCase())) || (point.address && where.includes(point.address.toLowerCase())));
}

/** The main button on a job that's moving (prototype `nextLbl`), as an m_partner key and the status it moves to. */
export function nextMove(status: string, point: boolean): { to: "picked_up" | "in_transit" | "out_for_delivery" | "at_pickup_point"; key: string } | null {
  if (status === "confirmed") return { to: "picked_up", key: "next.picked_up" };
  if (status === "picked_up") return { to: "in_transit", key: "next.in_transit" };
  if (status === "in_transit") return point ? { to: "at_pickup_point", key: "next.at_pickup_point" } : { to: "out_for_delivery", key: "next.out_for_delivery" };
  return null;
}

/** Which footer a job shows (prototype: isOffer, isMoving, isLast, isFailed, isReturning). */
export function jobFooter(status: string): "offer" | "moving" | "last" | "failed" | "returning" | "none" {
  if (status === "pending") return "offer";
  if (status === "confirmed" || status === "picked_up" || status === "in_transit") return "moving";
  if (status === "out_for_delivery" || status === "at_pickup_point") return "last";
  if (status === "failed") return "failed";
  if (status === "returning") return "returning";
  return "none";
}

export type StepState = "done" | "now" | "todo";

/** The vertical timeline (prototype `steps`): Accepted → Picked up → In transit → Out for delivery or At pickup
 * point → Delivered or Collected, as m_partner keys. Shown for accepted, moving, delivered and failed jobs. */
export function jobTimeline(status: string, point: boolean): Array<{ key: string; state: StepState }> | null {
  const index: Record<string, number> = { confirmed: 0, picked_up: 1, in_transit: 2, out_for_delivery: 3, at_pickup_point: 3, delivered: 4, failed: 3 };
  if (!(status in index)) return null;
  const at = index[status];
  const keys = ["tl.accepted", "tl.picked_up", "tl.in_transit", point ? "tl.at_pickup_point" : "tl.out_for_delivery", point ? "tl.collected" : "tl.delivered"];
  return keys.map((key, i) => ({ key, state: i < at || (status === "delivered" && i === at) ? "done" : i === at ? "now" : "todo" }));
}

/** Two-letter initials for a company or person ("Swift Dispatch" → "SD"). */
export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[1][0]}`).toUpperCase();
}

// Prices, coverage choices and the starter rate card are shared with the web set-up (shared/partner-setup.ts).
export { nairaInput, priceText, STATE_CHIPS, stateLabel, statesIn, deliverModeOf, deliveryAreasFor, pickupAreasFor, starterRates, draftFromRow, rowsToSave, newDraftRate, SIZE_KEYS, SERVICE_KEYS } from "@shared/partner-setup";
export type { DeliverMode, DraftRate } from "@shared/partner-setup";

/** A rider's pill (prototype `riders`): Invited until they open their link, Off when offline or paused, Busy on a job,
 * else Free. m_partner "rider.<state>". */
export function riderState(rider: Pick<RiderRow, "hasAppLink" | "active" | "out" | "openJobs">): { key: string; tone: "ok" | "warn" | "gray" } {
  if (!rider.hasAppLink) return { key: "rider.invited", tone: "gray" };
  if (!rider.active || !rider.out) return { key: "rider.off", tone: "gray" };
  if (rider.openJobs > 0) return { key: "rider.busy", tone: "warn" };
  return { key: "rider.free", tone: "ok" };
}
