// Website leads (shopinbos.com forms): request signing and input checks. Pure so tests can use them.
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const LEAD_KINDS = ["newsletter", "sunday", "trending", "download", "tool", "contact", "popup", "signup_start", "waitlist", "app_notify"] as const;
export const LEAD_STATUSES = ["new", "contacted", "converted", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** How old a signed request may be (replays are refused after this). */
export const MAX_SKEW_SECONDS = 600;

export function signLead(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** "ok", "unconfigured" (no secret set: refuse everything), "stale" or "denied". */
export function checkLeadSignature(
  secret: string | null | undefined,
  timestamp: string | null,
  signature: string | null,
  body: string,
  now = Date.now(),
): "ok" | "unconfigured" | "stale" | "denied" {
  if (!secret) return "unconfigured";
  if (!timestamp || !signature || !/^\d{9,12}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return "denied";
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) return "stale";
  const expected = Buffer.from(signLead(secret, timestamp, body), "hex");
  const sent = Buffer.from(signature, "hex");
  return sent.length === expected.length && timingSafeEqual(sent, expected) ? "ok" : "denied";
}

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const WebsiteLeadInput = z.object({
  id: z.string().trim().min(6).max(80),
  kind: z.enum(LEAD_KINDS),
  name: text(120),
  email: z.string().trim().toLowerCase().email().max(190).optional().nullable().or(z.literal("")).transform((v) => v || null),
  phone: text(32),
  message: text(5000),
  source: z.string().trim().max(190).default(""),
  pageUrl: text(500),
  consent: z.boolean().default(false),
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime().optional(),
}).refine((v) => v.email || v.phone || v.message, { message: "A lead needs an email, a phone number or a message." });

export type WebsiteLeadInputType = z.infer<typeof WebsiteLeadInput>;

/** Nigerian numbers in one shape (+234…) so the same person is easy to spot. Others are kept as typed. */
export function normalisePhone(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/[^\d+]/g, "");
  const local = digits.replace(/^\+?234/, "").replace(/^0/, "");
  if (/^[789]\d{9}$/.test(local)) return `+234${local}`;
  return digits || null;
}

export const KIND_LABELS: Record<string, string> = {
  newsletter: "Newsletter",
  sunday: "WhatsApp tips",
  trending: "Trending every Monday",
  download: "Guide download",
  tool: "Tool result",
  contact: "Contact form",
  popup: "Pop-up",
  signup_start: "Started sign-up",
  waitlist: "Waitlist",
  app_notify: "App launch alert",
};

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Signed up",
  closed: "Closed",
};

/** One CSV cell, quoted, with formula characters neutralised so spreadsheets don't run them. */
export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
