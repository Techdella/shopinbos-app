import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { userFromCallToken } from "@/lib/ai/peggy-voice.server";
import { setupStatus, setupText, type SetupStatus } from "@/lib/onboarding/setup-status.server";
import { peggyDashboard } from "@/lib/ai/peggy-dashboard.server";
import { applySetupActions } from "@/lib/onboarding/setup-peggy.server";
import { savedItem } from "@/lib/onboarding/setup-peggy-pure";
import { VOICE_TOOL_NAMES, toolActions, toolAllowed, toolReply } from "@/lib/onboarding/peggy-call-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/mobile/peggy-call/action { tool, params, conversationId? } → { result, saved, status }
// Peggy's tools on a call ("Call Peggy"): the phone app (or the web call page) runs her client tools here with the
// person's own sign-in. The same setup actions as the text setup chat (cleanActions: only well-formed actions this
// role may take), then the setup status again so the screen behind the call ticks itself. `result` is one short
// English line for Peggy; `saved` is what the app shows ("Peggy added coverage: …"). Free: no AI is used here.
// get_dashboard answers with the setup and the dashboard snapshot read fresh; open_screen runs on the device.
// The web call page opened from an old app link has no session: it sends its 15-minute call token as `t`.

const Body = z.object({
  tool: z.string().trim().min(1).max(40),
  params: z.record(z.string(), z.unknown()).optional().default({}),
  conversationId: z.string().trim().max(80).optional(),
  t: z.string().max(400).optional(),
});

/** Calls to Peggy's tools per person per day (a long call saves a few dozen things at most). */
const ACTIONS_PER_DAY = 300;

const statusView = (status: SetupStatus | null) =>
  status ? { done: status.done, total: status.steps.length, next: status.next?.id ?? null, steps: status.steps.map((step) => ({ id: step.id, done: step.done })) } : null;

async function run(userId: string, body: z.infer<typeof Body>) {
  if (!(await checkRateLimitShared(rateLimitKey("peggy-call-action", userId), { maxRequests: ACTIONS_PER_DAY, windowMs: 86_400_000 })).allowed) {
    return apiError("RATE_LIMITED", "That's a lot of saving for one day. Try again tomorrow.", 429);
  }
  const status = await setupStatus(userId);
  if (!status) return apiError("BAD_REQUEST", "Finish signing up first, then call Peggy.");
  const { tool, params } = body;
  // get_dashboard: the setup and the dashboard snapshot again, read fresh (nothing saved).
  if (tool === "get_dashboard") {
    const dashboard = await peggyDashboard(userId, status);
    return ok({ result: [`Setup now:\n${setupText(status)}`, dashboard ? `Dashboard now:\n${dashboard}` : null].filter(Boolean).join("\n\n"), saved: [], status: statusView(status) });
  }
  if (!VOICE_TOOL_NAMES.includes(tool) || tool === "lookup_areas" || !toolAllowed(tool, status.role)) {
    return ok({ result: toolReply(tool, params, status.role, []), saved: [], status: statusView(status) });
  }
  const actions = toolActions(tool, params, status.role);
  const done = actions.length ? await applySetupActions(userId, status, actions, { conversationId: body.conversationId ?? null }) : [];
  const after = done.length ? await setupStatus(userId) : status;
  const result = actions.length && !done.length ? "Not saved: something went wrong on our side. Tell them you've noted it and carry on." : toolReply(tool, params, status.role, done.map((item) => item.label));
  return ok({ result, saved: done.map((item) => savedItem(item.action)), status: statusView(after) });
}

const signedIn = withAuth(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Tell Peggy what to save.");
  return run(user.id, parsed.data);
}, ["seller", "supplier", "logistics_partner"]);

export async function POST(req: NextRequest, ctx: { params: Promise<Record<string, never>> }) {
  const peek = (await req.clone().json().catch(() => null)) as { t?: unknown } | null;
  if (typeof peek?.t === "string") {
    const userId = userFromCallToken(peek.t);
    if (!userId) return apiError("UNAUTHORIZED", "This call link has expired. Open it again from the app.", 401);
    const parsed = Body.safeParse(peek);
    if (!parsed.success) return apiError("BAD_REQUEST", "Tell Peggy what to save.");
    return run(userId, parsed.data);
  }
  return signedIn(req, ctx);
}
