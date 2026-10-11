import "server-only";
import { aiText } from "@/lib/ai/text";
import { sourceLabel, summarizeReviews, type ReviewItem } from "./pure";

// Peggy's review writing: reply drafts and summaries. Text only; nothing is posted or changed here.

export async function draftReviewReply(item: ReviewItem, storeName: string, productName?: string | null) {
  const result = await aiText({
    fast: true,
    system: `You write public replies from ${storeName}, a small online shop in Nigeria, to customer reviews. Warm, specific, brief Nigerian English (2-4 sentences, under 70 words). Thank the customer by first name. For praise, mention what they liked. For complaints, apologise once, don't argue, and invite them to message the shop to fix it. Never promise refunds, discounts or delivery times. No emojis, no hashtags, no sign-off with a person's name.`,
    prompt: [
      `Review on ${sourceLabel(item.source)}${item.rating ? `, ${item.rating} out of 5 stars` : ""}${productName ? `, about ${productName}` : ""}.`,
      `Customer: ${item.authorName}`,
      item.title ? `Title: ${item.title}` : "",
      `Review: ${item.body || "(no text, stars only)"}`,
      "Return only the reply text.",
    ].filter(Boolean).join("\n"),
  });
  return result?.text.trim().replace(/^"|"$/g, "") ?? null;
}

export async function summarizeReviewThemes(items: ReviewItem[], storeName: string) {
  const summary = summarizeReviews(items);
  const sample = items
    .filter((item) => (item.body || item.title).trim())
    .slice(0, 80)
    .map((item) => `- ${item.rating ?? "?"}★ (${sourceLabel(item.source)}): ${(item.body || item.title).replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");
  if (!sample) return { summary, themes: null };
  const result = await aiText({
    fast: true,
    system: `You analyse customer reviews for ${storeName}, a small online shop. Be concrete and honest. Plain Nigerian English, no emojis.`,
    prompt: `Here are recent reviews:\n${sample}\n\nIn under 120 words: what customers love (2-3 points), what they complain about (1-3 points, or "nothing repeated"), and one practical thing to fix or promote. Only use what the reviews say.`,
  });
  return { summary, themes: result?.text.trim() ?? null };
}
