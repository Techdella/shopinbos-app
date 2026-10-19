import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sellerConfirmsCash } from "@/lib/logistics/seller-payins.server";

const Body = z.object({ partnerId: z.string().min(1).max(40) });

// A seller confirms a delivery partner handed over (or transferred) the cash on delivery their riders collected.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Choose the delivery partner.", 400);
  const result = await sellerConfirmsCash(user.id, parsed.data.partnerId);
  return result.ok ? ok(result) : apiError("NOTHING_WAITING", result.error, 409);
});
