"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { requireRole } from "@/lib/server-auth";
import { isOnboardingComplete, isProPlan } from "@/lib/role-queries";
import { replyToQuote } from "@/lib/logistics/quotes";
import { getPublicEnv } from "@/lib/env";
import { assignRider, transitionJob } from "@/lib/logistics/jobs";
import { newRiderToken } from "@/lib/logistics/rider-token";
import { toE164 } from "@shared/phone";
import { TEAM_NEEDS_VERIFICATION, TEAM_ROLES, riderPlaceholderEmail, type TeamRole } from "@/lib/logistics/team";
import { LOGISTICS_FREE_ROUTE_LIMIT, LOGISTICS_FREE_TEAM_MEMBER_LIMIT } from "@/lib/plan-limits";
import {
  BookingStatusUpdateSchema,
  LogisticsCoverageUpdateSchema,
  LogisticsPricingUpdateSchema,
} from "@/lib/schemas";

const bookingStatuses = ["pending", "confirmed", "picked_up", "in_transit", "delivered", "failed", "cancelled"] as const;

function splitList(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveNumber(value: FormDataEntryValue | null) {
  const amount = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function parseCoverageRows(value: FormDataEntryValue | null, fallbackZones: string[], fallbackBasePrice: number) {
  const rows = String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [nameRaw, serviceRaw, priceRaw, demandRaw] = line.split("|").map((part) => part?.trim());
      const name = nameRaw || "";
      if (!name) return null;

      return {
        name,
        service: serviceRaw || "Same-day",
        basePrice: parsePositiveNumber(priceRaw || String(fallbackBasePrice)),
        active: true,
        ...(demandRaw ? { demandSignal: demandRaw } : {}),
      };
    })
    .filter((zone): zone is { name: string; service: string; basePrice: number; active: boolean; demandSignal?: string } => Boolean(zone));

  if (rows.length > 0) return rows;
  return fallbackZones.map((name) => ({ name, service: "Same-day", basePrice: fallbackBasePrice, active: true }));
}

/** Where to send the partner after a dispatch action: a /logistics page they came from, or the fallback. */
function returnPath(formData: FormData, fallback: string) {
  const value = String(formData.get("returnTo") || "");
  return /^\/logistics\/[a-z-]+$/.test(value) ? value : fallback;
}

async function getLogisticsActor() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });

  if (!partner) {
    redirect("/logistics/profile");
  }

  return { user, partner };
}

function assertVerifiedLogistics(partner: { verificationStatus: string; onboardingState: unknown }) {
  if (!isOnboardingComplete(partner)) redirect("/logistics/onboarding");
  if (partner.verificationStatus !== "verified") redirect("/logistics/profile?verification=pending");
}

async function assertLogisticsPlanAllowsRoutes(userId: string, zoneCount: number) {
  const dbUser = await db.user.findUnique({ where: { id: userId }, select: { aiCredits: true } });
  if (!isProPlan(dbUser ?? {}) && zoneCount > LOGISTICS_FREE_ROUTE_LIMIT) {
    redirect("/logistics/profile?tab=Billing%20%26%20Plan&limit=routes");
  }
}

export async function respondToDeliveryQuote(formData: FormData) {
  const { partner } = await getLogisticsActor();
  assertVerifiedLogistics(partner);
  const back = returnPath(formData, "/logistics/quotes");

  // Same rules as POST /v1/partner/quotes.
  const result = await replyToQuote({
    partnerId: partner.id,
    quoteId: String(formData.get("quoteId") || ""),
    intent: String(formData.get("intent") || "respond") === "reject" ? "reject" : "respond",
    quotedPrice: parsePositiveNumber(formData.get("quotedPrice")),
    partnerResponse: String(formData.get("partnerResponse") || ""),
    expiresAt: String(formData.get("expiresAt") || "").trim() || undefined,
  });
  if (!result.ok) redirect(`${back}?error=${encodeURIComponent(result.error)}`);

  revalidatePath("/logistics/quotes");
  revalidatePath("/logistics/dashboard");
  redirect(`${back}?saved=1`);
}

