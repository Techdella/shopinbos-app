import "server-only";

import { db } from "@/lib/db/client";
import { cacCheckEnabled } from "@/lib/kyb/verify-cac.server";
import { deliverySettingsFor } from "@/lib/delivery-market/market.server";
import { normalizeVerificationDocs } from "@shared/verification-docs";
import { businessCategories } from "@shared/onboarding";
import { CAC_ANSWERS, isSupplierStep, preorderLocked, readSupplierIdentity, sourceForBusinessType, supplierTiers, type CacAnswer } from "@shared/supplier-onboarding";
import { supplierIdChecksReady } from "./supplier.server";

// What the supplier onboarding screens start from (GET /api/supplier/onboarding, the web page and the phone app):
// every answer saved so far, the ID check's state and the screen to resume on.

/** Top-level marketplace categories, for "What do you supply?". */
export async function supplierCategoryOptions(): Promise<string[]> {
  const rows = await db.category.findMany({ where: { parentId: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true }, take: 40 }).catch(() => []);
  return businessCategories(rows.map((row) => row.name));
}

function stateOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function supplierOnboardingView(userId: string) {
  const supplier = await db.supplier.findUnique({
    where: { userId },
    select: {
      id: true,
      businessName: true,
      displayName: true,
      businessType: true,
      country: true,
      city: true,
      address: true,
      categories: true,
      buyModes: true,
      level: true,
      minimumOrder: true,
      pickupLat: true,
      pickupLng: true,
      verificationStatus: true,
      trustScore: true,
      verificationDocuments: true,
      identityChecks: true,
      onboardingState: true,
      payoutAccount: { select: { verificationStatus: true } },
      user: { select: { name: true } },
      _count: { select: { products: true } },
    },
  });
  if (!supplier) return null;
  const [categoryOptions, where] = await Promise.all([supplierCategoryOptions(), deliverySettingsFor(userId).catch(() => null)]);
  const docs = normalizeVerificationDocs(supplier.verificationDocuments);
  const identity = readSupplierIdentity(supplier.identityChecks);
  const state = stateOf(supplier.onboardingState);
  const doc = (type: string) => docs.find((row) => row.type === type) ?? null;
  const cac = doc("cac");
  const idDoc = doc("identity");
  const selfie = doc("selfie");
  const [firstName = "", ...rest] = String(supplier.user.name ?? "").trim().split(/\s+/);
  const tiers = supplierTiers({ verificationStatus: String(supplier.verificationStatus), docs, identity, payoutVerified: supplier.payoutAccount?.verificationStatus === "verified" });

  return {
    businessName: supplier.businessName,
    displayName: supplier.displayName,
    categories: supplier.categories,
    categoryOptions,
    businessType: supplier.businessType,
    source: state.sourceAnswered === true ? sourceForBusinessType(supplier.businessType) : null,
    buyModes: supplier.buyModes,
    /** Track record level; Pre-order stays locked below Established (shared/supplier-onboarding.ts preorderLocked). */
    level: supplier.level,
    preorderLocked: preorderLocked(supplier.level),
    minimumOrder: supplier.minimumOrder,
    country: supplier.country,
    city: supplier.city,
    address: supplier.address ?? where?.originAddress ?? "",
    originState: where?.originState ?? null,
    pickupLat: supplier.pickupLat,
    pickupLng: supplier.pickupLng,
    cacAnswer: (CAC_ANSWERS as readonly string[]).includes(String(state.cacAnswer)) ? (state.cacAnswer as CacAnswer) : null,
    cac: cac ? { status: cac.status, registeredName: cac.registry?.registeredName ?? null, number: cac.registry?.rcNumber ?? null, verified: Boolean(cac.registry?.verified) } : null,
    cacCheckEnabled: cacCheckEnabled(),
    idType: identity.idType ?? null,
    idDocument: idDoc ? { status: idDoc.status, reason: idDoc.rejectionReason ?? null, uploadedAt: idDoc.uploadedAt, updatedAt: idDoc.updatedAt } : null,
    selfie: selfie ? { status: selfie.status, reason: selfie.rejectionReason ?? null, faceMatch: selfie.faceMatch ?? null, uploadedAt: selfie.uploadedAt, updatedAt: selfie.updatedAt } : null,
    nin: identity.nin ? { status: identity.nin.status, last4: identity.nin.last4 } : null,
    idChecksReady: supplierIdChecksReady(),
    owner: { firstName, lastName: rest.join(" ") },
    productCount: supplier._count.products,
    catalogueRequested: typeof state.catalogueRequestedAt === "string",
    step: isSupplierStep(state.step) ? state.step : null,
    completed: state.completed === true,
    docsLater: typeof state.docsLaterAt === "string",
    verificationStatus: supplier.verificationStatus,
    trustScore: supplier.trustScore,
    tiers,
    // Older screens (phone app before this version, dashboard) still read these.
    verificationDocuments: docs,
    onboardingState: state,
  };
}

export type SupplierOnboardingView = NonNullable<Awaited<ReturnType<typeof supplierOnboardingView>>>;
