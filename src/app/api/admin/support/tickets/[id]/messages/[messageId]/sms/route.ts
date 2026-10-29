import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sendSupportMessageBySms } from "@/lib/support/service.server";
import { supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/support/tickets/<ticket id>/messages/<message id>/sms: a team WhatsApp message that didn't arrive,
// sent again by SMS (Brevo, per SMS_PROVIDER) to the same person. Shows in the thread as an SMS reply.
export const POST = withAdmin(async (_req, { user, params }) => {
  try {
    const result = await sendSupportMessageBySms(String(params.messageId), user, String(params.id));
    if (!result.ok) return apiError("BAD_REQUEST", result.error);
    return ok({ sent: true }, 201);
  } catch (error) {
    return supportError(error);
  }
});
