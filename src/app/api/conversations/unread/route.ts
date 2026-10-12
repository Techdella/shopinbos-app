import { after } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { sendUnreadEmails, sweepDue, unreadCount } from "@/lib/conversations/service.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Unread partner messages, for the top bar and sidebar badges (polled while the app is open).
// Also nudges the unread-email sweep now and then, so emails go out even without the cron.
export const GET = withAuth(async (_req, { user }) => {
  const unread = await unreadCount(user.id).catch(() => 0);
  if (sweepDue()) {
    after(() => sendUnreadEmails().catch((error) => console.error("Unread message emails failed:", error)));
  }
  return ok({ unread });
});
