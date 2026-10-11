"use server";

import { db } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { z } from "zod";
import { parseReviewKey, validRating, isReviewSource, type RequestChannel } from "@/lib/reviews/pure";
import { requestReviews, type RequestOutcome } from "@/lib/reviews/requests";
import { chooseGoogleLocation, disconnectGoogle, getGoogleConnection, GoogleReviewsError, replyOnGoogle, syncGoogleReviews } from "@/lib/reviews/google";

export async function respondToReview(formData: FormData) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });
  if (!partner) return { success: false, error: "Partner not found" };

  const reviewId = String(formData.get("reviewId") || "").trim();
  const response = String(formData.get("response") || "").trim();
  if (!reviewId || !response) return { success: false, error: "Missing review ID or response" };

  await db.logisticsReview.update({
    where: { id: reviewId, logisticsPartnerId: partner.id },
    data: { response, respondedAt: new Date() },
  });

  revalidatePath("/logistics/reviews");
  return { success: true };
}

export async function getReviewMetrics(logisticsPartnerId: string) {
  const reviews = await db.logisticsReview.findMany({
    where: { logisticsPartnerId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      reviewer: { select: { id: true, name: true, role: true, avatarUrl: true } },
    },
  });

  const total = reviews.length;
  const avgRating = total > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  const distribution = [0, 0, 0, 0, 0];
  reviews.forEach((r) => { if (r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1]++; });
  const responded = reviews.filter((r) => r.response).length;

  return { reviews, total, avgRating, distribution, responded };
}

// ─── Seller reviews (/home/reviews) ───────────────────────────────────────────
// Every action is scoped to the signed-in seller's store. Reviews are addressed by key: "store:<id>" for
// reviews left on the store, "ext:<id>" for imported ones. The customer's words are never edited.

async function requireSellerStore() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true } });
  if (!store) throw new Error("Store not found");
  return { user, store };
}

function refresh(key?: string) {
  revalidatePath("/home/reviews", "layout");
  if (key) revalidatePath(`/home/reviews/${encodeURIComponent(key)}`);
}

function keyFrom(formData: FormData) {
  return parseReviewKey(String(formData.get("key") || ""));
}

export type ActionState = { ok: boolean; message: string; href?: string } | null;

/** Publish, hold back (pending) or hide a review. */
export async function setReviewStatus(formData: FormData) {
  const { store } = await requireSellerStore();
  const ref = keyFrom(formData);
  const status = String(formData.get("status") || "");
  if (!ref || !["approved", "pending", "rejected"].includes(status)) return;
  if (ref.kind === "store") await db.productReview.updateMany({ where: { id: ref.id, storeId: store.id }, data: { status: status as "approved" | "pending" | "rejected" } });
  else await db.externalReview.updateMany({ where: { id: ref.id, storeId: store.id }, data: { status } });
  refresh(String(formData.get("key")));
}

/** Featured reviews show first on the reviews wall, the widget and share pages. Featuring also publishes. */
export async function setReviewFeatured(formData: FormData) {
  const { store } = await requireSellerStore();
  const ref = keyFrom(formData);
  if (!ref) return;
  const featured = formData.get("featured") === "1";
  const data = featured ? { featured: true, status: "approved" as const } : { featured: false };
  if (ref.kind === "store") await db.productReview.updateMany({ where: { id: ref.id, storeId: store.id }, data });
  else await db.externalReview.updateMany({ where: { id: ref.id, storeId: store.id }, data });
  refresh(String(formData.get("key")));
}

