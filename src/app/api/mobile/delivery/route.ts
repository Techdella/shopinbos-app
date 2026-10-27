import { NextRequest } from "next/server";
import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { connectionsForOwner, privateCardsForOwner, statsForPartners } from "@/lib/delivery-market/manage.server";
import { deliverySettingsFor } from "@/lib/delivery-market/market.server";
import { exceptionsFor } from "@/lib/delivery-market/jobs.server";
import { sellAreaLimit } from "@/lib/plans/market.server";
import { withOwner } from "./_shared";

export const dynamic = "force-dynamic";

// GET /api/mobile/delivery: the Delivery hub. Where the business sells and ships from, its own options (pickup from
// them, what customers see when no partner covers an address, usual parcel size), its delivery partners with their
// stats and settings, private rates waiting or on, and (sellers) jobs that need them.
export const GET = withOwner(async (_req: NextRequest, { user }) => {
  const [settings, connections, privateCards, profile, sellLimit] = await Promise.all([
    deliverySettingsFor(user.id),
    connectionsForOwner(user.id),
    privateCardsForOwner(user.id),
    user.role === "supplier"
      ? db.supplier.findUnique({ where: { userId: user.id }, select: { city: true, address: true } })
      : db.store.findUnique({ where: { userId: user.id }, select: { city: true } }),
    // The plan's selling states, so "Where do you sell?" offers what the plan includes (null: all of Nigeria).
    sellAreaLimit(user.id).catch(() => ({ states: null, nationwidePlan: null })),
  ]);
  const stats = await statsForPartners(connections.map((connection) => connection.logisticsPartnerId));
  const exceptions = user.role === "seller" ? await exceptionsFor(user.id).catch(() => []) : [];
  return ok({
    role: user.role,
    settings,
    sellLimit,
    city: profile?.city ?? null,
    address: profile && "address" in profile ? profile.address : null,
    connections: connections.map((connection) => ({
      id: connection.id,
      services: connection.services,
      showPartnerName: connection.showPartnerName,
      label: connection.label,
      ownerPod: connection.ownerPod,
      partnerPod: connection.partnerPod,
      createdAt: connection.createdAt,
      partner: {
        id: connection.logisticsPartner.id,
        slug: connection.logisticsPartner.slug,
        name: connection.logisticsPartner.displayName,
        logoUrl: connection.logisticsPartner.logoUrl,
        services: connection.logisticsPartner.services,
        offersPayOnDelivery: connection.logisticsPartner.offersPayOnDelivery,
        live: connection.logisticsPartner.status === "active" && connection.logisticsPartner.verificationStatus === "verified",
        badges: connection.logisticsPartner.badges,
        userId: connection.logisticsPartner.userId,
      },
      stats: stats.get(connection.logisticsPartnerId) ?? null,
    })),
    privateCards: privateCards.map((card) => ({
      id: card.id,
      status: card.status,
      rows: card.rows,
      failedAttemptFee: card.failedAttemptFee,
      returnFee: card.returnFee,
      notes: card.notes,
      createdAt: card.createdAt,
      partner: card.logisticsPartner,
    })),
    exceptions: exceptions.map(({ job, kind, order }) => ({
      kind,
      job: { id: job.id, status: job.status, service: job.service, declineReason: job.declineReason, failedReason: job.failedReason, deliveryFee: job.deliveryFee, partner: job.logisticsPartner },
      order,
    })),
  });
});
