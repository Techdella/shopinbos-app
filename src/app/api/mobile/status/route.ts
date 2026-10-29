import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, created, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { POST_SELECT, postView, statusHome } from "@/lib/status/status.server";
import { shopinbosFeedAuthor } from "@/lib/status/shopinbos.server";
import { storedStatusFileProblem } from "@/lib/status/status-video.server";
import { removeFileByPublicUrl } from "@/lib/supabase/storage.server";
import { cleanDurationMs, isStatusVideoUrl, statusVideoProblem } from "@shared/status-video";
import { rewardStatusPosted } from "@/lib/status/reward-hook.server";
import {
  STATUS_CAPTION_MAX,
  STATUS_CTA_KINDS,
  STATUS_HEADLINE_MAX,
  STATUS_POSTS_PER_DAY,
  STATUS_TONES,
  ctaProblem,
  isStatusImageUrl,
  plainLine,
  plainText,
  statusExpiresAt,
} from "@shared/status";
import { withStatusUser } from "./_shared";

export const dynamic = "force-dynamic";

// Status (24-hour stories) in the phone app.
// GET  → { mine: { posts, viewsLast }, feed: StatusAuthor[] }: my live posts, and the authors I can see with live
//        posts (relationships first, then the same state; unseen first; about 30). Expired posts are never returned.
//        Shopinbos's own posts (official: true) come first until the person chooses "Don't show again".
// POST { headline, caption?, imageUrl?, videoUrl?, posterUrl?, durationMs?, tone?, productId?, ctaKind? }
//        → { post, reward }: a new post for 24 hours. Plain text only (tags and control characters removed, lengths
//        capped). 10 a day per user. The photo must come from POST /api/mobile/status/upload; a video (up to 30 s,
//        25 MB) and its poster from a signed URL of POST /api/mobile/status/upload-url (shared/status-video.ts).
//        productId: a supplier's own SupplierProduct, or a seller's own StoreProduct (shared/status.ts). reward is
//        null until the rewards backend answers.

const Body = z.object({
  headline: z.string().max(1000),
  caption: z.string().max(5000).nullish(),
  imageUrl: z.string().trim().max(2000).nullish(),
  videoUrl: z.string().trim().max(2000).nullish(),
  posterUrl: z.string().trim().max(2000).nullish(),
  durationMs: z.number().nonnegative().max(10 * 60_000).nullish(),
  tone: z.enum(STATUS_TONES).nullish(),
  productId: z.string().trim().max(64).nullish(),
  ctaKind: z.enum(STATUS_CTA_KINDS).nullish(),
});

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media";

export const GET = withStatusUser(async (req: NextRequest, { user }) => {
  // Shopinbos's own getting-started posts come first for every role until "Don't show again" (?lang= picks their
  // language; shared/shopinbos-status.ts). Additive: that author carries official: true.
  const [home, shopinbos] = await Promise.all([
    statusHome({ id: user.id, role: user.role }),
    shopinbosFeedAuthor({ id: user.id, role: user.role }, { lang: req.nextUrl.searchParams.get("lang"), acceptLanguage: req.headers.get("accept-language"), origin: req.nextUrl.origin }),
  ]);
  return ok(shopinbos ? { ...home, feed: [shopinbos, ...home.feed] } : home);
});

export const POST = withStatusUser(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Check your post and try again.");
  const input = parsed.data;

  const headline = plainLine(input.headline, STATUS_HEADLINE_MAX);
  if (!headline) return apiError("BAD_REQUEST", "Write a headline for your post.");
  const caption = plainText(input.caption ?? "", STATUS_CAPTION_MAX) || null;

  const imageUrl = input.imageUrl || null;
  if (imageUrl && !isStatusImageUrl(imageUrl, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, bucket: BUCKET, userId: user.id })) {
    return apiError("BAD_REQUEST", "Upload the photo from the app first.");
  }

  // A video status: uploaded straight to Storage with a signed URL from /api/mobile/status/upload-url, under this
  // author's folder; the stored file is checked (really a video, at most 25 MB) and its length capped at 30 s.
  const videoUrl = input.videoUrl || null;
  const posterUrl = videoUrl ? input.posterUrl || null : null;
  let durationMs: number | null = null;
  if (videoUrl) {
    if (imageUrl) return apiError("BAD_REQUEST", "Pick a photo or a video, not both.");
    const where = { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, bucket: BUCKET, userId: user.id };
    if (!isStatusVideoUrl(videoUrl, { ...where, kind: "video" })) return apiError("BAD_REQUEST", "Upload the video from the app first.");
    if (posterUrl && !isStatusVideoUrl(posterUrl, { ...where, kind: "poster" })) return apiError("BAD_REQUEST", "Upload the video from the app first.");
    if (statusVideoProblem({ type: "video/mp4", size: null, durationMs: input.durationMs }) === "too_long") {
      return apiError("BAD_REQUEST", "Videos can be up to 30 seconds. Trim it and try again.");
    }
    durationMs = cleanDurationMs(input.durationMs);
    const [videoProblem, posterProblem] = await Promise.all([storedStatusFileProblem(videoUrl, "video"), posterUrl ? storedStatusFileProblem(posterUrl, "poster") : null]);
    if (videoProblem || posterProblem) {
      // A file that isn't a video (or is too big) is removed straight away; it was only ever this author's upload.
      if (videoProblem && !/couldn't (find|check)/.test(videoProblem)) await removeFileByPublicUrl(videoUrl).catch(() => undefined);
      return apiError("BAD_REQUEST", videoProblem ?? posterProblem!);
    }
  }

  // The product must be the author's own: a supplier's product (sellers add it through the dropship agreement), or a
  // product in the seller's shop. Delivery partners don't post products.
  let productId: string | null = null;
  if (input.productId) {
    if (user.role === "supplier") {
      const product = await db.supplierProduct.findFirst({ where: { id: input.productId, supplier: { userId: user.id } }, select: { id: true, status: true, dropshipAvailable: true } });
      if (!product) return apiError("NOT_FOUND", "We couldn't find that product.", 404);
      if (input.ctaKind === "add_product" && (product.status !== "published" || !product.dropshipAvailable)) {
        return apiError("BAD_REQUEST", "Shops can only add products that are live and open to dropship.");
      }
      productId = product.id;
    } else if (user.role === "seller") {
      const product = await db.storeProduct.findFirst({ where: { id: input.productId, userId: user.id }, select: { id: true } });
      if (!product) return apiError("NOT_FOUND", "We couldn't find that product.", 404);
      productId = product.id;
    } else {
      return apiError("BAD_REQUEST", "Delivery partners can't add a product to a post.");
    }
  }
  const ctaKind = input.ctaKind ?? null;
  const problem = ctaProblem(user.role, ctaKind, !!productId && user.role === "supplier");
  if (problem) return apiError("BAD_REQUEST", problem);

  const limit = await checkRateLimitShared(rateLimitKey("status-post", user.id), { maxRequests: STATUS_POSTS_PER_DAY, windowMs: 24 * 60 * 60_000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", `You can post ${STATUS_POSTS_PER_DAY} statuses a day. Try again tomorrow.`, 429);

  const now = new Date();
  const row = await db.statusPost.create({
    data: { authorId: user.id, role: user.role, headline, caption, imageUrl, videoUrl, posterUrl, durationMs, tone: input.tone ?? "peach", productId, ctaKind, createdAt: now, expiresAt: statusExpiresAt(now) },
    select: POST_SELECT,
  });
  const [post, reward] = await Promise.all([postView(row, user.id), rewardStatusPosted(user.id, row.id)]);
  return created({ post, reward });
});
