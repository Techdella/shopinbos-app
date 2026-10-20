import type { CustomerEvent, VariableValues } from "../marketing/text-channels.ts";

// Delivery partner updates to the buyer (Logistics marketplace, spec §6.3): which order message a job step sends,
// the dedupe key it goes out under, and the details it carries (who delivers, as checkout showed it; the delivery
// code; the pickup point; the problem in plain words). Pure, so tests/delivery-messages.test.mjs covers it; the
// sending is notifyDeliveryStage in src/lib/notifications/customer-messages.ts, called from transitionJob.
//
// Dedupe (CustomerMessage is unique per store, event, refId and channel): refId is the delivery job, not the order,
// so a job handed to another partner (a new job with its own delivery code) messages again. Out for delivery and a
// failed attempt also carry the attempt number, so a second try after a failed one gets its own message (with the
// code again); a retry never repeats "booked". Delivered stays the order's own "Delivered" message (sent through
// updateOrderStatus when the job is delivered), once per order.

/** The order message for a job's new status, or null when that step doesn't message the buyer. */
export function deliveryEventFor(jobStatus: string): CustomerEvent | null {
  switch (jobStatus) {
    case "confirmed":
      return "delivery_accepted";
    case "out_for_delivery":
      return "delivery_out";
    case "at_pickup_point":
      return "delivery_at_point";
    case "failed":
    case "returning":
      return "delivery_problem";
    default:
      return null;
  }
}

/** What the message is recorded under, so each one goes once (see the note at the top). */
export function deliveryRefId(jobStatus: string, bookingId: string, failedAttempts = 0) {
  const attempts = Math.max(0, Math.floor(Number(failedAttempts) || 0));
  switch (jobStatus) {
    case "out_for_delivery":
      return `${bookingId}:out:${attempts}`;
    case "failed":
      return `${bookingId}:failed:${attempts}`;
    case "returning":
      return `${bookingId}:returning`;
    default:
      return bookingId;
  }
}

/**
 * Text that goes into a WhatsApp template parameter or an SMS: one line (Meta refuses new lines, tabs and more
 * than four spaces in a row), no stray punctuation at the end, and short.
 */
export function oneLine(text: string | null | undefined, max = 160) {
  const clean = String(text ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[\s.,;:!]+$/, "");
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export interface ConnectionLabel {
  showPartnerName: boolean;
  label: string | null;
  partnerName: string | null;
}

/**
 * Who delivers, as checkout showed it: the partner's name when the seller shows it for that connection, else the
 * seller's own label ("Standard delivery"). Without a connection we never name the partner.
 */
export function deliveryPartnerLabel(connection: ConnectionLabel | null | undefined, service: string | null | undefined) {
  if (connection?.showPartnerName && oneLine(connection.partnerName, 60)) return oneLine(connection.partnerName, 60);
  if (connection && oneLine(connection.label, 60)) return oneLine(connection.label, 60);
  if (service === "same_day") return "Same-day delivery";
  if (service === "pickup_point") return "Pickup point delivery";
  return "Standard delivery";
}

/** "Ikeja Hub, 12 Allen Avenue, Ikeja (open Mon-Sat 9am-6pm)". */
export function pickupPointWords(point: { name: string; address: string; area?: string | null; hours?: string | null } | null | undefined) {
  if (!point) return "the pickup point you chose";
  const address = oneLine(point.address, 80);
  const area = oneLine(point.area, 40);
  // The area is left out when the address already says it.
  const place = [oneLine(point.name, 60), address, area && !address.toLowerCase().includes(area.toLowerCase()) ? area : ""].filter(Boolean);
  const hours = oneLine(point.hours, 60);
  return oneLine(`${place.join(", ")}${hours ? ` (open ${hours})` : ""}`, 200) || "the pickup point you chose";
}

/** Common reasons a rider gives, as a clause after "because". */
const REASONS: Array<[RegExp, string]> = [
  [/not? (picking|picked|answering|answered|reachable)|no answer|didn'?t (pick|answer)|unreachable (phone|number|line|customer)|phone (off|switched off|not reachable)|switched off|not responding|calls?/i, "the rider couldn't reach you on the phone"],
  [/address|can'?t find|cannot find|could ?n[o']t find|not found|wrong (house|street|place|location)|landmark|location/i, "the rider couldn't find the address"],
  [/not (at )?home|not available|unavailable|nobody|no one|no-one|absent|travell?ed|not around|out of town/i, "nobody was there to receive it"],
  [/refus|reject|didn'?t want|doesn'?t want|cancel/i, "the parcel was refused"],
  [/reschedul|another (day|time)|come back|tomorrow|later date|next week/i, "a new delivery day was asked for"],
];

/** The partner's reason for a failed attempt in plain words (their own words when it's none of the usual ones). */
export function plainFailReason(reason: string | null | undefined): { clause: string | null; text: string | null } {
  const text = oneLine(reason, 100)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[\s.,;:!]+$/, "");
  if (!text) return { clause: null, text: null };
  for (const [pattern, clause] of REASONS) if (pattern.test(text)) return { clause, text };
  return { clause: null, text };
}

