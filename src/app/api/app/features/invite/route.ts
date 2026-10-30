import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { redeemInvite } from "@/lib/feature-switches.server";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// A pilot invite code (Admin › Pilot features › Invite codes): the signed-in person redeems it and gets its features.
// Rate limited per account (codes are guessable only by trying many).
//   POST { code } → { data: { features: string[] } } | 404 INVITE_NOT_FOUND | 410 INVITE_EXPIRED | 409 INVITE_USED_UP | 429

const Body = z.object({ code: z.string().trim().min(1).max(64) });

const MESSAGES = {
  not_found: { code: "INVITE_NOT_FOUND", status: 404, message: "That code doesn't work. Check it and try again." },
  expired: { code: "INVITE_EXPIRED", status: 410, message: "That code has expired." },
  used_up: { code: "INVITE_USED_UP", status: 409, message: "That code has been used up." },
} as const;

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const limit = await checkRateLimitShared(rateLimitKey("feature-invite", user.id), { maxRequests: 8, windowMs: 15 * 60_000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Type your code.");
  try {
    const result = await redeemInvite(user.id, parsed.data.code);
    if (!result.ok) {
      const error = MESSAGES[result.reason];
      return apiError(error.code, error.message, error.status);
    }
    return ok({ features: result.features });
  } catch (error) {
    console.warn("[feature-invite] couldn't redeem", error);
    return apiError("INTERNAL_ERROR", "That didn't work. Try again in a minute.", 500);
  }
});