/** Saves the seller's public reply. For Google reviews it is posted to Google when connected. Empty deletes it. */
export async function saveReviewReply(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { store } = await requireSellerStore();
  const ref = keyFrom(formData);
  const reply = formData.get("intent") === "delete" ? "" : String(formData.get("reply") || "").trim().slice(0, 4000);
  if (!ref) return { ok: false, message: "Review not found." };
  const now = new Date();
  if (ref.kind === "store") {
    const res = await db.productReview.updateMany({ where: { id: ref.id, storeId: store.id }, data: { sellerReply: reply, repliedAt: reply ? now : null } });
    refresh(String(formData.get("key")));
    return res.count ? { ok: true, message: reply ? "Reply saved. It shows under the review on your store." : "Reply deleted." } : { ok: false, message: "Review not found." };
  }
  const review = await db.externalReview.findFirst({ where: { id: ref.id, storeId: store.id } });
  if (!review) return { ok: false, message: "Review not found." };
  let synced: Date | null = null;
  let replyError: string | null = null;
  if (review.source === "google" && review.importMethod === "api" && review.externalId) {
    const connection = await getGoogleConnection(store.id);
    if (connection) {
      try {
        await replyOnGoogle(store.id, review.externalId, reply);
        synced = now;
      } catch (error) {
        replyError = error instanceof Error ? error.message.slice(0, 300) : "Google didn't accept the reply";
      }
    } else replyError = "Google isn't connected, so the reply is only saved here.";
  }
  await db.externalReview.update({ where: { id: review.id }, data: { reply: reply || null, repliedAt: reply ? now : null, replySyncedAt: synced, replyError } });
  refresh(String(formData.get("key")));
  if (replyError) return { ok: false, message: `Saved here, but not on Google: ${replyError}` };
  if (synced) return { ok: true, message: reply ? "Reply posted on Google and saved." : "Reply deleted on Google." };
  return { ok: true, message: reply ? "Reply saved. It shows with the review on your reviews wall." : "Reply deleted." };
}

/** Marks an imported review as from a verified buyer by linking one of the store's orders. */
export async function linkReviewOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { store } = await requireSellerStore();
  const ref = keyFrom(formData);
  if (!ref || ref.kind !== "external") return { ok: false, message: "Only imported reviews can be linked to an order." };
  const wanted = String(formData.get("orderNumber") || "").trim().replace(/^#/, "");
  if (!wanted) {
    await db.externalReview.updateMany({ where: { id: ref.id, storeId: store.id }, data: { orderId: null, verifiedBuyer: false } });
    refresh(String(formData.get("key")));
    return { ok: true, message: "Order link removed. The review no longer shows as a verified buyer." };
  }
  const order = await db.retailOrder.findFirst({ where: { storeId: store.id, orderNumber: { equals: wanted, mode: "insensitive" } }, select: { id: true, orderNumber: true, status: true } });
  if (!order) return { ok: false, message: `No order ${wanted} in your store.` };
  if (!["paid", "processing", "packed", "shipped", "delivered"].includes(order.status)) return { ok: false, message: `Order ${order.orderNumber} isn't paid, so it can't verify a purchase.` };
  await db.externalReview.updateMany({ where: { id: ref.id, storeId: store.id }, data: { orderId: order.id, verifiedBuyer: true } });
  refresh(String(formData.get("key")));
  return { ok: true, message: `Linked to order ${order.orderNumber}. The review shows as a verified buyer.` };
}

/** Which product an imported review is about (metadata only). */
export async function setReviewProduct(formData: FormData) {
  const { store } = await requireSellerStore();
  const ref = keyFrom(formData);
  if (!ref || ref.kind !== "external") return;
  const productId = String(formData.get("productId") || "");
  if (productId) {
    const product = await db.storeProduct.findFirst({ where: { id: productId, storeId: store.id }, select: { id: true } });
    if (!product) return;
  }
  await db.externalReview.updateMany({ where: { id: ref.id, storeId: store.id }, data: { productId: productId || null } });
  refresh(String(formData.get("key")));
}

export async function deleteReviewByKey(formData: FormData) {
  const { store } = await requireSellerStore();
  const ref = keyFrom(formData);
  if (!ref) return;
  if (ref.kind === "store") await db.productReview.deleteMany({ where: { id: ref.id, storeId: store.id } });
  else await db.externalReview.deleteMany({ where: { id: ref.id, storeId: store.id } });
  refresh();
  redirect("/home/reviews");
}

const ImportSchema = z.object({
  source: z.string().refine((value) => isReviewSource(value) && value !== "store", "Choose where the review came from"),
  importMethod: z.enum(["manual", "screenshot"]),
  authorName: z.string().trim().min(1, "Add the customer's name").max(120),
  rating: z.string().optional(),
  title: z.string().trim().max(200).optional().default(""),
  body: z.string().trim().min(1, "Add the review text").max(5000),
  reviewedAt: z.string().optional(),
  sourceUrl: z.string().trim().max(1000).optional().default(""),
  productId: z.string().optional().default(""),
  orderNumber: z.string().trim().max(60).optional().default(""),
  images: z.string().optional().default(""),
});

