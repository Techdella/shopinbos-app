import "server-only";
import { z } from "zod";
import { aiConfigured, CLAUDE_FAST_MODEL, getAnthropicClient, getOpenAIClient, providerOrder, REX_OPENAI_MODEL } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { applyChanges, askNumbers, BULK_MAX_PRICE_KOBO, BULK_MAX_STOCK, nextAsk, parseReply, summarize, type BulkChange, type BulkEvent, type BulkItem, type BulkQuestion, type ParseResult } from "@shared/bulk-products";
import { appendEvents, newEventId, saveChanges, sessionItems, threadOf } from "./session.server";

// The person's reply to Peggy ("bag 15k, dress 12,500", "all the bags 15k", "remove 3"). Read without AI first
// (shared/bulk-products.ts parseReply); only a reply it can't fully read goes to the AI (one small text call, metered
// as one chat reply, 20 a minute at most), and anything the AI says is checked before it's saved.

const AiChange = z.object({
  n: z.number().int().min(1).max(10_000),
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  price: z.number().positive().max(BULK_MAX_PRICE_KOBO / 100).optional(),
  stock: z.number().int().min(0).max(BULK_MAX_STOCK).optional(),
  remove: z.boolean().optional(),
});
const AiAnswer = z.object({ changes: z.array(AiChange).max(400), unclear: z.array(z.string().max(200)).max(10).optional() });

async function callText(prompt: string): Promise<string> {
  for (const provider of providerOrder()) {
    try {
      if (provider === "openai") {
        const openai = getOpenAIClient();
        if (!openai) continue;
        const response = await openai.responses.create({ model: REX_OPENAI_MODEL, input: prompt }, { timeout: 30_000, maxRetries: 1 });
        return response.output_text ?? "";
      }
      const anthropic = getAnthropicClient();
      if (!anthropic) continue;
      const response = await anthropic.messages.create({ model: CLAUDE_FAST_MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }, { timeout: 30_000, maxRetries: 1 });
      return response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    } catch (error) {
      console.error(`[bulk] reply on ${provider} failed`, error);
    }
  }
  return "";
}

/** The AI's reading of a reply as checked changes, or null when it gave nothing usable. */
export function readAiAnswer(raw: string, items: BulkItem[]): { changes: BulkChange[]; unknown: string[] } | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: z.infer<typeof AiAnswer>;
  try {
    const result = AiAnswer.safeParse(JSON.parse(match[0]));
    if (!result.success) return null;
    parsed = result.data;
  } catch {
    return null;
  }
  const known = new Set(items.filter((item) => !item.removed && !item.productId).map((item) => item.number));
  const changes: BulkChange[] = [];
  for (const entry of parsed.changes) {
    if (!known.has(entry.n)) continue;
    const change: BulkChange = { n: entry.n };
    if (entry.remove) change.removed = true;
    if (entry.name) change.name = entry.name;
    if (entry.description) change.description = entry.description;
    if (entry.category) change.category = entry.category;
    if (entry.price) change.priceKobo = Math.round(entry.price * 100);
    if (entry.stock !== undefined) change.stock = entry.stock;
    if (Object.keys(change).length > 1) changes.push(change);
  }
  return { changes, unknown: parsed.unclear ?? [] };
}

async function aiRead(userId: string, message: string, items: BulkItem[], asking: number[]): Promise<{ changes: BulkChange[]; unknown: string[] } | null> {
  if (!aiConfigured()) return null;
  const burst = await checkRateLimitShared(rateLimitKey("bulk-reply-ai", userId), { maxRequests: 20, windowMs: 60_000 });
  if (!burst.allowed) return null;
  if (await meterAi(userId, "text", 1, "chat_reply")) return null;
  const list = items
    .filter((item) => !item.removed && !item.productId)
    .map((item) => `${item.number}|${item.name || "(no name)"}|${item.category || "-"}|${item.priceKobo ? item.priceKobo / 100 : "-"}`)
    .join("\n");
  const prompt = `You help a Nigerian seller price products in a chat. Products (number|name|category|price in naira):
${list}
${asking.length ? `Peggy just asked about numbers: ${asking.join(", ")}. A bare price means those.\n` : ""}The seller wrote (English or Nigerian Pidgin): """${message.slice(0, 2000)}"""
Turn it into changes. "15k" = 15000, "1.2m" = 1200000, "na" = "is". "all the bags 15k" means every bag. Never guess a price that wasn't said; a range like "12k to 18k" is unclear, not a price. Return JSON only:
{"changes":[{"n":number,"price":naira number?,"name":string?,"stock":integer?,"category":string?,"description":string?,"remove":true?}],"unclear":[the parts you couldn't read, as written]}`;
  const raw = await callText(prompt);
  return raw ? readAiAnswer(raw, items) : null;
}

/** The last price set in this chat (for "same price as the last one"). */
function lastPrice(thread: BulkEvent[]) {
  for (let i = thread.length - 1; i >= 0; i--) {
    const event = thread[i];
    if (event.kind !== "applied") continue;
    const priced = [...event.changes].reverse().find((change) => change.priceKobo);
    if (priced?.priceKobo) return priced.priceKobo;
  }
  return null;
}

function lastAsk(thread: BulkEvent[]) {
  for (let i = thread.length - 1; i >= 0; i--) {
    const event = thread[i];
    if (event.kind === "applied" || event.kind === "intro" || event.kind === "allSeen") return event.ask;
  }
  return null;
}

/** Reads the reply, saves the changes and adds the reply and Peggy's answer to the chat. */
export async function answerReply(session: { id: string; userId: string; thread: unknown }, message: string) {
  const items = await sessionItems(session.id);
  const thread = threadOf({ thread: session.thread as never });
  const asking = askNumbers(lastAsk(thread), items);
  const parsed: ParseResult = parseReply(message, items, { asking, lastPriceKobo: lastPrice(thread) });
  let changes = parsed.changes;
  let unknown = parsed.unknown;
  let questions: BulkQuestion[] = parsed.questions;
  let usedAi = false;
  if (!parsed.complete) {
    const ai = await aiRead(session.userId, message, items, asking);
    if (ai && ai.changes.length) {
      usedAi = true;
      // The AI read the whole message; what the rules already understood stays unless the AI changed it.
      const merged = new Map(parsed.changes.map((change) => [change.n, change]));
      for (const change of ai.changes) merged.set(change.n, { ...(merged.get(change.n) ?? {}), ...change });
      changes = [...merged.values()].sort((a, b) => a.n - b.n);
      unknown = ai.unknown;
      questions = questions.filter((q) => q.kind !== "which" || !q.numbers.some((n) => merged.has(n)));
    }
  }
  await saveChanges(
    session.id,
    changes.map((change) => ({
      n: change.n,
      ...(change.name !== undefined ? { name: change.name } : {}),
      ...(change.description !== undefined ? { description: change.description } : {}),
      ...(change.category !== undefined ? { category: change.category } : {}),
      ...(change.priceKobo !== undefined ? { priceKobo: change.priceKobo } : {}),
      ...(change.stock !== undefined ? { stock: change.stock } : {}),
      ...(change.removed ? { removed: true } : {}),
    })),
  );
  const after = applyChanges(items, changes);
  const at = new Date().toISOString();
  const events: BulkEvent[] = [
    { id: newEventId(), at, from: "me", kind: "text", text: message.slice(0, 2000) },
    { id: newEventId(), at, from: "peggy", kind: "applied", changes, unknown, questions, summary: summarize(after), ask: nextAsk(after), ...(usedAi ? { ai: true } : {}) },
  ];
  await appendEvents(session.id, events);
  return { events, usedAi };
}
