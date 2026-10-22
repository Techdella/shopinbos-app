import "server-only";
import { db } from "@/lib/db/client";
import { creditBalance } from "@/lib/ai/credits.server";
import { aiCost, meterAi } from "@/lib/ai/usage";
import type { ChatbotSettings } from "./assistant";

// What the storefront and WhatsApp chatbots may spend: each AI-written reply costs the owner's credits (the
// "chat_reply" price), and the owner can cap how many such replies go out each month (Inbox › Chatbot). Keyword,
// hand-off and fallback answers are free. Over the cap or out of credits, the bot stays quiet and the usual
// auto-replies (away message, quick replies) answer instead.

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function ownerId(storeId: string) {
  return (await db.store.findUnique({ where: { id: storeId }, select: { userId: true } }))?.userId ?? null;
}

/** AI-written bot replies this month (live chat and WhatsApp together). */
export async function aiBotRepliesThisMonth(storeId: string) {
  return db.inboxMessage
    .count({ where: { storeId, direction: "outbound", kind: "auto_reply", createdAt: { gte: monthStart() }, meta: { path: ["source"], equals: "ai" } } })
    .catch(() => 0);
}

/** Whether the bot may write an AI reply now: under the owner's monthly cap and with credits for one reply. */
export async function chatbotMayAnswer(storeId: string, bot: Pick<ChatbotSettings, "monthlyCap">) {
  const owner = await ownerId(storeId);
  if (!owner) return false;
  if (bot.monthlyCap > 0 && (await aiBotRepliesThisMonth(storeId)) >= bot.monthlyCap) return false;
  const [balance, cost] = await Promise.all([creditBalance(owner).catch(() => 0), aiCost("text", 1, "chat_reply")]);
  return balance >= cost;
}

/** Takes the credits for one AI-written reply (after it went out). */
export async function chargeChatbotReply(storeId: string) {
  const owner = await ownerId(storeId);
  if (owner) await meterAi(owner, "text", 1, "chat_reply").catch(() => null);
}
