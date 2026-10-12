import "server-only";

import { db } from "@/lib/db/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { plainText } from "@/lib/cms/richtext";
import { legalContext } from "@/lib/legal/server";
import { readLegalPages } from "@/lib/legal/pages";
import { naira } from "@shared/onboarding";
import { describeHours, matchKeywordReply, wantsHuman, DEFAULT_AWAY_MESSAGE, type AutoReplyRules, type ChatbotSettings } from "./assistant";
import { hasAiProvider } from "./ai";

// Peggy as the storefront's shopping assistant on live chat. She answers only from what the shop has told us
// (products and prices, delivery zones, published returns/delivery pages, the seller's FAQs), never invents
// stock, prices or delivery times, and hands over to the seller when asked or unsure. Without an AI key she
// falls back to the keyword quick replies and the away message.

export interface ChatTurn {
  from: "shopper" | "shop";
  body: string;
}

export interface ChatbotAnswer {
  reply: string;
  handoff: boolean;
  source: "ai" | "keyword" | "handoff" | "fallback";
}

const TONES: Record<ChatbotSettings["tone"], string> = {
  friendly: "Warm and friendly, like a helpful shop attendant in Lagos.",
  professional: "Polite, clear and professional.",
  playful: "Light and cheerful, with a little Naija flavour, but always clear.",
};

async function knowledge(storeId: string, bot: ChatbotSettings, rules: AutoReplyRules) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, slug: true, city: true, country: true, customDomain: true, brandSettings: true, description: true, userId: true } });
  if (!store) return null;
  const parts: string[] = [`Shop: ${store.name}${store.city ? ` in ${store.city}` : ""}.`, store.description ? `About: ${store.description.slice(0, 400)}` : ""];
  if (bot.sources.products) {
    const products = await db.storeProduct
      .findMany({ where: { storeId, status: "published" }, orderBy: { soldStock: "desc" }, take: 40, select: { id: true, name: true, retailPrice: true, currentStock: true } })
      .catch(() => []);
    parts.push(products.length ? `Products (name | price | stock):\n${products.map((p) => `${p.name} | ${naira(Number(p.retailPrice) || 0)} | ${p.currentStock > 0 ? "in stock" : "out of stock"}`).join("\n")}` : "No products are listed yet.");
  }
  if (bot.sources.delivery) {
    const owner = await db.user.findUnique({ where: { id: store.userId }, select: { email: true, phone: true } }).catch(() => null);
    const ctx = await legalContext(store, { email: owner?.email ?? null, phone: owner?.phone ?? null }).catch(() => null);
    if (ctx?.delivery?.length) {
      parts.push(`Delivery zones (name | areas | fee | free over | days):\n${ctx.delivery.slice(0, 15).map((z) => `${z.name} | ${(z.regions ?? []).join(", ")} | ${z.alwaysFree ? "free" : z.fee != null ? naira(Number(z.fee)) : "ask"} | ${z.freeOver ? naira(Number(z.freeOver)) : "-"} | ${z.estimatedDays ?? "ask"}`).join("\n")}`);
    } else parts.push("Delivery fees and times are not set up: say the shop will confirm.");
    if (ctx?.payOnDelivery) parts.push("Pay on delivery is available.");
    if (ctx?.paymentLabels?.length) parts.push(`Ways to pay: ${ctx.paymentLabels.join(", ")}.`);
  }
  if (bot.sources.policies) {
    const pages = readLegalPages(store.brandSettings).filter((page) => page.published && ["refund-policy", "shipping-policy"].includes(page.key));
    for (const page of pages) parts.push(`${page.title}:\n${plainText(page.doc).slice(0, 1500)}`);
  }
  if (bot.sources.faqs && bot.faqs.length) parts.push(`The seller's FAQs:\n${bot.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n")}`);
  if (rules.hours.enabled) parts.push(`Opening hours (Lagos time): ${describeHours(rules.hours)}.`);
  return { store, facts: parts.filter(Boolean).join("\n\n") };
}

/** The chatbot's next message for a conversation (oldest first, ending with the shopper's message). */
export async function chatbotAnswer(storeId: string, bot: ChatbotSettings, rules: AutoReplyRules, thread: ChatTurn[]): Promise<ChatbotAnswer> {
  const last = [...thread].reverse().find((turn) => turn.from === "shopper")?.body ?? "";
  if (wantsHuman(last, bot.handoff.keywords)) return { reply: bot.handoff.message, handoff: true, source: "handoff" };

  if (hasAiProvider()) {
    const known = await knowledge(storeId, bot, rules);
    if (known) {
      const result = await aiText({
        fast: true,
        maxTokens: 2000,
        system:
          `You are ${bot.name}, the shopping assistant on ${known.store.name}'s online store chat (a small shop in Nigeria). ${TONES[bot.tone]} Short replies (1-4 sentences), plain Nigerian English, no markdown.\n` +
          "Rules: answer ONLY from the shop facts below. Never invent or guess prices, stock, sizes, colours, delivery fees, delivery times, discounts or policies. " +
          "If the facts don't answer the question, say you'll ask the shop and someone will follow up here, and set handoff to true. Also set handoff to true when the shopper wants to order something you can't confirm, has a complaint, or asks about an existing order. " +
          "Never ask for card details or passwords. You may point to the shop's products by name.\n" +
          'Reply with JSON only: {"reply": string, "handoff": boolean}.\n\n' +
          `Shop facts:\n${known.facts}`,
        messages: thread.slice(-12).map((turn) => ({ role: turn.from === "shopper" ? ("user" as const) : ("assistant" as const), content: turn.body.slice(0, 1200) })),
      }).catch(() => null);
      const json = firstJsonObject(result?.text ?? null);
      const reply = typeof json?.reply === "string" ? json.reply.trim().slice(0, 1200) : "";
      if (reply) return { reply, handoff: json?.handoff === true, source: "ai" };
    }
  }

  const keyword = matchKeywordReply(rules, last);
  if (keyword) return { reply: keyword.reply, handoff: false, source: "keyword" };
  return { reply: DEFAULT_AWAY_MESSAGE, handoff: true, source: "fallback" };
}
