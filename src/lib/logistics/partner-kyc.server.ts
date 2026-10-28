import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { generatePhoneCode, phoneVerifySecret } from "@/lib/commerce/phone-verify";
import { deliverCode } from "@/lib/auth/otp-delivery.server";
import { getPublicEnv } from "@/lib/env";
import { korapayIdentityReady } from "@/lib/korapay";
import { youverifyReady } from "@/lib/youverify";
import { notifyAdminsToReview } from "@/lib/notifications/events.server";
import { DOC_TYPE_LABELS, LOGISTICS_TIER_DOC_TYPES, normalizeVerificationDocs, submitUploadedDocs, type FaceMatchCheck, type LivenessCheck, type VerificationDoc } from "@shared/verification-docs";
import { removePrivateFile, uploadPrivateFile } from "@/lib/supabase/storage.server";
import { e164 } from "@/lib/sms/pure";
import {
  ITEM_LABELS,
  PARTNER_TERMS_VERSION,
  flowProgress,
  itemsWhere,
  partnerVerificationState,
  readFlowAnswers,
  readIdentityChecks,
  readyToSubmit,
  tier1Checklist,
  tier2Checklist,
  type FlowAnswers,
  type IdentityChecks,
} from "@shared/partner-tiers";
import { checkGraduation, partnerTierSnapshot, refreshPartnerTier } from "./partner-tiers.server";

// The partner's own verification steps (/logistics/verification, /api/logistics/kyc/*). The tier rules are
// shared/partner-tiers.ts; every change here is followed by refreshPartnerTier so the tier, badges and status follow.

/** The key for code, token and ID hashes (the checkout phone check's secret; empty in production without one). */
export function kycSecret() {
  return phoneVerifySecret();
}

/** NIN and BVN checks can run (Korapay Identity, else Youverify). Without them a NIN waits for the team. */
export function idChecksReady() {
  return korapayIdentityReady() || youverifyReady();
}

export async function kycPartnerFor(userId: string) {
  return db.logisticsPartner.findUnique({
    where: { userId },
    select: { id: true, slug: true, userId: true, displayName: true, companyName: true, verificationStatus: true, identityChecks: true, kycSubmittedAt: true, onboardingState: true },
  });
}

export type KycPartner = NonNullable<Awaited<ReturnType<typeof kycPartnerFor>>>;

/** Read-modify-write of LogisticsPartner.identityChecks, then the tier refresh. */
export async function updateIdentityChecks(partnerId: string, update: (current: IdentityChecks) => IdentityChecks) {
  const row = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { identityChecks: true } });
  const next = update(readIdentityChecks(row?.identityChecks));
  await db.logisticsPartner.update({ where: { id: partnerId }, data: { identityChecks: next as unknown as Prisma.InputJsonValue } });
  await refreshPartnerTier(partnerId);
  return next;
}

/** The account's own phone (+234…), when Supabase confirmed it with the sign-up code (auth.users). Null otherwise. */
export async function confirmedAuthPhone(supabaseId: string): Promise<string | null> {
  const rows = await db.$queryRaw<Array<{ phone: string | null; confirmed: Date | null }>>`
    SELECT u."phone" AS "phone", u."phone_confirmed_at" AS "confirmed" FROM auth.users u WHERE u."id"::text = ${supabaseId} LIMIT 1`.catch(() => null);
  const row = rows?.[0];
  return row?.phone && row.confirmed ? e164(row.phone.startsWith("+") ? row.phone : `+${row.phone}`) : null;
}

/**
 * The phone the partner signed up with was already confirmed by its code, so it counts for Tier 1 without another
 * one. Only fills a phone that isn't confirmed yet; one they confirmed here themselves stays.
 */
export async function syncSignUpPhone(partner: KycPartner, supabaseId: string) {
  const current = readIdentityChecks(partner.identityChecks);
  if (current.phone?.status === "approved") return;
  const phone = await confirmedAuthPhone(supabaseId);
  if (!phone) return;
  await updateIdentityChecks(partner.id, (checks) => ({ ...checks, phone: { value: phone, status: "approved", verifiedAt: new Date().toISOString() } }));
}

