import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, created, ok } from "@/lib/api/response";
import {
  VideoInputProblem,
  createProductVideo,
  listProductVideos,
  missingTable,
  ownedProduct,
  rexReels,
} from "@/lib/product-videos/service.server";
import { CAPTION_MAX, MAX_VIDEOS_PER_PRODUCT, PRODUCT_VIDEO_MAX_MS, defaultShowOnDiscover } from "@shared/product-videos";
import { withVideoOwner } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Product videos, "Post to Plug" (shared/product-videos.ts). Sellers (their store's products) and suppliers (their
// own products), only while the post_to_plug pilot switch is on for them.
//
// GET ?productId=…  → { data: { videos, rex, showOnDiscoverDefault, limits } }
//   videos: this product's videos (not removed), newest first; rex: the store's finished Rex reels (≤ 60 s) that can
//   be used instead of uploading (none for suppliers).
// POST { productId, videoUrl, posterUrl?, durationMs?, width?, height?, caption?, showOnDiscover? }
//   or { productId, rexProjectId, caption?, showOnDiscover? }   → 201 { data: video }
//   The video comes from a signed URL of POST /api/app/product-videos/upload-url (checked: this owner's folder, really
//   a video, ≤ 50 MB, ≤ 60 s), or is a finished Rex reel of the store. "Show on Plug Discover" is on unless sent false.

export const GET = withVideoOwner(async (req: NextRequest, { owner }) => {
  const productId = req.nextUrl.searchParams.get("productId") ?? "";
  const product = await ownedProduct(owner, productId);
  if (!product) return apiError("NOT_FOUND", "Pick one of your own products.", 404);
  const [videos, rex] = await Promise.all([
    listProductVideos(owner, product.id).catch((error) => {
      if (missingTable(error)) return [];
      throw error;
    }),
    rexReels(owner).catch(() => []),
  ]);
  return ok({
    videos,
    rex: rex.filter((reel) => !videos.some((video) => video.videoUrl === reel.videoUrl)),
    showOnDiscoverDefault: defaultShowOnDiscover(true),
    limits: { maxMs: PRODUCT_VIDEO_MAX_MS, perProduct: MAX_VIDEOS_PER_PRODUCT, captionMax: CAPTION_MAX },
  });
});

const Body = z.object({
  productId: z.string().trim().min(1).max(64),
  videoUrl: z.string().trim().max(2000).nullish(),
  posterUrl: z.string().trim().max(2000).nullish(),
  rexProjectId: z.string().trim().max(64).nullish(),
  durationMs: z.number().nonnegative().nullish(),
  width: z.number().int().nonnegative().nullish(),
  height: z.number().int().nonnegative().nullish(),
  caption: z.string().max(1000).nullish(),
  showOnDiscover: z.boolean().nullish(),
});

export const POST = withVideoOwner(async (req: NextRequest, { user, owner }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Pick a product and a video.");
  if (!parsed.data.videoUrl && !parsed.data.rexProjectId) return apiError("BAD_REQUEST", "Upload a video or pick a Rex video.");
  try {
    return created(await createProductVideo(owner, user.id, parsed.data, true));
  } catch (error) {
    if (error instanceof VideoInputProblem) return apiError(error.code, error.message, error.status);
    if (missingTable(error)) return apiError("NOT_READY", "Product videos aren't ready yet. Try again later.", 503);
    console.error("[product-videos] save failed", error);
    return apiError("SAVE_FAILED", "Couldn't save the video. Try again.", 500);
  }
});
