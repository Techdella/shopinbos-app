import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashRiderToken, isRiderTokenShape } from "./rider-token";

// The Riders app has no login: the private link's token is the credential. Every page load and every
// action looks the rider up again from the token, so revoking the link or deactivating the rider is instant.

export type RiderSession = {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: Date | null;
  partnerId: string;
  partnerName: string;
  partnerPhone: string | null;
};

export type RiderLookup = { ok: true; rider: RiderSession } | { ok: false; reason: "invalid" | "limited" };

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function riderFromToken(token: string): Promise<RiderLookup> {
  const ip = await clientIp();
  // Tokens are 256-bit random, so this is about load, not guessing: cap lookups per caller.
  if (!checkRateLimit(`rider:ip:${ip}`, { maxRequests: 120, windowMs: 60_000 }).allowed) return { ok: false, reason: "limited" };
  if (!isRiderTokenShape(token)) return { ok: false, reason: "invalid" };

  const member = await db.logisticsTeamMember.findUnique({
    where: { riderTokenHash: hashRiderToken(token) },
    select: {
      id: true, name: true, role: true, status: true, online: true, lastSeenAt: true, logisticsPartnerId: true,
      logisticsPartner: { select: { displayName: true, whatsappNumber: true, status: true } },
    },
  });
  if (!member || member.status !== "active" || member.role !== "rider") return { ok: false, reason: "invalid" };

  const now = new Date();
  await db.logisticsTeamMember.update({ where: { id: member.id }, data: { lastSeenAt: now } });
  return {
    ok: true,
    rider: {
      id: member.id,
      name: member.name,
      online: member.online,
      lastSeenAt: now,
      partnerId: member.logisticsPartnerId,
      partnerName: member.logisticsPartner.displayName,
      partnerPhone: member.logisticsPartner.whatsappNumber,
    },
  };
}
