import "server-only";
import { randomUUID } from "node:crypto";
import { toE164 } from "@shared/phone";
import { db } from "@/lib/db/client";
import { appOrigin } from "@/lib/ads";
import { riderLimit, riderLimitMessage } from "@/lib/plan-limits";
import { notifyRiderAssigned } from "@/lib/notifications/events.server";
import { orderCollectAmount } from "./booking.server";
import { makeDeliveryCode } from "./job-rules";
import { transitionJob } from "./jobs";
import { newRiderToken } from "./rider-token";

// "My riders": a seller's (or supplier's) own delivery riders. Each gets one private fleet, a LogisticsPartner row with
// ownerId = the seller (and a system user nobody signs in as), so their riders use the same Riders app, private
// links and job steps as a delivery partner's riders. A fleet is never listed as a partner, carries no Shopinbos fee,
// and the cash its riders collect on pay-on-delivery orders is the seller's: it's never a Shopinbos pay-in.

export class FleetError extends Error {}

/** Riders an account can have at once: by plan (riderLimit in src/lib/plan-limits.ts). */
export async function fleetRiderLimit(ownerId: string) {
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { role: true, aiCredits: true } });
  return { limit: riderLimit(owner ?? {}), message: riderLimitMessage(owner ?? {}) };
}

/** The name riders and delivery companies know the account by: the store, else the supplier's business. */
export async function fleetOwner(ownerId: string) {
  const user = await db.user.findUnique({
    where: { id: ownerId },
    select: { name: true, phone: true, role: true, store: { select: { name: true, slug: true, city: true, logoUrl: true } }, supplier: { select: { displayName: true, slug: true, city: true, logoUrl: true } } },
  });
  if (!user) return null;
  const shop = user.role === "supplier" ? user.supplier : user.store ?? user.supplier;
  return {
    name: (user.role === "supplier" ? user.supplier?.displayName : user.store?.name) || user.name || "",
    slug: shop?.slug ?? null,
    city: shop?.city ?? null,
    logoUrl: shop?.logoUrl ?? null,
    phone: user.phone,
    role: user.role,
  };
}

/** Where the owner manages their riders and deliveries. */
export const fleetPage = (role: string | null | undefined) => (role === "supplier" ? "/supplier/delivery" : "/home/logistics");

const OPEN = ["pending", "confirmed", "picked_up", "in_transit"] as const;

/** The seller's fleet, created the first time they add a rider. */
export async function ensureSellerFleet(sellerId: string) {
  const existing = await db.logisticsPartner.findUnique({ where: { ownerId: sellerId }, select: { id: true } });
  if (existing) return existing;
  const seller = await fleetOwner(sellerId);
  if (!seller) throw new FleetError("We couldn't find your account. Sign in again.");
  const name = seller.name || "My riders";
  const user = await db.user.upsert({
    where: { supabaseId: `fleet:${sellerId}` },
    create: { supabaseId: `fleet:${sellerId}`, name, role: "logistics_partner", country: "Nigeria", verificationStatus: "verified" },
    update: {},
    select: { id: true },
  });
  return db.logisticsPartner.upsert({
    where: { ownerId: sellerId },
    create: {
      userId: user.id,
      ownerId: sellerId,
      companyName: name,
      displayName: name,
      slug: `fleet-${seller.slug ?? sellerId}`.slice(0, 120),
      country: "Nigeria",
      city: seller.city || "Lagos",
      whatsappNumber: seller.phone ?? null,
      pricingModel: "own",
      verificationStatus: "verified",
      status: "active",
    },
    update: {},
    select: { id: true },
  });
}