export async function updateDeliveryBookingStatus(formData: FormData) {
  const { partner } = await getLogisticsActor();
  assertVerifiedLogistics(partner);
  const bookingId = String(formData.get("bookingId") || "");
  const status = String(formData.get("status") || "");
  const trackingCode = String(formData.get("trackingCode") || "").trim();
  const estimatedDeliveryRaw = String(formData.get("estimatedDelivery") || "").trim();
  const failedReason = String(formData.get("failedReason") || "").trim();
  const codCollectedRaw = String(formData.get("codCollected") || "").trim();
  const codMethod = String(formData.get("codMethod") || "").trim();
  const riderField = formData.get("riderId");
  const back = returnPath(formData, "/logistics/bookings");
  const parsed = BookingStatusUpdateSchema.safeParse({
    status,
    trackingCode: trackingCode || undefined,
    estimatedDelivery: estimatedDeliveryRaw || undefined,
  });

  if (!parsed.success || !bookingStatuses.includes(status as never)) {
    redirect(`${back}?error=${encodeURIComponent("Pick a status from the list, then update the job again.")}`);
  }

  const booking = bookingId
    ? await db.deliveryBooking.findFirst({
        where: { id: bookingId, logisticsPartnerId: partner.id },
        select: { id: true, status: true, riderId: true },
      })
    : null;

  if (!booking) redirect(`${back}?error=${encodeURIComponent("We couldn't find that job. It may have been cancelled. Refresh the page.")}`);

  // Status changes go through the shared job rules (delivery code, failure reason, cash on delivery) and
  // keep the seller's order in step. The dispatcher can close a job without the buyer's code.
  if (status !== booking.status) {
    const result = await transitionJob({
      bookingId: booking.id,
      partnerId: partner.id,
      to: status,
      actor: "partner",
      failedReason: failedReason || null,
      codCollected: codCollectedRaw ? parsePositiveNumber(codCollectedRaw) : null,
      codMethod: codMethod || null,
    });
    if (!result.ok) redirect(`${back}?error=${encodeURIComponent(result.error)}`);
  }

  const details: Prisma.DeliveryBookingUpdateInput = {};
  if (parsed.data.trackingCode) details.trackingCode = parsed.data.trackingCode;
  if (parsed.data.estimatedDelivery) details.estimatedDelivery = parsed.data.estimatedDelivery;
  if (Object.keys(details).length > 0) {
    const saved = await db.deliveryBooking.update({ where: { id: booking.id }, data: details }).catch(() => null);
    if (!saved) redirect(`${back}?error=${encodeURIComponent("That tracking code is already on another job. Check it and try again.")}`);
  }

  if (riderField !== null) {
    const riderId = String(riderField) || null;
    if (riderId !== booking.riderId && !["delivered", "cancelled"].includes(status)) {
      const result = await assignRider({ bookingId: booking.id, partnerId: partner.id, riderId });
      if (!result.ok) redirect(`${back}?error=${encodeURIComponent(result.error)}`);
    }
  }

  revalidateDispatch();
  redirect(`${back}?saved=1`);
}

function revalidateDispatch() {
  revalidatePath("/logistics/bookings");
  revalidatePath("/logistics/dashboard");
  revalidatePath("/logistics/couriers");
  revalidatePath("/logistics/cash");
}

/** "Accept and assign": confirm a new job (which gives it a delivery code) and hand it to a rider in one step. */
export async function acceptAndAssignJob(formData: FormData) {
  const { partner } = await getLogisticsActor();
  assertVerifiedLogistics(partner);
  const bookingId = String(formData.get("bookingId") || "");
  const riderId = String(formData.get("riderId") || "") || null;
  const back = returnPath(formData, "/logistics/bookings");

  const accepted = await transitionJob({ bookingId, partnerId: partner.id, to: "confirmed", actor: "partner" });
  if (!accepted.ok) redirect(`${back}?error=${encodeURIComponent(accepted.error)}`);
  if (riderId) {
    const assigned = await assignRider({ bookingId, partnerId: partner.id, riderId });
    if (!assigned.ok) redirect(`${back}?error=${encodeURIComponent(`Accepted, but ${assigned.error.charAt(0).toLowerCase()}${assigned.error.slice(1)}`)}`);
  }

  revalidateDispatch();
  redirect(`${back}?saved=1`);
}

/** Give a job to a rider, move it to another rider, or take it off the rider (empty riderId). */
export async function assignJobRider(formData: FormData) {
  const { partner } = await getLogisticsActor();
  assertVerifiedLogistics(partner);
  const back = returnPath(formData, "/logistics/bookings");
  const result = await assignRider({
    bookingId: String(formData.get("bookingId") || ""),
    partnerId: partner.id,
    riderId: String(formData.get("riderId") || "") || null,
  });
  if (!result.ok) redirect(`${back}?error=${encodeURIComponent(result.error)}`);
  revalidateDispatch();
  redirect(`${back}?saved=1`);
}

