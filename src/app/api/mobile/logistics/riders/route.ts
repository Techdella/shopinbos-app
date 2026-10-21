import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { isRiderOut } from "@/lib/logistics/job-rules";
import { bookingNet, lagosStartOfToday } from "@/components/logistics/kit";
import { getPublicEnv } from "@/lib/env";
import { newRiderToken } from "@/lib/logistics/rider-token";
import { isOnboardingComplete } from "@/lib/role-queries";
import { logisticsPlanLimits, logisticsTeamLimitMessage } from "@/lib/plan-limits";
import { atLimit } from "@shared/plans";
import { toE164 } from "@shared/phone";
import { riderWhereWords } from "@shared/delivery-geo";
import { partnerForUser } from "../_shared";

export const dynamic = "force-dynamic";

// Riders for the delivery partner app: who is out (online in the Riders app recently), what each one is carrying
// and has delivered today.
// POST { name, whatsapp, plate? } adds a rider with just a name and a WhatsApp number (spec 8A) and returns their private
// Riders app link plus a ready WhatsApp invite. Riders have no email; we store a placeholder the rider never sees.

export const GET = withLogistics(async (_req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);

  const now = new Date();
  const [riders, open, doneToday] = await Promise.all([
    db.logisticsTeamMember.findMany({
      where: { logisticsPartnerId: partner.id, role: "rider" },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: { id: true, name: true, phone: true, status: true, online: true, lastSeenAt: true, riderTokenHash: true, lastLat: true, lastLng: true, lastLocationAt: true, plate: true },
    }),
    db.deliveryBooking.groupBy({ by: ["riderId"], where: { logisticsPartnerId: partner.id, status: { in: ["confirmed", "picked_up", "in_transit", "out_for_delivery"] }, riderId: { not: null } }, _count: { _all: true } }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, status: "delivered", deliveredAt: { gte: lagosStartOfToday(now) }, riderId: { not: null } },
      select: { riderId: true, deliveryFee: true, platformFee: true, netAmount: true },
    }),
  ]);

  const openBy = new Map(open.map((row) => [row.riderId, row._count._all]));
  return ok({
    riders: riders.map((rider) => {
      const done = doneToday.filter((job) => job.riderId === rider.id);
      return {
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        plate: rider.plate,
        active: rider.status === "active",
        out: rider.status === "active" && isRiderOut(rider, now),
        lastSeenAt: rider.lastSeenAt?.toISOString() ?? null,
        hasAppLink: Boolean(rider.riderTokenHash),
        openJobs: openBy.get(rider.id) ?? 0,
        deliveredToday: done.length,
        earnedToday: done.reduce((sum, job) => sum + bookingNet(job), 0),
        // "last seen 2 min ago, Ikeja": the nearest known area, never the exact spot.
        where: riderWhereWords({ lat: rider.lastLat, lng: rider.lastLng, locationAt: rider.lastLocationAt, lastSeenAt: rider.lastSeenAt }, now),
      };
    }),
  });
});

function linkOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return getPublicEnv().appUrl.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export const POST = withLogistics(async (req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "We couldn't find your company. Log out and in again.", 404);
  if (!isOnboardingComplete(partner) || partner.verificationStatus !== "verified") {
    return apiError("FORBIDDEN", "You can add riders once your company is checked. Finish verification first.", 403);
  }
  const body = (await req.json().catch(() => null)) as { name?: unknown; whatsapp?: unknown; plate?: unknown } | null;
  const name = String(body?.name ?? "").trim().slice(0, 80);
  // The bike's number plate (optional), shown on the rider's Me tab: "LSR 482 KJ".
  const plate = typeof body?.plate === "string" ? body.plate.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 20) || null : undefined;
  const phone = toE164(String(body?.whatsapp ?? ""));
  if (name.length < 2) return apiError("BAD_REQUEST", "Type the rider's name.");
  if (!phone) return apiError("BAD_REQUEST", "That WhatsApp number doesn't look right. Use the number they use on WhatsApp, like 0803 123 4567.");

  const digits = phone.replace(/\D/g, "");
  const email = `wa${digits}@riders.shopinbos.app`;
  const [dbUser, activeCount, existing] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    db.logisticsTeamMember.count({ where: { logisticsPartnerId: partner.id, status: "active" } }),
    db.logisticsTeamMember.findUnique({ where: { logisticsPartnerId_email: { logisticsPartnerId: partner.id, email } }, select: { status: true } }),
  ]);
  const teamLimit = logisticsPlanLimits(dbUser ?? {}).teamMembers;
  if (existing?.status !== "active" && atLimit(activeCount, teamLimit)) {
    return apiError("PLAN_LIMIT", `${logisticsTeamLimitMessage(teamLimit)} Or deactivate someone.`, 403);
  }

  const { token, hash } = newRiderToken();
  const member = await db.logisticsTeamMember.upsert({
    where: { logisticsPartnerId_email: { logisticsPartnerId: partner.id, email } },
    create: { logisticsPartnerId: partner.id, name, email, phone, role: "rider", status: "active", riderTokenHash: hash, plate: plate ?? null },
    update: { name, phone, role: "rider", status: "active", riderTokenHash: hash, ...(plate !== undefined ? { plate } : {}) },
    select: { id: true, name: true },
  });
  const url = `${linkOrigin(req)}/rider/${token}`;
  const message = `Hi ${member.name.split(" ")[0]}, ${partner.displayName} added you as a rider on Shopinbos. Open this link to get your jobs. Keep it private: ${url}`;
  return ok({ id: member.id, name: member.name, url, whatsapp: digits, inviteUrl: `https://wa.me/${digits}?text=${encodeURIComponent(message)}` }, 201);
});
