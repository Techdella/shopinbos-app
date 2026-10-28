import { NATIONWIDE, NG_STATES, cleanAreas, parseArea } from "@shared/delivery-market";
import { nameWords } from "@shared/identity-images";
import type { TakingBlock } from "@shared/taking-jobs";
import type { MarketRateRow, RateService, RiderRow, SizeBand } from "./logistics";

/**
 * Why the "Taking new jobs" switch can't go on, for Jobs: the server's answer (overview takingBlock) when it sends
 * one, else read from what the phone has (an older server: set-up and verification only).
 */
export function takingBlockOf(partner: { takingBlock?: TakingBlock | null; verificationStatus: string; onboarded: boolean }): TakingBlock | null {
  if (partner.takingBlock !== undefined) return partner.takingBlock;
  if (partner.verificationStatus === "suspended") return "hold";
  if (partner.verificationStatus === "verified") return null;
  if (!partner.onboarded) return "setup";
  if (partner.verificationStatus === "rejected") return "rejected";
  return partner.verificationStatus === "pending" ? "checking" : "documents";
}

/** What the line under the switch offers for each reason: a screen to open, Help, or nothing (we're checking). */
export const TAKING_BLOCK_ACTION: Record<TakingBlock, { path: string | null; key: string }> = {
  setup: { path: "/logistics/verification", key: "taking.go.setup" },
  documents: { path: "/logistics/verification", key: "taking.go.documents" },
  checking: { path: null, key: "" },
  rejected: { path: "/logistics/verification", key: "taking.go.rejected" },
  hold: { path: "/help", key: "taking.go.hold" },
};

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
  const words = nameWords(name);
  if (!words.length) return "?";
  return (words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[1][0]}`).toUpperCase();
}

/** Whole naira from what someone typed ("2,500" → 2500); null when it isn't a number. 0 is allowed (fees). */
export function nairaInput(text: string): number | null {
  const clean = text.replace(/[₦,\s]/g, "");
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

/** "2500" → "2,500" for price boxes. */
export const priceText = (value: number | null | undefined) => (value == null || !Number.isFinite(value) ? "" : Math.round(value).toLocaleString("en-NG"));

// ─── Coverage ────────────────────────────────────────────────────────────────────────────────────────────────────

/** States the chips show, in order, the busiest first (the rest follow alphabetically). */
const FIRST = ["Lagos", "Ogun", "Oyo", "Abia", "FCT", "Rivers", "Kano", "Enugu", "Edo", "Delta", "Kaduna", "Anambra"];
export const STATE_CHIPS: string[] = [...FIRST, ...NG_STATES.filter((state) => !FIRST.includes(state))];

/** How a state reads on a chip ("FCT" → "Abuja (FCT)"). */
export const stateLabel = (state: string) => (state === "FCT" ? "Abuja (FCT)" : state);

export type DeliverMode = "same" | "all" | "some";

/** Plain states among area tokens (regions, "State: Area" and Nationwide are kept aside). */
export function statesIn(areas: readonly string[]) {
  return areas.filter((area) => parseArea(area)?.kind === "state");
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((item) => b.includes(item));

/** Which "Where can you deliver to?" choice the saved areas mean. */
export function deliverModeOf(pickupAreas: readonly string[], deliveryAreas: readonly string[]): DeliverMode {
  if (deliveryAreas.includes(NATIONWIDE)) return "all";
  if (!deliveryAreas.length) return "all";
  return sameSet(statesIn(pickupAreas), statesIn(deliveryAreas)) && deliveryAreas.every((area) => parseArea(area)?.kind === "state") ? "same" : "some";
}

/** The delivery areas to save for a choice; tokens the chips don't show (regions, "State: Area") are kept for "some". */
export function deliveryAreasFor(mode: DeliverMode, pickupStates: readonly string[], chosen: readonly string[], saved: readonly string[] = []) {
  if (mode === "all") return [NATIONWIDE];
  if (mode === "same") return cleanAreas([...pickupStates]).areas;
  const kept = saved.filter((area) => area !== NATIONWIDE && parseArea(area)?.kind !== "state");
  return cleanAreas([...chosen, ...kept]).areas;
}

/** Pickup areas to save: the chosen states plus any finer tokens already saved. */
export function pickupAreasFor(chosen: readonly string[], saved: readonly string[] = []) {
  const kept = saved.filter((area) => parseArea(area)?.kind !== "state");
  return cleanAreas([...chosen, ...kept]).areas;
}

// ─── Rate card ───────────────────────────────────────────────────────────────────────────────────────────────────

/** A row while editing: the price is what was typed. */
export type DraftRate = Omit<MarketRateRow, "price" | "id"> & { id: string; price: string };

let seq = 0;
const rowId = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * "We started it from what you picked": one small-parcel row per pickup state for each service it offers, inside
 * that state (1–2 days, same-day in 0) and, when it delivers further, to everywhere else it covers (2–4 days).
 * Prices start empty for the partner to fill in.
 */
export function starterRates(pickupStates: readonly string[], deliverMode: DeliverMode, deliverStates: readonly string[], services: readonly string[]): DraftRate[] {
  const rows: DraftRate[] = [];
  const priced: RateService[] = (["doorstep", "pickup_point", "same_day"] as const).filter((service) => services.includes(service));
  if (!priced.length) priced.push("doorstep");
  const far = deliverMode === "all" ? [NATIONWIDE] : deliverMode === "some" ? deliverStates : [];
  for (const from of pickupStates.slice(0, 6)) {
    for (const service of priced) {
      rows.push({ id: rowId(), from, to: from, service, sizeBand: "small", price: "", minDays: service === "same_day" ? 0 : 1, maxDays: service === "same_day" ? 0 : 2 });
      if (service === "same_day") continue;
      for (const to of far.filter((place) => place !== from).slice(0, 6)) rows.push({ id: rowId(), from, to, service, sizeBand: "small", price: "", minDays: 2, maxDays: 4 });
    }
  }
  return rows;
}

export const draftFromRow = (row: MarketRateRow): DraftRate => ({ ...row, price: priceText(row.price) });

/** Rows with a price, ready for PUT { section: "rates" } (rows left empty are skipped). */
export function rowsToSave(rows: readonly DraftRate[]) {
  return rows
    .map((row) => ({ id: row.id, from: row.from, to: row.to, service: row.service, sizeBand: row.sizeBand, price: nairaInput(row.price) ?? 0, minDays: row.minDays, maxDays: row.maxDays }))
    .filter((row) => row.price > 0);
}

export const newDraftRate = (from = "Lagos", to = "Lagos"): DraftRate => ({ id: rowId(), from, to, service: "doorstep", sizeBand: "small", price: "", minDays: 1, maxDays: 2 });

export const SIZE_KEYS: Record<SizeBand, string> = { small: "size.small", medium: "size.medium", bulky: "size.bulky" };
export const SERVICE_KEYS: Record<string, string> = { doorstep: "svc.doorstep", pickup_point: "svc.pickup_point", same_day: "svc.same_day", interstate: "svc.interstate" };

/** A rider's pill (prototype `riders`): Invited until they open their link, Off when offline or paused, Busy on a job,
 * else Free. m_partner "rider.<state>". */
export function riderState(rider: Pick<RiderRow, "hasAppLink" | "active" | "out" | "openJobs">): { key: string; tone: "ok" | "warn" | "gray" } {
  if (!rider.hasAppLink) return { key: "rider.invited", tone: "gray" };
  if (!rider.active || !rider.out) return { key: "rider.off", tone: "gray" };
  if (rider.openJobs > 0) return { key: "rider.busy", tone: "warn" };
  return { key: "rider.free", tone: "ok" };
}