export type RiderLinkResult = { ok: true; url: string; riderName: string; whatsapp: string | null } | { ok: false; error: string };

async function appOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return getPublicEnv().appUrl.replace(/\/$/, "");
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * New private Riders app link for a rider. The token is shown once and only its hash is stored, so making a
 * new link switches the old one off.
 */
export async function createRiderLink(teamMemberId: string): Promise<RiderLinkResult> {
  const { partner } = await getLogisticsActor();
  assertVerifiedLogistics(partner);
  const member = await db.logisticsTeamMember.findFirst({
    where: { id: String(teamMemberId || ""), logisticsPartnerId: partner.id },
    select: { id: true, name: true, role: true, status: true, phone: true },
  });
  if (!member) return { ok: false, error: "We couldn't find that rider. Refresh the page." };
  if (member.role !== "rider") return { ok: false, error: "Only riders get a Riders app link." };
  if (member.status !== "active") return { ok: false, error: "This rider is inactive. Reactivate them first." };

  const { token, hash } = newRiderToken();
  await db.logisticsTeamMember.update({ where: { id: member.id }, data: { riderTokenHash: hash } });
  revalidatePath("/logistics/couriers");
  const phone = member.phone ? toE164(member.phone) : null;
  return { ok: true, url: `${await appOrigin()}/rider/${token}`, riderName: member.name, whatsapp: phone ? phone.replace(/\D/g, "") : null };
}

export async function revokeRiderLink(formData: FormData) {
  const { partner } = await getLogisticsActor();
  assertVerifiedLogistics(partner);
  const member = await db.logisticsTeamMember.findFirst({
    where: { id: String(formData.get("teamMemberId") || ""), logisticsPartnerId: partner.id },
    select: { id: true },
  });
  if (!member) redirect(`/logistics/couriers?error=${encodeURIComponent("We couldn't find that rider. Refresh the page.")}`);
  await db.logisticsTeamMember.update({ where: { id: member.id }, data: { riderTokenHash: null, online: false } });
  revalidatePath("/logistics/couriers");
  redirect("/logistics/couriers?saved=1");
}

/**
 * Record cash paid in from pay-on-delivery jobs. It settles the oldest unremitted cash jobs it fully covers;
 * whatever is left over stays on the pay-in record.
 */
export async function recordCodRemittance(_formData: FormData) {
  // Retired: cash on delivery belongs to the seller and is paid to each seller directly (src/lib/logistics/
  // seller-payins.server.ts), never to Shopinbos, so a pay-in to Shopinbos can't be recorded any more.
  await getLogisticsActor();
  redirect(`/logistics/cash?error=${encodeURIComponent("Cash now goes to each seller directly. Use Pay the seller on this page.")}`);
}

export async function updateLogisticsCoverage(formData: FormData) {
  const { user, partner } = await getLogisticsActor();
  assertVerifiedLogistics(partner);
  const coverageZones = splitList(formData.get("coverageZones"));
  const vehicleTypes = splitList(formData.get("vehicleTypes"));
  const deliveryTypes = splitList(formData.get("deliveryTypes"));
  const depot = String(formData.get("depot") || "").trim();
  const coverageMap = {
    zones: parseCoverageRows(formData.get("coverageRows"), coverageZones, partner.basePrice),
    ...(depot ? { depot } : {}),
    updatedBy: "portal" as const,
  };
  const parsed = LogisticsCoverageUpdateSchema.safeParse({
    coverageZones,
    vehicleTypes,
    deliveryTypes,
    coverageMap,
  });

  if (!parsed.success) {
    redirect(`/logistics/coverage?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check your coverage areas and rates, then save again.")}`);
  }
  await assertLogisticsPlanAllowsRoutes(user.id, parsed.data.coverageZones.length);

  await db.logisticsPartner.update({
    where: { id: partner.id },
    data: parsed.data,
  });

  invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
  revalidatePath("/logistics/coverage");
  revalidatePath("/logistics/profile");
  revalidatePath("/logistics/dashboard");
  redirect("/logistics/coverage?saved=1");
}

export async function updateLogisticsPricing(formData: FormData) {
  const { partner } = await getLogisticsActor();
  assertVerifiedLogistics(partner);
  const parsed = LogisticsPricingUpdateSchema.safeParse({
    pricingModel: String(formData.get("pricingModel") || partner.pricingModel),
    basePrice: parsePositiveNumber(formData.get("basePrice")),
    estimatedSpeed: String(formData.get("estimatedSpeed") || "").trim() || undefined,
  });

  if (!parsed.success) {
    redirect(`/logistics/pricing?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check your pricing, then save again.")}`);
  }

  await db.logisticsPartner.update({
    where: { id: partner.id },
    data: parsed.data,
  });

  invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
  revalidatePath("/logistics/pricing");
  revalidatePath("/logistics/profile");
  revalidatePath("/logistics/dashboard");
  redirect("/logistics/pricing?saved=1");
}

