import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { ok, apiError } from "@/lib/api/response";
import { SupplierOnboardingSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

const REQUIRED_DOCUMENT_TYPES = ["registration", "identity", "factory"] as const;

function isCompleteDocument(document: { status: string }) {
  return document.status === "read" || document.status === "uploaded";
}

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
  return ok(supplier);
});

export const PATCH = withSupplier(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = SupplierOnboardingSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid onboarding details");
  }

  const now = new Date().toISOString();
  const documents = parsed.data.documents.map((document) => ({
    ...document,
    id: document.id === "cac" ? "registration" : document.id,
    status: REQUIRED_DOCUMENT_TYPES.includes(document.type as (typeof REQUIRED_DOCUMENT_TYPES)[number]) && document.status === "optional" ? "pending" : document.status,
    uploadedAt: document.uploadedAt ?? now,
  }));
  const requiredDocuments = documents.filter((document) => REQUIRED_DOCUMENT_TYPES.includes(document.type as (typeof REQUIRED_DOCUMENT_TYPES)[number]));
  const missingRequiredDocuments = parsed.data.completed
    ? REQUIRED_DOCUMENT_TYPES.filter((type) => !requiredDocuments.some((document) => document.type === type && isCompleteDocument(document)))
    : [];

  if (missingRequiredDocuments.length > 0) {
    return apiError("BAD_REQUEST", "Business registration, owner NIN, and factory or product warehouse photo are required before submission.");
  }

  const readCount = requiredDocuments.filter(isCompleteDocument).length;
  const readinessScore = Math.max(parsed.data.readinessScore, Math.round((readCount / Math.max(requiredDocuments.length, 1)) * 100));
  const onboardingState = {
    source: "supplier-onboarding",
    completed: parsed.data.completed,
    readinessScore,
    documentFindings: parsed.data.documentFindings,
    submittedAt: parsed.data.completed ? now : undefined,
    updatedAt: now,
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
      verificationDocuments: documents as unknown as Prisma.InputJsonValue,
      onboardingState: onboardingState as Prisma.InputJsonValue,
      verificationStatus: supplier.verificationStatus === "verified" ? "verified" : parsed.data.completed ? "pending" : "unverified",
      trustScore: Math.max(supplier.trustScore, Math.min(readinessScore, 100)),
    },
  });

  invalidatePublicMarketplaceCache({ supplierSlug: updated.slug });
  return ok(updated);
});
