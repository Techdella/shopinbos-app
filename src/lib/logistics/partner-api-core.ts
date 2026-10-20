import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Pure parts of the delivery partner API: key format, webhook signatures, event envelopes, the job shape partners
// see and the cash pay-in allocation. No database and no path aliases, so tests/behaviour.test.mjs can import it.

export const API_KEY_PREFIX = "sbp_live_";
export const PARTNER_EVENTS = ["job.offered", "job.updated", "job.cancelled", "cod.reminder"] as const;
export type PartnerEventName = (typeof PARTNER_EVENTS)[number];

const KEY_PATTERN = /^sbp_live_[A-Za-z0-9_-]{32}$/;

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** A new key: shown to the partner once; only the hash and a short prefix are stored. */
export function generateApiKey(bytes: (size: number) => Buffer = randomBytes) {
  const key = `${API_KEY_PREFIX}${bytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, API_KEY_PREFIX.length + 6), keyHash: hashApiKey(key) };
}

export function isApiKeyFormat(key: string) {
  return KEY_PATTERN.test(key);
}

/** The key from `Authorization: Bearer sbp_live_...`, or null when the header isn't a partner key. */
export function bearerApiKey(header: string | null | undefined) {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return match && isApiKeyFormat(match[1]) ? match[1] : null;
}

/** lastUsedAt is written at most once a minute per key, not on every call. */
export function shouldTouchLastUsed(lastUsedAt: Date | null, now = new Date(), everyMs = 60_000) {
  return !lastUsedAt || now.getTime() - lastUsedAt.getTime() >= everyMs;
}

export function generateWebhookSecret(bytes: (size: number) => Buffer = randomBytes) {
  return `whsec_${bytes(24).toString("base64url")}`;
}

/** `Shopinbos-Signature` header value: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">. */
export function signWebhook(secret: string, body: string, timestamp: number) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

/** What a partner runs on their side; kept here so the docs snippet and the signer can't drift. */
export function verifyWebhookSignature(secret: string, body: string, header: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = Buffer.from(signWebhook(secret, body, t).split("v1=")[1], "hex");
  const given = Buffer.from(parts.v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function buildEventEnvelope(type: string, data: Record<string, unknown>, opts: { id?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  return { id: opts.id ?? `evt_${randomBytes(12).toString("hex")}`, type, created: Math.floor(now.getTime() / 1000), data };
}

/** A webhook with no events selected gets every event. */
export function webhookWants(events: string[], event: string) {
  return events.length === 0 || events.includes(event);
}

export function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[.*\])$/i;

/** Webhook targets must be public https URLs (no localhost, private ranges or raw IPv6), so they can't probe our network. */
export function isAllowedWebhookUrl(value: string) {
  if (!isHttpsUrl(value) || value.length > 500) return false;
  return !PRIVATE_HOST.test(new URL(value).hostname);
}

/** Backoff between webhook retries inside one request lifetime. */
export const WEBHOOK_RETRY_DELAYS_MS = [2_000, 10_000, 30_000];

// ─── Job shape partners see ──────────────────────────────────────────────────

const BUYER_VISIBLE = new Set(["confirmed", "picked_up", "in_transit", "out_for_delivery", "at_pickup_point", "delivered", "failed"]);

export interface PartnerJobSource {
  id: string;
  status: string;
  pickupLocation: string;
  destination: string;
  packageDetails: unknown;
  deliveryFee: number;
  currency: string;
  codAmount: number | null;
  codCollected?: number | null;
  codMethod?: string | null;
  trackingCode: string | null;
  estimatedDelivery?: Date | null;
  pickedUpAt?: Date | null;
  deliveredAt?: Date | null;
  failedReason?: string | null;
  proofUrl?: string | null;
  createdAt: Date;
  rider?: { id: string; name: string; phone: string | null } | null;
  /** Supplier pickups: when the rider should collect it. */
  pickupWindowStart?: Date | null;
  pickupWindowEnd?: Date | null;
}

/**
 * The job as the API returns it and webhooks carry it. Never the buyer's email; the buyer's name and phone only
 * once the partner has accepted the job.
 */
export function partnerJob(job: PartnerJobSource, buyer?: { name: string | null; phone: string | null } | null) {
  const pkg = job.packageDetails && typeof job.packageDetails === "object" ? (job.packageDetails as Record<string, unknown>) : {};
  return {
    id: job.id,
    status: job.status,
    pickup: job.pickupLocation,
    destination: job.destination,
    package: {
      description: typeof pkg.description === "string" ? pkg.description : null,
      weight: typeof pkg.weight === "number" ? pkg.weight : null,
      fragile: pkg.fragile === true,
    },
    fee: { amount: job.deliveryFee, currency: job.currency },
    codAmount: job.codAmount ?? null,
    cod: job.codCollected != null ? { collected: job.codCollected, method: job.codMethod ?? null } : null,
    trackingCode: job.trackingCode,
    estimatedDelivery: job.estimatedDelivery?.toISOString() ?? null,
    pickupWindow: job.pickupWindowStart && job.pickupWindowEnd ? { start: job.pickupWindowStart.toISOString(), end: job.pickupWindowEnd.toISOString() } : null,
    pickedUpAt: job.pickedUpAt?.toISOString() ?? null,
    deliveredAt: job.deliveredAt?.toISOString() ?? null,
    failedReason: job.failedReason ?? null,
    proofUrl: job.proofUrl ?? null,
    rider: job.rider ? { id: job.rider.id, name: job.rider.name, phone: job.rider.phone } : null,
    buyer: buyer && BUYER_VISIBLE.has(job.status) ? { name: buyer.name ?? null, phone: buyer.phone ?? null } : null,
    createdAt: job.createdAt.toISOString(),
  };
}
