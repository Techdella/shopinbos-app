// Supplier orders: the time a supplier has to accept a new order (and the countdown they see), and booking a
// rider to collect a packed order at a set time (build spec 7.2 and 8A, "Simple supplier, delivery and rider
// apps"). Shared by the web app, the server and the mobile app. Pure (no imports) so
// tests/supplier-countdown-pickup.test.mjs can load it directly.
//
// Times are Africa/Lagos (WAT, UTC+1 all year, no daylight saving), so local hours are UTC hours + 1.

export type SupplierOrderKind = "dropship" | "wholesale";

// ─── Time to accept ───────────────────────────────────────────────────────────

/** Default hours to accept: an order a shop sold (dropship) 4 h, a bulk (wholesale) order 24 h. */
export const DEFAULT_ACCEPT_HOURS: Record<SupplierOrderKind, number> = { dropship: 4, wholesale: 24 };
/** The longest any window can be: a week. The shortest: one minute (for testing with a short env value). */
export const MAX_ACCEPT_HOURS = 168;
const MIN_ACCEPT_HOURS = 1 / 60;
/** The countdown turns amber this close to the deadline. */
export const ACCEPT_SOON_MINUTES = 30;
/** The supplier is reminded this long before the deadline. */
export const ACCEPT_REMINDER_MINUTES = 60;

function positiveHours(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return Math.min(MAX_ACCEPT_HOURS, Math.max(MIN_ACCEPT_HOURS, hours));
}

/**
 * Hours a supplier has to accept a new order: the admin's setting for this supplier, else the env value
 * (SUPPLIER_ACCEPT_HOURS_DROPSHIP / SUPPLIER_ACCEPT_HOURS_WHOLESALE, decimals allowed), else 4 h / 24 h.
 */
export function acceptHours(kind: SupplierOrderKind, env: { dropship?: string | null; wholesale?: string | null } = {}, supplierHours?: number | null) {
  return positiveHours(supplierHours) ?? positiveHours(kind === "dropship" ? env.dropship : env.wholesale) ?? DEFAULT_ACCEPT_HOURS[kind];
}

/** The deadline for an order that came in at `from`. Night hours count: no business-hours maths. */
export function acceptDeadline(from: Date, hours: number) {
  return new Date(from.getTime() + Math.round(hours * 3_600_000));
}

export interface AcceptCountdown {
  /** "Accept in 2h 14m", "Accept in 9m", "Time ran out". */
  text: string;
  /** Under 30 minutes left: show it amber. */
  soon: boolean;
  expired: boolean;
  /** Shown with the amber countdown. */
  warning: string | null;
  minutesLeft: number;
}

export const ACCEPT_SOON_WARNING = "Accept soon or the shop will be told";

/** The countdown a supplier sees on a new order, in plain words. Null when the order has no deadline. */
export function acceptCountdown(acceptBy: Date | string | null | undefined, now: Date | number = Date.now()): AcceptCountdown | null {
  if (!acceptBy) return null;
  const deadline = new Date(acceptBy).getTime();
  const at = typeof now === "number" ? now : now.getTime();
  if (!Number.isFinite(deadline)) return null;
  const ms = deadline - at;
  if (ms <= 0) return { text: "Time ran out", soon: true, expired: true, warning: "The shop has been told", minutesLeft: 0 };
  const minutes = Math.floor(ms / 60_000);
  const soon = minutes < ACCEPT_SOON_MINUTES;
  let left: string;
  if (minutes < 1) left = "less than a minute";
  else if (minutes < 60) left = `${minutes}m`;
  else if (minutes < 48 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    left = rest ? `${hours}h ${rest}m` : `${hours}h`;
  } else left = `${Math.floor(minutes / (24 * 60))} days`;
  return { text: `Accept in ${left}`, soon, expired: false, warning: soon ? ACCEPT_SOON_WARNING : null, minutesLeft: minutes };
}

export interface AcceptRow {
  status: string;
  acceptBy: Date | null;
  acceptReminderAt?: Date | null;
  createdAt?: Date | null;
}

/** Still waiting for the supplier's yes: both kinds use "pending" for a new order. */
export const AWAITING_ACCEPT_STATUS = "pending";

/** A new order whose time to accept has run out (the cron expires it). */
export function isAcceptExpired(row: AcceptRow, now: Date) {
  return row.status === AWAITING_ACCEPT_STATUS && Boolean(row.acceptBy) && row.acceptBy!.getTime() <= now.getTime();
}

