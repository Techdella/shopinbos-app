import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { normalizeVerificationDocs, docHasEvidence, type DocStatus } from "@shared/verification-docs";
import {
  ACTIVE_JOB_STATUSES,
  DEFAULT_TIER_RULES,
  TIER_RULES_KEY,
  graduationProgress,
  jobLimitProblem,
  limitProblemMessage,
  limitsApply,
  nextTier,
  nextVerificationStatus,
  partnerBadges,
  readIdentityChecks,
  readTierRules,
  type CheckStatus,
  type PartnerRecord,
  type TierRules,
  type TierSnapshot,
} from "@shared/partner-tiers";
import { notifyVerificationDecision } from "@/lib/notifications/events.server";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";

// Tiered delivery partner verification, server side (the rules are shared/partner-tiers.ts). refreshPartnerTier is
// called after anything that can change a partner's checks (a partner saving a step, the team approving or
// rejecting an item): it stores the tier and badges and, once a submitted partner's Tier 1 checks are all approved,
// makes them "verified" so they can take jobs. partnerJobLimitProblem keeps Tier 1 partners inside their limits
// wherever a job is offered (seller bookings, accepted quotes, checkout).

// ─── Rules (Admin › Logistics partners › Tier rules) ─────────────────────────

export async function getTierRules(): Promise<TierRules> {
  const row = await db.platformSetting.findUnique({ where: { key: TIER_RULES_KEY } }).catch(() => null);
  return row ? readTierRules(row.value) : DEFAULT_TIER_RULES;
}

export async function saveTierRules(input: unknown, adminId: string, note?: string | null): Promise<TierRules> {
  const rules = readTierRules(input);
  const before = await db.platformSetting.findUnique({ where: { key: TIER_RULES_KEY } });
  const value = rules as unknown as Prisma.InputJsonValue;
  await db.$transaction([
    db.platformSetting.upsert({ where: { key: TIER_RULES_KEY }, create: { key: TIER_RULES_KEY, value, updatedById: adminId }, update: { value, updatedById: adminId } }),
    db.platformSettingChange.create({
      data: { key: TIER_RULES_KEY, before: (before?.value ?? undefined) as Prisma.InputJsonValue | undefined, after: value, note: note?.trim().slice(0, 300) || null, changedById: adminId },
    }),
  ]);
  return rules;
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

const SNAPSHOT_SELECT = {
  id: true,
  slug: true,
  userId: true,
  verificationStatus: true,
  verificationTier: true,
  kycSubmittedAt: true,
  termsVersion: true,
  identityChecks: true,
  deliveryAreas: true,
  vehicleTypes: true,
  verificationDocuments: true,
  registeredName: true,
  cacType: true,
  cacNumber: true,
  badges: true,
  limitsLiftedAt: true,
  vehicles: { select: { status: true } },
  guarantor: { select: { status: true } },
  payoutAccount: { select: { verificationStatus: true, accountName: true } },
} satisfies Prisma.LogisticsPartnerSelect;

type SnapshotRow = Prisma.LogisticsPartnerGetPayload<{ select: typeof SNAPSHOT_SELECT }>;

/** A document's status as a check: sent or waiting → pending. */
function docCheckStatus(status: DocStatus): CheckStatus | undefined {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "draft") return undefined;
  return "pending";
}

export function snapshotOf(row: SnapshotRow): TierSnapshot {
  const docs: TierSnapshot["docs"] = {};
  const all = normalizeVerificationDocs(row.verificationDocuments);
  for (const doc of all) {
    if (!docHasEvidence(doc)) continue;
    const status = docCheckStatus(doc.status);
    if (status) docs[doc.type] = status;
  }
  const cac = all.find((doc) => doc.type === "cac" && doc.registry?.verified);
  return {
    verificationStatus: String(row.verificationStatus),
    verificationTier: row.verificationTier,
    termsVersion: row.termsVersion,
    identity: readIdentityChecks(row.identityChecks),
    deliveryAreas: row.deliveryAreas,
    deliveryMethods: row.vehicleTypes,
    docs,
    cacRegistryVerified: Boolean(cac),
    vehicles: row.vehicles,
    guarantor: row.guarantor,
    registeredName: row.registeredName,
    cacType: row.cacType,
    cacNumber: row.cacNumber,
    payoutAccount: row.payoutAccount ? { verified: row.payoutAccount.verificationStatus === "verified", accountName: row.payoutAccount.accountName } : null,
  };
}

