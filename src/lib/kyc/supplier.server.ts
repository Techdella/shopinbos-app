import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { phoneVerifySecret } from "@/lib/commerce/phone-verify";
import { korapayIdentityReady } from "@/lib/korapay";
import { youverifyReady } from "@/lib/youverify";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { notifyAdminsToReview, notifyVerificationDecision } from "@/lib/notifications/events.server";
import { removePrivateFile, uploadPrivateFile } from "@/lib/supabase/storage.server";
import { DOC_TYPE_LABELS, normalizeVerificationDocs, type FaceMatchCheck, type LivenessCheck, type VerificationDoc } from "@shared/verification-docs";
import { ID_TYPE_LABELS, identitySent, nextSupplierStatus, readSupplierIdentity, supplierTiers, type SupplierIdentity, type SupplierIdType } from "@shared/supplier-onboarding";

// A supplier's ID check in onboarding (/supplier/onboarding, /api/supplier/kyc/*): the photo of their ID and the
// selfie are private files kept as the "identity" and "selfie" documents (the admin supplier page shows them with
// the face match), and the NIN result sits in Supplier.identityChecks. refreshSupplierVerification follows every
// change, so a supplier whose ID and selfie are approved is listed to shops ("Verified Individual") without waiting.

/** The key for ID hashes (the checkout phone check's secret; empty in production without one). */
export function kycSecret() {
  return phoneVerifySecret();
}

/** NIN checks can run (Korapay Identity, else Youverify). Without them the team checks the ID and selfie. */
export function supplierIdChecksReady() {
  return korapayIdentityReady() || youverifyReady();
}

export async function updateSupplierIdentity(supplierId: string, update: (current: SupplierIdentity) => SupplierIdentity) {
  const row = await db.supplier.findUnique({ where: { id: supplierId }, select: { identityChecks: true } });
  const next = update(readSupplierIdentity(row?.identityChecks));
  await db.supplier.update({ where: { id: supplierId }, data: { identityChecks: next as unknown as Prisma.InputJsonValue } });
  return next;
}

/**
 * Keeps a photo of the supplier's ID or their selfie as a private file and its document, replacing an earlier one
 * and its file. `status` is the decision so far: pending waits for the team like a sent document.
 */
export async function saveSupplierPhoto(
  supplierId: string,
  type: "identity" | "selfie",
  photo: { bytes: Buffer; mimeType: string; ext: string },
  outcome: { status: "pending" | "approved" | "rejected"; reason?: string; idType?: SupplierIdType; faceMatch?: FaceMatchCheck; liveness?: LivenessCheck },
) {
  const file = new File([new Uint8Array(photo.bytes)], `${type}.${photo.ext}`, { type: photo.mimeType });
  const { path } = await uploadPrivateFile(`supplier-verifications/${supplierId}/${type}`, file);
  const supplier = await db.supplier.findUnique({ where: { id: supplierId }, select: { verificationDocuments: true } });
  const docs = normalizeVerificationDocs(supplier?.verificationDocuments);
  const previous = docs.filter((doc) => doc.type === type);
  const now = new Date().toISOString();
  const doc: VerificationDoc = {
    id: previous[0]?.id ?? `${type}-${Date.now()}`,
    type,
    label: type === "identity" && outcome.idType ? ID_TYPE_LABELS[outcome.idType] : DOC_TYPE_LABELS[type],
    fileName: file.name,
    filePath: path,
    fileSize: file.size,
    mimeType: photo.mimeType,
    status: outcome.status === "pending" ? "submitted" : outcome.status,
    uploadedAt: now,
    updatedAt: now,
    ...(outcome.reason ? { rejectionReason: outcome.reason } : {}),
    ...(outcome.faceMatch ? { faceMatch: outcome.faceMatch } : {}),
    ...(outcome.liveness ? { liveness: outcome.liveness } : {}),
  };
  try {
    await db.supplier.update({
      where: { id: supplierId },
      data: { verificationDocuments: [...docs.filter((row) => row.type !== type), doc] as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    await removePrivateFile(path).catch(() => undefined);
    throw error;
  }
  await Promise.all(previous.map((row) => (row.filePath ? removePrivateFile(row.filePath).catch(() => undefined) : undefined)));
  return doc;
}

/** Sets an existing document's status (the ID photo approved together with a matching NIN selfie). */
export async function setSupplierDocStatus(supplierId: string, type: "identity" | "selfie", status: "approved" | "rejected" | "submitted", onlyFrom?: string[]) {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId }, select: { verificationDocuments: true } });
  const docs = normalizeVerificationDocs(supplier?.verificationDocuments);
  const target = docs.find((doc) => doc.type === type);
  if (!target || (onlyFrom && !onlyFrom.includes(target.status))) return;
  const now = new Date().toISOString();
  await db.supplier.update({
    where: { id: supplierId },
    data: { verificationDocuments: docs.map((doc) => (doc.type === type ? { ...doc, status, updatedAt: now } : doc)) as unknown as Prisma.InputJsonValue },
  });
}

function stateOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Onboarding was sent for review (step 11), not just opened with "Skip for now". */
export function onboardingSent(state: unknown) {
  return stateOf(state).completed === true;
}

export async function supplierTierSnapshot(supplierId: string) {
  const row = await db.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, slug: true, userId: true, displayName: true, verificationStatus: true, verificationDocuments: true, identityChecks: true, onboardingState: true, payoutAccount: { select: { verificationStatus: true } } },
  });
  if (!row) return null;
  const docs = normalizeVerificationDocs(row.verificationDocuments);
  const snapshot = { verificationStatus: String(row.verificationStatus), docs, identity: readSupplierIdentity(row.identityChecks), payoutVerified: row.payoutAccount?.verificationStatus === "verified" };
  return { row, docs, snapshot, tiers: supplierTiers(snapshot) };
}

/**
 * Moves a supplier that sent onboarding to verified as soon as their ID and selfie are approved, or to pending for
 * the team. Safe to call any time; does nothing when nothing changed.
 */
export async function refreshSupplierVerification(supplierId: string) {
  const found = await supplierTierSnapshot(supplierId);
  if (!found) return null;
  const { row, docs, tiers } = found;
  const current = String(row.verificationStatus);
  const status = nextSupplierStatus(current, onboardingSent(row.onboardingState), tiers);
  if (status !== current) {
    await db.supplier.update({ where: { id: supplierId }, data: { verificationStatus: status as "verified" } });
    invalidatePublicMarketplaceCache({ supplierSlug: row.slug });
    if (status === "verified") await notifyVerificationDecision({ userId: row.userId, status, portal: "supplier" });
    if (status === "pending") {
      await notifyAdminsToReview({
        title: `${row.displayName} is waiting for review`,
        description: identitySent(docs) ? "Check their ID photo and selfie." : "Check their business details.",
        link: `/admin/suppliers/${row.id}`,
        dedupeKey: `supplier-review:${row.id}:${new Date().toISOString().slice(0, 10)}`,
      }).catch(() => undefined);
    }
  }
  return { status, tiers };
}