/** Which of these the cron expires now, oldest deadline first. */
export function selectExpired<T extends AcceptRow>(rows: T[], now: Date): T[] {
  return rows.filter((row) => isAcceptExpired(row, now)).sort((a, b) => a.acceptBy!.getTime() - b.acceptBy!.getTime());
}

/**
 * The conditional update that expires one order: only while it is still new and past its deadline. An accept
 * that lands first moves it off "pending", so this matches nothing and the accept wins.
 */
export function expiryGuard(id: string, now: Date) {
  return { id, status: AWAITING_ACCEPT_STATUS, acceptBy: { lte: now } };
}

/** The "1 hour left" reminder is due: still new, not reminded, under an hour left, and the window was longer than that. */
export function reminderDue(row: AcceptRow, now: Date) {
  if (row.status !== AWAITING_ACCEPT_STATUS || !row.acceptBy || row.acceptReminderAt) return false;
  const left = row.acceptBy.getTime() - now.getTime();
  if (left <= 0 || left > ACCEPT_REMINDER_MINUTES * 60_000) return false;
  // A window of an hour or less: the "new order" message already said how long they have.
  return !row.createdAt || row.acceptBy.getTime() - row.createdAt.getTime() > (ACCEPT_REMINDER_MINUTES + 15) * 60_000;
}

/** "4 hours", "24 hours", "30 minutes": a window in words for the new-order message. */
export function hoursInWords(hours: number) {
  const minutes = Math.round(hours * 60);
  if (minutes < 120) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const whole = Math.round(minutes / 60);
  return `${whole} hour${whole === 1 ? "" : "s"}`;
}

// ─── Lagos time ───────────────────────────────────────────────────────────────

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Year, month (1-12), day, hour, minute and weekday (0 = Sunday) in Lagos. */
export function lagosParts(date: Date) {
  const local = new Date(date.getTime() + LAGOS_OFFSET_MS);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate(), hour: local.getUTCHours(), minute: local.getUTCMinutes(), weekday: local.getUTCDay() };
}

/** "2026-10-12": the Lagos calendar day. */
export function lagosDay(date: Date) {
  const p = lagosParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The instant a Lagos wall-clock time happens. `day` is "YYYY-MM-DD"; hours may run past 24. */
export function lagosTime(day: string, hour: number, minute = 0) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - LAGOS_OFFSET_MS);
}

function addDays(day: string, days: number) {
  return lagosDay(new Date(lagosTime(day, 12).getTime() + days * DAY_MS));
}

// ─── Pickup slots ─────────────────────────────────────────────────────────────

/** Riders collect between 8am and 7pm. */
export const PICKUP_DAY_START = 8;
export const PICKUP_DAY_END = 19;
/** The soonest a rider can be there. */
export const PICKUP_NOTICE_MINUTES = 60;
/** A window must still have at least this long left after the notice to be offered. */
const MIN_WINDOW_LEFT_MINUTES = 60;

const WINDOWS = {
  morning: { start: 9, end: 12 },
  afternoon: { start: 12, end: 16 },
  evening: { start: 16, end: 19 },
} as const;

export type PickupSlotKey = "in_1_hour" | "this_morning" | "this_afternoon" | "this_evening" | "tomorrow_morning" | "tomorrow_afternoon" | "custom";

export interface PickupSlot {
  key: PickupSlotKey;
  label: string;
  /** ISO times. */
  start: string;
  end: string;
}

function roundUpTo(date: Date, minutes: number) {
  const step = minutes * 60_000;
  return new Date(Math.ceil(date.getTime() / step) * step);
}

