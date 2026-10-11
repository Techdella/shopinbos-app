import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// Badges for the app shell: unread notifications for everyone; for sellers also orders that need
// action (paid but not yet shipped) and unread inbox messages.
export const GET = withAuth(async (_req, { user }) => {
  const [notifications, inbox] = await Promise.all([
    db.notification.count({ where: { userId: user.id, read: false } }).catch(() => 0),
    db.message
      .count({ where: { read: false, senderId: { not: user.id }, conversation: { OR: [{ participant1Id: user.id }, { participant2Id: user.id }] } } })
      .catch(() => 0),
  ]);

  let orders = 0;
  if (user.role === "seller") {
    const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (store) {
      orders = await db.retailOrder.count({ where: { storeId: store.id, status: { in: ["paid", "processing", "packed"] } } }).catch(() => 0);
    }
  }

  return ok({ notifications, inbox, orders });
});
