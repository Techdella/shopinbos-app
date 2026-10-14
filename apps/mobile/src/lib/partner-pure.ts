// Pure helpers for the supplier, delivery partner and rider sides of the app: which screens each role may
// open, where each role lands, rider link parsing and the status words. No imports, so
// tests/mobile-partners.test.mjs loads this file directly.

export type AppRole = "seller" | "supplier" | "logistics_partner" | "admin";
export type Area = "public" | "seller" | "supplier" | "logistics" | "rider" | "admin";

/** Where each role starts. Sellers go through the launch gate (onboarding or Home). */
export function homeFor(role: AppRole | null | undefined): string {
  if (role === "supplier") return "/supplier/home";
  if (role === "logistics_partner") return "/logistics/home";
  if (role === "admin") return "/web-only";
  return "/home";
}

const PUBLIC = ["/", "/welcome", "/login", "/signup", "/verify", "/forgot", "/web-only"];
/** Help (a person on WhatsApp, the chat with the team), "Ask us to set it up" and Notifications are for every role. */
const SHARED = ["/help", "/ask-us", "/notifications"];

/** Which part of the app a path belongs to. Everything outside the partner areas is the seller app. */
export function areaOf(pathname: string): Area {
  const path = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  if (PUBLIC.includes(path) || path.startsWith("/auth/")) return "public";
  if (SHARED.some((shared) => path === shared || path.startsWith(`${shared}/`))) return "public";
  if (path === "/supplier" || path.startsWith("/supplier/")) return "supplier";
  if (path === "/logistics" || path.startsWith("/logistics/")) return "logistics";
  if (path === "/rider" || path.startsWith("/rider/")) return "rider";
  return "seller";
}

const AREA_ROLE: Record<"seller" | "supplier" | "logistics", AppRole> = { seller: "seller", supplier: "supplier", logistics: "logistics_partner" };

/**
 * Whether someone may stay on a path. Public screens and the Riders app (which uses its own link, not an
 * account) are open; each tab group only to its own role. Null role = not signed in or not known yet.
 */
export function canVisit(role: AppRole | null | undefined, pathname: string): boolean {
  const area = areaOf(pathname);
  if (area === "public" || area === "rider") return true;
  if (area === "admin") return role === "admin";
  return Boolean(role) && AREA_ROLE[area] === role;
}

/** A role string from anywhere (JWT metadata, the sync-user answer, storage). */
export function asRole(value: unknown): AppRole | null {
  return value === "seller" || value === "supplier" || value === "logistics_partner" || value === "admin" ? value : null;
}

/** The sign-up choice ("I sell / I supply shops / I deliver"). */
export type SignupRole = Exclude<AppRole, "admin">;

export const SIGNUP_ROLES: Array<{ role: SignupRole; tab: string; title: string; sub: string }> = [
  { role: "seller", tab: "I sell", title: "Your shop, live in 10 minutes", sub: "Tell Rex what you sell. Sell on your own link, WhatsApp and Instagram. Free to start." },
  { role: "supplier", tab: "I supply shops", title: "Your products in hundreds of shops", sub: "Sellers stock your products under their brand. You pack with their label and get paid after delivery." },
  { role: "logistics_partner", tab: "I deliver", title: "Deliveries from Shopinbos shops", sub: "Shops book you at checkout. Accept the job, assign a rider and get paid weekly." },
];

export function asSignupRole(value: unknown): SignupRole {
  return value === "supplier" || value === "logistics_partner" ? value : "seller";
}

/** The private Riders app link (https://…/rider/<token>, shopinbos://rider/<token>) or the bare token. */
export function parseRiderToken(text: string | null | undefined): string | null {
  const value = (text ?? "").trim();
  const match = value.match(/rider\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/) ?? value.match(/^([A-Za-z0-9_-]{43})$/);
  return match ? match[1] : null;
}

export type Tone = "accent" | "success" | "warning" | "muted" | "danger" | "info";

