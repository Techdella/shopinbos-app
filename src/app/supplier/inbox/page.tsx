import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { InboxClient } from "@/components/messaging/InboxClient";
import { db } from "@/lib/db/client";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function SupplierInboxPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const conversations = await db.conversation.findMany({
    where: {
      OR: [{ participant1Id: user.id }, { participant2Id: user.id }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      participant1: { select: { id: true, name: true, avatarUrl: true, role: true } },
      participant2: { select: { id: true, name: true, avatarUrl: true, role: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { text: true, createdAt: true, read: true, senderId: true },
      },
    },
  });

  const unreadCount = conversations.reduce((count, conv) => {
    const lastMessage = conv.messages[0];
    return count + (lastMessage && !lastMessage.read && lastMessage.senderId !== user.id ? 1 : 0);
  }, 0);

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title="Inbox"
      sub={conversations.length > 0
        ? `${conversations.length} conversation${conversations.length === 1 ? "" : "s"} with sellers · ${unreadCount} unread`
        : "Reply to sellers directly."}
    >
      <InboxClient
        conversations={conversations.map((conversation) => ({
          id: conversation.id,
          participant1: conversation.participant1,
          participant2: conversation.participant2,
          lastMessage: conversation.messages[0]
            ? {
                text: conversation.messages[0].text,
                createdAt: conversation.messages[0].createdAt.toISOString(),
                read: conversation.messages[0].read,
                senderId: conversation.messages[0].senderId,
              }
            : null,
          updatedAt: conversation.updatedAt.toISOString(),
        }))}
        currentUserId={user.id}
        emptyMessage="No conversations yet. Seller messages will appear here."
      />
    </AppPage>
  );
}
