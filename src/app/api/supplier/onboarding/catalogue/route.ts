import type { Prisma } from "@prisma/client";
import { withSupplier } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { notifyAdminsToReview } from "@/lib/notifications/events.server";

// "Send us your WhatsApp catalogue and we'll list it for you" (supplier onboarding, instead of adding a first product):
// remembers the request and tells the team, who list the products from the supplier's WhatsApp catalogue.
export const POST = withSupplier(async (_req, { user }) => {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true, displayName: true, whatsappNumber: true, onboardingState: true } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const state = supplier.onboardingState && typeof supplier.onboardingState === "object" && !Array.isArray(supplier.onboardingState) ? (supplier.onboardingState as Record<string, unknown>) : {};
  if (typeof state.catalogueRequestedAt !== "string") {
    const now = new Date().toISOString();
    await db.supplier.update({ where: { id: supplier.id }, data: { onboardingState: { ...state, catalogueRequestedAt: now } as Prisma.InputJsonValue } });
    await notifyAdminsToReview({
      title: `${supplier.displayName} wants their WhatsApp catalogue listed`,
      description: `Message them on WhatsApp${supplier.whatsappNumber || user.phone ? ` (${supplier.whatsappNumber || user.phone})` : ""} for the catalogue and add the products for them.`,
      link: `/admin/suppliers/${supplier.id}`,
      dedupeKey: `supplier-catalogue:${supplier.id}`,
    }).catch(() => undefined);
  }
  return ok({ requested: true });
});