/**
 * The app-language translator (useT("m_partner", …) on the phone). Optional everywhere: without it the words are
 * English, so the root tests and old callers get the same text. Keys live in shared/i18n/messages/m_partner.
 */
export type Say = { dynamic(key: string, fallback?: string, vars?: Record<string, string | number | null | undefined>): string };

const say = (t: Say | undefined, key: string, english: string, vars?: Record<string, string | number>) =>
  t ? t.dynamic(key, english, vars) : english;

const JOB_STAGE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "New request", tone: "accent" },
  confirmed: { label: "Accepted, waiting for pickup", tone: "warning" },
  picked_up: { label: "Picked up", tone: "info" },
  in_transit: { label: "On the way", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  failed: { label: "Delivery failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export function jobStage(status: string, t?: Say) {
  const stage = JOB_STAGE[status];
  return stage ? { ...stage, label: say(t, `stage.job.${status}`, stage.label) } : { label: status.replace(/_/g, " "), tone: "muted" as Tone };
}

/** The next step button(s) on a job the partner has accepted, in pipeline order (same moves as job-rules.ts). */
export function jobNextSteps(status: string, t?: Say): Array<{ to: "picked_up" | "in_transit" | "delivered" | "confirmed"; label: string }> {
  const step = (to: "picked_up" | "in_transit" | "delivered" | "confirmed", label: string) => ({ to, label: say(t, `step.${to}`, label) });
  if (status === "confirmed") return [step("picked_up", "Picked up")];
  if (status === "picked_up") return [step("in_transit", "On the way"), step("delivered", "Delivered")];
  if (status === "in_transit") return [step("delivered", "Delivered")];
  if (status === "failed") return [step("confirmed", "Try again")];
  return [];
}

export function canFail(status: string) {
  return status === "confirmed" || status === "picked_up" || status === "in_transit";
}

export const FAIL_REASONS = ["Customer didn't pick up calls", "Customer not at the address", "Customer refused the parcel", "Wrong or incomplete address", "Customer couldn't pay"];

/** The reasons as choices: the value stays English (the shop and the company read it), the label is translated. */
export function failReasonOptions(t?: Say) {
  return FAIL_REASONS.map((reason, index) => ({ value: reason, label: say(t, `fail.${index}`, reason) }));
}

const ORDER_STAGE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "New", tone: "accent" },
  awaiting_payment: { label: "Pay on delivery", tone: "accent" },
  paid: { label: "To accept", tone: "accent" },
  confirmed: { label: "Accepted", tone: "warning" },
  accepted: { label: "Accepted, to send", tone: "warning" },
  rejected: { label: "Declined", tone: "muted" },
  processing: { label: "To pack", tone: "warning" },
  packed: { label: "Packed, waiting for rider", tone: "info" },
  shipped: { label: "With the rider", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "muted" },
  refunded: { label: "Refunded", tone: "muted" },
  returned: { label: "Returned", tone: "muted" },
};

export function orderStage(status: string) {
  return ORDER_STAGE[status] ?? { label: status.replace(/_/g, " "), tone: "muted" as Tone };
}

export const ORDER_ACTION_LABEL: Record<string, string> = { accept: "Accept", decline: "Decline", packed: "Mark packed", handed_over: "Handed to rider", delivered: "Mark delivered" };

const PRODUCT_STAGE: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "muted" },
  pending_review: { label: "In review", tone: "warning" },
  published: { label: "Live", tone: "success" },
  unpublished: { label: "Hidden", tone: "muted" },
  rejected: { label: "Needs changes", tone: "danger" },
};

export function productStage(status: string, t?: Say) {
  const stage = PRODUCT_STAGE[status];
  return stage ? { ...stage, label: say(t, `stage.product.${status}`, stage.label) } : { label: status, tone: "muted" as Tone };
}

const QUOTE_STAGE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for your price", tone: "accent" },
  responded: { label: "Quoted", tone: "info" },
  accepted: { label: "Won", tone: "success" },
  rejected: { label: "Declined", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
};

