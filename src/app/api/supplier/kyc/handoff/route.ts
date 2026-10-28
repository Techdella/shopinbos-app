import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { isHandoffPurpose } from "@/lib/kyc/handoff";
import { createHandoff } from "@/lib/kyc/handoff.server";

export const runtime = "nodejs";

// "Do it on your phone": a 20-minute link (shown as a QR code) to take the selfie or ID photo on a phone.
export const POST = withSupplier(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isHandoffPurpose(body?.purpose)) return apiError("BAD_REQUEST", "Pick the selfie or the ID photo.");
  const link = createHandoff("supplier", user.id, body.purpose);
  if (!link) return apiError("UNAVAILABLE", "Phone links aren't set up. Use this computer's camera.", 503);
  return ok(link);
});
