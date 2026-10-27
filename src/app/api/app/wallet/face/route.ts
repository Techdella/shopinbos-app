import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { WalletIdentityError, confirmFaceCheck } from "@/lib/wallet/identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/app/wallet/face { reference } → { outcome: passed | failed | review, message }. The server asks Kora for
// the result of that reference; the phone's own "success" is never taken on trust.
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    return ok(await confirmFaceCheck(user.id, body));
  } catch (error) {
    if (error instanceof WalletIdentityError) return apiError(error.status >= 500 ? "UNAVAILABLE" : error.status === 409 ? "CONFLICT" : "BAD_REQUEST", error.message, error.status);
    console.error("[wallet] face check confirm failed", error);
    return apiError("UNAVAILABLE", "We couldn't check the result. Try again.", 503);
  }
}, ["seller", "supplier", "logistics_partner"]);
