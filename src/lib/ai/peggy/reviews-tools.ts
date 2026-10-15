import "server-only";

import { db } from "@/lib/db/client";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { draftReviewReply, summarizeReviewThemes } from "@/lib/reviews/ai";
import { parseReviewKey, sourceLabel, STATUS_LABEL, summarizeReviews, type ReviewItem } from "@/lib/reviews/pure";
import { requestReviews, storeChannelReadiness } from "@/lib/reviews/requests";
import { saveSellerReply } from "@/lib/reviews/reply";
import { loadReviews, moderateReview, productNames } from "@/lib/reviews/server";
import { checkConfirmationCode, confirmationCode } from "@/lib/marketing/brand";
import { reviewModerationConfirmationParts, reviewReplyConfirmationParts, reviewRequestConfirmationParts, type PeggyToolInput } from "./pure";
import { ToolError, findProduct, recordActivity, type PeggyToolContext, type ToolOutput } from "./tools";

/** The reviews of the whole shop, or of one of its products (by id or name). */
async function reviewsFor(ctx: PeggyToolContext, product: string | null) {
  if (!product) return { items: await loadReviews(ctx.store.id), product: null };
  const match = await findProduct(ctx, product);
  return { items: await loadReviews(ctx.store.id, { productId: match.id }), product: { id: match.id, name: match.name } };
}

async function reviewsSummary(ctx: PeggyToolContext, input: PeggyToolInput<"reviews_summary">): Promise<ToolOutput> {
  const { items, product } = await reviewsFor(ctx, input.product);
  const about = product ? { product: product.name, productLink: `/products/${product.id}` } : {};
  if (input.themes && items.length && aiConfigured()) {
    if (await meterAi(ctx.userId, "text")) throw new ToolError("The seller has used today's AI writing allowance. Give the numbers without themes.");
    const { summary, themes } = await summarizeReviewThemes(items, ctx.store.name);
    return { content: JSON.stringify({ ...about, ...summary, bySource: labelled(summary.bySource), themes: themes ?? "Couldn't summarise themes just now.", link: "/home/reviews" }) };
  }
  const summary = summarizeReviews(items);
  return { content: JSON.stringify({ ...about, ...summary, bySource: labelled(summary.bySource), note: "distribution[0] is 1 star. responseRate is % of non-hidden reviews with a reply.", link: "/home/reviews" }) };
}

function labelled(bySource: Record<string, { count: number; average: number }>) {
  return Object.fromEntries(Object.entries(bySource).map(([key, value]) => [sourceLabel(key), value]));
}

async function draftReplies(ctx: PeggyToolContext, input: PeggyToolInput<"reviews_draft_replies">): Promise<ToolOutput> {
  if (!aiConfigured()) throw new ToolError("AI isn't configured on this platform. Write the replies yourself in your answer.");
  let open = (await reviewsFor(ctx, input.product)).items.filter((item) => !item.reply && item.status !== "rejected");
  if (input.lowRatingsFirst) open = [...open].sort((a, b) => (a.rating ?? 6) - (b.rating ?? 6));
  open = open.slice(0, input.limit ?? 3);
  if (!open.length) return { content: "Every review already has a reply." };
  if (await meterAi(ctx.userId, "text")) throw new ToolError("The seller has used today's AI writing allowance.");
  const products = await productNames(ctx.store.id);
  const drafts = [];
  for (const item of open) {
    const reply = await draftReviewReply(item, ctx.store.name, item.productId ? products.get(item.productId)?.name : null);
    drafts.push({ key: item.key, customer: item.authorName, source: sourceLabel(item.source), rating: item.rating, review: (item.body || item.title).slice(0, 300), draftReply: reply ?? "(couldn't draft)", link: `/home/reviews/${item.key}` });
  }
  return {
    content: `Drafts only, nothing was posted. Show each draft in full. The seller can save it on the review's page, or approve it here and you post it with reviews_reply (its key and the exact text).\n${JSON.stringify(drafts)}`,
  };
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

// ─── Listing, replying, publishing and featuring ──────────────────────────────

const LIST_FILTERS: Record<PeggyToolInput<"reviews_list">["filter"], (item: ReviewItem) => boolean> = {
  all: () => true,
  needs_reply: (item) => !item.reply && item.status !== "rejected",
  waiting: (item) => item.status === "pending",
  low_rating: (item) => item.rating !== null && item.rating <= 3,
  featured: (item) => item.featured,
  hidden: (item) => item.status === "rejected",
};

async function listReviews(ctx: PeggyToolContext, input: PeggyToolInput<"reviews_list">): Promise<ToolOutput> {
  const { items, product } = await reviewsFor(ctx, input.product);
  const matching = items.filter(LIST_FILTERS[input.filter]);
  const names = await productNames(ctx.store.id);
  const summary = summarizeReviews(items);
  return {
    content: JSON.stringify({
      product: product?.name ?? "all products",
      average: summary.average,
      count: summary.count,
      matching: matching.length,
      reviews: matching.slice(0, input.limit ?? 10).map((item) => ({
        key: item.key,
        stars: item.rating,
        customer: item.authorName,
        product: item.productId ? (names.get(item.productId)?.name ?? null) : null,
        source: sourceLabel(item.source),
        text: `${item.title ? `${item.title}. ` : ""}${item.body}`.slice(0, 400),
        status: STATUS_LABEL[item.status],
        featured: item.featured,
        reply: item.reply ? item.reply.slice(0, 300) : null,
        date: item.createdAt.slice(0, 10),
        link: `/home/reviews/${item.key}`,
      })),
      note: "Use a review's key with reviews_reply or reviews_moderate.",
    }),
  };
}

async function ownReview(ctx: PeggyToolContext, key: string) {
  const ref = parseReviewKey(key);
  const item = ref ? (await loadReviews(ctx.store.id)).find((review) => review.key === key) : undefined;
  if (!ref || !item) throw new ToolError(`No review ${key} in this shop. Use reviews_list to find the key.`);
  return { ref, item };
}

async function replyToReview(ctx: PeggyToolContext, input: PeggyToolInput<"reviews_reply">): Promise<ToolOutput> {
  const { ref, item } = await ownReview(ctx, input.review);
  const parts = reviewReplyConfirmationParts(ctx.store.id, item.key, input.reply);
  const about = `${item.authorName}'s ${item.rating ? `${item.rating}-star ` : ""}review ("${(item.body || item.title).replace(/\s+/g, " ").slice(0, 120)}")`;
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    const what = input.reply
      ? `Would post this public reply under ${about}${item.reply ? ", replacing the current reply" : ""}:\n"${input.reply}"`
      : `Would delete the reply under ${about}.`;
    return {
      content: `NOT POSTED YET. ${what}\nAsk the seller to confirm. Confirmation code: ${confirmationCode(parts)}. Only call reviews_reply again, with exactly this text and the code, after they clearly say yes.${input.confirmCode ? " (The code given was wrong or expired, or the words changed.)" : ""}`,
    };
  }
  const outcome = await saveSellerReply(ctx.store.id, ref, input.reply);
  if (!outcome.ok && outcome.message === "Review not found.") throw new ToolError("That review isn't in this shop any more.");
  const summary = `${input.reply ? "Replied to" : "Deleted the reply to"} ${item.authorName}'s review. ${outcome.message}`;
  const href = `/home/reviews/${item.key}`;
  await recordActivity(ctx, { type: "review", title: `Peggy replied to ${item.authorName}'s review`, description: input.reply.slice(0, 500) || "Reply deleted", tool: "reviews_reply", link: href, data: { review: item.key } });
  return { content: summary, action: { summary, href } };
}