/** Saves flow answers (onboardingState.partnerFlow) next to whatever else onboardingState holds, with other fields. */
export async function saveFlowAnswers(partnerId: string, update: Partial<FlowAnswers>, data: Prisma.LogisticsPartnerUpdateInput = {}) {
  const row = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { onboardingState: true, deliveryAreas: true } });
  const state = row?.onboardingState && typeof row.onboardingState === "object" && !Array.isArray(row.onboardingState) ? (row.onboardingState as Record<string, unknown>) : {};
  const answers = { ...readFlowAnswers(state), ...update };
  // Set-up is done once they've said where they deliver: the rest of the portal opens.
  const areas = Array.isArray(data.deliveryAreas) ? data.deliveryAreas : row?.deliveryAreas ?? [];
  const completed = state.completed === true || areas.length > 0;
  await db.logisticsPartner.update({
    where: { id: partnerId },
    data: {
      ...data,
      onboardingState: {
        ...state,
        partnerFlow: answers,
        flow: "questions",
        ...(completed ? { completed: true, completedAt: typeof state.completedAt === "string" ? state.completedAt : new Date().toISOString() } : {}),
      } as Prisma.InputJsonValue,
    },
  });
  await refreshPartnerTier(partnerId);
}

/** The account's own email, when Supabase has confirmed it (auth.users). Null when it can't be read. */
export async function confirmedAuthEmail(supabaseId: string): Promise<string | null> {
  const rows = await db.$queryRaw<Array<{ email: string | null; confirmed: Date | null }>>`
    SELECT u."email" AS "email", u."email_confirmed_at" AS "confirmed" FROM auth.users u WHERE u."id"::text = ${supabaseId} LIMIT 1`.catch(() => null);
  const row = rows?.[0];
  return row?.email && row.confirmed ? row.email.trim().toLowerCase() : null;
}

const TIER_DOC_TYPES = new Set(LOGISTICS_TIER_DOC_TYPES.map((config) => config.type));

