import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { riderFromToken } from "@/lib/logistics/rider-session";
import { riderThread, sendRiderMessage } from "@/lib/logistics/rider-messages.server";

export const dynamic = "force-dynamic";

// Riders app chat (shared/rider-chat.ts), X-Rider-Token header:
//   GET  ?with=company            → the rider's chat with their delivery company
//   GET  ?with=shop&job=<id>      → the chat with the shop about a job the rider carries
//   POST { with, job?, body }     → sends one message; answers { message }

const LINK_ERROR = "This link no longer works. Ask your dispatcher for a new one.";

async function riderOf(req: NextRequest) {
  return riderFromToken(req.headers.get("x-rider-token")?.trim() ?? "");
}

function denied(reason: string) {
  return reason === "limited" ? apiError("RATE_LIMITED", "Too many tries. Wait a minute and try again.", 429) : apiError("UNAUTHORIZED", LINK_ERROR, 401);
}

export async function GET(req: NextRequest) {
  const session = await riderOf(req);
  if (!session.ok) return denied(session.reason);
  const audience = req.nextUrl.searchParams.get("with") === "shop" ? "shop" : "company";
  const messages = await riderThread(
    { kind: "rider", riderId: session.rider.id, partnerId: session.rider.partnerId },
    { audience, bookingId: req.nextUrl.searchParams.get("job")?.slice(0, 40) || undefined },
  );
  if (!messages) return apiError("NOT_FOUND", "This job isn't yours to message about.", 404);
  return ok({ messages, with: audience === "company" ? session.rider.partnerName : null });
}

export async function POST(req: NextRequest) {
  const session = await riderOf(req);
  if (!session.ok) return denied(session.reason);
  if (!checkRateLimit(rateLimitKey("rider-message", session.rider.id), { maxRequests: 30, windowMs: 60_000 }).allowed) {
    return apiError("RATE_LIMITED", "Slow down a little and try again.", 429);
  }
  const body = (await req.json().catch(() => null)) as { with?: unknown; job?: unknown; body?: unknown } | null;
  const result = await sendRiderMessage(
    { kind: "rider", riderId: session.rider.id, partnerId: session.rider.partnerId },
    { audience: body?.with === "shop" ? "shop" : "company", bookingId: typeof body?.job === "string" ? body.job.slice(0, 40) : undefined, body: body?.body },
  );
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ message: result.message });
}
