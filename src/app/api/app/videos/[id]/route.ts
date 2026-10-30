import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { isOwnImageUrl } from "@/lib/ai/images";
import { addPublished, readPublished, VIDEO_PURPOSES, VideoConfigSchema } from "@shared/video-projects";
import { videoPlacesFor, videoPurposesFor, videoWithoutShop } from "@shared/video-owner";
import { videoOwnerFor, withVideoMaker } from "@/lib/video/owner.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One video project, for sellers and delivery partners. VideoProject.storeId is the OWNER id: Store.id for a seller,
// LogisticsPartner.id for a delivery partner (shared/video-owner.ts; no migration, the column has no foreign key).
// Partners can only mark a video posted ("social"): product pages and ads are shop-only.

async function findProject(user: { id: string; role: string }, id: string) {
  const owner = await videoOwnerFor(user);
  if (!owner) return null;
  const project = await db.videoProject.findFirst({ where: { id, storeId: owner.id } });
  return project ? { owner, project } : null;
}

export const GET = withVideoMaker(async (_req: NextRequest, { user, params }) => {
  const project = (await findProject(user, (await params).id))?.project;
  return project ? ok(project) : apiError("NOT_FOUND", "That video isn't here any more.", 404);
});

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  purpose: z.enum(VIDEO_PURPOSES).optional(),
  productId: z.string().max(64).nullable().optional(),
  config: VideoConfigSchema.optional(),
  /** The recorded video, uploaded to our storage: the project becomes "saved". */
  videoUrl: z.string().max(2000).refine(isOwnImageUrl, "Upload the video first").optional(),
  posterUrl: z.string().max(2000).refine(isOwnImageUrl, "Upload the cover first").optional(),
  seconds: z.number().min(0).max(600).optional(),
  /** Where it went live: the project becomes "published". */
  published: z.object({ kind: z.enum(["product", "ad", "social"]), id: z.string().max(64).optional() }).optional(),
});

// Autosave (config), save (videoUrl) and publish (published) for one project.
export const PATCH = withVideoMaker(async (req: NextRequest, { user, params }) => {
  const found = await findProject(user, (await params).id);
  const project = found?.project;
  if (!found || !project) return apiError("NOT_FOUND", "That video isn't here any more.", 404);
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the video details.");
  const { published, config, ...rest } = parsed.data;
  if (videoWithoutShop(found.owner.role)) {
    // A delivery partner has no products or Shopinbos ads.
    if (published && !videoPlacesFor(found.owner.role).includes(published.kind)) return apiError("BAD_REQUEST", "Product pages and ads are for shops. Share the video, then mark it posted.");
    if (rest.purpose && !videoPurposesFor(found.owner.role).includes(rest.purpose)) return apiError("BAD_REQUEST", "Product videos are for shops. Make an ad or a social media video.");
    if (rest.productId) rest.productId = null;
  }
  const data: Prisma.VideoProjectUpdateInput = { ...rest };
  if (config) data.config = config as Prisma.InputJsonValue;
  if (rest.videoUrl && project.status === "draft") data.status = "saved";
  if (published) {
    if (!(rest.videoUrl ?? project.videoUrl)) return apiError("BAD_REQUEST", "Save the video before you publish it.");
    data.publishedTo = addPublished(readPublished(project.publishedTo), published) as unknown as Prisma.InputJsonValue;
    data.status = "published";
  }
  return ok(await db.videoProject.update({ where: { id: project.id }, data }));
});

export const DELETE = withVideoMaker(async (_req: NextRequest, { user, params }) => {
  const project = (await findProject(user, (await params).id))?.project;
  if (!project) return apiError("NOT_FOUND", "That video isn't here any more.", 404);
  await db.videoProject.delete({ where: { id: project.id } });
  return ok({ id: project.id });
});