function hourLabel(hour: number) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour < 12 ? "am" : "pm"}`;
}

function windowSlot(key: PickupSlotKey, name: string, day: string, window: { start: number; end: number }, now: Date): PickupSlot | null {
  const start = lagosTime(day, window.start);
  const end = lagosTime(day, window.end);
  const soonest = roundUpTo(new Date(now.getTime() + PICKUP_NOTICE_MINUTES * 60_000), 30);
  if (soonest.getTime() > end.getTime() - MIN_WINDOW_LEFT_MINUTES * 60_000) return null;
  const from = soonest.getTime() > start.getTime() ? soonest : start;
  const startHour = window.start === 12 || window.start < 12 === window.end < 12 ? String(window.start % 12 || 12) : hourLabel(window.start);
  return { key, label: `${name} (${startHour}–${hourLabel(window.end)})`, start: from.toISOString(), end: end.toISOString() };
}

/**
 * The big choices after "I've packed it": In 1 hour, This afternoon (12–4pm), This evening (4–7pm), Tomorrow
 * morning (9am–12pm), plus "Pick a time" (customSlot). Only slots a rider can still make are offered (an hour's
 * notice, 8am to 7pm); late in the evening everything rolls over to tomorrow. `preselected` is the soonest.
 */
export function pickupSlots(now: Date = new Date()): { slots: PickupSlot[]; preselected: PickupSlotKey } {
  const today = lagosDay(now);
  const tomorrow = addDays(today, 1);
  const slots: PickupSlot[] = [];

  const inAnHour = roundUpTo(new Date(now.getTime() + PICKUP_NOTICE_MINUTES * 60_000), 15);
  const startHour = lagosParts(inAnHour).hour + lagosParts(inAnHour).minute / 60;
  if (lagosDay(inAnHour) === today && startHour >= PICKUP_DAY_START && startHour <= PICKUP_DAY_END - 2) {
    slots.push({ key: "in_1_hour", label: "In 1 hour", start: inAnHour.toISOString(), end: new Date(inAnHour.getTime() + 2 * 3_600_000).toISOString() });
  }
  const morning = windowSlot("this_morning", "This morning", today, WINDOWS.morning, now);
  // "This morning" only before the day starts, when "In 1 hour" would be too early.
  if (morning && !slots.length) slots.push(morning);
  const afternoon = windowSlot("this_afternoon", "This afternoon", today, WINDOWS.afternoon, now);
  if (afternoon) slots.push(afternoon);
  const evening = windowSlot("this_evening", "This evening", today, WINDOWS.evening, now);
  if (evening) slots.push(evening);
  const todayCount = slots.length;
  const tomorrowMorning = windowSlot("tomorrow_morning", "Tomorrow morning", tomorrow, WINDOWS.morning, now);
  if (tomorrowMorning) slots.push(tomorrowMorning);
  // Nothing left today: offer tomorrow afternoon too, so there's still a choice.
  if (todayCount === 0) {
    const tomorrowAfternoon = windowSlot("tomorrow_afternoon", "Tomorrow afternoon", tomorrow, WINDOWS.afternoon, now);
    if (tomorrowAfternoon) slots.push(tomorrowAfternoon);
  }
  return { slots, preselected: slots[0]?.key ?? "tomorrow_morning" };
}

/** Days ahead "Pick a time" offers (today plus the next six). */
export const CUSTOM_PICKUP_DAYS = 7;

/** The days "Pick a time" offers: { day: "2026-10-12", label: "Today" | "Tomorrow" | "Friday 16" }. */
export function customPickupDays(now: Date = new Date()) {
  const today = lagosDay(now);
  return Array.from({ length: CUSTOM_PICKUP_DAYS }, (_, index) => {
    const day = addDays(today, index);
    return { day, label: dayWord(day, now, true) };
  });
}

/** Start hours "Pick a time" offers: 2-hour windows from 8am to 5pm (ending by 7pm). */
export const CUSTOM_START_HOURS = Array.from({ length: PICKUP_DAY_END - 2 - PICKUP_DAY_START + 1 }, (_, index) => PICKUP_DAY_START + index);

/** "Pick a time": a 2-hour window on a day, checked. */
export function customSlot(day: string, startHour: number, now: Date = new Date()): { ok: true; slot: PickupSlot } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(startHour)) return { ok: false, error: "Pick a day and a time." };
  if (startHour < PICKUP_DAY_START || startHour > PICKUP_DAY_END - 2) return { ok: false, error: "Riders collect between 8am and 7pm. Pick a time in the day." };
  const days = customPickupDays(now).map((option) => option.day);
  if (!days.includes(day)) return { ok: false, error: "Pick a day in the next week." };
  const start = lagosTime(day, startHour);
  const end = lagosTime(day, startHour + 2);
  if (start.getTime() < now.getTime() + PICKUP_NOTICE_MINUTES * 60_000) return { ok: false, error: "That's too soon for a rider to get there. Pick a time at least an hour from now." };
  return { ok: true, slot: { key: "custom", label: `${dayWord(day, now, true)} ${windowWords(start, end)}`, start: start.toISOString(), end: end.toISOString() } };
}

/** The slot a supplier picked: one of today's choices by key, or their own time. */
export function resolvePickupSlot(choice: { key: string; day?: string | null; startHour?: number | null }, now: Date = new Date()): { ok: true; slot: PickupSlot } | { ok: false; error: string } {
  if (choice.key === "custom") return customSlot(String(choice.day ?? ""), Number(choice.startHour), now);
  const slot = pickupSlots(now).slots.find((option) => option.key === choice.key);
  return slot ? { ok: true, slot } : { ok: false, error: "That time has passed. Pick another time." };
}

// ─── Window words ─────────────────────────────────────────────────────────────

function timeWord(date: Date, withSuffix: boolean) {
  const { hour, minute } = lagosParts(date);
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = withSuffix ? (hour < 12 ? "am" : "pm") : "";
  return `${h}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${suffix}`;
}

/** "12–4pm", "9am–12pm", "2:30–4pm" (Lagos time). */
export function windowWords(start: Date | string, end: Date | string) {
  const from = new Date(start);
  const to = new Date(end);
  const sameHalf = lagosParts(from).hour < 12 === lagosParts(to).hour < 12;
  // "12–4pm": noon reads fine without its own "pm".
  return `${timeWord(from, !sameHalf)}–${timeWord(to, true)}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "today", "tomorrow", "Friday", or "21 Oct" further out (capitalised when `capital`). */
