import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { AI_CHAT_KEEP, aiChatTitle, type AiChatAssistant, type AiChatSave } from "@shared/ai-chats";

// Saved Rex Studio and Peggy conversations, one row per chat, always the signed-in person's own.

export async function listAiChats(userId: string, assistant: AiChatAssistant) {
  const rows = await db.aiChat.findMany({
    where: { userId, assistant },
    orderBy: { updatedAt: "desc" },
    take: AI_CHAT_KEEP,
    select: { id: true, title: true, updatedAt: true },
  });
  return rows.map((row) => ({ id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() }));
}

export async function getAiChat(userId: string, id: string) {
  const row = await db.aiChat.findFirst({ where: { id, userId }, select: { id: true, assistant: true, title: true, messages: true, updatedAt: true } });
  return row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null;
}

/** Saves a chat (new, or the caller's own existing one) and drops the oldest past AI_CHAT_KEEP. */
export async function saveAiChat(userId: string, save: AiChatSave) {
  const data = { title: aiChatTitle(save.messages), messages: save.messages as Prisma.InputJsonValue };
  if (save.id) {
    const updated = await db.aiChat.updateMany({ where: { id: save.id, userId, assistant: save.assistant }, data });
    if (updated.count === 1) return { id: save.id, title: data.title };
  }
  const created = await db.aiChat.create({ data: { userId, assistant: save.assistant, ...data }, select: { id: true } });
  const old = await db.aiChat.findMany({ where: { userId, assistant: save.assistant }, orderBy: { updatedAt: "desc" }, skip: AI_CHAT_KEEP, select: { id: true } });
  if (old.length) await db.aiChat.deleteMany({ where: { id: { in: old.map((row) => row.id) }, userId } });
  return { id: created.id, title: data.title };
}

export async function deleteAiChat(userId: string, id: string) {
  const removed = await db.aiChat.deleteMany({ where: { id, userId } });
  return removed.count === 1;
}