/** Everything the verification page and the dashboard card show. Never a whole ID number, nor any hash. */
export async function kycState(partnerId: string) {
  const [found, partner, vehicles] = await Promise.all([
    partnerTierSnapshot(partnerId),
    db.logisticsPartner.findUnique({
      where: { id: partnerId },
      select: {
        verificationStatus: true, verificationTier: true, kycSubmittedAt: true, statusReason: true, badges: true, limitsLiftedAt: true,
        termsVersion: true, termsAcceptedAt: true, registeredName: true, cacType: true, cacNumber: true, businessAddress: true,
        deliveryAreas: true, vehicleTypes: true, verificationDocuments: true, displayName: true, companyName: true,
        onboardingState: true, services: true, basePrice: true, user: { select: { name: true } },
      },
    }),
    db.logisticsVehicle.findMany({ where: { logisticsPartnerId: partnerId }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!found || !partner) return null;
  const { snapshot } = found;
  const identity = snapshot.identity;
  const tier1 = tier1Checklist(snapshot);
  const tier2 = tier2Checklist(snapshot);
  const answers = readFlowAnswers(partner.onboardingState);
  const flow = flowProgress(snapshot, answers, Boolean(partner.kycSubmittedAt));
  const graduation = await checkGraduation({ id: partnerId, verificationTier: partner.verificationTier, limitsLiftedAt: partner.limitsLiftedAt });
  return {
    state: partnerVerificationState(partner),
    tier: partner.verificationTier,
    badges: partner.badges,
    statusReason: partner.statusReason,
    submittedAt: partner.kycSubmittedAt?.toISOString() ?? null,
    termsCurrent: partner.termsVersion === PARTNER_TERMS_VERSION,
    idChecksReady: idChecksReady(),
    displayName: partner.displayName,
    /** The account holder's name (sign-up), for "Just use my name" and the NIN fields. */
    accountName: partner.user.name,
    identity: {
      fullName: identity.fullName ?? null,
      address: identity.address ?? null,
      base: identity.base ?? null,
      idDocument: identity.idDocument ?? null,
      phone: identity.phone ?? null,
      email: identity.email ?? null,
      nin: identity.nin ? { last4: identity.nin.last4, status: identity.nin.status, rejectionReason: identity.nin.rejectionReason ?? null } : null,
      payout: identity.payout
        ? {
            method: identity.payout.method,
            last4: identity.payout.last4,
            status: identity.payout.status,
            bankName: identity.payout.bankName ?? null,
            accountName: identity.payout.accountName ?? null,
            nameMatched: identity.payout.nameMatched,
            rejectionReason: identity.payout.rejectionReason ?? null,
          }
        : null,
    },
    docs: normalizeVerificationDocs(partner.verificationDocuments).filter((doc) => TIER_DOC_TYPES.has(doc.type)),
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      type: vehicle.type,
      plateNumber: vehicle.plateNumber,
      photoPath: vehicle.photoPath,
      licencePath: vehicle.licencePath,
      status: vehicle.status,
      rejectionReason: vehicle.rejectionReason,
    })),
    coverage: { deliveryAreas: partner.deliveryAreas, deliveryMethods: partner.vehicleTypes, interstate: partner.services.includes("interstate") },
    pricing: { basePrice: partner.basePrice },
    flow: { answers, done: flow.done, first: flow.first },
    business: { registeredName: partner.registeredName, cacType: partner.cacType, cacNumber: partner.cacNumber, businessAddress: partner.businessAddress, companyName: partner.companyName },
    tier1,
    tier2,
    readyToSubmit: readyToSubmit(tier1),
    limits: { limited: graduation.limited, rules: graduation.rules, progress: graduation.progress, liftedAt: partner.limitsLiftedAt?.toISOString() ?? null },
  };
}

export type KycState = NonNullable<Awaited<ReturnType<typeof kycState>>>;

export type SubmitResult = { ok: true } | { ok: false; status: number; error: string; missing?: string[] };

/** English names of checklist items, for the error shown when something is missing. */
const ITEM_WORDS: Record<string, string> = {
  terms: "accept the partner terms",
  phone: "confirm your phone",
  idDocument: "a photo of your ID",
  selfie: "a selfie",
  coverage: "where you deliver",
  methods: "what you deliver with",
  base: "where you're based",
};

/**
 * Sends the partner's verification to the team: everything for Tier 1 must be in (checks may still be waiting),
 * Tier 2 is optional. A rejected partner goes back to "pending"; verified and suspended partners keep their status.
 */
export async function submitPartnerKyc(userId: string): Promise<SubmitResult> {
  const partner = await db.logisticsPartner.findUnique({
    where: { userId },
    select: { id: true, displayName: true, companyName: true, verificationStatus: true, verificationDocuments: true },
  });
  if (!partner) return { ok: false, status: 404, error: "We couldn't find your company. Log out and in again." };
  if (partner.verificationStatus === "suspended") return { ok: false, status: 409, error: "Your account is on hold. Talk to the Shopinbos team in Help." };
  const found = await partnerTierSnapshot(partner.id);
  if (!found) return { ok: false, status: 404, error: "We couldn't find your company. Log out and in again." };
  const items = tier1Checklist(found.snapshot);
  if (!readyToSubmit(items)) {
    const missing = itemsWhere(items, ["missing", "rejected"]);
    return {
      ok: false,
      status: 400,
      missing,
      error: `Before sending for review, add: ${missing.map((key) => ITEM_WORDS[key] ?? ITEM_LABELS[key as keyof typeof ITEM_LABELS] ?? key).join(", ")}.`,
    };
  }
  const docs = normalizeVerificationDocs(partner.verificationDocuments);
  const reopen = partner.verificationStatus !== "verified";
  await db.logisticsPartner.update({
    where: { id: partner.id },
    data: {
      kycSubmittedAt: new Date(),
      verificationDocuments: submitUploadedDocs(docs) as unknown as Prisma.InputJsonValue,
      ...(reopen ? { verificationStatus: "pending" as const, statusReason: null } : {}),
    },
  });
  await notifyAdminsToReview({
    title: `${String(partner.displayName || partner.companyName || "A delivery partner").slice(0, 60)} sent their verification`,
    description: "A delivery partner is waiting for verification. Check their ID photo against their selfie.",
    link: `/admin/logistics-partners/${partner.id}`,
    dedupeKey: `admin.verify:${partner.id}:${new Date().toISOString().slice(0, 10)}`,
  });
  await refreshPartnerTier(partner.id);
  return { ok: true };
}

