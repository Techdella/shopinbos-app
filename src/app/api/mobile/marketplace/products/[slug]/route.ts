import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { agreementWith, nearness, sellerHasPlace, sellerPlace, supplierContact, supplierTrust, VISIBLE_SUPPLIER } from "@/lib/marketplace/agreements.server";
import { listingStep } from "@shared/supplier-trust";
import { productSelect, withPreorderState } from "../_shared";

export const dynamic = "force-dynamic";

// GET → the product with its supplier's verification, risk score and distance, and `listing`: what the seller does
// before dropshipping it (add a city / too far / call, check the stock and agree / waiting / declined / ready), with
// the supplier's phone and address only while the seller still has to call them.
export const GET = withSeller(async (_req: NextRequest, { user, params }) => {
  const slug = decodeURIComponent(String((await params)?.slug ?? "")).slice(0, 200);
  const row = await db.supplierProduct.findFirst({ where: { OR: [{ slug }, { id: slug }], status: "published", supplier: VISIBLE_SUPPLIER }, select: productSelect });
  if (!row) return apiError("NOT_FOUND", "This product isn't available any more.", 404);
  const [place, trust, agreement] = await Promise.all([sellerPlace(user.id), supplierTrust([row.supplier.id]), agreementWith(user.id, row.supplier.id)]);
  const distance = nearness(place, row.supplier);
  const step = !sellerHasPlace(place) ? "noPlace" : !distance.near ? "far" : listingStep(agreement);
  const contact = step === "agree" || step === "declined" ? await supplierContact(row.supplier.id) : { phone: null, address: null };
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, city: true } });
  const { address: _address, ...supplier } = row.supplier;
  return ok({
    // `preorder`: the supplier takes preorders (ship date, places left, promise), or null.
    ...withPreorderState(row),
    // Wholesale (paid to the supplier directly) only from verified suppliers.
    bulkOrderAvailable: row.bulkOrderAvailable && row.supplier.verificationStatus === "verified",
    supplier: { ...supplier, km: distance.km, area: distance.area, risk: trust.get(row.supplier.id)?.risk ?? null, agreed: agreement?.status === "active" },
    listing: { step, phone: contact.phone, address: contact.address, supplierNote: agreement?.supplierNote ?? null, shopName: store?.name ?? null, shopCity: store?.city ?? null },
  });
});
