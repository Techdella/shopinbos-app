import { redirect } from "next/navigation";
import type { InboxConversationSummary } from "@/components/messaging/InboxClient";
import { AppPage } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, safeQuery } from "@/lib/workspace";
import { SellerInbox } from "./SellerInbox";

export const dynamic = "force-dynamic";

type ContactUser = {
  id: string;
  name: string;
  role: string;
};

function serializeConversation(
  conversation: {
    id: string;
    updatedAt: Date;
    participant1: ContactUser;
    participant2: ContactUser;
    messages: Array<{ text: string; createdAt: Date; read: boolean; senderId: string }>;
  },
): InboxConversationSummary {
  const lastMessage = conversation.messages[0];
  return {
    id: conversation.id,
    participant1: conversation.participant1,
    participant2: conversation.participant2,
    lastMessage: lastMessage
      ? {
          text: lastMessage.text,
          createdAt: lastMessage.createdAt.toISOString(),
          read: lastMessage.read,
          senderId: lastMessage.senderId,
        }
      : null,
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

async function ensureConversation(currentUserId: string, contactUserId: string) {
  const ids = [currentUserId, contactUserId].sort();
  return db.conversation.upsert({
    where: {
      participant1Id_participant2Id: {
        participant1Id: ids[0],
        participant2Id: ids[1],
      },
    },
    create: {
      participant1Id: ids[0],
      participant2Id: ids[1],
    },
    update: {},
    include: {
      participant1: { select: { id: true, name: true, role: true } },
      participant2: { select: { id: true, name: true, role: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { text: true, createdAt: true, read: true, senderId: true },
      },
    },
  });
}

export default async function SellerMessagesPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");

  const existingConversations = await db.conversation.findMany({
    where: {
      OR: [{ participant1Id: user.id }, { participant2Id: user.id }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      participant1: { select: { id: true, name: true, role: true } },
      participant2: { select: { id: true, name: true, role: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { text: true, createdAt: true, read: true, senderId: true },
      },
    },
  });

  const existingContactIds = new Set(
    existingConversations.map((conversation) =>
      conversation.participant1Id === user.id ? conversation.participant2Id : conversation.participant1Id,
    ),
  );

  const [suppliers, logisticsPartners] = await Promise.all([
    safeQuery(() => db.supplier.findMany({
      where: { status: "active", verificationStatus: "verified", userId: { notIn: Array.from(existingContactIds) } },
      orderBy: [{ trustScore: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: { userId: true },
    }), []),
    safeQuery(() => db.logisticsPartner.findMany({
      where: { status: "active", verificationStatus: "verified", userId: { notIn: Array.from(existingContactIds) } },
      orderBy: [{ reliabilityScore: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: { userId: true },
    }), []),
  ]);

  const seeded = [];
  for (const contactUserId of [...suppliers.map((item) => item.userId), ...logisticsPartners.map((item) => item.userId)]) {
    if (contactUserId && contactUserId !== user.id) {
      seeded.push(await ensureConversation(user.id, contactUserId));
    }
  }

  const conversations = [...existingConversations, ...seeded]
    .map(serializeConversation)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const unreadCount = conversations.reduce((count, conv) => {
    return count + (conv.lastMessage && !conv.lastMessage.read && conv.lastMessage.senderId !== user.id ? 1 : 0);
  }, 0);

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title="Messages"
      sub={conversations.length > 0 ? `${conversations.length} conversations with suppliers and delivery partners · ${unreadCount} unread` : "Message suppliers and delivery partners directly."}
    >
      <SellerInbox
        conversations={conversations}
        currentUserId={user.id}
        emptyMessage="No conversations yet. Verified suppliers and delivery partners will appear here."
      />
    </AppPage>
  );
}
