import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { ok, apiError } from "@/lib/api/response";
import { SupplierOnboardingSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import {
  SUPPLIER_DOC_TYPES,
  isDocComplete,
  findDoc,
  missingRequiredDocs,
  normalizeVerificationDocs,
  submitUploadedDocs,
} from "@shared/verification-docs";

export const GET = withSupplier(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const supplier = await db.supplier.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      businessName: true,
      displayName: true,
      country: true,
      city: true,
      address: true,
      description: true,
      categories: true,
      verificationStatus: true,
      trustScore: true,
      verificationDocuments: true,
      onboardingState: true,
    },
  });

  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  return ok({ ...supplier, verificationDocuments: normalizeVerificationDocs(supplier.verificationDocuments) });
});

export const PATCH = withSupplier(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = SupplierOnboardingSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid onboarding details");
  }

  // Documents are uploaded one by one through /api/supplier/verification/upload, which stores the
  // file and records it. Any document list in the body is ignored so a client can't mark files as
  // uploaded without sending them.
  const now = new Date().toISOString();
  const storedDocuments = normalizeVerificationDocs(supplier.verificationDocuments);
  const missingRequiredDocuments = parsed.data.completed ? missingRequiredDocs(SUPPLIER_DOC_TYPES, storedDocuments) : [];

  if (missingRequiredDocuments.length > 0) {
    return apiError("BAD_REQUEST", `Upload ${missingRequiredDocuments.map((config) => config.label).join(", ")} before submitting.`);
  }

  const previousState = supplier.onboardingState && typeof supplier.onboardingState === "object" && !Array.isArray(supplier.onboardingState)
    ? (supplier.onboardingState as Record<string, unknown>)
    : {};
  if (parsed.data.docsLater && !(parsed.data.businessName ?? supplier.businessName)?.trim()) {
    return apiError("BAD_REQUEST", "Add your business name first.");
  }
  // Once someone chooses "add documents later" they keep portal access; submitting later still works as normal.
  const docsLaterAt = typeof previousState.docsLaterAt === "string" ? previousState.docsLaterAt : parsed.data.docsLater ? now : undefined;

  const requiredTypes = SUPPLIER_DOC_TYPES.filter((config) => config.required);
  const readCount = requiredTypes.filter((config) => isDocComplete(findDoc(storedDocuments, config.type))).length;
  const readinessScore = Math.round((readCount / Math.max(requiredTypes.length, 1)) * 100);
  const onboardingState = {
    source: "supplier-onboarding",
    completed: parsed.data.completed,
    readinessScore,
    documentFindings: parsed.data.documentFindings,
    submittedAt: parsed.data.completed ? now : undefined,
    updatedAt: now,
    ...(docsLaterAt ? { docsLaterAt } : {}),
    // Reminder emails already sent for missing documents (see src/lib/verification/reminders.server.ts).
    ...(Array.isArray(previousState.docReminders) ? { docReminders: previousState.docReminders } : {}),
    ...(Array.isArray(previousState.cacChecks) ? { cacChecks: previousState.cacChecks } : {}),
  };

  if (parsed.data.country || parsed.data.city) {
    await db.user.update({
      where: { id: user.id },
      data: {
        country: parsed.data.country ?? user.country,
        city: parsed.data.city ?? user.city,
      },
    });
  }

  const updated = await db.supplier.update({
    where: { id: supplier.id },
    data: {
      businessName: parsed.data.businessName ?? supplier.businessName,
      displayName: parsed.data.displayName ?? supplier.displayName,
      country: parsed.data.country ?? supplier.country,
      city: parsed.data.city ?? supplier.city,
      address: parsed.data.address ?? supplier.address,
      description: parsed.data.description ?? supplier.description,
      categories: parsed.data.categories?.length ? parsed.data.categories : supplier.categories,
      // Only rewritten on submit, so a save never races an upload that is still in flight.
      ...(parsed.data.completed
        ? { verificationDocuments: submitUploadedDocs(storedDocuments, now) as unknown as Prisma.InputJsonValue }
        : {}),
      onboardingState: onboardingState as Prisma.InputJsonValue,
      verificationStatus: supplier.verificationStatus === "verified" ? "verified" : parsed.data.completed ? "pending" : "unverified",
      trustScore: Math.max(supplier.trustScore, Math.min(readinessScore, 100)),
    },
  });

  invalidatePublicMarketplaceCache({ supplierSlug: updated.slug });
  return ok(updated);
});