const COURIERS = "/logistics/couriers";

function couriersError(message: string): never {
  redirect(`${COURIERS}?error=${encodeURIComponent(message)}`);
}

/**
 * The Riders page can't add or reactivate people until the company is checked. Say so on the page, instead of
 * the silent jump to the profile page assertVerifiedLogistics does.
 */
function assertTeamUnlocked(partner: { verificationStatus: string; onboardingState: unknown }) {
  if (!isOnboardingComplete(partner)) redirect("/logistics/onboarding");
  if (partner.verificationStatus !== "verified") {
    couriersError(TEAM_NEEDS_VERIFICATION);
  }
}

/** Starter plan: one more active person allowed? If not, send them to Billing to move to Pro. */
async function assertTeamHasRoom(userId: string, partnerId: string) {
  const [dbUser, teamMemberCount] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { aiCredits: true } }),
    db.logisticsTeamMember.count({ where: { logisticsPartnerId: partnerId, status: "active" } }),
  ]);
  if (!isProPlan(dbUser ?? {}) && teamMemberCount >= LOGISTICS_FREE_TEAM_MEMBER_LIMIT) {
    redirect("/logistics/profile?tab=Billing%20%26%20Plan&limit=team");
  }
}

/**
 * Add a rider or office staff. Riders need a name and a WhatsApp number (no email: they use their private Riders
 * app link, made from their row). Office staff need an email. Same rules as POST /api/mobile/logistics/riders.
 */
export async function addLogisticsTeamMember(formData: FormData) {
  const { user, partner } = await getLogisticsActor();
  assertTeamUnlocked(partner);

  const name = String(formData.get("name") || "").trim().slice(0, 80);
  const roleRaw = String(formData.get("role") || "rider").trim();
  const role: TeamRole = (TEAM_ROLES as readonly string[]).includes(roleRaw) ? (roleRaw as TeamRole) : "rider";
  const phoneRaw = String(formData.get("phone") || "").trim();
  const phone = phoneRaw ? toE164(phoneRaw) : null;
  let email = String(formData.get("email") || "").trim().toLowerCase();

  if (name.length < 2) couriersError("Type their name.");
  if (phoneRaw && !phone) couriersError("That phone number doesn't look right. Use the number they use on WhatsApp, like 0803 123 4567.");
  if (role === "rider") {
    if (!phone) couriersError("Add the rider's WhatsApp number. That's where you send their Riders app link.");
    if (!email) email = riderPlaceholderEmail(phone);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) couriersError("Add their email address, like name@example.com.");

  const where = { logisticsPartnerId_email: { logisticsPartnerId: partner.id, email } };
  // A rider added once by email and once by number is still one person: match on the number too.
  const existing =
    (await db.logisticsTeamMember.findUnique({ where, select: { id: true, status: true } })) ??
    (phone && role === "rider"
      ? await db.logisticsTeamMember.findFirst({ where: { logisticsPartnerId: partner.id, role: "rider", phone }, select: { id: true, status: true } })
      : null);
  // People who are already active don't count again.
  if (existing?.status !== "active") await assertTeamHasRoom(user.id, partner.id);

  const data = { name, phone: phone ?? undefined, role, status: "active" };
  if (existing) {
    await db.logisticsTeamMember.update({ where: { id: existing.id }, data });
  } else {
    await db.logisticsTeamMember.create({ data: { ...data, logisticsPartnerId: partner.id, email } });
  }

  revalidatePath(COURIERS);
  revalidatePath("/logistics/profile");
  revalidatePath("/logistics/dashboard");
  redirect(`${COURIERS}?saved=${role === "rider" ? "rider" : "1"}`);
}

