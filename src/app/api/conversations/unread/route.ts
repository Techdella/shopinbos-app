import { after } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { sendUnreadEmails, sweepDue, unreadCount } from "@/lib/conversations/service.server";
import { db } from "@/lib/db/client";
import { riderUnreadForPartner } from "@/lib/logistics/rider-messages.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Unread partner messages, for the top bar and sidebar badges (polled while the app is open).
// Delivery partners also count their riders' unread messages (one Messages page has both, /logistics/inbox).
// Also nudges the unread-email sweep now and then, so emails go out even without the cron.
export const GET = withAuth(async (_req, { user }) => {
  const [partnerUnread, riderUnread] = await Promise.all([unreadCount(user.id).catch(() => 0), user.role === "logistics_partner" ? ridersUnread(user.id) : 0]);
  const unread = partnerUnread + riderUnread;
  if (sweepDue()) {
    after(() => sendUnreadEmails().catch((error) => console.error("Unread message emails failed:", error)));
  }
  return ok({ unread });
});

async function ridersUnread(userId: string) {
  const partner = await db.logisticsPartner.findUnique({ where: { userId }, select: { id: true } }).catch(() => null);
  return partner ? riderUnreadForPartner(partner.id).catch(() => 0) : 0;
}
