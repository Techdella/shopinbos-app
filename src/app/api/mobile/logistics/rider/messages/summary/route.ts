import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { riderFromToken } from "@/lib/logistics/rider-session";
import { riderInbox } from "@/lib/logistics/rider-messages.server";

export const dynamic = "force-dynamic";

// The Riders app's "Messages" card on Today (shared/logistics-chats.ts riderInboxSummary), X-Rider-Token header:
//   GET → { company: { name, unread, last }, shops: [{ jobId, name, unread, last }], unread }
// Reading it marks nothing read; opening the chat (GET ../messages) does.

export async function GET(req: NextRequest) {
  const session = await riderFromToken(req.headers.get("x-rider-token")?.trim() ?? "");
  if (!session.ok) {
    return session.reason === "limited"
      ? apiError("RATE_LIMITED", "Too many tries. Wait a minute and try again.", 429)
      : apiError("UNAUTHORIZED", "This link no longer works. Ask your dispatcher for a new one.", 401);
  }
  return ok(await riderInbox({ riderId: session.rider.id, partnerName: session.rider.partnerName }));
}
