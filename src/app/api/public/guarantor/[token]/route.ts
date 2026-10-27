import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey, requestIp } from "@/lib/rate-limit";
import { checkGuarantorCode } from "@/lib/logistics/partner-kyc";
import { guarantorForToken, kycSecret } from "@/lib/logistics/partner-kyc.server";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";
import { notify } from "@/lib/notifications/notify.server";

export const dynamic = "force-dynamic";

// A guarantor answers from the link we texted them (/guarantor/<token>): the code from the same text, then Confirm
// or Decline. No sign-in. Only the partner's display name and the guarantor's own name are ever shown.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = requestIp(req.headers);
  const limit = await checkRateLimitShared(rateLimitKey("guarantor:answer:ip", ip), { maxRequests: 20, windowMs: 10 * 60_000, failClosed: true });
  if (!limit.allowed) return apiError("RATE_LIMITED", "Too many tries. Wait 10 minutes and try again.", 429);
  const guarantor = await guarantorForToken(token);
  const secret = kycSecret();
  if (!guarantor || !secret) return apiError("NOT_FOUND", "This link has expired. Ask the delivery partner to send a new one.", 404);

  const body = (await req.json().catch(() => null)) as { code?: unknown; decision?: unknown } | null;
  const decision = body?.decision === "confirm" ? "confirmed" : body?.decision === "decline" ? "declined" : null;
  if (!decision) return apiError("BAD_REQUEST", "Choose Confirm or Decline.");
  const check = checkGuarantorCode(guarantor, String(body?.code ?? ""), secret);
  if (!check.ok) {
    if (check.reason === "wrong_code") await db.logisticsGuarantor.update({ where: { id: guarantor.id }, data: { codeAttempts: { increment: 1 } } });
    const message = {
      answered: "You've already answered. Thank you.",
      expired: "This code has expired. Ask the delivery partner to send a new one.",
      too_many: "Too many wrong codes. Ask the delivery partner to send a new one.",
      wrong_code: "That code isn't right. Check the text message and try again.",
    }[check.reason];
    return apiError("BAD_REQUEST", message, check.reason === "answered" ? 409 : 400);
  }
  // Answer once: a second tap (or two tabs) finds it no longer pending.
  const claimed = await db.logisticsGuarantor.updateMany({
    where: { id: guarantor.id, status: "pending" },
    data: { status: decision, respondedVia: "otp", respondedAt: new Date(), codeHash: null, codeExpiresAt: null },
  });
  if (claimed.count !== 1) return apiError("CONFLICT", "You've already answered. Thank you.", 409);
  await refreshPartnerTier(guarantor.logisticsPartnerId);
  const partner = await db.logisticsPartner.findUnique({ where: { id: guarantor.logisticsPartnerId }, select: { userId: true } });
  if (partner) {
    await notify({
      userId: partner.userId,
      event: "verification.update",
      type: "system",
      priority: decision === "confirmed" ? "success" : "warning",
      title: decision === "confirmed" ? "Your guarantor confirmed" : "Your guarantor declined",
      description: decision === "confirmed" ? `${guarantor.fullName} confirmed they are your guarantor.` : `${guarantor.fullName} said no. Add another guarantor in Verification.`,
      link: "/logistics/verification",
      dedupeKey: `guarantor.${decision}:${guarantor.id}`,
    }).catch(() => undefined);
  }
  return ok({ status: decision });
}