export function quoteStage(status: string, t?: Say) {
  const stage = QUOTE_STAGE[status];
  return stage ? { ...stage, label: say(t, `stage.quote.${status}`, stage.label) } : { label: status, tone: "muted" as Tone };
}

const VERIFICATION: Record<string, { label: string; tone: Tone; hint: string }> = {
  verified: { label: "Verified", tone: "success", hint: "Shops can see you're checked." },
  pending: { label: "Being checked", tone: "warning", hint: "We're reviewing your documents. This usually takes 1 to 2 working days." },
  unverified: { label: "Not verified yet", tone: "accent", hint: "Upload your CAC and ID so you can start taking orders." },
  rejected: { label: "Needs changes", tone: "danger", hint: "Some documents need another look. Check the notes and upload them again." },
  suspended: { label: "Paused", tone: "danger", hint: "Your account is paused. Contact support." },
};

export function verificationStage(status: string, t?: Say) {
  const key = VERIFICATION[status] ? status : "unverified";
  const stage = VERIFICATION[key];
  return { ...stage, label: say(t, `verify.${key}.label`, stage.label), hint: say(t, `verify.${key}.hint`, stage.hint) };
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(iso: string | null | undefined, now = Date.now(), t?: Say) {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return say(t, "ago.justNow", "just now");
  if (minutes < 60) return say(t, "ago.minutes", `${minutes} min ago`, { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return say(t, "ago.hours", `${hours} h ago`, { count: hours });
  const days = Math.round(hours / 24);
  return say(t, "ago.days", `${days} d ago`, { count: days });
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "today", "yesterday", "tomorrow", "Friday" for the last week, else "12 Oct" (and the year when it isn't this one),
 * in Lagos time. For dates in the supplier and delivery screens.
 */
export function dayWord(iso: string | null | undefined, now = Date.now(), t?: Say) {
  if (!iso) return "";
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "";
  const lagos = (ms: number) => Math.floor((ms + 60 * 60 * 1000) / 86_400_000);
  const diff = lagos(now) - lagos(time);
  if (diff === 0) return say(t, "day.today", "today");
  if (diff === 1) return say(t, "day.yesterday", "yesterday");
  if (diff === -1) return say(t, "day.tomorrow", "tomorrow");
  const date = new Date(time + 60 * 60 * 1000);
  const weekday = date.getUTCDay();
  if (diff > 1 && diff < 7) return say(t, `weekday.${weekday}`, WEEKDAYS[weekday]);
  const month = date.getUTCMonth();
  const sameYear = new Date(now + 60 * 60 * 1000).getUTCFullYear() === date.getUTCFullYear();
  return `${date.getUTCDate()} ${say(t, `month.${month}`, MONTHS[month])}${sameYear ? "" : ` ${date.getUTCFullYear()}`}`;
}

/** "Yaba" from "14 Herbert Macaulay Way, Yaba" for the short route line. */
export function shortPlace(place: string) {
  const parts = place.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : place.trim();
}

/** Whole naira from what someone typed ("12,500" → 12500); null when it isn't a positive amount. */
export function parseAmount(text: string): number | null {
  const value = Number(text.replace(/[,₦\s]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** A whole number of units from what someone typed; null when it isn't one. */
export function parseCount(text: string): number | null {
  const value = Number(text.replace(/[,\s]/g, ""));
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/** The picture on each Welcome card and on the "Sign up as …" badge (AppIcon names). */
export const ROLE_ICON = { seller: "store", supplier: "box", logistics_partner: "truck" } as const satisfies Record<SignupRole, string>;

/** A role from a link (?role=), only when it's one of the three sign-up choices; null means "not chosen yet". */
export function pickedSignupRole(value: unknown): SignupRole | null {
  return value === "seller" || value === "supplier" || value === "logistics_partner" ? value : null;
}
