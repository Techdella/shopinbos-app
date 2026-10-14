import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { finishPagesLogin, startPagesLogin } from "@/lib/meta/pages-login.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// "Connect with Facebook" for Pages and Instagram. start: the FB.login code → the seller's Pages and a sealed
// session. connect: the chosen Page → inbox (Messenger, Instagram DMs) and/or the post scheduler.
const BODY = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), code: z.string().trim().min(10).max(2000) }),
  z.object({
    action: z.literal("connect"),
    session: z.string().min(20).max(8000),
    pageId: z.string().trim().regex(/^\d{3,30}$/),
    messenger: z.boolean().default(false),
    instagramDms: z.boolean().default(false),
    publishing: z.boolean().default(false),
  }),
]);

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = BODY.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Start again with Connect with Facebook.", 422);
  const body = parsed.data;
  if (body.action === "start") {
    const result = await startPagesLogin(store.id, body.code);
    return result.ok ? ok({ session: result.session, pages: result.pages }) : apiError("CONNECT_FAILED", result.error, 422);
  }
  if (!body.messenger && !body.instagramDms && !body.publishing) return apiError("VALIDATION_ERROR", "Choose what to connect.", 422);
  const result = await finishPagesLogin(store.id, body);
  return result.ok ? ok(result.result) : apiError("CONNECT_FAILED", result.error, 422);
});