/** The seller's riders, with how many deliveries each has open. */
export async function sellerRiders(sellerId: string) {
  const fleet = await db.logisticsPartner.findUnique({ where: { ownerId: sellerId }, select: { id: true } });
  if (!fleet) return [];
  const riders = await db.logisticsTeamMember.findMany({
    where: { logisticsPartnerId: fleet.id, role: "rider", status: "active" },
    orderBy: { invitedAt: "asc" },
    select: { id: true, name: true, phone: true, online: true, lastSeenAt: true, riderTokenHash: true },
  });
  const open = riders.length
    ? await db.deliveryBooking.groupBy({ by: ["riderId"], where: { logisticsPartnerId: fleet.id, riderId: { in: riders.map((r) => r.id) }, status: { in: [...OPEN] } }, _count: { _all: true } })
    : [];
  return riders.map((rider) => ({
    id: rider.id,
    name: rider.name,
    phone: rider.phone,
    online: rider.online,
    lastSeenAt: rider.lastSeenAt,
    hasLink: Boolean(rider.riderTokenHash),
    openJobs: open.find((row) => row.riderId === rider.id)?._count._all ?? 0,
  }));
}

export type RiderLink = { url: string; riderName: string; whatsapp: string | null };

async function linkFor(member: { id: string; name: string; phone: string | null }): Promise<RiderLink> {
  const { token, hash } = newRiderToken();
  await db.logisticsTeamMember.update({ where: { id: member.id }, data: { riderTokenHash: hash } });
  const phone = member.phone ? toE164(member.phone) : null;
  return { url: `${appOrigin()}/rider/${token}`, riderName: member.name, whatsapp: phone ? phone.replace(/\D/g, "") : null };
}

/** Adds a rider and makes their private Riders app link (shown once: only its hash is kept). */
export async function addSellerRider(sellerId: string, input: { name: string; phone: string }): Promise<RiderLink> {
  const name = input.name.trim().slice(0, 80);
  const phone = input.phone.trim();
  if (name.length < 2) throw new FleetError("Add the rider's name.");
  if (!toE164(phone)) throw new FleetError("Add the rider's phone number, like 0803 123 4567.");
  const fleet = await ensureSellerFleet(sellerId);
  const count = await db.logisticsTeamMember.count({ where: { logisticsPartnerId: fleet.id, role: "rider", status: "active" } });
  const plan = await fleetRiderLimit(sellerId);
  if (count >= plan.limit) throw new FleetError(plan.message);
  // Riders sign in with their link, not email: the email only fills the required field and is never used.
  const member = await db.logisticsTeamMember.create({
    data: { logisticsPartnerId: fleet.id, name, phone, email: `rider-${randomUUID()}@riders.shopinbos.invalid`, role: "rider", status: "active" },
    select: { id: true, name: true, phone: true },
  });
  return linkFor(member);
}

async function ownRider(sellerId: string, riderId: string) {
  const fleet = await db.logisticsPartner.findUnique({ where: { ownerId: sellerId }, select: { id: true } });
  if (!fleet) return null;
  const rider = await db.logisticsTeamMember.findFirst({ where: { id: riderId, logisticsPartnerId: fleet.id, role: "rider", status: "active" }, select: { id: true, name: true, phone: true } });
  return rider ? { fleet, rider } : null;
}

/** A new Riders app link for one of the seller's riders (the old one stops working). */
export async function newSellerRiderLink(sellerId: string, riderId: string): Promise<RiderLink> {
  const found = await ownRider(sellerId, riderId);
  if (!found) throw new FleetError("We couldn't find that rider. Refresh the page.");
  return linkFor(found.rider);
}

/** Removes a rider: their link stops working. Refused while they still have deliveries on the way. */
export async function removeSellerRider(sellerId: string, riderId: string) {
  const found = await ownRider(sellerId, riderId);
  if (!found) throw new FleetError("We couldn't find that rider. Refresh the page.");
  const open = await db.deliveryBooking.count({ where: { riderId: found.rider.id, status: { in: [...OPEN] } } });
  if (open > 0) throw new FleetError(`${found.rider.name} still has ${open} ${open === 1 ? "delivery" : "deliveries"} on the way. Give them to another rider or finish them first.`);
  await db.logisticsTeamMember.update({ where: { id: found.rider.id }, data: { status: "inactive", riderTokenHash: null, online: false } });
}

