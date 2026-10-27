import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { generatePhoneCode, phoneVerifySecret } from "@/lib/commerce/phone-verify";
import { deliverCode } from "@/lib/auth/otp-delivery.server";
import { getPublicEnv } from "@/lib/env";
import { korapayIdentityReady } from "@/lib/korapay";
import { youverifyReady } from "@/lib/youverify";
import { notifyAdminsToReview } from "@/lib/notifications/events.server";
import { LOGISTICS_TIER_DOC_TYPES, normalizeVerificationDocs, submitUploadedDocs } from "@shared/verification-docs";
import {
  PARTNER_TERMS_VERSION,
  itemsWhere,
  partnerVerificationState,
  readIdentityChecks,
  readyToSubmit,
  tier1Checklist,
  tier2Checklist,
  type IdentityChecks,
} from "@shared/partner-tiers";
import { checkGraduation, partnerTierSnapshot, refreshPartnerTier } from "./partner-tiers.server";
import {
  GUARANTOR_CODE_TTL_MS,
  guarantorCodeHash,
  guarantorMessage,
  guarantorResendWait,
  guarantorTokenHash,
  newGuarantorToken,
} from "./partner-kyc";

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
    select: { id: true, slug: true, userId: true, displayName: true, companyName: true, verificationStatus: true, identityChecks: true, kycSubmittedAt: true },
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
  const [found, partner, vehicles, guarantor] = await Promise.all([
    partnerTierSnapshot(partnerId),
    db.logisticsPartner.findUnique({
      where: { id: partnerId },
      select: {
        verificationStatus: true, verificationTier: true, kycSubmittedAt: true, statusReason: true, badges: true, limitsLiftedAt: true,
        termsVersion: true, termsAcceptedAt: true, registeredName: true, cacType: true, cacNumber: true, businessAddress: true,
        deliveryAreas: true, vehicleTypes: true, verificationDocuments: true, displayName: true, companyName: true,
      },
    }),
    db.logisticsVehicle.findMany({ where: { logisticsPartnerId: partnerId }, orderBy: { createdAt: "asc" } }),
    db.logisticsGuarantor.findUnique({ where: { logisticsPartnerId: partnerId } }),
  ]);
  if (!found || !partner) return null;
  const { snapshot } = found;
  const identity = snapshot.identity;
  const tier1 = tier1Checklist(snapshot);
  const tier2 = tier2Checklist(snapshot);
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
    identity: {
      fullName: identity.fullName ?? null,
      address: identity.address ?? null,
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
    guarantor: guarantor
      ? {
          fullName: guarantor.fullName,
          phone: guarantor.phone,
          address: guarantor.address,
          relationship: guarantor.relationship,
          status: guarantor.status,
          respondedVia: guarantor.respondedVia,
          resendIn: guarantor.status === "pending" ? guarantorResendWait(guarantor) : null,
        }
      : null,
    coverage: { deliveryAreas: partner.deliveryAreas, deliveryMethods: partner.vehicleTypes },
    business: { registeredName: partner.registeredName, cacType: partner.cacType, cacNumber: partner.cacNumber, businessAddress: partner.businessAddress, companyName: partner.companyName },
    tier1,
    tier2,
    readyToSubmit: readyToSubmit(tier1),
    limits: { limited: graduation.limited, rules: graduation.rules, progress: graduation.progress, liftedAt: partner.limitsLiftedAt?.toISOString() ?? null },
  };
}

export type KycState = NonNullable<Awaited<ReturnType<typeof kycState>>>;

export type SubmitResult = { ok: true } | { ok: false; status: number; error: string; missing?: string[] };

/** English names of checklist items, for the error the phone app shows when something is missing. */
const ITEM_WORDS: Record<string, string> = {
  terms: "accept the partner terms",
  fullName: "your full name",
  phone: "verify your phone",
  email: "verify your email",
  nin: "your NIN",
  selfie: "a selfie",
  payout: "your BVN or bank account",
  address: "your address",
  coverage: "where you deliver",
  methods: "how you deliver",
  vehicles: "a vehicle",
  guarantor: "a guarantor",
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
      error: `Before sending for review, add: ${missing.map((key) => ITEM_WORDS[key] ?? key).join(", ")}. Open Verification on the web to finish.`,
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
    description: "A delivery partner is waiting for verification. Check their ID, vehicles and guarantor.",
    link: `/admin/logistics-partners/${partner.id}`,
    dedupeKey: `admin.verify:${partner.id}:${new Date().toISOString().slice(0, 10)}`,
  });
  await refreshPartnerTier(partner.id);
  return { ok: true };
}

// ─── Guarantor ───────────────────────────────────────────────────────────────

export type GuarantorSend = { ok: true } | { ok: false; error: string; status: number };

/** Texts the guarantor a new code and link (each send replaces the last code and link). */
export async function sendGuarantorCode(partnerId: string): Promise<GuarantorSend> {
  const secret = kycSecret();
  if (!secret) return { ok: false, status: 503, error: "We can't send codes right now. Try again later." };
  const [guarantor, partner] = await Promise.all([
    db.logisticsGuarantor.findUnique({ where: { logisticsPartnerId: partnerId } }),
    db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { displayName: true } }),
  ]);
  if (!guarantor || !partner) return { ok: false, status: 404, error: "Add your guarantor first." };
  if (guarantor.status !== "pending") return { ok: false, status: 409, error: "Your guarantor has already answered." };
  const wait = guarantorResendWait(guarantor);
  if (wait === null) return { ok: false, status: 429, error: "We've texted your guarantor as many times as we can. Ask them to check their messages, or talk to the Shopinbos team." };
  if (wait > 0) return { ok: false, status: 429, error: `Wait ${wait} seconds before texting your guarantor again.` };

  const code = generatePhoneCode();
  const token = newGuarantorToken();
  const link = `${getPublicEnv().appUrl.replace(/\/$/, "")}/guarantor/${token}`;
  const sent = await deliverCode({ phone: guarantor.phone, otp: code, message: guarantorMessage(partner.displayName, code, link), via: "sms" });
  if (!sent.ok) {
    console.error("[partner-kyc] guarantor code not sent", sent.error);
    return { ok: false, status: 503, error: "We couldn't text your guarantor just now. Check the number and try again." };
  }
  await db.logisticsGuarantor.update({
    where: { id: guarantor.id },
    data: {
      codeHash: guarantorCodeHash(secret, guarantor.id, code),
      codeExpiresAt: new Date(Date.now() + GUARANTOR_CODE_TTL_MS),
      codeAttempts: 0,
      tokenHash: guarantorTokenHash(secret, token),
      lastSentAt: new Date(),
      sendCount: { increment: 1 },
    },
  });
  return { ok: true };
}

/** The guarantor behind a link token, with only what their page may show. */
export async function guarantorForToken(token: string) {
  const secret = kycSecret();
  if (!secret || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return db.logisticsGuarantor.findUnique({
    where: { tokenHash: guarantorTokenHash(secret, token) },
    select: { id: true, fullName: true, status: true, codeHash: true, codeExpiresAt: true, codeAttempts: true, logisticsPartnerId: true, logisticsPartner: { select: { displayName: true } } },
  });
}