export async function partnerTierSnapshot(partnerId: string) {
  const row = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: SNAPSHOT_SELECT });
  return row ? { row, snapshot: snapshotOf(row) } : null;
}

/**
 * Stores the tier and badges the checks earn, and makes a submitted partner "verified" once Tier 1 is complete.
 * Safe to call any time; does nothing when nothing changed.
 */
export async function refreshPartnerTier(partnerId: string) {
  const found = await partnerTierSnapshot(partnerId);
  if (!found) return null;
  const { row, snapshot } = found;
  const tier = nextTier(snapshot);
  const status = nextVerificationStatus(snapshot, Boolean(row.kycSubmittedAt));
  const badges = status === "verified" || status === "suspended" ? partnerBadges(snapshot, tier) : [];
  const changed = tier !== row.verificationTier || status !== String(row.verificationStatus) || badges.join(",") !== row.badges.join(",");
  if (!changed) return { tier, status, badges };
  await db.logisticsPartner.update({
    where: { id: partnerId },
    data: {
      verificationTier: tier,
      badges,
      ...(status !== String(row.verificationStatus) ? { verificationStatus: status as "verified", status: "active", statusReason: null } : {}),
    },
  });
  invalidatePublicMarketplaceCache({ logisticsSlug: row.slug });
  if (status !== String(row.verificationStatus)) await notifyVerificationDecision({ userId: row.userId, status, portal: "logistics" });
  return { tier, status, badges };
}

// ─── Record, graduation and limits ───────────────────────────────────────────

export async function partnerRecord(partnerId: string): Promise<PartnerRecord> {
  const [completed, failed, issues, partner] = await Promise.all([
    db.deliveryBooking.count({ where: { logisticsPartnerId: partnerId, status: "delivered" } }),
    db.deliveryBooking.count({ where: { logisticsPartnerId: partnerId, status: { in: ["failed", "returning", "returned"] } } }),
    db.deliveryIssue.count({ where: { logisticsPartnerId: partnerId } }),
    db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { rating: true, ratingCount: true } }),
  ]);
  return { completed, disputes: failed + issues, rating: partner?.rating ?? 0, ratingCount: partner?.ratingCount ?? 0 };
}

/** Graduation progress, lifting the limits for good the first time all three are met. */
export async function checkGraduation(partner: { id: string; verificationTier: string; limitsLiftedAt: Date | null }, rules?: TierRules) {
  const resolved = rules ?? (await getTierRules());
  const progress = graduationProgress(await partnerRecord(partner.id), resolved);
  let limitsLiftedAt = partner.limitsLiftedAt;
  if (progress.met && limitsApply(partner)) {
    limitsLiftedAt = new Date();
    await db.logisticsPartner.updateMany({ where: { id: partner.id, limitsLiftedAt: null }, data: { limitsLiftedAt } });
  }
  return { progress, rules: resolved, limited: limitsApply({ verificationTier: partner.verificationTier, limitsLiftedAt }) };
}

export async function activeJobCount(partnerId: string) {
  return db.deliveryBooking.count({ where: { logisticsPartnerId: partnerId, status: { in: [...ACTIVE_JOB_STATUSES] } } });
}

/**
 * Why this partner can't be offered a job worth `orderValue` (naira) now, or null. Only Tier 1 partners who
 * haven't graduated have limits.
 */
export async function partnerJobLimitProblem(partnerId: string, orderValue: number): Promise<string | null> {
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { id: true, verificationTier: true, limitsLiftedAt: true } });
  if (!partner || !limitsApply(partner)) return null;
  const { limited, rules } = await checkGraduation(partner);
  if (!limited) return null;
  const problem = jobLimitProblem({ orderValue: Math.max(0, orderValue || 0), activeJobs: await activeJobCount(partner.id) }, rules);
  return problem ? limitProblemMessage(problem) : null;
}

/** Of these partners, the ones that can't take a job worth `orderValue` now (checkout leaves them out). */
export async function partnersOverLimit(partnerIds: string[], orderValue: number): Promise<Set<string>> {
  const out = new Set<string>();
  if (!partnerIds.length) return out;
  const limited = await db.logisticsPartner.findMany({ where: { id: { in: partnerIds }, verificationTier: "tier1", limitsLiftedAt: null }, select: { id: true } });
  for (const partner of limited) {
    if (await partnerJobLimitProblem(partner.id, orderValue)) out.add(partner.id);
  }
  return out;
}