// ─── Photos taken in the flow ────────────────────────────────────────────────

export type FlowPhotoType = "selfie" | "identity" | "base-photo";
const FLOW_PHOTO_LABELS: Record<FlowPhotoType, string> = { selfie: DOC_TYPE_LABELS.selfie, identity: "Photo of an ID", "base-photo": DOC_TYPE_LABELS["base-photo"] };

/** The selfie, with its face match and liveness reference: see savePartnerPhoto. */
export async function saveSelfie(
  partnerId: string,
  selfie: { bytes: Buffer; mimeType: string; ext: string },
  outcome: { status: "pending" | "approved" | "rejected"; reason?: string; faceMatch?: FaceMatchCheck; liveness?: LivenessCheck },
) {
  return savePartnerPhoto(partnerId, "selfie", selfie, outcome);
}

/**
 * Stores a photo taken in the sign-up flow (selfie, ID, base) privately and records it as that document, with the
 * status it gets now (pending waits for the team, like a sent document) and, for a selfie, the facial match and the
 * liveness reference. Replaces an earlier photo of the same kind and its file.
 */
export async function savePartnerPhoto(
  partnerId: string,
  type: FlowPhotoType,
  photo: { bytes: Buffer; mimeType: string; ext: string },
  outcome: { status: "pending" | "approved" | "rejected"; reason?: string; faceMatch?: FaceMatchCheck; liveness?: LivenessCheck },
) {
  const file = new File([new Uint8Array(photo.bytes)], `${type}.${photo.ext}`, { type: photo.mimeType });
  const { path } = await uploadPrivateFile(`logistics-verifications/${partnerId}/${type}`, file);
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { verificationDocuments: true } });
  const docs = normalizeVerificationDocs(partner?.verificationDocuments);
  const previous = docs.filter((doc) => doc.type === type);
  const now = new Date().toISOString();
  const doc: VerificationDoc = {
    id: previous[0]?.id ?? `${type}-${Date.now()}`,
    type,
    label: FLOW_PHOTO_LABELS[type],
    fileName: file.name,
    filePath: path,
    fileSize: file.size,
    mimeType: photo.mimeType,
    // Decided now: an approved or rejected selfie is final; a pending one waits for the team like a sent document.
    status: outcome.status === "pending" ? "submitted" : outcome.status,
    uploadedAt: now,
    updatedAt: now,
    ...(outcome.reason ? { rejectionReason: outcome.reason } : {}),
    ...(outcome.faceMatch ? { faceMatch: outcome.faceMatch } : {}),
    ...(outcome.liveness ? { liveness: outcome.liveness } : {}),
  };
  try {
    await db.logisticsPartner.update({
      where: { id: partnerId },
      data: { verificationDocuments: [...docs.filter((row) => row.type !== type), doc] as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    await removePrivateFile(path).catch(() => undefined);
    throw error;
  }
  await Promise.all(previous.map((row) => (row.filePath ? removePrivateFile(row.filePath).catch(() => undefined) : undefined)));
  return doc;
}
