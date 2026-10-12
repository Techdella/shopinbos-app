import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { normaliseAutoReply, normaliseChatbot, type AutoReplyRules, type ChatbotSettings } from "./assistant";

// Reads and saves InboxAutomation (auto-reply rules and the chatbot). Before the 2026-10-12 migration the
// table doesn't exist: reads then return the defaults with ready=false, so the inbox keeps working with the
// old away message and the settings pages can say what's missing.

export interface InboxAutomationState {
  ready: boolean;
  autoReply: AutoReplyRules;
  chatbot: ChatbotSettings;
}

export async function loadAutomation(storeId: string): Promise<InboxAutomationState> {
  try {
    const row = await db.inboxAutomation.findUnique({ where: { storeId }, select: { autoReply: true, chatbot: true } });
    return { ready: true, autoReply: normaliseAutoReply(row?.autoReply), chatbot: normaliseChatbot(row?.chatbot) };
  } catch (error) {
    console.warn("[inbox] InboxAutomation unavailable (run docs/migrations/2026-10-12-email-autoreply.sql)", (error as Error).message?.slice(0, 120));
    return { ready: false, autoReply: normaliseAutoReply(null), chatbot: normaliseChatbot(null) };
  }
}

export class AutomationNotReady extends Error {}

/** Saves either part (normalised). Throws AutomationNotReady when the table is missing. */
export async function saveAutomation(storeId: string, input: { autoReply?: unknown; chatbot?: unknown }) {
  const data: { autoReply?: Prisma.InputJsonValue; chatbot?: Prisma.InputJsonValue } = {};
  if (input.autoReply !== undefined) data.autoReply = normaliseAutoReply(input.autoReply) as unknown as Prisma.InputJsonValue;
  if (input.chatbot !== undefined) data.chatbot = normaliseChatbot(input.chatbot) as unknown as Prisma.InputJsonValue;
  try {
    const row = await db.inboxAutomation.upsert({ where: { storeId }, create: { storeId, ...data }, update: data });
    return { ready: true, autoReply: normaliseAutoReply(row.autoReply), chatbot: normaliseChatbot(row.chatbot) };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2021" || code === "P2022" || /does not exist/i.test((error as Error).message ?? "")) throw new AutomationNotReady("Auto-reply settings need a database update first (docs/migrations/2026-10-12-email-autoreply.sql).");
    throw error;
  }
}
