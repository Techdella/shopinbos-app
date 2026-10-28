"use server";

import { canWorkExistingJobs } from "@/lib/logistics/job-rules";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { isOnboardingComplete } from "@/lib/role-queries";
import { transitionJob } from "@/lib/logistics/jobs";
import { DECLINE_REASONS } from "@shared/delivery-market";
import {
  endConnection,
  partnerSetPod,
  proposePrivateRateCard,
  removePickupPoint,
  savePartnerBusiness,
  savePartnerCoverage,
  savePickupPoint,
  savePublicRateCard,
  withdrawPrivateRateCard,
} from "@/lib/delivery-market/manage.server";
import { partnerMarksCashRemitted } from "@/lib/delivery-market/jobs.server";

// The delivery partner's side of the logistics marketplace (shared/delivery-market.ts, src/lib/delivery-market):
// rate cards (public and private), pickup points, coverage and services, business details, connections, and
// declining a job or saying the pay-on-delivery cash was paid to the shop. Same conventions as actions/logistics.ts:
// FormData in, redirect back with ?saved=1 or ?error=..., except the rate card editor, which keeps its rows on screen
// and gets the error back (useActionState).

/** What the rate card editor gets back when the card can't be saved (a successful save redirects). */
export type RateFormState = { error: string | null };

async function partnerActor() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });
  if (!partner) redirect("/logistics/profile");
  return { user, partner };
}

/** Setting up (rates, coverage, pickup points): onboarding done. Unverified partners can prepare; they go live once verified. */
async function setupActor() {
  const actor = await partnerActor();
  if (!isOnboardingComplete(actor.partner)) redirect("/logistics/onboarding");
  return actor;
}

/** Working with businesses and jobs: verified, like the dispatch actions in actions/logistics.ts. */
async function verifiedActor() {
  const actor = await setupActor();
  if (actor.partner.verificationStatus !== "verified") redirect("/logistics/verification");
  return actor;
}

/** Jobs it already has (decline, cash records): verified, or suspended, since existing jobs carry on. */
async function jobActor() {
  const actor = await setupActor();
  if (!canWorkExistingJobs(actor.partner)) redirect("/logistics/verification");
  return actor;
}

const go = (path: string, error?: string): never => redirect(error ? `${path}?error=${encodeURIComponent(error)}` : `${path}?saved=1`);

/** A /logistics page the form came from, or the fallback. */
function back(formData: FormData, fallback: string) {
  const value = String(formData.get("returnTo") || "");
  return /^\/logistics\/[a-z-]+$/.test(value) ? value : fallback;
}

function rateInput(formData: FormData) {
  let rows: unknown = [];
  try {
    rows = JSON.parse(String(formData.get("rows") || "[]"));
  } catch {
    rows = [];
  }
  return { rows, failedAttemptFee: formData.get("failedAttemptFee") ?? 0, returnFee: formData.get("returnFee") ?? 0, notes: formData.get("notes") ?? "" };
}

// ─── Rate cards ──────────────────────────────────────────────────────────────

export async function savePartnerRateCard(_prev: RateFormState, formData: FormData): Promise<RateFormState> {
  const { partner } = await setupActor();
  const result = await savePublicRateCard(partner.id, rateInput(formData));
  if (!result.ok) return { error: result.error };
  revalidatePath("/logistics/rates");
  revalidatePath("/logistics/pricing");
  revalidatePath("/logistics/dashboard");
  redirect("/logistics/rates?saved=1");
}

export async function sendPartnerPrivateRates(_prev: RateFormState, formData: FormData): Promise<RateFormState> {
  const { partner } = await verifiedActor();
  const ownerUserId = String(formData.get("ownerUserId") || "");
  if (!ownerUserId) return { error: "Pick the business to send these rates to." };
  const result = await proposePrivateRateCard(partner.id, ownerUserId, rateInput(formData));
  if (!result.ok) return { error: result.error };
  revalidatePath("/logistics/connections");
  redirect("/logistics/connections?saved=rates");
}

export async function withdrawPartnerPrivateRates(formData: FormData) {
  const { partner } = await verifiedActor();
  const result = await withdrawPrivateRateCard(partner.id, String(formData.get("cardId") || ""));
  revalidatePath("/logistics/connections");
  go("/logistics/connections", result.ok ? undefined : result.error);
}

// ─── Coverage, services and business details ─────────────────────────────────