export async function updateLogisticsTeamMemberStatus(formData: FormData) {
  const { user, partner } = await getLogisticsActor();
  assertTeamUnlocked(partner);

  const teamMemberId = String(formData.get("teamMemberId") || "");
  const status = String(formData.get("status") || "inactive");
  if (!["active", "inactive"].includes(status)) {
    couriersError("Something went wrong with that button. Refresh the page and try again.");
  }

  const teamMember = await db.logisticsTeamMember.findFirst({
    where: { id: teamMemberId, logisticsPartnerId: partner.id },
    select: { id: true, status: true },
  });

  if (!teamMember) couriersError("We couldn't find that person. Refresh the page.");
  // Reactivating counts towards the Starter limit just like adding someone.
  if (status === "active" && teamMember.status !== "active") await assertTeamHasRoom(user.id, partner.id);

  await db.logisticsTeamMember.update({
    where: { id: teamMember.id },
    // A deactivated rider is off the road: drop them offline so dispatch stops offering them.
    data: status === "active" ? { status } : { status, online: false },
  });

  revalidatePath(COURIERS);
  revalidatePath("/logistics/profile");
  revalidatePath("/logistics/dashboard");
  redirect(`${COURIERS}?saved=1`);
}

export async function updateLogisticsProfile(formData: FormData) {
  const { user, partner } = await getLogisticsActor();
  const name = String(formData.get("name") || user.name).trim();
  const displayName = String(formData.get("displayName") || partner.displayName).trim();
  const city = String(formData.get("city") || partner.city).trim();
  const country = String(formData.get("country") || partner.country).trim();
  const description = String(formData.get("description") || "").trim();
  const coverageZones = splitList(formData.get("coverageZones"));
  const vehicleTypes = splitList(formData.get("vehicleTypes"));
  const deliveryTypes = splitList(formData.get("deliveryTypes"));
  const pricingModel = String(formData.get("pricingModel") || partner.pricingModel).trim();
  const basePrice = Number(formData.get("basePrice") || partner.basePrice || 0);
  const estimatedSpeed = String(formData.get("estimatedSpeed") || "").trim();
  const whatsappNumber = String(formData.get("whatsappNumber") || "").trim();
  await assertLogisticsPlanAllowsRoutes(user.id, coverageZones.length || partner.coverageZones.length);

  // Parse service hours
  const hours: Array<{ day: string; open: string; close: string; cutoff: string; active: boolean }> = [];
  const dayKeys = [...formData.keys()].filter((k) => k.startsWith("hours_") && k.endsWith("_day"));
  const dayIndices = [...new Set(dayKeys.map((k) => k.split("_")[1]))];
  for (const idx of dayIndices) {
    const day = String(formData.get(`hours_${idx}_day`) || "").trim();
    const open = String(formData.get(`hours_${idx}_open`) || "").trim();
    const close = String(formData.get(`hours_${idx}_close`) || "").trim();
    const cutoff = String(formData.get(`hours_${idx}_cutoff`) || "").trim();
    const active = formData.get(`hours_${idx}_active`) === "on";
    if (day) hours.push({ day, open, close, cutoff, active });
  }

  const onboardingState = typeof partner.onboardingState === "object" && partner.onboardingState
    ? (partner.onboardingState as Record<string, unknown>)
    : {};
  onboardingState.serviceHours = hours.length > 0 ? hours : onboardingState.serviceHours;

  await db.user.update({
    where: { id: user.id },
    data: { name, city, country },
  });

  await db.logisticsPartner.update({
    where: { id: partner.id },
    data: {
      displayName,
      companyName: displayName,
      city,
      country,
      description: description || undefined,
      coverageZones: coverageZones.length > 0 ? coverageZones : partner.coverageZones,
      vehicleTypes: vehicleTypes.length > 0 ? vehicleTypes : partner.vehicleTypes,
      deliveryTypes: deliveryTypes.length > 0 ? deliveryTypes : partner.deliveryTypes,
      pricingModel,
      basePrice,
      estimatedSpeed: estimatedSpeed || undefined,
      whatsappNumber: whatsappNumber || undefined,
      onboardingState: onboardingState as Prisma.InputJsonValue,
    },
  });

  invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
  revalidatePath("/logistics");
  revalidatePath("/logistics/profile");
  redirect("/logistics/profile?saved=true");
}

export async function uploadLogisticsLogo(formData: FormData) {
  const { user, partner } = await getLogisticsActor();
  const file = formData.get("logo") as File | null;
  if (!file) redirect("/logistics/profile?error=Pick+a+picture+first.");

  try {
    const { uploadFileServer, uploadPath } = await import("@/lib/supabase/storage.server");
    const { publicUrl } = await uploadFileServer("logistics-logos", file, uploadPath(`logistics-logos/${partner.id}`, file));
    await db.logisticsPartner.update({ where: { id: partner.id }, data: { logoUrl: publicUrl } });
    redirect("/logistics/profile?saved=true");
  } catch {
    redirect("/logistics/profile?error=That+picture+didn%27t+upload.+Try+a+smaller+photo.");
  }
}
