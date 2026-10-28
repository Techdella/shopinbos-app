import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { saveSupplierBranding, supplierBrandingView } from "@/lib/supplier-dropship.server";

export const dynamic = "force-dynamic";

// Branding the supplier offers sellers who dropship from them (web portal and the phone app). Blind packing and the
// seller's name on tracking are always on.
//   GET → { data: { offer: { packingSlip, packingSlipFee, stickers, stickerFee, custom }, level, allowed } }
//   PUT { packingSlip?, packingSlipFee?, stickers?, stickerFee?, custom? } → the same. Packing slips and stickers
//       unlock at Trusted (allowed: false for New suppliers, and brandingOfferFor drops them on save).

async function supplierIdFor(userId: string) {
  return (await db.supplier.findUnique({ where: { userId }, select: { id: true } }))?.id ?? null;
}

export const GET = withSupplier(async (_req: NextRequest, { user }) => {
  const supplierId = await supplierIdFor(user.id);
  if (!supplierId) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  return ok(await supplierBrandingView(supplierId));
});

export const PUT = withSupplier(async (req: NextRequest, { user }) => {
  const supplierId = await supplierIdFor(user.id);
  if (!supplierId) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return apiError("BAD_REQUEST", "Send the branding you offer.");
  return ok(await saveSupplierBranding(supplierId, body));
});
