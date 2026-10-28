// "Do it on your phone": the link (QR code) that lets someone signed in on a computer take their selfie or ID photo
// on their phone without signing in there. The token is the credential: one person (their user id), one portal
// (delivery partner or supplier), one step (selfie or ID photo), and 20 minutes. Signed with the KYC secret through
// keyedHash, the same HMAC the NIN hashes use. Pure (relative imports and node:crypto only), so
// tests/phone-handoff.test.mjs loads it directly.

import { timingSafeEqual } from "node:crypto";
import { keyedHash } from "../logistics/partner-kyc.ts";

export const HANDOFF_KINDS = ["logistics", "supplier"] as const;
export type HandoffKind = (typeof HANDOFF_KINDS)[number];
export const HANDOFF_PURPOSES = ["selfie", "id"] as const;
export type HandoffPurpose = (typeof HANDOFF_PURPOSES)[number];

/** How long a phone link works. */
export const HANDOFF_TTL_MS = 20 * 60_000;

export interface Handoff {
  kind: HandoffKind;
  purpose: HandoffPurpose;
  /** The account's User id. */
  userId: string;
  expiresAt: number;
}

export function isHandoffPurpose(value: unknown): value is HandoffPurpose {
  return (HANDOFF_PURPOSES as readonly unknown[]).includes(value);
}

function signature(secret: string, payload: string) {
  return Buffer.from(keyedHash(secret, "handoff", payload), "hex").toString("base64url");
}

/** A token for this person's step: "<payload>.<signature>", both base64url. */
export function signHandoff(secret: string, input: Omit<Handoff, "expiresAt">, now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = now + HANDOFF_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ k: input.kind, p: input.purpose, u: input.userId, e: expiresAt })).toString("base64url");
  return { token: `${payload}.${signature(secret, payload)}`, expiresAt };
}

/** The handoff a token stands for, or why it doesn't work. */
export function readHandoff(secret: string, token: unknown, now = Date.now()): { ok: true; handoff: Handoff } | { ok: false; reason: "invalid" | "expired" } {
  if (typeof token !== "string" || token.length > 600) return { ok: false, reason: "invalid" };
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(signature(secret, payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "invalid" };
  let data: { k?: unknown; p?: unknown; u?: unknown; e?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!(HANDOFF_KINDS as readonly unknown[]).includes(data.k) || !isHandoffPurpose(data.p) || typeof data.u !== "string" || !data.u || typeof data.e !== "number") {
    return { ok: false, reason: "invalid" };
  }
  if (data.e <= now) return { ok: false, reason: "expired" };
  return { ok: true, handoff: { kind: data.k as HandoffKind, purpose: data.p, userId: data.u, expiresAt: data.e } };
}

/** The phone page for a token. */
export function handoffPath(token: string) {
  return `/verify/phone/${encodeURIComponent(token)}`;
}

/** "Has the selfie (or ID photo) changed since the QR code was shown?": a document's upload and status times. */
export function docStamp(doc: { uploadedAt?: string | null; updatedAt?: string | null; status?: string | null } | null | undefined) {
  return doc ? `${doc.uploadedAt ?? ""}|${doc.updatedAt ?? ""}|${doc.status ?? ""}` : "";
}
