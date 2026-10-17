import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { LogisticsInviteSchema } from "@/lib/schemas";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { InviteError, createSellerInvite, sellerInvites } from "@/lib/logistics/invites.server";

// Invites for the delivery companies a supplier already uses. POST returns the link and a ready WhatsApp message.
export const GET = withSupplier(async (_req, { user }) => ok(await sellerInvites(user.id)));

export const POST = withSupplier(async (req: NextRequest, { user }) => {
  const parsed = LogisticsInviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Add the delivery company's name.");
  if (!(await checkRateLimitShared(rateLimitKey("logistics-invite", user.id), { maxRequests: 20, windowMs: 60 * 60_000 })).allowed) {
    return apiError("RATE_LIMITED", "Too many invites at once. Try again later.", 429);
  }
  try {
    const { invite, url, message, whatsapp } = await createSellerInvite(user.id, parsed.data);
    return ok({ id: invite.id, companyName: invite.companyName, url, message, whatsapp }, 201);
  } catch (error) {
    if (error instanceof InviteError) return apiError("BAD_REQUEST", error.message);
    throw error;
  }
});
