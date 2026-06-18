"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { requireRole } from "@/lib/server-auth";
import { isOnboardingComplete, isProPlan } from "@/lib/role-queries";
import { LOGISTICS_FREE_ROUTE_LIMIT, LOGISTICS_FREE_TEAM_MEMBER_LIMIT } from "@/lib/plan-limits";
import {
  BookingStatusUpdateSchema,
  DeliveryQuoteResponseSchema,
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

async function assertLogisticsPlanAllowsTeamMember(userId: string, partnerId: string) {
  const [dbUser, teamMemberCount] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { aiCredits: true } }),
    db.logisticsTeamMember.count({ where: { logisticsPartnerId: partnerId, status: "active" } }),
  ]);

  if (!isProPlan(dbUser ?? {}) && teamMemberCount >= LOGISTICS_FREE_TEAM_MEMBER_LIMIT) {
    redirect("/logistics/profile?tab=Billing%20%26%20Plan&limit=team");
  }
}

export async function respondToDeliveryQuote(formData: FormData) {
  const { partner } = await getLogisticsActor();
  assertVerifiedLogistics(partner);
  const quoteId = String(formData.get("quoteId") || "");
  const intent = String(formData.get("intent") || "respond");
  const quotedPrice = parsePositiveNumber(formData.get("quotedPrice"));
  const partnerResponse = String(formData.get("partnerResponse") || "").trim();
  const expiresAtRaw = String(formData.get("expiresAt") || "").trim();

  const quote = quoteId
    ? await db.deliveryQuoteRequest.findFirst({
        where: { id: quoteId, logisticsPartnerId: partner.id },
        select: { id: true, status: true },
      })
    : null;

  if (!quote) redirect("/logistics/quotes?error=Quote%20not%20found.");
  if (quote.status !== "pending") {
    redirect("/logistics/quotes?error=This%20quote%20has%20already%20been%20handled.");
  }

  if (intent === "reject") {
    await db.deliveryQuoteRequest.update({
      where: { id: quote.id },
      data: {
        status: "rejected",
        partnerResponse: partnerResponse || "Thanks for reaching out. This route is not available for us right now.",
      },
    });
    revalidatePath("/logistics/quotes");
    revalidatePath("/logistics/dashboard");
    redirect("/logistics/quotes?saved=1");
  }

  const parsed = DeliveryQuoteResponseSchema.safeParse({
    quotedPrice,
    partnerResponse: partnerResponse || undefined,
    expiresAt: expiresAtRaw || undefined,
  });

  if (!parsed.success) {
    redirect(`/logistics/quotes?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the quote details.")}`);
  }

  await db.deliveryQuoteRequest.update({
    where: { id: quote.id },
    data: {
      status: "responded",
      quotedPrice: parsed.data.quotedPrice,
      partnerResponse: parsed.data.partnerResponse,
      expiresAt: parsed.data.expiresAt,
    },
  });

  revalidatePath("/logistics/quotes");
  revalidatePath("/logistics/dashboard");
  redirect("/logistics/quotes?saved=1");
}

export async function updateDeliveryBookingStatus(formData: FormData) {
  const { partner } = await getLogisticsActor();
  assertVerifiedLogistics(partner);
  const bookingId = String(formData.get("bookingId") || "");
  const status = String(formData.get("status") || "");
  const trackingCode = String(formData.get("trackingCode") || "").trim();
  const estimatedDeliveryRaw = String(formData.get("estimatedDelivery") || "").trim();
  const parsed = BookingStatusUpdateSchema.safeParse({
    status,
    trackingCode: trackingCode || undefined,
    estimatedDelivery: estimatedDeliveryRaw || undefined,
    deliveredAt: status === "delivered" ? new Date() : undefined,
  });

  if (!parsed.success || !bookingStatuses.includes(status as never)) {
    redirect("/logistics/bookings?error=Choose%20a%20valid%20booking%20status.");
  }

  const booking = bookingId
    ? await db.deliveryBooking.findFirst({
        where: { id: bookingId, logisticsPartnerId: partner.id },
        select: { id: true },
      })
    : null;

  if (!booking) redirect("/logistics/bookings?error=Booking%20not%20found.");

  await db.deliveryBooking.update({
    where: { id: booking.id },
    data: parsed.data,
  });

  revalidatePath("/logistics/bookings");
  revalidatePath("/logistics/dashboard");
  redirect("/logistics/bookings?saved=1");
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
    redirect(`/logistics/coverage?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check coverage details.")}`);
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
    redirect(`/logistics/pricing?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check pricing details.")}`);
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

export async function addLogisticsTeamMember(formData: FormData) {
  const { user, partner } = await getLogisticsActor();
  assertVerifiedLogistics(partner);
  await assertLogisticsPlanAllowsTeamMember(user.id, partner.id);

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  const role = String(formData.get("role") || "dispatcher").trim() || "dispatcher";

  if (name.length < 2 || !email.includes("@")) {
    redirect("/logistics/couriers?error=Add%20a%20valid%20name%20and%20email.");
  }

  await db.logisticsTeamMember.upsert({
    where: {
      logisticsPartnerId_email: {
        logisticsPartnerId: partner.id,
        email,
      },
    },
    create: {
      logisticsPartnerId: partner.id,
      name,
      email,
      phone: phone || undefined,
      role,
      status: "active",
    },
    update: {
      name,
      phone: phone || undefined,
      role,
      status: "active",
    },
  });

  revalidatePath("/logistics/couriers");
  revalidatePath("/logistics/profile");
  redirect("/logistics/couriers?saved=1");
}

export async function updateLogisticsTeamMemberStatus(formData: FormData) {
  const { partner } = await getLogisticsActor();
  assertVerifiedLogistics(partner);

  const teamMemberId = String(formData.get("teamMemberId") || "");
  const status = String(formData.get("status") || "inactive");
  if (!["active", "inactive"].includes(status)) {
    redirect("/logistics/couriers?error=Choose%20a%20valid%20team%20member%20status.");
  }

  const teamMember = await db.logisticsTeamMember.findFirst({
    where: { id: teamMemberId, logisticsPartnerId: partner.id },
    select: { id: true },
  });

  if (!teamMember) redirect("/logistics/couriers?error=Team%20member%20not%20found.");

  await db.logisticsTeamMember.update({
    where: { id: teamMember.id },
    data: { status },
  });

  revalidatePath("/logistics/couriers");
  revalidatePath("/logistics/profile");
  redirect("/logistics/couriers?saved=1");
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
  if (!file) redirect("/logistics/profile?error=No+file+selected");

  try {
    const { uploadFileServer } = await import("@/lib/supabase/storage.server");
    const { publicUrl } = await uploadFileServer("logistics-logos", file, `logistics-logos/${partner.id}/${file.name}`);
    await db.logisticsPartner.update({ where: { id: partner.id }, data: { logoUrl: publicUrl } });
    redirect("/logistics/profile?saved=true");
  } catch {
    redirect("/logistics/profile?error=Upload+failed");
  }
}
