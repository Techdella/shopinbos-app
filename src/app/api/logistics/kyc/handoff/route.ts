import { apiError, ok } from "@/lib/api/response";
import { isHandoffPurpose } from "@/lib/kyc/handoff";
import { createHandoff } from "@/lib/kyc/handoff.server";
import { readJson, withKycPartner } from "../_partner";

export const runtime = "nodejs";

// "Do it on your phone": a 20-minute link (shown as a QR code) to take the selfie or ID photo on a phone.
export const POST = withKycPartner(async (req, { user }) => {
  const body = await readJson(req);
  if (!isHandoffPurpose(body.purpose)) return apiError("BAD_REQUEST", "Pick the selfie or the ID photo.");
  const link = createHandoff("logistics", user.id, body.purpose);
  if (!link) return apiError("UNAVAILABLE", "Phone links aren't set up. Use this computer's camera.", 503);
  return ok(link);
});
