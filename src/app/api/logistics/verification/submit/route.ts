import { NextRequest, NextResponse } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { submitPartnerKyc } from "@/lib/logistics/partner-kyc.server";
import type { AuthUser } from "@/lib/auth/types";

// "Send for review" (the phone app's documents screen, older pages): the same tiered submit as
// /api/logistics/kyc/submit, answered in this route's older { success, error } shape.
export const POST = withLogistics(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const result = await submitPartnerKyc(user.id);
  if (!result.ok) return NextResponse.json({ success: false, error: result.error, missing: result.missing ?? [] }, { status: result.status });
  return NextResponse.json({ success: true });
});