export interface FleetJobInput {
  riderId: string;
  pickupLocation: string;
  destination: string;
  orderId?: string | null;
  recipient?: { name: string; phone: string } | null;
  description?: string | null;
  weightKg?: number | null;
  notes?: string | null;
}

/**
 * Gives a delivery to one of the seller's riders. It starts "confirmed" with the rider on it. On an order it gets
 * the buyer's 4-digit delivery code (they see it on their order page); an unpaid order's cash is collected by the
 * rider for the seller. Returns a WhatsApp message the seller can send the rider.
 */
export async function bookWithSellerRider(sellerId: string, input: FleetJobInput) {
  const found = await ownRider(sellerId, input.riderId);
  if (!found) throw new FleetError("Pick one of your riders.");
  const codAmount = await orderCollectAmount(sellerId, input.orderId);
  const recipient = input.recipient ? `Customer: ${input.recipient.name} ${input.recipient.phone}` : null;
  const notes = [recipient, input.notes?.trim() || null].filter(Boolean).join(" · ").slice(0, 1000) || null;
  const booking = await db.deliveryBooking.create({
    data: {
      sellerId,
      logisticsPartnerId: found.fleet.id,
      orderId: input.orderId ?? null,
      pickupLocation: input.pickupLocation,
      destination: input.destination,
      packageDetails: {
        fragile: false,
        ...(input.weightKg ? { weight: input.weightKg } : {}),
        ...(input.description ? { description: input.description } : {}),
      },
      deliveryFee: 0,
      currency: "NGN",
      status: "confirmed",
      riderId: found.rider.id,
      codAmount: codAmount ?? null,
      deliveryCode: input.orderId ? makeDeliveryCode() : null,
      notes,
    },
  });
  await notifyRiderAssigned({ bookingId: booking.id, riderId: found.rider.id, previousRiderId: null });
  const phone = found.rider.phone ? toE164(found.rider.phone) : null;
  const message = [
    `Hi ${found.rider.name}, new delivery for you.`,
    `Pick up: ${input.pickupLocation}`,
    `Deliver to: ${input.destination}`,
    input.recipient ? `Customer: ${input.recipient.name}, ${input.recipient.phone}` : null,
    codAmount ? `Collect ₦${codAmount.toLocaleString("en-NG")} from the customer.` : null,
    "Open your Shopinbos rider link to start it.",
  ].filter(Boolean).join("\n");
  return { booking, whatsapp: phone ? phone.replace(/\D/g, "") : null, message };
}

/**
 * The seller moves one of their own riders' deliveries (for a rider without a smartphone): picked up, delivered or
 * failed. A pay-on-delivery order is marked as paid in cash to the rider.
 */
export async function moveSellerRiderJob(sellerId: string, bookingId: string, to: "picked_up" | "delivered" | "failed", reason?: string | null) {
  const fleet = await db.logisticsPartner.findUnique({ where: { ownerId: sellerId }, select: { id: true } });
  const job = fleet ? await db.deliveryBooking.findFirst({ where: { id: bookingId, sellerId, logisticsPartnerId: fleet.id }, select: { id: true, status: true, codAmount: true } }) : null;
  if (!fleet || !job) throw new FleetError("We couldn't find that delivery. Refresh the page.");
  // "Delivered" straight from "confirmed" goes through "picked up" first.
  const steps = to === "delivered" && job.status === "confirmed" ? (["picked_up", "delivered"] as const) : ([to] as const);
  for (const step of steps) {
    const res = await transitionJob({
      bookingId: job.id,
      partnerId: fleet.id,
      to: step,
      actor: "partner",
      failedReason: step === "failed" ? reason?.trim() || "The rider couldn't deliver it." : null,
      ...(step === "delivered" && job.codAmount ? { codCollected: job.codAmount, codMethod: "cash" } : {}),
    });
    if (!res.ok) throw new FleetError(res.error);
  }
}
