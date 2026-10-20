// Pure helpers for the seller screens of the 2026 "Seller app" prototype: the Orders tab groups, the order page's
// delivery timeline, the payout line on Home, and the Delivery hub's words (where I sell, rate rows). No React
// Native imports, so the root tests can load this file directly.

export type OrderGroup = "need" | "way" | "done";
export const ORDER_GROUPS: readonly OrderGroup[] = ["need", "way", "done"];

const NEED = new Set(["pending", "awaiting_payment", "paid", "processing", "packed"]);
const DONE = new Set(["delivered", "returned", "cancelled", "refunded", "partially_refunded"]);

/** Needs action (not paid, to pack or send, or a delivery problem), On the way (sent), Done. */
export function orderGroup(status: string, hasException = false): OrderGroup {
  if (hasException) return "need";
  if (NEED.has(status)) return "need";
  if (DONE.has(status)) return "done";
  return "way";
}

export type StepState = "done" | "now" | "todo";

/** Server timeline steps (done or not) → the prototype's dots: done steps, then the current one, then the rest. */
export function timelineStates<S extends { done: boolean }>(steps: readonly S[]): Array<S & { state: StepState }> {
  const firstOpen = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => ({ ...step, state: step.done ? "done" : index === firstOpen ? "now" : "todo" }));
}

/** The order's own steps when no delivery partner carries it (keys are m_orders "tl.<key>"). */
export function ownTimeline(order: { status: string; createdAt: string }): Array<{ key: string; done: boolean; at: string | null }> {
  const paid = !["pending", "awaiting_payment", "cancelled"].includes(order.status);
  const sent = ["shipped", "delivered", "returned"].includes(order.status);
  const delivered = order.status === "delivered";
  return [
    { key: "placed", done: true, at: order.createdAt },
    { key: "paid", done: paid, at: null },
    { key: "sent", done: sent, at: null },
    { key: "delivered", done: delivered, at: null },
  ];
}

/** Server timeline keys (shared/delivery-market.ts deliveryTimeline) → the web "delivery" catalog's words. */
export function timelineWordKey(key: string, kind: string | null, service: string | null): string {
  const point = service === "pickup_point";
  switch (key) {
    case "placed":
      return "timeline.placed";
    case "pending":
      return "timeline.sent";
    case "confirmed":
      return "timeline.accepted";
    case "picked_up":
      return "timeline.pickedUp";
    case "in_transit":
      return "timeline.inTransit";
    case "out_for_delivery":
      return "timeline.outForDelivery";
    case "at_pickup_point":
      return "timeline.atPickupPoint";
    case "ready":
      return kind === "self_pickup" ? "timeline.readyForPickup" : "timeline.beingPrepared";
    case "delivered":
      return kind === "self_pickup" || point ? "timeline.collected" : "timeline.delivered";
    default:
      return `timeline.${key}`;
  }
}

/** Money on its way to the bank: Paystack settlements not paid out yet (amounts in kobo), and the earliest date. */
export function upcomingPayout(settlements: ReadonlyArray<{ status: string; amountKobo: number; date: string | null }> | null | undefined): { amount: number; date: string | null } | null {
  const waiting = (settlements ?? []).filter((row) => row.amountKobo > 0 && !["success", "processed", "paid", "failed", "reversed"].includes(String(row.status).toLowerCase()));
  if (!waiting.length) return null;
  const amount = waiting.reduce((sum, row) => sum + row.amountKobo, 0) / 100;
  const dates = waiting.map((row) => row.date).filter((date): date is string => !!date).sort();
  return { amount, date: dates[0] ?? null };
}

/** "Where I sell" in a few words: m_delivery "where.all", "where.only" ({state}), or the states themselves. */
export function whereWords(settings: { sellArea: string; sellStates: readonly string[] } | null | undefined, t: { dynamic(key: string, fallback?: string, vars?: Record<string, string | number>): string }) {
  if (!settings || settings.sellArea === "nationwide" || !settings.sellStates.length) return t.dynamic("where.all", "All of Nigeria");
  if (settings.sellArea === "one_state") return t.dynamic("where.only", `${settings.sellStates[0]} only`, { state: stateName(settings.sellStates[0]) });
  return settings.sellStates.map(stateName).join(", ");
}

/** FCT reads better as Abuja. */
export const stateName = (state: string) => (state === "FCT" ? "Abuja (FCT)" : state);

/** A rate row's route: "Lagos → Abuja". Area tokens are "State: Area"; show the area when there is one. */
export function routeWords(row: { from: string; to: string }) {
  const place = (token: string) => {
    const [state, area] = token.split(":").map((part) => part.trim());
    return area ? `${area}, ${stateName(state)}` : stateName(state);
  };
  return `${place(row.from)} → ${place(row.to)}`;
}

/** The public price of the same route, service and size (for "Was ₦4,000" on a private rate). */
export function publicPriceFor(row: { from: string; to: string; service: string; sizeBand: string }, publicRows: ReadonlyArray<{ from: string; to: string; service: string; sizeBand: string; price: number }> | null | undefined) {
  return publicRows?.find((other) => other.from === row.from && other.to === row.to && other.service === row.service && other.sizeBand === row.sizeBand)?.price ?? null;
}

/** "Picks up in Lagos, Ogun · delivers nationwide" in parts the screen translates. */
export function coverageParts(partner: { pickupAreas: readonly string[]; deliveryAreas: readonly string[] }) {
  const list = (areas: readonly string[]) => areas.map((area) => routeWords({ from: area, to: "" }).replace(/ → $/, "")).join(", ");
  return { from: list(partner.pickupAreas), to: list(partner.deliveryAreas) };
}

type Say = { dynamic(key: string, fallback?: string, vars?: Record<string, string | number>): string };

/** "Same day", "2 days", "1–3 days" in the app language (the web "delivery" catalog's time.* words). */
export function daysWords(minDays: number, maxDays: number, t: Say) {
  if (maxDays <= 0) return t.dynamic("time.sameDay", "Same day");
  if (minDays >= maxDays) return t.dynamic("time.days", `${maxDays} days`, { count: maxDays });
  return t.dynamic("time.dayRange", `${minDays}–${maxDays} days`, { min: Math.max(0, minDays), max: maxDays });
}

/** The server's English timeframe ("Same day", "1 day", "1–3 days", "Same day – 3 days") in the app language. */
export function timeframeWords(text: string | null | undefined, t: Say) {
  if (!text) return "";
  const range = text.match(/^(\d+)\s*[–-]\s*(\d+) days?$/);
  if (range) return daysWords(Number(range[1]), Number(range[2]), t);
  const one = text.match(/^(\d+) days?$/);
  if (one) return daysWords(Number(one[1]), Number(one[1]), t);
  if (/^same day$/i.test(text)) return daysWords(0, 0, t);
  const mixed = text.match(/^same day\s*[–-]\s*(\d+) days?$/i);
  if (mixed) return `${daysWords(0, 0, t)} – ${daysWords(Number(mixed[1]), Number(mixed[1]), t)}`;
  return text;
}

/** wa.me wants the number in international form without "+"; Nigerian local numbers start with 0. */
export function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
}
