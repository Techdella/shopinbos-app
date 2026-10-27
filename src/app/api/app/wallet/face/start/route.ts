import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { WalletIdentityError, startFaceCheck } from "@/lib/wallet/identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/app/wallet/face/start { nin, consent: true } → what the phone app's Kora Liveness SDK starts with (public
// key, the verified name, and the NIN lookup for the face match). src/lib/wallet/identity.server.ts startFaceCheck.
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    return ok(await startFaceCheck({ id: user.id, email: user.email }, body));
  } catch (error) {
    if (error instanceof WalletIdentityError) return apiError(error.status === 429 ? "RATE_LIMITED" : error.status >= 500 ? "UNAVAILABLE" : error.status === 409 ? "CONFLICT" : "BAD_REQUEST", error.message, error.status);
    console.error("[wallet] face check start failed", error);
    return apiError("UNAVAILABLE", "We couldn't start the face check. Try again.", 503);
  }
}, ["seller", "supplier", "logistics_partner"]);