export function dayWord(day: string, now: Date = new Date(), capital = false) {
  const today = lagosDay(now);
  const diff = Math.round((lagosTime(day, 12).getTime() - lagosTime(today, 12).getTime()) / DAY_MS);
  const date = lagosTime(day, 12);
  const parts = lagosParts(date);
  let word: string;
  if (diff === 0) word = "today";
  else if (diff === 1) word = "tomorrow";
  else if (diff === -1) word = "yesterday";
  else if (diff > 1 && diff < 7) word = WEEKDAYS[parts.weekday];
  else word = `${parts.day} ${MONTHS[parts.month - 1]}`;
  return capital ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** "Pick up 12–4pm today", "Pick up 9am–12pm tomorrow", "Pick up 2–4pm Friday". */
export function pickupWindowText(start: Date | string | null | undefined, end: Date | string | null | undefined, now: Date = new Date()) {
  if (!start || !end) return null;
  return `Pick up ${windowWords(start, end)} ${dayWord(lagosDay(new Date(start)), now)}`;
}

// ─── Delivery company ─────────────────────────────────────────────────────────

export interface PartnerChoice {
  id: string;
  city: string;
  coverageZones: string[];
  status: string;
  verificationStatus: string;
  reliabilityScore?: number;
  rating?: number;
}

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();

/** The partner works where the parcel is collected (their city, or one of their areas names it). */
export function partnerCovers(partner: PartnerChoice, area: { city?: string | null; state?: string | null }) {
  const places = [norm(area.city), norm(area.state)].filter(Boolean);
  if (!places.length) return false;
  if (places.includes(norm(partner.city))) return true;
  return partner.coverageZones.some((zone) => {
    const name = norm(zone);
    return Boolean(name) && places.some((place) => name === place || name.includes(place) || place.includes(name));
  });
}

function usable(partner: PartnerChoice | undefined | null): partner is PartnerChoice {
  return Boolean(partner) && partner!.status === "active" && partner!.verificationStatus === "verified";
}

/**
 * Who collects a supplier's parcel: the shop's chosen delivery company, else the platform's default one
 * (SHOPINBOS_DEFAULT_DELIVERY_PARTNER_ID), else the most reliable company covering the area. Only active
 * ("taking new jobs") verified companies that cover the pickup area. Null: nobody covers it, the admin team finds one.
 */
export function choosePickupPartner(input: { preferredId?: string | null; defaultId?: string | null; partners: PartnerChoice[]; area: { city?: string | null; state?: string | null } }): { id: string; why: "shop" | "default" | "best" } | null {
  const byId = new Map(input.partners.map((partner) => [partner.id, partner]));
  const fits = (partner: PartnerChoice | undefined) => usable(partner) && partnerCovers(partner, input.area);
  if (input.preferredId && fits(byId.get(input.preferredId))) return { id: input.preferredId, why: "shop" };
  if (input.defaultId && fits(byId.get(input.defaultId))) return { id: input.defaultId, why: "default" };
  const best = input.partners
    .filter(fits)
    .sort((a, b) => (b.reliabilityScore ?? 0) - (a.reliabilityScore ?? 0) || (b.rating ?? 0) - (a.rating ?? 0) || a.id.localeCompare(b.id))[0];
  return best ? { id: best.id, why: "best" } : null;
}

// ─── The delivery job ─────────────────────────────────────────────────────────

export interface PickupJobInput {
  kind: SupplierOrderKind;
  /** "DS-1A2B3C": what the supplier and rider call the parcel. */
  ref: string;
  /** The label: the shop's name, never the supplier's. */
  shopName: string;
  pickupAddress: string;
  dropoff: { name: string; phone?: string | null; lines: string[] };
  items: Array<{ name: string; quantity: number }>;
  /** Cash the rider collects at the door (pay when it arrives), else 0. */
  collect: number;
  window: { start: Date | string; end: Date | string };
  deliveryFee: number;
  /** The store order, for dropship (keeps the shop's order in step with the rider). */
  retailOrderId?: string | null;
}

/** What goes into DeliveryBooking for a supplier pickup (the existing job shape, plus the pickup window). */
export function buildPickupJob(input: PickupJobInput) {
  const items = input.items.filter((item) => item.quantity > 0);
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  const shop = input.shopName.trim() || "the shop";
  const what = items.map((item) => `${item.quantity} × ${item.name}`).join(", ").slice(0, 200);
  const start = new Date(input.window.start);
  const end = new Date(input.window.end);
  return {
    pickupLocation: input.pickupAddress.trim().slice(0, 300),
    destination: [input.dropoff.name, ...input.dropoff.lines].filter(Boolean).join(", ").slice(0, 300) || "Address with the shop",
    packageDetails: {
      description: `Parcel for ${shop}${what ? `: ${what}` : ""}`.slice(0, 240),
      label: shop,
      ref: input.ref,
      units,
      source: input.kind === "dropship" ? "supplier_dropship" : "supplier_bulk",
    },
    deliveryFee: Math.max(0, Math.round(input.deliveryFee * 100) / 100),
    codAmount: input.collect > 0 ? Math.round(input.collect * 100) / 100 : null,
    pickupWindowStart: start,
    pickupWindowEnd: end,
    orderId: input.kind === "dropship" ? input.retailOrderId ?? null : null,
    notes: `Collect ${input.ref} from the supplier. Label: ${shop}.${input.dropoff.phone ? ` Customer: ${input.dropoff.phone}.` : ""}`.slice(0, 500),
  };
}

// ─── Pickup state the supplier sees ───────────────────────────────────────────

/** Pickup statuses: a job is booked, or we're still finding a rider, or it's done with. */
export const PICKUP_OPEN = ["booked", "finding_rider"] as const;

/** The supplier can still move or cancel the pickup: nobody has taken the job with a rider yet. */
export function pickupChangeable(pickup: { status: string } | null | undefined, job: { status: string; riderId: string | null } | null | undefined) {
  if (!pickup || !(PICKUP_OPEN as readonly string[]).includes(pickup.status)) return false;
  if (!job) return true;
  return (job.status === "pending" || job.status === "confirmed") && !job.riderId;
}

/** What the supplier reads after booking. */
export function pickupMessage(pickup: { status: string; windowStart: Date | string; windowEnd: Date | string }, job: { status: string; riderName?: string | null } | null, now: Date = new Date()) {
  const when = pickupWindowText(pickup.windowStart, pickup.windowEnd, now)?.replace(/^Pick up/, "pick up") ?? "";
  if (pickup.status === "finding_rider") return { title: "We'll find a rider and message you", body: `You asked for ${when.replace(/^pick up /, "")}. No delivery company covers your area yet, so our team is finding one.` };
  if (job?.status === "picked_up" || job?.status === "in_transit") return { title: "The rider has it", body: "It's on the way to the customer." };
  if (job?.riderName) return { title: `${job.riderName} is coming`, body: `Rider booked: ${when}. Have the parcel ready.` };
  return { title: `Rider booked: ${when}`, body: "We'll message you when they're on the way." };
}