type ModerateAction = PeggyToolInput<"reviews_moderate">["action"];
const MODERATE: Record<ModerateAction, { change: { status: "approved" | "pending" | "rejected" } | { featured: boolean }; will: string; did: string }> = {
  publish: { change: { status: "approved" }, will: "publish", did: "Published" },
  wait: { change: { status: "pending" }, will: "move to waiting (not shown on the store)", did: "Moved to waiting" },
  hide: { change: { status: "rejected" }, will: "hide", did: "Hid" },
  feature: { change: { featured: true }, will: "feature (shown first, and published)", did: "Featured" },
  unfeature: { change: { featured: false }, will: "unfeature", did: "Unfeatured" },
};

async function moderateReviews(ctx: PeggyToolContext, input: PeggyToolInput<"reviews_moderate">): Promise<ToolOutput> {
  const all = new Map((await loadReviews(ctx.store.id)).map((item) => [item.key, item]));
  const keys = [...new Set(input.reviews)];
  const missing = keys.filter((key) => !all.has(key));
  if (missing.length) throw new ToolError(`Not in this shop: ${missing.slice(0, 5).join(", ")}. Use reviews_list to find the keys.`);
  const items = keys.map((key) => all.get(key)!);
  const { change, will, did } = MODERATE[input.action];
  const parts = reviewModerationConfirmationParts(ctx.store.id, input.action, keys);
  const plural = (n: number) => `${n} review${n === 1 ? "" : "s"}`;
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    const list = items.slice(0, 12).map((item) => `${item.authorName} (${item.rating ? `${item.rating} stars` : "no stars"}, now ${STATUS_LABEL[item.status]}${item.featured ? ", featured" : ""})`).join("; ");
    return {
      content: `NOT CHANGED YET. Would ${will} ${plural(items.length)}: ${list}${items.length > 12 ? "; …" : ""}. Ask the seller to confirm. Confirmation code: ${confirmationCode(parts)}. Only call reviews_moderate again, with the same reviews, action and this code, after they clearly say yes.${input.confirmCode ? " (The code given was wrong or expired, or the reviews changed.)" : ""}`,
    };
  }
  let done = 0;
  for (const item of items) {
    const ref = parseReviewKey(item.key);
    if (ref && (await moderateReview(ctx.store.id, ref, change))) done++;
  }
  const summary = `${did} ${plural(done)}.`;
  await recordActivity(ctx, { type: "review", title: `Peggy: ${did.toLowerCase()} ${plural(done)}`, description: summary, tool: "reviews_moderate", link: "/home/reviews", data: { action: input.action, reviews: keys } });
  return { content: summary, action: { summary, href: "/home/reviews" } };
}

export const REVIEWS_TOOL_RUNNERS = {
  reviews_summary: reviewsSummary,
  reviews_draft_replies: draftReplies,
  reviews_request: requestReviewsTool,
  reviews_list: listReviews,
  reviews_reply: replyToReview,
  reviews_moderate: moderateReviews,
};