/** Saves a review the seller copied in or read from a screenshot. It is marked as imported with its source. */
export async function importReview(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { store } = await requireSellerStore();
  const parsed = ImportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the review details." };
  const input = parsed.data;
  const sourceUrl = input.sourceUrl && /^https?:\/\//i.test(input.sourceUrl) ? input.sourceUrl : null;
  const date = input.reviewedAt ? new Date(input.reviewedAt) : new Date();
  const productId = input.productId ? (await db.storeProduct.findFirst({ where: { id: input.productId, storeId: store.id }, select: { id: true } }))?.id ?? null : null;
  let orderId: string | null = null;
  if (input.orderNumber) {
    const order = await db.retailOrder.findFirst({ where: { storeId: store.id, orderNumber: { equals: input.orderNumber.replace(/^#/, ""), mode: "insensitive" } }, select: { id: true } });
    if (!order) return { ok: false, message: `No order ${input.orderNumber} in your store. Leave it empty or check the number.` };
    orderId = order.id;
  }
  // Only our own uploads (the screenshot import stores them) are accepted as review photos.
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const images = input.images.split(/\s*,\s*/).filter((url) => url && supabase && url.startsWith(supabase)).slice(0, 6);
  const created = await db.externalReview.create({
    data: {
      storeId: store.id,
      source: input.source,
      importMethod: input.importMethod,
      sourceUrl,
      productId,
      authorName: input.authorName,
      rating: validRating(input.rating),
      title: input.title,
      body: input.body,
      images,
      status: "approved",
      verifiedBuyer: Boolean(orderId),
      orderId,
      reviewedAt: Number.isNaN(date.getTime()) || date.getTime() > Date.now() ? new Date() : date,
    },
  });
  refresh();
  return { ok: true, message: "Imported and published. It is marked as imported, with where it came from.", href: `/home/reviews/ext:${created.id}` };
}

export async function saveReviewSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { store } = await requireSellerStore();
  const channel = String(formData.get("requestChannel") || "email");
  const delay = Math.round(Number(formData.get("requestDelayDays") || 3));
  const data = {
    autoRequest: formData.get("autoRequest") === "on",
    autoApprove: formData.get("autoApprove") === "on",
    requestChannel: ["email", "sms", "whatsapp"].includes(channel) ? channel : "email",
    requestDelayDays: Number.isFinite(delay) ? Math.min(30, Math.max(0, delay)) : 3,
  };
  await db.reviewSettings.upsert({ where: { storeId: store.id }, create: { storeId: store.id, ...data }, update: data });
  refresh();
  return { ok: true, message: "Review settings saved." };
}

export type RequestState = { ok: boolean; message: string; results?: RequestOutcome[] } | null;

export async function sendReviewRequests(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const { store } = await requireSellerStore();
  const orderIds = formData.getAll("orderId").map(String).filter(Boolean);
  const channel = String(formData.get("channel") || "email") as RequestChannel;
  if (!orderIds.length) return { ok: false, message: "Choose at least one order." };
  if (!["email", "sms", "whatsapp", "link"].includes(channel)) return { ok: false, message: "Choose how to ask." };
  try {
    const result = await requestReviews({ storeId: store.id, orderIds, channel, trigger: "manual", resend: formData.get("resend") === "1" });
    refresh();
    const parts = [
      result.sent ? `${result.sent} ${channel === "link" ? "link" : "request"}${result.sent === 1 ? "" : "s"} ${channel === "link" ? "ready" : "sent"}` : "",
      result.failed ? `${result.failed} failed` : "",
      result.skipped ? `${result.skipped} skipped` : "",
    ].filter(Boolean);
    return { ok: result.sent > 0, message: parts.join(", ") || "Nothing was sent.", results: result.results };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't send the requests." };
  }
}

export async function chooseGoogleLocationAction(formData: FormData) {
  const { store } = await requireSellerStore();
  const [accountName, locationName, ...title] = String(formData.get("location") || "").split("|");
  if (!accountName || !locationName) return;
  await chooseGoogleLocation(store.id, { accountName, locationName, title: title.join("|") || locationName });
  refresh();
}

export async function syncGoogleAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const { store } = await requireSellerStore();
  try {
    const result = await syncGoogleReviews(store.id);
    refresh();
    return { ok: true, message: result.seen ? `Imported ${result.added} new of ${result.seen} Google reviews.` : "Google has no reviews for this location yet." };
  } catch (error) {
    return { ok: false, message: error instanceof GoogleReviewsError ? error.message : "Couldn't reach Google. Try again." };
  }
}

export async function disconnectGoogleAction() {
  const { store } = await requireSellerStore();
  await disconnectGoogle(store.id);
  refresh();
}
