import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead } from "@/components/ui";
import { InboxClient } from "@/components/messaging/InboxClient";

export const dynamic = "force-dynamic";

export default async function LogisticsInboxPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

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
    const lastMsg = conv.messages[0];
    return count + (lastMsg && !lastMsg.read && lastMsg.senderId !== user.id ? 1 : 0);
  }, 0);

  return (
    <AppFrame
      role="logistics_partner"
      storeName={partner.displayName}
      storeSlug={`${partner.city ?? "Lagos"} · Fleet`}
      storeInitial={partner.displayName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Inbox"
          sub={conversations.length > 0 ? `${conversations.length} conversations · ${unreadCount} unread` : "Message sellers and suppliers directly"}
        />
        <InboxClient
          conversations={conversations.map((c) => ({
            id: c.id,
            participant1: { id: c.participant1.id, name: c.participant1.name, role: c.participant1.role },
            participant2: { id: c.participant2.id, name: c.participant2.name, role: c.participant2.role },
            lastMessage: c.messages[0] ? { text: c.messages[0].text, createdAt: c.messages[0].createdAt.toISOString(), read: c.messages[0].read, senderId: c.messages[0].senderId } : null,
            updatedAt: c.updatedAt.toISOString(),
          }))}
          currentUserId={user.id}
          emptyMessage="No conversations yet. Messages from sellers and suppliers will appear here."
        />
      </div>
    </AppFrame>
  );
}
