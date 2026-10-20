import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { parsePreferences } from "@shared/preferences";
import { getIdentity } from "@/lib/identity";
import { adminNavIds } from "@/lib/admin-team/pure";

export const dynamic = "force-dynamic";

// Badges for the app shell: unread notifications for everyone; for sellers also orders that need
// action (paid but not yet shipped) and unread inbox messages. Also the person's menu preferences and photo/logo.
export const GET = withAuth(async (_req, { user }) => {
  const [notifications, inbox, prefsRow, identity] = await Promise.all([
    db.notification.count({ where: { userId: user.id, read: false } }).catch(() => 0),
    db.message
      .count({ where: { read: false, senderId: { not: user.id }, conversation: { OR: [{ participant1Id: user.id }, { participant2Id: user.id }] } } })
      .catch(() => 0),
    db.user.findUnique({ where: { id: user.id }, select: { preferences: true, adminRole: true } }).catch(() => null),
    getIdentity(user).catch(() => null),
  ]);

  let orders = 0;
  if (user.role === "seller") {
    const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (store) {
      orders = await db.retailOrder.count({ where: { storeId: store.id, status: { in: ["paid", "processing", "packed"] } } }).catch(() => 0);
    }
  }

  // Menu choices, walkthrough state and the person's photo/logo ride along so the shell needs one request per page load.
  // Admins: the menu items their team role opens (null: all of them).
  const adminNav = user.role === "admin" ? adminNavIds(prefsRow?.adminRole) : null;
  return ok({ notifications, inbox, orders, preferences: parsePreferences(prefsRow?.preferences), identity, adminNav });
});
