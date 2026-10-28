// Pure helpers for an owner's ID check (a NIN with a selfie matched against its photo), shared by any role that runs
// one. Only node:crypto, so tests load it directly. Nothing here keeps a whole ID number: a NIN is stored as its
// last 4 digits plus a keyed hash (to spot one ID on several accounts).
//
// The delivery partner flow has its own copy (src/lib/logistics/partner-kyc.ts); suppliers use these.

import { createHmac } from "node:crypto";

/** NIN checks cost money: a few a day per account. */
export const DAILY_ID_CHECKS = 3;

/** Keyed hash of an ID number, scoped by what it is ("supplier-nin"), never the number itself. */
export function idNumberHash(secret: string, purpose: string, digits: string) {
  return createHmac("sha256", secret).update(`kyc:${purpose}:${digits}`).digest("hex");
}

/** Just the digits, when there are exactly `length` of them. */
export function digitsOf(value: unknown, length: number): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === length ? digits : null;
}

/** "YYYY-MM-DD" for a real date 16 to 100 years ago, else null. */
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

/** The most a photo may be once decoded (the phone and the browser shrink it first). */
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type PhotoUpload = { ok: true; mimeType: string; ext: string; bytes: Buffer; dataUri: string } | { ok: false; error: string };

/** Reads a photo the person took ("data:image/jpeg;base64,…"): a JPEG, PNG or WebP, not too small or big. */
export function readPhotoDataUri(value: unknown, what = "photo"): PhotoUpload {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { ok: false, error: `Take the ${what} first.` };
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(raw);
  if (!match) return { ok: false, error: `That ${what} isn't a picture we can read. Take it again.` };
  const mimeType = match[1];
  const base64 = match[2].replace(/\s+/g, "");
  if (base64.length > Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 4) return { ok: false, error: `That ${what} is too big. Take it again.` };
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 1024) return { ok: false, error: `That ${what} is too small to check. Take it again.` };
  if (bytes.length > PHOTO_MAX_BYTES) return { ok: false, error: `That ${what} is too big. Take it again.` };
  return { ok: true, mimeType, ext: PHOTO_TYPES[mimeType], bytes, dataUri: `data:${mimeType};base64,${base64}` };
}

/** The liveness result the browser or phone reported, or null. Only Korapay's reference is kept. */
export function readLivenessReport(value: unknown): { reference: string; passed: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const reference = typeof row.reference === "string" ? row.reference.trim() : "";
  if (!reference || reference.length > 120 || !/^[A-Za-z0-9_.:-]+$/.test(reference)) return null;
  return { reference, passed: row.passed === true };
}
