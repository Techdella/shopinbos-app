import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { apiError, created, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { VIDEO_PURPOSES, VIDEO_STATUSES, VideoConfigSchema, videoTitle } from "@shared/video-projects";
import { videoPurposesFor, videoWithoutShop } from "@shared/video-owner";
import { noVideoOwnerMessage, videoOwnerFor, withVideoMaker } from "@/lib/video/owner.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Video studio projects, for sellers AND delivery partners (role logistics_partner). GET ?status=draft|saved|published
// lists the owner's videos (newest first); POST starts one.
//
// Owner id (no migration): VideoProject.storeId holds Store.id for a seller and LogisticsPartner.id for a delivery
// partner (shared/video-owner.ts, src/lib/video/owner.server.ts). Partners have no products, so they can't start a
// "product" video and productId is always null for them.

export const GET = withVideoMaker(async (req: NextRequest, { user }) => {
  const owner = await videoOwnerFor(user);
  if (!owner) return apiError("NOT_FOUND", noVideoOwnerMessage(user.role), 404);
  const status = req.nextUrl.searchParams.get("status");
  const rows = await db.videoProject.findMany({
    where: { storeId: owner.id, ...(status && (VIDEO_STATUSES as readonly string[]).includes(status) ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: { id: true, title: true, purpose: true, status: true, productId: true, videoUrl: true, posterUrl: true, seconds: true, updatedAt: true, config: true },
  });
  return ok(rows);
});

const CreateSchema = z.object({
  purpose: z.enum(VIDEO_PURPOSES),
  title: z.string().trim().max(120).optional(),
  productId: z.string().max(64).nullable().optional(),
  config: VideoConfigSchema.optional(),
});

export const POST = withVideoMaker(async (req: NextRequest, { user }) => {
  const owner = await videoOwnerFor(user);
  if (!owner) return apiError("NOT_FOUND", noVideoOwnerMessage(user.role), 404);
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Pick what the video is for.");
  if (!videoPurposesFor(owner.role).includes(parsed.data.purpose)) return apiError("BAD_REQUEST", "Product videos are for shops. Make an ad or a social media video.");
  const product = parsed.data.productId && owner.storeId && !videoWithoutShop(owner.role)
    ? await db.storeProduct.findFirst({ where: { id: parsed.data.productId, storeId: owner.storeId }, select: { id: true, name: true } })
    : null;
  const project = await db.videoProject.create({
    data: {
      storeId: owner.id,
      userId: user.id,
      purpose: parsed.data.purpose,
      title: parsed.data.title || videoTitle(parsed.data.purpose, product?.name),
      productId: product?.id ?? null,
      config: (parsed.data.config ?? {}) as Prisma.InputJsonValue,
    },
  });
  return created(project);
});
