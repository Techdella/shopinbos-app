import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, created, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { postView, statusHome } from "@/lib/status/status.server";
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
// POST { headline, caption?, imageUrl?, tone?, productId?, ctaKind? } → { post, reward }: a new post for 24 hours.
//        Plain text only (tags and control characters removed, lengths capped). 10 a day per user. The photo must
//        come from POST /api/mobile/status/upload. productId: a supplier's own SupplierProduct, or a seller's own
//        StoreProduct (shared/status.ts). reward is null until the rewards backend answers.

const Body = z.object({
  headline: z.string().max(1000),
  caption: z.string().max(5000).nullish(),
  imageUrl: z.string().trim().max(2000).nullish(),
  tone: z.enum(STATUS_TONES).nullish(),
  productId: z.string().trim().max(64).nullish(),
  ctaKind: z.enum(STATUS_CTA_KINDS).nullish(),
});

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media";

export const GET = withStatusUser(async (_req: NextRequest, { user }) => {
  return ok(await statusHome({ id: user.id, role: user.role }));
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
    data: { authorId: user.id, role: user.role, headline, caption, imageUrl, tone: input.tone ?? "peach", productId, ctaKind, createdAt: now, expiresAt: statusExpiresAt(now) },
    select: { id: true, authorId: true, role: true, headline: true, caption: true, imageUrl: true, tone: true, productId: true, ctaKind: true, expiresAt: true, createdAt: true },
  });
  const [post, reward] = await Promise.all([postView(row, user.id), rewardStatusPosted(user.id, row.id)]);
  return created({ post, reward });
});
