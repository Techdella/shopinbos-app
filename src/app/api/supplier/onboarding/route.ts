import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { ok, apiError } from "@/lib/api/response";
import { SupplierOnboardingSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { saveDeliverySettings } from "@/lib/delivery-market/manage.server";
import { refreshSupplierVerification } from "@/lib/kyc/supplier.server";
import { supplierOnboardingView } from "@/lib/kyc/supplier-onboarding.server";
import { normalizeVerificationDocs } from "@shared/verification-docs";
import { SOURCE_BUSINESS_TYPE, cleanCoords, identitySent } from "@shared/supplier-onboarding";

// Supplier onboarding, one question per screen (shared/supplier-onboarding.ts). GET: every answer so far and the screen
// to resume on. PATCH: saves whatever the screen answered (each Continue autosaves, with `step` to resume on), and
//   * completed: sends it for review. Needs the business name and the ID photo and selfie (no documents: a CAC number
//     lookup replaces the certificate, uploaded only when the lookup fails). The supplier is verified at once when the
//     ID and selfie are approved, else pending for the team (src/lib/kyc/supplier.server.ts).
//   * docsLater ("Skip for now" on the ID screens): opens the portal unverified; nothing is public until verified.
// Where goods leave from also goes to the delivery settings (DeliverySettings.origin*), as "Where I ship from".

export const GET = withSupplier(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const view = await supplierOnboardingView(user.id);
  if (!view) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  return ok(view);
});

export const PATCH = withSupplier(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = SupplierOnboardingSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid onboarding details");
  }
  const input = parsed.data;
  const businessName = input.businessName?.trim() || supplier.businessName;
  const docs = normalizeVerificationDocs(supplier.verificationDocuments);
  if (input.completed && !identitySent(docs)) {
    return apiError("BAD_REQUEST", "Snap a photo of your ID and take your selfie first.");
  }
  if ((input.completed || input.docsLater) && !businessName?.trim()) return apiError("BAD_REQUEST", "Add your business name first.");

  if (input.pickup) {
    const saved = await saveDeliverySettings(user.id, { originState: input.pickup.state, originArea: input.pickup.area?.trim() || input.pickup.state, originAddress: input.pickup.address.trim() });
    if (!saved.ok) return apiError("BAD_REQUEST", saved.error);
  }

  const now = new Date().toISOString();
  const previousState = supplier.onboardingState && typeof supplier.onboardingState === "object" && !Array.isArray(supplier.onboardingState)
    ? (supplier.onboardingState as Record<string, unknown>)
    : {};
  // Once someone skips the ID screens they keep portal access; sending for review later still works as normal.
  const docsLaterAt = typeof previousState.docsLaterAt === "string" ? previousState.docsLaterAt : input.docsLater ? now : undefined;
  const completed = input.completed || previousState.completed === true;
  const onboardingState = {
    ...previousState,
    source: "supplier-onboarding",
    completed,
    ...(input.step ? { step: input.step } : {}),
    ...(input.cacAnswer ? { cacAnswer: input.cacAnswer } : {}),
    ...(input.source ? { sourceAnswered: true } : {}),
    ...(input.completed ? { submittedAt: now } : {}),
    updatedAt: now,
    ...(docsLaterAt ? { docsLaterAt } : {}),
  };

  const coords = input.pickup ? cleanCoords(input.pickup.lat, input.pickup.lng) : null;
  const city = input.pickup ? input.pickup.area?.trim() || input.pickup.state : input.city;
  const country = input.country;
  if (country || city) {
    await db.user.update({ where: { id: user.id }, data: { country: country ?? user.country, city: city ?? user.city } });
  }

  const updated = await db.supplier.update({
    where: { id: supplier.id },
    data: {
      businessName,
      displayName: input.displayName ?? (input.businessName && supplier.displayName === supplier.businessName ? businessName : supplier.displayName),
      country: country ?? supplier.country,
      city: city ?? supplier.city,
      address: input.pickup?.address.trim() ?? input.address ?? supplier.address,
      description: input.description ?? supplier.description,
      categories: input.categories?.length ? input.categories : supplier.categories,
      ...(input.source ? { businessType: SOURCE_BUSINESS_TYPE[input.source] } : {}),
      ...(input.buyModes ? { buyModes: input.buyModes } : {}),
      ...(input.minimumOrder !== undefined ? { minimumOrder: input.minimumOrder } : {}),
      ...(input.buyModes && !input.buyModes.includes("wholesale") ? { minimumOrder: null } : {}),
      ...(input.pickup ? { pickupLat: coords?.lat ?? null, pickupLng: coords?.lng ?? null } : {}),
      onboardingState: onboardingState as Prisma.InputJsonValue,
    },
  });

  if (input.completed) await refreshSupplierVerification(supplier.id);
  invalidatePublicMarketplaceCache({ supplierSlug: updated.slug });
  return ok(await supplierOnboardingView(user.id));
});
