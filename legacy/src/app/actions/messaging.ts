"use server";

import { db } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";

export async function sendMessage(formData: FormData) {
  const user = await requireRole(["logistics_partner", "seller", "supplier"], "/login");
  const conversationId = String(formData.get("conversationId") || "").trim();
  const recipientId = String(formData.get("recipientId") || "").trim();
  const text = String(formData.get("text") || "").trim();

  if (!text) return { success: false, error: "Message cannot be empty" };

  let convId = conversationId;

  if (!convId && recipientId) {
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
  return { success: true, conversationId: convId };
}

export async function getConversations(userId: string) {
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
  return messages.map((message) => ({
    ...message,
    createdAt: message.createdAt.toISOString(),
  }));
}

export async function markAsRead(conversationId: string, userId: string) {
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
