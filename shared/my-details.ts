// "My details": the one place every account (seller, supplier, delivery partner) changes its own name, email and
// phone, and the business's name, phone, address, city and state. Shared by the API (/api/app/me/details, …/email,
// …/phone), the web pages (/home/details, /supplier/details, /logistics/details) and the phone app's
// app/my-details.tsx. Pure, no imports beyond ./phone.ts, so tests/my-details.test.mjs loads it directly.
import { phoneKey } from "./phone.ts";

export type DetailsRole = "seller" | "supplier" | "logistics_partner" | "admin";

/** The business fields every role edits here, whatever each one's own table calls them. */
export const BUSINESS_FIELDS = ["name", "phone", "address", "city", "state"] as const;
export type BusinessField = (typeof BUSINESS_FIELDS)[number];
export type BusinessDetails = Record<BusinessField, string>;

/** Longest each business field may be (the smallest column it is saved in). */
export const BUSINESS_LIMITS: Record<BusinessField, number> = { name: 120, phone: 20, address: 200, city: 60, state: 40 };

/** What the details screens show; `business` is null for an account with no shop or business yet (and admins). */
export interface MyDetails {
  role: DetailsRole;
  me: {
    name: string;
    email: string | null;
    /** The number the account signs in with (Supabase) or, without one, the one saved on the account. */
    phone: string | null;
    avatarUrl: string | null;
    /** A new email waiting for the person to open the confirmation link, else null. */
    pendingEmail: string | null;
  };
  business: (BusinessDetails & { logoUrl: string | null }) | null;
  /** A seller's staff member changes only their own details; the shop's are the owner's. */
  canEditBusiness: boolean;
}

/**
 * Which word each role uses for its business, for the section title and labels ("Your shop", "Your business",
 * "Your company"). Keys in the `details` namespace: `biz.<kind>.title`, `biz.<kind>.name`, `biz.<kind>.address`.
 */
export function businessKind(role: DetailsRole): "shop" | "supplier" | "partner" | null {
  if (role === "seller") return "shop";
  if (role === "supplier") return "supplier";
  if (role === "logistics_partner") return "partner";
  return null;
}

/** Where each role's web "My details" page lives (the account menu and settings link to it). */
export const DETAILS_HREF: Record<DetailsRole, string> = {
  seller: "/home/details",
  supplier: "/supplier/details",
  logistics_partner: "/logistics/details",
  admin: "/admin/settings",
};

const clean = (value: unknown, max: number) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);

/** The business form as the screens keep it: every field a string, trimmed and capped. */
export function businessForm(input: Partial<Record<BusinessField, unknown>> | null | undefined): BusinessDetails {
  return Object.fromEntries(BUSINESS_FIELDS.map((field) => [field, clean(input?.[field], BUSINESS_LIMITS[field])])) as BusinessDetails;
}

/** Only the fields that changed (compared trimmed), so a save never rewrites what wasn't touched. */
export function businessChanges(saved: Partial<Record<BusinessField, unknown>> | null | undefined, form: Partial<Record<BusinessField, unknown>>): Partial<BusinessDetails> {
  const before = businessForm(saved);
  const after = businessForm(form);
  return Object.fromEntries(BUSINESS_FIELDS.filter((field) => field in form && before[field] !== after[field]).map((field) => [field, after[field]])) as Partial<BusinessDetails>;
}

/** Emails compare without case or spaces. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined) {
  const left = (a ?? "").trim().toLowerCase();
  return Boolean(left) && left === (b ?? "").trim().toLowerCase();
}

/** Phones compare by their last 10 digits ("0803…" and "+234 803…" are the same number), like one-account-per-number. */
export function samePhone(a: string | null | undefined, b: string | null | undefined) {
  const left = phoneKey(a);
  return Boolean(left) && left === phoneKey(b);
}

/** The signed code challenge for a new sign-in phone is only good for this account (src/lib/commerce/phone-verify.ts). */
export function accountPhoneScope(userId: string) {
  return `account-phone:${userId}`;
}

/** The SMS that carries the code (WhatsApp sends only the code). */
export function accountPhoneCodeMessage(code: string) {
  return `Shopinbos: your code to change your phone number is ${code}. Don't share it with anyone.`;
}

/** At most this many codes per account in 10 minutes, and email change links per hour. */
export const PHONE_CODE_LIMIT = { maxRequests: 3, windowMs: 10 * 60 * 1000 };
export const EMAIL_CHANGE_LIMIT = { maxRequests: 3, windowMs: 60 * 60 * 1000 };
