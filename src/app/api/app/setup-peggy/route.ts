import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { setupStatus } from "@/lib/onboarding/setup-status.server";
import { stepQuestion } from "@/lib/onboarding/setup-peggy-pure";
import { SetupPeggyError, setupChat } from "@/lib/onboarding/setup-peggy.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["seller", "supplier", "logistics_partner"] as const;

// GET  /api/app/setup-peggy: where they are in setup, and Peggy's first question.
// POST /api/app/setup-peggy { messages }: a turn of the setup chat. Free (no AI credits); 80 messages a day.
export const GET = withAuth(async (_req, { user }) => {
  const status = await setupStatus(user.id);
  return ok({ status, question: status?.next ? stepQuestion(status.next.id, status.role, status.firstName) : null });
}, [...ROLES]);

const body = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().max(2000) })).min(1).max(40) });

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Type a message first.");
  if (!(await checkRateLimitShared(rateLimitKey("setup-peggy", user.id), { maxRequests: 80, windowMs: 86_400_000 })).allowed) {
    return apiError("RATE_LIMITED", "That's a lot of messages today. Peggy is back tomorrow, or message us on WhatsApp.", 429);
  }
  try {
    return ok(await setupChat(user.id, parsed.data.messages));
  } catch (error) {
    if (error instanceof SetupPeggyError) return apiError("BAD_REQUEST", error.message);
    console.error("[setup-peggy]", error);
    return apiError("UNAVAILABLE", "Peggy couldn't answer just now. Try again.", 503);
  }
}, [...ROLES]);
