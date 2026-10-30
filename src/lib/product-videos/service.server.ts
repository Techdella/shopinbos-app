import "server-only";

import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { appFromHeaders, featuresFor } from "@/lib/feature-switches.server";
import { removeFileByPublicUrl } from "@/lib/supabase/storage.server";
import { APP_VERSION_HEADER } from "@shared/feature-switches";
import {
  MAX_VIDEOS_PER_PRODUCT,
  POST_TO_PLUG,
  cleanCaption,
  cleanDimension,
  cleanVideoDurationMs,
  defaultShowOnDiscover,
  isProductVideoUrl,
  nextStatus,
  productVideoProblem,
  rexReelUsable,
  storefrontVideos,
  type OwnerKind,
  type ShopperVideo,
} from "@shared/product-videos";
import { pilotOwners } from "./pilot.server";
import { PRODUCT_VIDEO_BUCKET, VIDEO_PROBLEM_TEXT, storedProductVideoProblem } from "./storage.server";

// Product videos, "Post to Plug" (shared/product-videos.ts has the rules; docs/migrations/2026-12-14-product-videos.sql).
// The owner is the seller's store or the supplier's account; the product must be one of theirs. All of it is behind
// the post_to_plug pilot switch.

export type VideoOwner = { kind: OwnerKind; id: string };

/** The signed-in seller's store or supplier's account, or null (other roles, no store yet). */
export async function videoOwnerFor(user: { id: string; role: string }): Promise<VideoOwner | null> {
  if (user.role === "seller") {
    const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
    return store ? { kind: "store", id: store.id } : null;
  }
  if (user.role === "supplier") {
    const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true } });
    return supplier ? { kind: "supplier", id: supplier.id } : null;
  }
  return null;
}

/** Is post_to_plug on for this account on the app asking (X-App-Platform; the web counts as business_web)? */
export async function postToPlugOnFor(req: NextRequest, user: { id: string; role?: string | null }) {
  const version = req.headers.get(APP_VERSION_HEADER)?.trim().slice(0, 32) || null;
  return (await featuresFor(user, appFromHeaders(req.headers), version)).includes(POST_TO_PLUG);
}

/** The owner's product (its id and name), or null when it isn't theirs. */
export async function ownedProduct(owner: VideoOwner, productId: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(productId)) return null;
  return owner.kind === "store"
    ? db.storeProduct.findFirst({ where: { id: productId, storeId: owner.id }, select: { id: true, name: true } })
    : db.supplierProduct.findFirst({ where: { id: productId, supplierId: owner.id }, select: { id: true, name: true } });
}

function ownerWhere(owner: VideoOwner) {
  return owner.kind === "store" ? { ownerKind: "store", storeId: owner.id } : { ownerKind: "supplier", supplierId: owner.id };
}

const OWNER_SELECT = { id: true, productId: true, videoUrl: true, posterUrl: true, durationMs: true, width: true, height: true, caption: true, showOnDiscover: true, status: true, views: true, createdAt: true, updatedAt: true } as const;

export function missingTable(error: unknown) {
  const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined;
  return code === "P2021" || code === "P2022" || /does not exist/i.test(String((error as Error)?.message ?? ""));
}

/** The owner's videos of one product (not removed), newest first. */
export async function listProductVideos(owner: VideoOwner, productId: string) {
  return db.productVideo.findMany({ where: { ...ownerWhere(owner), productId, status: { not: "removed" } }, orderBy: { createdAt: "desc" }, take: 50, select: OWNER_SELECT });
}

/** The store's finished Rex reels that can go on a product (newest first). Suppliers have none. */
export async function rexReels(owner: VideoOwner) {
  if (owner.kind !== "store") return [];
  const rows = await db.videoProject.findMany({
    where: { storeId: owner.id, videoUrl: { not: null }, status: { in: ["saved", "published"] } },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, title: true, videoUrl: true, posterUrl: true, seconds: true, productId: true, updatedAt: true },
  });
  return rows.filter(rexReelUsable);
}

