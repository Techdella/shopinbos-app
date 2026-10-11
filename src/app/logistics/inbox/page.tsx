import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import type { Metadata } from "next";
import { InboxClient } from "@/components/messaging/InboxClient";
import { PartnerPage } from "@/components/logistics/kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox" };

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
    <PartnerPage
      frame={{ user, partner }}
      title="Inbox"
      sub={conversations.length > 0 ? `${conversations.length} conversations · ${unreadCount} unread` : "Message sellers and suppliers directly."}
    >
      <InboxClient
        conversations={conversations.map((c) => ({
          id: c.id,
          participant1: { id: c.participant1.id, name: c.participant1.name, role: c.participant1.role, avatarUrl: c.participant1.avatarUrl },
          participant2: { id: c.participant2.id, name: c.participant2.name, role: c.participant2.role, avatarUrl: c.participant2.avatarUrl },
          lastMessage: c.messages[0] ? { text: c.messages[0].text, createdAt: c.messages[0].createdAt.toISOString(), read: c.messages[0].read, senderId: c.messages[0].senderId } : null,
          updatedAt: c.updatedAt.toISOString(),
        }))}
        currentUserId={user.id}
        emptyMessage="No conversations yet. Messages from sellers and suppliers will appear here."
      />
    </PartnerPage>
  );
}
