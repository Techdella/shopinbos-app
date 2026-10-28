import type { NextRequest, NextResponse } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { kycPartnerFor, type KycPartner } from "@/lib/logistics/partner-kyc.server";

// Shared by the /api/logistics/kyc routes: the signed-in partner's company, and the page state every change answers with.

type KycHandler = (req: NextRequest, ctx: { user: AuthUser; partner: KycPartner; params: any }) => Promise<NextResponse>;

export function withKycPartner(handler: KycHandler) {
  return withLogistics(async (req, { user, params }) => {
    const partner = await kycPartnerFor(user.id);
    if (!partner) return apiError("NOT_FOUND", "We couldn't find your company. Log out and in again.", 404);
    return handler(req, { user, partner, params });
  });
}

/** The verification page state after a change (src/lib/logistics/kyc-steps.server.ts). */
export { stateResponse } from "@/lib/logistics/kyc-steps.server";

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
