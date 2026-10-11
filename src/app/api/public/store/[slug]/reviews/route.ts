import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, created, apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { publicName, publicReviews, sourceLabel, summarizeReviews } from "@/lib/reviews/pure";
import { resolveReviewLink, saveOrderReviews } from "@/lib/reviews/public";
import { loadReviews } from "@/lib/reviews/server";

const CORS = { methods: ["GET", "POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const Item = z.object({
  productId: z.string().min(1).max(64),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(200).optional().default(""),
  body: z.string().trim().max(5000).optional().default(""),
  images: z.array(z.string().url()).max(6).optional().default([]),
});

// From a review link (/s/[slug]/review/<token>): several items at once.
const LinkSchema = z.object({ token: z.string().min(10).max(120), buyerName: z.string().trim().max(120).optional(), reviews: z.array(Item).min(1).max(30) });

// From the product page or the order confirmation: the buyer proves the order with its email.
const SingleSchema = Item.extend({
  orderId: z.string().min(1).max(64).optional(),
  orderNumber: z.string().trim().min(1).max(60).optional(),
  buyerName: z.string().trim().min(1).max(120),
  buyerEmail: z.string().email(),
}).refine((value) => value.orderId || value.orderNumber, "Add your order number");

function ip(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!checkRateLimit(`review-submit:${ip(req)}`, { maxRequests: 10, windowMs: 10 * 60_000 }).allowed) {
    return withCors(req, apiError("RATE_LIMITED", "Too many reviews from here. Try again in a few minutes.", 429), CORS);
  }
  const body = await req.json().catch(() => null);
  if (!body) return withCors(req, apiError("BAD_REQUEST", "Invalid JSON body"), CORS);

  if (typeof body.token === "string") {
    const parsed = LinkSchema.safeParse(body);
    if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your review"), CORS);
    const link = await resolveReviewLink(slug, parsed.data.token);
    if (link.error) return withCors(req, apiError("FORBIDDEN", link.error === "expired" ? "This review link has expired." : "This review link isn't valid.", 403), CORS);
    const result = await saveOrderReviews({ storeId: link.store.id, order: link.order, buyerName: parsed.data.buyerName, reviews: parsed.data.reviews });
    if (result.saved) await db.reviewRequest.update({ where: { id: link.request.id }, data: { status: "completed", completedAt: new Date() } }).catch(() => undefined);
    if (!result.saved) return withCors(req, apiError("CONFLICT", "These items have already been reviewed.", 409), CORS);
    return withCors(req, created(result), CORS);
  }

  const parsed = SingleSchema.safeParse(body);
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body"), CORS);
  const input = parsed.data;
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const order = await db.retailOrder.findFirst({
    where: {
      storeId: store.id,
      buyerEmail: { equals: input.buyerEmail, mode: "insensitive" },
      ...(input.orderId ? { id: input.orderId } : { orderNumber: { equals: input.orderNumber!.replace(/^#/, ""), mode: "insensitive" } }),
    },
    select: { id: true, buyerName: true, buyerEmail: true, items: true, status: true },
  });
  if (!order) return withCors(req, apiError("FORBIDDEN", "We couldn't find that order for this email.", 403), CORS);
  if (["pending", "awaiting_payment", "cancelled"].includes(order.status)) {
    return withCors(req, apiError("FORBIDDEN", "You can review this once your order is paid.", 403), CORS);
  }
  const result = await saveOrderReviews({
    storeId: store.id,
    order,
    buyerName: input.buyerName,
    reviews: [{ productId: input.productId, rating: input.rating, title: input.title, body: input.body, images: input.images }],
  });
  if (!result.saved) return withCors(req, apiError("CONFLICT", "This product isn't in that order, or you've already reviewed it.", 409), CORS);
  return withCors(req, created({ success: true, ...result }), CORS);
}

// GET ?productId= — published reviews. With productId: that product's store reviews. Without: the whole
// store, imported reviews included and labelled with their source.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const productId = req.nextUrl.searchParams.get("productId");
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const items = publicReviews(await loadReviews(store.id, { approvedOnly: true, productId, take: 200 })).filter((item) => !productId || item.kind === "store");
  const summary = summarizeReviews(items);
  const reviews = items.slice(0, 50).map((item) => ({
    id: item.key,
    productId: item.productId,
    buyerName: publicName(item.authorName),
    rating: item.rating,
    title: item.title,
    body: item.body,
    images: item.images,
    source: item.source,
    sourceLabel: sourceLabel(item.source),
    verifiedBuyer: item.verifiedBuyer,
    featured: item.featured,
    sellerReply: item.reply ?? "",
    repliedAt: item.repliedAt,
    createdAt: item.createdAt,
  }));
  return withCors(req, ok({ reviews, summary: { average: summary.average, count: summary.count, rated: summary.rated, distribution: summary.distribution } }), { ...CORS, cacheControl: "public, max-age=120, stale-while-revalidate=600" });
}