/** The {{delivery_problem}} wording: why the delivery stopped, without a full stop (the message carries on). */
export function deliveryProblemWords(jobStatus: string, failedReason?: string | null) {
  if (jobStatus === "returning") return "it couldn't be delivered, so it's on its way back to us";
  const { clause, text } = plainFailReason(failedReason);
  if (clause) return `the delivery didn't go through today because ${clause}`;
  if (text) return `the delivery didn't go through today. The rider said: ${text}`;
  return "the delivery didn't go through today";
}

export interface DeliveryMessageInput {
  /** The job's new status. */
  status: string;
  bookingId: string;
  failedAttempts?: number | null;
  failedReason?: string | null;
  deliveryCode?: string | null;
  service?: string | null;
  connection?: ConnectionLabel | null;
  point?: { name: string; address: string; area?: string | null; hours?: string | null } | null;
  buyerName?: string | null;
  storeName: string;
  orderNumber: string;
  /** The store's order page for this order. */
  orderLink: string;
  storeLink: string;
}

const firstWord = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/**
 * The event, dedupe key and details for one job step: `values` fill the WhatsApp template ({{n}} mapping keys) and
 * `smsVars` the seller's SMS text ({{store}}, {{delivery_code}}…). Null when the step doesn't message the buyer.
 */
export function deliveryMessage(input: DeliveryMessageInput): { event: CustomerEvent; refId: string; values: VariableValues; smsVars: Record<string, string> } | null {
  const event = deliveryEventFor(input.status);
  if (!event) return null;
  const first = oneLine(firstWord(input.buyerName), 40) || "there";
  const partner = deliveryPartnerLabel(input.connection, input.service);
  // The code is made when the partner accepts; if it's somehow missing, the order page is where it would show.
  const code = oneLine(input.deliveryCode, 12) || "on your order page";
  const point = pickupPointWords(input.point);
  const problem = event === "delivery_problem" ? deliveryProblemWords(input.status, input.failedReason) : "";
  const store = oneLine(input.storeName, 80);
  return {
    event,
    refId: deliveryRefId(input.status, input.bookingId, input.failedAttempts ?? 0),
    values: {
      first_name: first,
      store_name: store,
      order_number: input.orderNumber,
      order_link: input.orderLink,
      tracking_link: input.orderLink,
      link: input.storeLink,
      delivery_partner: partner,
      delivery_code: code,
      pickup_point: point,
      ...(problem ? { delivery_problem: problem } : {}),
    },
    smsVars: {
      name: first,
      store,
      order_number: input.orderNumber,
      order_url: input.orderLink,
      tracking_link: input.orderLink,
      store_url: input.storeLink,
      delivery_partner: partner,
      delivery_code: code,
      pickup_point: point,
      delivery_problem: problem,
    },
  };
}
