import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { cashOwedBySeller } from "@/lib/logistics/seller-payins.server";
import { partnerForUser } from "../_shared";

export const dynamic = "force-dynamic";

// Cash on delivery the partner's riders collected, per seller: the partner pays each seller directly (Paystack,
// split to the seller's bank, when `payable`), or hands it over and the seller confirms it. Never through Shopinbos.
export const GET = withLogistics(async (_req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  const rows = await cashOwedBySeller(partner.id);
  return ok({ sellers: rows.map((row) => ({ sellerId: row.sellerId, sellerName: row.sellerName, amount: row.amount, jobs: row.jobIds.length, payable: row.payable, oldestAt: row.oldestAt.toISOString() })) });
});
