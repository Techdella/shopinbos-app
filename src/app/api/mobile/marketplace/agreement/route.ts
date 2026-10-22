import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { requestAgreement } from "@/lib/marketplace/agreements.server";

const Body = z.object({ supplierId: z.string().min(1).max(64), called: z.boolean(), stockCheck: z.string().max(20), agreed: z.boolean(), note: z.string().max(600).optional(), signedName: z.string().max(80).optional() });

// The seller called the supplier, checked the stock and signs the Dropship agreement (signedName; older apps sign
// with the account name): it goes to the supplier.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Fill in each step first.", 400);
  const result = await requestAgreement(user, parsed.data);
  return result.ok ? ok({ message: result.message }) : apiError("NOT_SENT", result.error, 409);
});