export async function savePartnerMarketCoverage(formData: FormData) {
  const { partner } = await setupActor();
  const result = await savePartnerCoverage(partner.id, {
    services: formData.getAll("services").map(String),
    pickupAreas: String(formData.get("pickupAreas") || ""),
    deliveryAreas: String(formData.get("deliveryAreas") || ""),
    offersPayOnDelivery: formData.get("offersPayOnDelivery") === "on",
  });
  if (!result.ok) go("/logistics/coverage", result.error);
  revalidatePath("/logistics/coverage");
  revalidatePath("/logistics/connections");
  revalidatePath("/logistics/profile");
  const unknown = result.ok ? (result.data?.unknown ?? []) : [];
  redirect(`/logistics/coverage?saved=market${unknown.length ? `&unknown=${encodeURIComponent(unknown.slice(0, 20).join("; "))}` : ""}#where-you-work`);
}

export async function savePartnerBusinessDetails(formData: FormData) {
  const { partner } = await partnerActor();
  const result = await savePartnerBusiness(partner.id, {
    cacNumber: formData.get("cacNumber"),
    contactName: formData.get("contactName"),
    contactPhone: formData.get("contactPhone"),
    contactEmail: formData.get("contactEmail"),
    address: formData.get("address"),
  });
  revalidatePath("/logistics/profile");
  go("/logistics/profile", result.ok ? undefined : result.error);
}

// ─── Pickup points ───────────────────────────────────────────────────────────

export async function savePartnerPickupPoint(formData: FormData) {
  const { partner } = await setupActor();
  const pointId = String(formData.get("pointId") || "") || null;
  const result = await savePickupPoint(partner.id, pointId, {
    name: formData.get("name"),
    address: formData.get("address"),
    state: formData.get("state"),
    area: formData.get("area"),
    hours: formData.get("hours"),
    phone: formData.get("phone"),
    lat: String(formData.get("lat") ?? "").trim(),
    lng: String(formData.get("lng") ?? "").trim(),
  });
  revalidatePath("/logistics/pickup-points");
  go("/logistics/pickup-points", result.ok ? undefined : result.error);
}

export async function removePartnerPickupPoint(formData: FormData) {
  const { partner } = await setupActor();
  const result = await removePickupPoint(partner.id, String(formData.get("pointId") || ""));
  revalidatePath("/logistics/pickup-points");
  go("/logistics/pickup-points", result.ok ? undefined : result.error);
}

// ─── Connections ─────────────────────────────────────────────────────────────

export async function setPartnerConnectionPod(formData: FormData) {
  const { partner } = await verifiedActor();
  const result = await partnerSetPod(partner.id, String(formData.get("connectionId") || ""), formData.get("on") === "1");
  revalidatePath("/logistics/connections");
  go("/logistics/connections", result.ok ? undefined : result.error);
}

export async function endPartnerConnection(formData: FormData) {
  const { user, partner } = await verifiedActor();
  const result = await endConnection({ userId: user.id, side: "partner", partnerId: partner.id }, String(formData.get("connectionId") || ""));
  revalidatePath("/logistics/connections");
  go("/logistics/connections", result.ok ? undefined : result.error);
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

/** "Decline" a new job with a reason, so the shop can send it to another partner. */
export async function declinePartnerJob(formData: FormData) {
  const { partner } = await jobActor();
  const to = back(formData, "/logistics/bookings");
  const picked = String(formData.get("reason") || "");
  const detail = String(formData.get("detail") || "").trim().slice(0, 240);
  const known = (DECLINE_REASONS as readonly string[]).includes(picked) ? picked : "";
  const reason = known === "Other" || !known ? detail : detail ? `${known}. ${detail}` : known;
  if (!reason) go(to, known === "Other" ? "Say why you can't take this job." : "Pick why you can't take this job.");
  const result = await transitionJob({ bookingId: String(formData.get("bookingId") || ""), partnerId: partner.id, to: "declined", actor: "partner", declineReason: reason });
  revalidatePath("/logistics/bookings");
  revalidatePath("/logistics/dashboard");
  go(to, result.ok ? undefined : result.error);
}

/** Pay on delivery: the partner says they've paid the shop the cash the rider collected (a record only). */
export async function markCashPaidToShop(formData: FormData) {
  const { partner } = await jobActor();
  const to = back(formData, "/logistics/bookings");
  const result = await partnerMarksCashRemitted(partner.id, String(formData.get("bookingId") || ""));
  revalidatePath("/logistics/bookings");
  go(to, result.ok ? undefined : result.error);
}
