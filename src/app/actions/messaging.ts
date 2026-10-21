"use server";

import { db } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";
import { offPlatformNote } from "@/lib/conversations/pure";

/** Roles of both people in a conversation, for the gentle off-app note in chats with a delivery partner. */
async function participantRoles(conversationId: string) {
  const row = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { participant1: { select: { role: true } }, participant2: { select: { role: true } } },
  });
  return [String(row?.participant1.role ?? ""), String(row?.participant2.role ?? "")];
}

export async function sendMessage(formData: FormData) {
  const user = await requireRole(["logistics_partner", "seller", "supplier"], "/login");
  const conversationId = String(formData.get("conversationId") || "").trim();
  const recipientId = String(formData.get("recipientId") || "").trim();
  const text = String(formData.get("text") || "").trim();

  if (!text) return { success: false, error: "Message cannot be empty" };
  if (text.length > 5000) return { success: false, error: "Message is too long" };

  let convId = conversationId;

  // Only post into a conversation you are part of.
  if (convId) {
    const mine = await db.conversation.findFirst({
      where: { id: convId, OR: [{ participant1Id: user.id }, { participant2Id: user.id }] },
      select: { id: true },
    });
    if (!mine) return { success: false, error: "Conversation not found" };
  }

  if (!convId && recipientId) {
    if (recipientId === user.id) return { success: false, error: "Choose who to message" };
    const recipient = await db.user.findUnique({ where: { id: recipientId }, select: { id: true } });
    if (!recipient) return { success: false, error: "Choose who to message" };
    const sorted = [user.id, recipientId].sort();
    const existing = await db.conversation.findUnique({
      where: { participant1Id_participant2Id: { participant1Id: sorted[0], participant2Id: sorted[1] } },
    });
    if (existing) {
      convId = existing.id;
    } else {
      const created = await db.conversation.create({
        data: { participant1Id: sorted[0], participant2Id: sorted[1] },
      });
      convId = created.id;
    }
  }

  if (!convId) return { success: false, error: "No conversation specified" };

  await db.message.create({
    data: {
      conversationId: convId,
      senderId: user.id,
      text,
    },
  });

  await db.conversation.update({ where: { id: convId }, data: { updatedAt: new Date() } });

  revalidatePath("/logistics/inbox");
  revalidatePath("/home/messages");
  revalidatePath("/supplier/inbox");
  revalidatePath("/home/inbox");
  // Never blocked: a message sharing contact or payment details with a delivery partner just carries a gentle note.
  const warning = offPlatformNote(text, await participantRoles(convId)) ?? undefined;
  return { success: true, conversationId: convId, warning };
}

export async function getConversations(userId: string) {
  // Callable from the browser (server action): only your own conversations.
  const user = await requireRole(["logistics_partner", "seller", "supplier"], "/login");
  if (userId !== user.id) return [];
  return db.conversation.findMany({
    where: {
      OR: [{ participant1Id: userId }, { participant2Id: userId }],
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
}

export async function getMessages(conversationId: string) {
  const user = await requireRole(["logistics_partner", "seller", "supplier"], "/login");
  const conversation = await db.conversation.findFirst({
    where: {
      id: conversationId,
      OR: [{ participant1Id: user.id }, { participant2Id: user.id }],
    },
    select: { id: true },
  });
  if (!conversation) return [];

  const messages = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, text: true, senderId: true, read: true, createdAt: true },
  });
  const roles = await participantRoles(conversationId);
  return messages.map((message) => ({
    ...message,
    createdAt: message.createdAt.toISOString(),
    warning: offPlatformNote(message.text, roles),
  }));
}

// Not exported: as a server action it would let anyone mark anyone's messages read.
async function markAsRead(conversationId: string, userId: string) {
  await db.message.updateMany({
    where: { conversationId, senderId: { not: userId }, read: false },
    data: { read: true },
  });
}

export async function markConversationAsRead(conversationId: string) {
  const user = await requireRole(["logistics_partner", "seller", "supplier"], "/login");
  await markAsRead(conversationId, user.id);
  revalidatePath("/home/messages");
  revalidatePath("/logistics/inbox");
  revalidatePath("/supplier/inbox");
}