export class VideoInputProblem extends Error {
  constructor(message: string, readonly code = "BAD_REQUEST", readonly status = 400) {
    super(message);
  }
}

export type NewVideoInput = {
  productId: string;
  videoUrl?: string | null;
  posterUrl?: string | null;
  rexProjectId?: string | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
  showOnDiscover?: boolean | null;
};

/** Saves a new video for the owner's product. Throws VideoInputProblem with a message the screen can show. */
export async function createProductVideo(owner: VideoOwner, userId: string, input: NewVideoInput, postToPlugOn: boolean) {
  const product = await ownedProduct(owner, input.productId);
  if (!product) throw new VideoInputProblem("Pick one of your own products.", "NOT_FOUND", 404);
  const count = await db.productVideo.count({ where: { ...ownerWhere(owner), productId: product.id, status: { not: "removed" } } });
  if (count >= MAX_VIDEOS_PER_PRODUCT) throw new VideoInputProblem(`A product can have up to ${MAX_VIDEOS_PER_PRODUCT} videos. Remove one first.`, "LIMIT_REACHED", 409);

  let videoUrl: string;
  let posterUrl: string | null = null;
  let durationMs = cleanVideoDurationMs(input.durationMs);
  if (input.rexProjectId) {
    // A finished Rex reel of this store: its file is already ours.
    if (owner.kind !== "store") throw new VideoInputProblem("Rex videos are for shops.");
    const project = await db.videoProject.findFirst({ where: { id: String(input.rexProjectId), storeId: owner.id }, select: { videoUrl: true, posterUrl: true, seconds: true } });
    if (!project || !rexReelUsable(project)) throw new VideoInputProblem("That Rex video isn't finished, or is longer than 60 seconds.");
    videoUrl = project.videoUrl!;
    posterUrl = project.posterUrl ?? null;
    durationMs = cleanVideoDurationMs(project.seconds != null ? project.seconds * 1000 : null) ?? durationMs;
  } else {
    const where = { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, bucket: PRODUCT_VIDEO_BUCKET, ownerKind: owner.kind, ownerId: owner.id };
    if (!input.videoUrl || !isProductVideoUrl(input.videoUrl, { ...where, kind: "video" })) throw new VideoInputProblem("Upload the video first.");
    if (input.posterUrl && !isProductVideoUrl(input.posterUrl, { ...where, kind: "poster" })) throw new VideoInputProblem("Upload the video first.");
    if (productVideoProblem({ type: "video/mp4", size: null, durationMs: input.durationMs }) === "too_long") throw new VideoInputProblem(VIDEO_PROBLEM_TEXT.too_long);
    videoUrl = input.videoUrl;
    posterUrl = input.posterUrl || null;
    const [videoProblem, posterProblem] = await Promise.all([storedProductVideoProblem(videoUrl, "video"), posterUrl ? storedProductVideoProblem(posterUrl, "poster") : null]);
    if (videoProblem) {
      // A file that isn't a video (or is too big) is removed straight away: it was only ever this owner's upload.
      if (!/couldn't (find|check)/.test(videoProblem)) await removeFileByPublicUrl(videoUrl).catch(() => undefined);
      throw new VideoInputProblem(videoProblem);
    }
    if (posterProblem) {
      // A bad poster is dropped; the player shows the video's first frame instead.
      await removeFileByPublicUrl(posterUrl).catch(() => undefined);
      posterUrl = null;
    }
  }

  // Off for anyone outside the pilot (the API refuses them anyway); on by default inside it, unless they said no.
  const showOnDiscover = postToPlugOn ? (input.showOnDiscover ?? defaultShowOnDiscover(true)) : false;
  return db.productVideo.create({
    data: {
      ownerKind: owner.kind,
      storeId: owner.kind === "store" ? owner.id : null,
      supplierId: owner.kind === "supplier" ? owner.id : null,
      productId: product.id,
      videoUrl,
      posterUrl,
      durationMs,
      width: cleanDimension(input.width),
      height: cleanDimension(input.height),
      caption: cleanCaption(input.caption),
      showOnDiscover,
      status: "active",
      createdBy: userId,
    },
    select: OWNER_SELECT,
  });
}

/** Caption, Discover switch and show / hide. Null when the video isn't the owner's (or was removed). */
export async function updateProductVideo(owner: VideoOwner, id: string, patch: { caption?: string | null; showOnDiscover?: boolean | null; status?: string | null }) {
  const video = await db.productVideo.findFirst({ where: { id, ...ownerWhere(owner) }, select: { id: true, status: true } });
  if (!video || video.status === "removed") return null;
  const status = patch.status != null ? nextStatus(video.status, patch.status) : null;
  if (patch.status != null && !status) throw new VideoInputProblem("Pick show or hide.");
  return db.productVideo.update({
    where: { id: video.id },
    data: {
      ...(patch.caption != null ? { caption: cleanCaption(patch.caption) } : {}),
      ...(typeof patch.showOnDiscover === "boolean" ? { showOnDiscover: patch.showOnDiscover } : {}),
      ...(status ? { status } : {}),
    },
    select: OWNER_SELECT,
  });
}

/** Removes a video (kept as "removed"; the uploaded file is deleted, a Rex reel's file stays). False when not theirs. */
export async function removeProductVideo(owner: VideoOwner, id: string) {
  const video = await db.productVideo.findFirst({ where: { id, ...ownerWhere(owner) }, select: { id: true, status: true, videoUrl: true, posterUrl: true } });
  if (!video) return false;
  if (video.status === "removed") return true;
  await db.productVideo.update({ where: { id: video.id }, data: { status: "removed", showOnDiscover: false } });
  const where = { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, bucket: PRODUCT_VIDEO_BUCKET, ownerKind: owner.kind, ownerId: owner.id };
  if (isProductVideoUrl(video.videoUrl, { ...where, kind: "video" })) await removeFileByPublicUrl(video.videoUrl).catch(() => undefined);
  if (video.posterUrl && isProductVideoUrl(video.posterUrl, { ...where, kind: "poster" })) await removeFileByPublicUrl(video.posterUrl).catch(() => undefined);
  return true;
}

// ─── The shop's product page ──────────────────────────────────────────────────

/**
 * The videos a shop's product page plays (shared/product-videos.ts storefrontVideos): the shop's own, then, for a
 * product imported from a supplier, the supplier's. Nothing about the supplier leaves the server. [] while the shop
 * isn't in the pilot, before the migration, or on any error.
 */
export async function productPageVideos(storeId: string, productId: string): Promise<ShopperVideo[]> {
  try {
    const shop = (await pilotOwners("store", [storeId])).get(storeId);
    if (!shop?.on) return [];
    const product = await db.storeProduct.findFirst({ where: { id: productId, storeId }, select: { supplierProductId: true, supplierProduct: { select: { supplierId: true } } } });
    if (!product) return [];
    const supplierId = product.supplierProduct?.supplierId ?? null;
    const supplierOn = supplierId ? ((await pilotOwners("supplier", [supplierId])).get(supplierId)?.on ?? false) : false;
    const rows = await db.productVideo.findMany({
      where: {
        status: "active",
        OR: [
          { ownerKind: "store", storeId, productId },
          ...(supplierId && product.supplierProductId && supplierOn ? [{ ownerKind: "supplier", supplierId, productId: product.supplierProductId }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return storefrontVideos(rows, { storeId, productId, supplierProductId: product.supplierProductId, supplierId, storeInPilot: true, supplierInPilot: supplierOn });
  } catch (error) {
    if (!missingTable(error)) console.warn("[product-videos] couldn't load a product page's videos", error);
    return [];
  }
}
