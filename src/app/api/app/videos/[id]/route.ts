import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { isOwnImageUrl } from "@/lib/ai/images";
import { addPublished, readPublished, VIDEO_PURPOSES, VideoConfigSchema } from "@shared/video-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function findProject(userId: string, id: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } });
  return store ? db.videoProject.findFirst({ where: { id, storeId: store.id } }) : null;
}

export const GET = withSeller(async (_req: NextRequest, { user, params }) => {
  const project = await findProject(user.id, (await params).id);
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
export const PATCH = withSeller(async (req: NextRequest, { user, params }) => {
  const project = await findProject(user.id, (await params).id);
  if (!project) return apiError("NOT_FOUND", "That video isn't here any more.", 404);
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the video details.");
  const { published, config, ...rest } = parsed.data;
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

export const DELETE = withSeller(async (_req: NextRequest, { user, params }) => {
  const project = await findProject(user.id, (await params).id);
  if (!project) return apiError("NOT_FOUND", "That video isn't here any more.", 404);
  await db.videoProject.delete({ where: { id: project.id } });
  return ok({ id: project.id });
});
