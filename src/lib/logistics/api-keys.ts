import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { canWorkExistingJobs } from "./job-rules";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { bearerApiKey, generateApiKey, hashApiKey, shouldTouchLastUsed } from "./partner-api-core";

// API keys for delivery partners' dispatch systems. The full key is shown once; we keep its SHA-256 hash, so a
// lookup by hash is the comparison (no secret is ever compared character by character).

export const PARTNER_RATE_LIMIT = { maxRequests: 120, windowMs: 60_000 };

export type ApiPartner = { id: string; displayName: string; keyId: string };

export async function createPartnerApiKey(partnerId: string, name: string) {
  const { key, prefix, keyHash } = generateApiKey();
  const row = await db.partnerApiKey.create({
    data: { logisticsPartnerId: partnerId, name: name.trim().slice(0, 60) || "Dispatch system", prefix, keyHash },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });
  return { ...row, key };
}

export async function revokePartnerApiKey(partnerId: string, keyId: string) {
  const result = await db.partnerApiKey.updateMany({ where: { id: keyId, logisticsPartnerId: partnerId, revokedAt: null }, data: { revokedAt: new Date() } });
  return result.count > 0;
}

type Verified = { ok: true; partner: ApiPartner } | { ok: false; status: number; code: string; message: string };

export async function verifyPartnerKey(authorization: string | null): Promise<Verified> {
  const key = bearerApiKey(authorization);
  if (!key) return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Send your API key as Authorization: Bearer sbp_live_..." };

  const row = await db.partnerApiKey.findUnique({
    where: { keyHash: hashApiKey(key) },
    select: {
      id: true, lastUsedAt: true, revokedAt: true,
      logisticsPartner: { select: { id: true, displayName: true, status: true, verificationStatus: true } },
    },
  });
  if (!row || row.revokedAt) return { ok: false, status: 401, code: "UNAUTHORIZED", message: "This API key is not valid or has been revoked." };
  const partner = row.logisticsPartner;
  // "paused" = the partner switched off "Taking new jobs"; "suspended" = the team took them out of checkout. Either
  // way their software still updates the jobs they already have.
  if (!["active", "paused", "suspended"].includes(partner.status) || !canWorkExistingJobs(partner)) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "Your partner account isn't active and verified yet." };
  }

  if (shouldTouchLastUsed(row.lastUsedAt)) {
    await db.partnerApiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => null);
  }
  return { ok: true, partner: { id: partner.id, displayName: partner.displayName, keyId: row.id } };
}

type PartnerHandler<P> = (req: NextRequest, ctx: { partner: ApiPartner; params: P }) => Promise<NextResponse>;

/** Route handler wrapper: checks the partner key, rate-limits per key (120 a minute) and resolves params. */
export function withPartnerKey<P = Record<string, string>>(handler: PartnerHandler<P>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Next passes each route's own params shape
  return async (req: NextRequest, context: { params: Promise<any> }) => {
    const verified = await verifyPartnerKey(req.headers.get("authorization"));
    if (!verified.ok) return apiError(verified.code, verified.message, verified.status);

    const limit = checkRateLimit(`partner-api:${verified.partner.keyId}`, PARTNER_RATE_LIMIT);
    if (!limit.allowed) {
      const response = apiError("RATE_LIMITED", "Too many requests. Slow down and try again shortly.", 429);
      response.headers.set("Retry-After", String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))));
      return response;
    }

    try {
      const response = await handler(req, { partner: verified.partner, params: ((await context?.params) ?? {}) as P });
      response.headers.set("X-RateLimit-Remaining", String(limit.remaining));
      return response;
    } catch (error) {
      console.error("[partner-api]", error);
      return apiError("INTERNAL_ERROR", "Something went wrong on our side. Try again.", 500);
    }
  };
}
