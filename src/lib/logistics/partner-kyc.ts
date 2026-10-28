// Delivery partner verification steps (shared/partner-tiers.ts has the tier rules): the pure parts of the partner's
// own checks, used by the /api/logistics/kyc routes (src/lib/logistics/partner-kyc.server.ts). No "@/" imports and only node:crypto, so tests/partner-kyc.test.mjs loads it directly.
//
// Nothing here keeps a whole ID or account number: a NIN is stored as its last 4 digits plus a keyed hash (to spot one
// ID on several accounts).

import { createHmac } from "node:crypto";

/** Phone codes for the partner's own phone, and the email code. */
export const KYC_CODE_SEND_LIMIT = { maxRequests: 3, windowMs: 10 * 60 * 1000 };
/** NIN and BVN checks cost money: a few a day per partner. */
export const DAILY_ID_CHECKS = 3;

export function keyedHash(secret: string, purpose: string, value: string) {
  return createHmac("sha256", secret).update(`partner-kyc:${purpose}:${value}`).digest("hex");
}

/** Keyed hash of a NIN or BVN (never the number itself). */
export function idNumberHash(secret: string, kind: "nin" | "bvn", digits: string) {
  return keyedHash(secret, kind, digits);
}

/** Just the digits, when there are exactly `length` of them. */
export function digitsOf(value: unknown, length: number): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === length ? digits : null;
}

/** "YYYY-MM-DD" for a real past date, else null. */
export function cleanDateOfBirth(value: unknown, now = new Date()): string | null {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return null;
  const age = (now.getTime() - date.getTime()) / (365.25 * 86_400_000);
  return age >= 16 && age <= 100 ? text : null;
}

/** A name part as typed: letters, spaces, hyphens and apostrophes, 2 to 60 characters. */
export function cleanNamePart(value: unknown): string | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length >= 2 && text.length <= 60 && /^[\p{L}][\p{L}' .-]*$/u.test(text) ? text : null;
}

/** "ABC 123 XY" for a plate as typed, or null. */
export function cleanPlate(value: unknown): string | null {
  const text = String(value ?? "").toUpperCase().replace(/[^A-Z0-9 -]/g, "").replace(/\s+/g, " ").trim();
  return text.replace(/[\s-]/g, "").length >= 4 && text.length <= 16 ? text : null;
}

export function cleanEmail(value: unknown): string | null {
  const text = String(value ?? "").trim().toLowerCase();
  return text.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : null;
}

/** "+234 803 ••• ••12" */
export function maskPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 6) return "";
  return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ••• ••${digits.slice(-2)}`;
}

/** "ad•••@gmail.com" */
export function maskEmail(email: string | null | undefined): string {
  const [user, domain] = String(email ?? "").split("@");
  if (!user || !domain) return "";
  return `${user.slice(0, 2)}•••@${domain}`;
}

export function partnerPhoneCodeMessage(code: string) {
  return `Shopinbos: your delivery partner verification code is ${code}. Don't share it with anyone.`;
}

// ─── Selfie ──────────────────────────────────────────────────────────────────

/** The most a selfie may be once decoded (the phone and the browser shrink it first). */
export const SELFIE_MAX_BYTES = 3 * 1024 * 1024;
const SELFIE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type SelfieUpload = { ok: true; mimeType: string; ext: string; bytes: Buffer; dataUri: string } | { ok: false; error: string };

/** Reads the selfie the partner took ("data:image/jpeg;base64,…"): a JPEG, PNG or WebP photo, not too big. */
export function readSelfieDataUri(value: unknown): SelfieUpload {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { ok: false, error: "Take a selfie first." };
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(raw);
  if (!match) return { ok: false, error: "That selfie isn't a photo we can read. Take it again." };
  const mimeType = match[1];
  const base64 = match[2].replace(/\s+/g, "");
  if (base64.length > Math.ceil((SELFIE_MAX_BYTES * 4) / 3) + 4) return { ok: false, error: "That selfie is too big. Take it again." };
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 1024) return { ok: false, error: "That selfie is too small to check. Take it again." };
  if (bytes.length > SELFIE_MAX_BYTES) return { ok: false, error: "That selfie is too big. Take it again." };
  return { ok: true, mimeType, ext: SELFIE_TYPES[mimeType], bytes, dataUri: `data:${mimeType};base64,${base64}` };
}

/** The liveness result the browser or phone reported, or null. Only Korapay's reference is kept. */
export function readLivenessReport(value: unknown): { reference: string; passed: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const reference = typeof row.reference === "string" ? row.reference.trim() : "";
  if (!reference || reference.length > 120 || !/^[A-Za-z0-9_.:-]+$/.test(reference)) return null;
  return { reference, passed: row.passed === true };
}
