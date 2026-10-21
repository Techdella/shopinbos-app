// Checkout phone check for delivery partners (spec §6.1: the customer gives "a verified phone number" so the partner's
// rider can reach them). The pure parts, no "@/" imports and only node:crypto, so tests/phone-verify.test.mjs loads
// it directly. The server side (sending the code, rate limits, the secret, when it is skipped) is
// ./phone-verify.server.ts; the routes are /api/public/store/[slug]/checkout/phone-code and /phone-verify.
//
// No table: everything the server needs travels in two signed strings.
//   challenge   what POST /phone-code returns after sending the 6-digit code. Signed payload
//               { p: phone (E.164), s: store id, h: keyed hash of the code, n: random nonce, e: expiry }, 10 minutes.
//               The code hash is an HMAC under the server secret (with the nonce, phone and store), never a plain
//               sha256: a 6-digit code has only a million values, so an unkeyed hash could be reversed offline.
//   phoneToken  what POST /phone-verify returns for the right code. Signed { p, s, e }, 24 hours. Checkout takes it
//               when the order goes with a delivery partner and refuses it for another phone or another store.
// Each string is `<payload>.<signature>`: base64url JSON, then an HMAC-SHA256 (base64url) over "<kind>:<payload>", so
// a challenge can never be passed off as a token or the other way round.

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

type Env = Record<string, string | undefined>;

export const PHONE_CODE_LENGTH = 6;
export const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
export const PHONE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** Wrong codes allowed per challenge (and the page waits this long before offering "Resend"). */
export const PHONE_CODE_MAX_ATTEMPTS = 5;
export const PHONE_CODE_RESEND_SECONDS = 45;

/** Only used outside production when no secret is set, so local dev works; production fails closed instead. */
const DEV_SECRET = "shopinbos-dev-checkout-phone";

/**
 * The HMAC key: CHECKOUT_PHONE_SECRET, else JWT_SECRET, else the Supabase service role key. Empty in production when
 * none is set (the routes then refuse: fail closed); a fixed dev key elsewhere.
 */
export function phoneVerifySecret(env: Env = process.env): string {
  const secret = env.CHECKOUT_PHONE_SECRET || env.JWT_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (secret) return secret;
  return env.NODE_ENV === "production" ? "" : DEV_SECRET;
}

/** A random 6-digit code ("004821" keeps its leading zeros). */
export function generatePhoneCode(): string {
  return String(randomInt(0, 10 ** PHONE_CODE_LENGTH)).padStart(PHONE_CODE_LENGTH, "0");
}

/** Just the digits a shopper typed ("123 456" → "123456"), or null when it isn't 6 of them. */
export function cleanPhoneCode(value: unknown): string | null {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return digits.length === PHONE_CODE_LENGTH ? digits : null;
}

/** The text message: names the store so the shopper knows why it came. "Mama's Kitchen: your delivery phone code is 123456…" */
export function phoneCodeMessage(storeName: string, code: string): string {
  const name = String(storeName ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "Shopinbos";
  return `${name}: your delivery phone code is ${code}. Don't share it with anyone.`;
}

type Kind = "challenge" | "token";

function sign(kind: Kind, payload: string, secret: string) {
  return createHmac("sha256", secret).update(`checkout-phone:${kind}:${payload}`).digest("base64url");
}

function sameText(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function seal(kind: Kind, data: Record<string, unknown>, secret: string) {
  if (!secret) throw new Error("No secret to sign the checkout phone check (set CHECKOUT_PHONE_SECRET or JWT_SECRET)");
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(kind, payload, secret)}`;
}

/** The payload when the signature is genuine, else null. Expiry is checked by the callers. */
function open(kind: Kind, value: unknown, secret: string): Record<string, unknown> | null {
  if (typeof value !== "string" || !secret || value.length > 2000) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  if (!sameText(sign(kind, payload, secret), signature)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function codeHash(input: { phone: string; storeId: string; nonce: string; code: string }, secret: string) {
  return createHmac("sha256", secret).update(`checkout-phone:code:${input.nonce}:${input.phone}:${input.storeId}:${input.code}`).digest("base64url");
}

/** The challenge for a code just sent to `phone` (E.164) for this store. */
export function createPhoneChallenge(input: { phone: string; storeId: string; code: string; now?: number }, secret: string): { challenge: string; nonce: string; expiresAt: number } {
  const nonce = randomBytes(12).toString("base64url");
  const expiresAt = (input.now ?? Date.now()) + PHONE_CODE_TTL_MS;
  const challenge = seal("challenge", { p: input.phone, s: input.storeId, h: codeHash({ ...input, nonce }, secret), n: nonce, e: expiresAt }, secret);
  return { challenge, nonce, expiresAt };
}

function readChallenge(challenge: unknown, expect: { phone: string; storeId: string; now?: number }, secret: string): { nonce: string; hash: string } | null {
  const data = open("challenge", challenge, secret);
  if (!data || typeof data.n !== "string" || typeof data.h !== "string" || typeof data.e !== "number") return null;
  if (data.p !== expect.phone || data.s !== expect.storeId || data.e < (expect.now ?? Date.now())) return null;
  return { nonce: data.n, hash: data.h };
}

/** The challenge's nonce (to count attempts against it) when it is genuine, for this phone and store, and not expired. */
export function readPhoneChallenge(challenge: unknown, expect: { phone: string; storeId: string; now?: number }, secret: string): { nonce: string } | null {
  const read = readChallenge(challenge, expect, secret);
  return read ? { nonce: read.nonce } : null;
}

export type ChallengeCheck = { ok: true } | { ok: false; reason: "invalid" | "wrong_code" };

/** Does `code` match the challenge? "invalid" covers a forged, expired, other-phone or other-store challenge. */
export function checkPhoneChallenge(input: { challenge: unknown; phone: string; storeId: string; code: unknown; now?: number }, secret: string): ChallengeCheck {
  const read = readChallenge(input.challenge, input, secret);
  if (!read) return { ok: false, reason: "invalid" };
  const code = cleanPhoneCode(input.code);
  if (!code) return { ok: false, reason: "wrong_code" };
  const expected = codeHash({ phone: input.phone, storeId: input.storeId, nonce: read.nonce, code }, secret);
  return sameText(expected, read.hash) ? { ok: true } : { ok: false, reason: "wrong_code" };
}

/** The proof checkout accepts: this phone was verified for this store, good for a day. */
export function createPhoneToken(input: { phone: string; storeId: string; now?: number }, secret: string): { phoneToken: string; expiresAt: number } {
  const expiresAt = (input.now ?? Date.now()) + PHONE_TOKEN_TTL_MS;
  return { phoneToken: seal("token", { p: input.phone, s: input.storeId, e: expiresAt }, secret), expiresAt };
}

/** True when the token is genuine, unexpired, and for exactly this phone (E.164) and store. */
export function verifyPhoneToken(token: unknown, expect: { phone: string | null | undefined; storeId: string; now?: number }, secret: string): boolean {
  if (!expect.phone) return false;
  const data = open("token", token, secret);
  if (!data || typeof data.e !== "number") return false;
  return data.p === expect.phone && data.s === expect.storeId && data.e >= (expect.now ?? Date.now());
}
