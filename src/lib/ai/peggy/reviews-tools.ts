import "server-only";

import { db } from "@/lib/db/client";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { draftReviewReply, summarizeReviewThemes } from "@/lib/reviews/ai";
import { sourceLabel, summarizeReviews } from "@/lib/reviews/pure";
import { requestReviews, storeChannelReadiness } from "@/lib/reviews/requests";
import { loadReviews, productNames } from "@/lib/reviews/server";
import { checkConfirmationCode, confirmationCode } from "@/lib/marketing/brand";
import { reviewRequestConfirmationParts, type PeggyToolInput } from "./pure";
import { ToolError, type PeggyToolContext, type ToolOutput } from "./tools";

async function reviewsSummary(ctx: PeggyToolContext, input: PeggyToolInput<"reviews_summary">): Promise<ToolOutput> {
  const items = await loadReviews(ctx.store.id);
  if (input.themes && items.length && aiConfigured()) {
    if (await meterAi(ctx.userId, "text")) throw new ToolError("The seller has used today's AI writing allowance. Give the numbers without themes.");
    const { summary, themes } = await summarizeReviewThemes(items, ctx.store.name);
    return { content: JSON.stringify({ ...summary, bySource: labelled(summary.bySource), themes: themes ?? "Couldn't summarise themes just now.", link: "/home/reviews" }) };
  }
  const summary = summarizeReviews(items);
  return { content: JSON.stringify({ ...summary, bySource: labelled(summary.bySource), note: "distribution[0] is 1 star. responseRate is % of non-hidden reviews with a reply.", link: "/home/reviews" }) };
}

function labelled(bySource: Record<string, { count: number; average: number }>) {
  return Object.fromEntries(Object.entries(bySource).map(([key, value]) => [sourceLabel(key), value]));
}

async function draftReplies(ctx: PeggyToolContext, input: PeggyToolInput<"reviews_draft_replies">): Promise<ToolOutput> {
  if (!aiConfigured()) throw new ToolError("AI isn't configured on this platform. Write the replies yourself in your answer.");
  let open = (await loadReviews(ctx.store.id)).filter((item) => !item.reply && item.status !== "rejected");
  if (input.lowRatingsFirst) open = [...open].sort((a, b) => (a.rating ?? 6) - (b.rating ?? 6));
  open = open.slice(0, input.limit ?? 3);
  if (!open.length) return { content: "Every review already has a reply." };
  if (await meterAi(ctx.userId, "text")) throw new ToolError("The seller has used today's AI writing allowance.");
  const products = await productNames(ctx.store.id);
  const drafts = [];
  for (const item of open) {
    const reply = await draftReviewReply(item, ctx.store.name, item.productId ? products.get(item.productId)?.name : null);
    drafts.push({ customer: item.authorName, source: sourceLabel(item.source), rating: item.rating, review: (item.body || item.title).slice(0, 300), draftReply: reply ?? "(couldn't draft)", link: `/home/reviews/${item.key}` });
  }
  return { content: `Drafts only, nothing was posted. Show each draft in full with its link so the seller can save it.\n${JSON.stringify(drafts)}` };
}

async function requestReviewsTool(ctx: PeggyToolContext, input: PeggyToolInput<"reviews_request">): Promise<ToolOutput> {
  let orders: Array<{ id: string; orderNumber: string; buyerName: string }>;
  if (input.orderNumbers?.length) {
    orders = await db.retailOrder.findMany({
      where: { storeId: ctx.store.id, OR: input.orderNumbers.map((n) => ({ orderNumber: { equals: n.replace(/^#/, ""), mode: "insensitive" as const } })) },
      select: { id: true, orderNumber: true, buyerName: true },
    });
    if (!orders.length) throw new ToolError("None of those order numbers are in this shop.");
  } else {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const delivered = await db.retailOrder.findMany({ where: { storeId: ctx.store.id, status: "delivered", updatedAt: { gte: since } }, select: { id: true, orderNumber: true, buyerName: true }, take: 100 });
    const asked = new Set((await db.reviewRequest.findMany({ where: { storeId: ctx.store.id, orderId: { in: delivered.map((o) => o.id) } }, select: { orderId: true } }).catch(() => [])).map((r) => r.orderId));
    orders = delivered.filter((order) => !asked.has(order.id));
    if (!orders.length) return { content: "No delivered orders from the last 30 days are waiting to be asked for a review." };
  }
  const ready = await storeChannelReadiness(ctx.store.id);
  if (input.channel !== "link" && !ready[input.channel]) {
    throw new ToolError(`${input.channel} sending isn't set up on this platform. Suggest channel "link" (WhatsApp from the seller's own phone) or email if it is ready.`);
  }
  const who = orders.slice(0, 15).map((order) => `${order.buyerName} (${order.orderNumber})`).join(", ");
  // The code is tied to exactly these orders and this channel, so a new delivered order means a new question.
  const parts = reviewRequestConfirmationParts(ctx.store.id, input.channel, orders.map((o) => o.id));
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    return {
      content: `NOT SENT YET. Would ask ${orders.length} buyer${orders.length === 1 ? "" : "s"} by ${input.channel}: ${who}${orders.length > 15 ? ", …" : ""}. Each gets a link to rate their items. Ask the seller to confirm. Confirmation code: ${confirmationCode(parts)}. Only call reviews_request again, with the same orders and channel and this code, after they clearly say yes.${input.confirmCode ? " (The code given was wrong or expired, or the buyers changed.)" : ""}`,
    };
  }
  const result = await requestReviews({ storeId: ctx.store.id, orderIds: orders.map((o) => o.id), channel: input.channel, trigger: "peggy" });
  const summary =
    input.channel === "link"
      ? `Made ${result.sent} review link${result.sent === 1 ? "" : "s"} to send from your WhatsApp (open Ask for reviews to send them)${result.skipped ? `; ${result.skipped} skipped` : ""}.`
      : `Asked ${result.sent} buyer${result.sent === 1 ? "" : "s"} for a review by ${input.channel}${result.failed ? `; ${result.failed} failed` : ""}${result.skipped ? `; ${result.skipped} skipped` : ""}.`;
  await db.activityEvent
    .create({ data: { storeId: ctx.store.id, userId: ctx.userId, type: "marketing", title: "Peggy asked buyers for reviews", description: summary, metadata: { source: "peggy", tool: "reviews_request", link: "/home/reviews/request" } } })
    .catch(() => undefined);
  const reasons = result.results.filter((r) => r.status !== "sent" && r.status !== "link").slice(0, 10).map((r) => `${r.orderNumber}: ${r.reason}`);
  return { content: `${summary}${reasons.length ? `\nNot sent: ${reasons.join("; ")}` : ""}`, action: { summary, href: "/home/reviews/request" } };
}

export const REVIEWS_TOOL_RUNNERS = {
  reviews_summary: reviewsSummary,
  reviews_draft_replies: draftReplies,
  reviews_request: requestReviewsTool,
};
