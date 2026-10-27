// Delivery partner verification steps (shared/partner-tiers.ts has the tier rules): the pure parts of the partner's
// own checks, used by the /api/logistics/kyc routes (src/lib/logistics/partner-kyc.server.ts) and the guarantor's
// confirm page. No "@/" imports and only node:crypto, so tests/partner-kyc.test.mjs loads it directly.
//
// Nothing here keeps a whole ID or account number: NIN and BVN are stored as their last 4 digits plus a keyed hash
// (to spot one ID on several accounts), and a guarantor's code and link token only as keyed hashes.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** A guarantor's code is good for 2 days (they may not answer at once); 5 wrong tries per code. */
export const GUARANTOR_CODE_TTL_MS = 48 * 60 * 60 * 1000;
export const GUARANTOR_MAX_ATTEMPTS = 5;
/** Wait between texts to the guarantor, and the most texts one guarantor gets. */
export const GUARANTOR_RESEND_SECONDS = 60;
export const GUARANTOR_MAX_SENDS = 5;

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

// ─── Guarantor ───────────────────────────────────────────────────────────────

/** The random part of the link the guarantor opens (/guarantor/<token>). Only its hash is stored. */
export function newGuarantorToken() {
  return randomBytes(24).toString("base64url");
}

export function guarantorTokenHash(secret: string, token: string) {
  return keyedHash(secret, "guarantor-token", token);
}

export function guarantorCodeHash(secret: string, guarantorId: string, code: string) {
  return keyedHash(secret, `guarantor-code:${guarantorId}`, code);
}

function sameHex(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type GuarantorCodeCheck = { ok: true } | { ok: false; reason: "expired" | "too_many" | "wrong_code" | "answered" };

/** Is this the guarantor's current code? */
export function checkGuarantorCode(
  guarantor: { id: string; status: string; codeHash: string | null; codeExpiresAt: Date | null; codeAttempts: number },
  code: string,
  secret: string,
  now = Date.now(),
): GuarantorCodeCheck {
  if (guarantor.status !== "pending") return { ok: false, reason: "answered" };
  if (!guarantor.codeHash || !guarantor.codeExpiresAt || guarantor.codeExpiresAt.getTime() < now) return { ok: false, reason: "expired" };
  if (guarantor.codeAttempts >= GUARANTOR_MAX_ATTEMPTS) return { ok: false, reason: "too_many" };
  const digits = digitsOf(code, 6);
  if (!digits) return { ok: false, reason: "wrong_code" };
  return sameHex(guarantorCodeHash(secret, guarantor.id, digits), guarantor.codeHash) ? { ok: true } : { ok: false, reason: "wrong_code" };
}

/** Seconds until another text may go to the guarantor (0: now), or null when they've had as many as they get. */
export function guarantorResendWait(guarantor: { lastSentAt: Date | null; sendCount: number }, now = Date.now()): number | null {
  if (guarantor.sendCount >= GUARANTOR_MAX_SENDS) return null;
  if (!guarantor.lastSentAt) return 0;
  return Math.max(0, Math.ceil((guarantor.lastSentAt.getTime() + GUARANTOR_RESEND_SECONDS * 1000 - now) / 1000));
}

/** The text to the guarantor: who named them, the code, and the link to answer. */
export function guarantorMessage(partnerName: string, code: string, link: string) {
  const name = String(partnerName ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "A delivery partner";
  return `${name} named you as their guarantor on Shopinbos. Your code is ${code}. Open ${link} to confirm or decline. Don't share this code.`;
}

export function partnerPhoneCodeMessage(code: string) {
  return `Shopinbos: your delivery partner verification code is ${code}. Don't share it with anyone.`;
}
