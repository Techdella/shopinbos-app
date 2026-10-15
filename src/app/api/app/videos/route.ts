import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, created, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { VIDEO_PURPOSES, VIDEO_STATUSES, VideoConfigSchema, videoTitle } from "@shared/video-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Video studio projects. GET ?status=draft|saved|published lists the store's videos (newest first); POST starts one.

export const GET = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const status = req.nextUrl.searchParams.get("status");
  const rows = await db.videoProject.findMany({
    where: { storeId: store.id, ...(status && (VIDEO_STATUSES as readonly string[]).includes(status) ? { status } : {}) },
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

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Pick what the video is for.");
  const product = parsed.data.productId ? await db.storeProduct.findFirst({ where: { id: parsed.data.productId, storeId: store.id }, select: { id: true, name: true } }) : null;
  const project = await db.videoProject.create({
    data: {
      storeId: store.id,
      userId: user.id,
      purpose: parsed.data.purpose,
      title: parsed.data.title || videoTitle(parsed.data.purpose, product?.name),
      productId: product?.id ?? null,
      config: (parsed.data.config ?? {}) as Prisma.InputJsonValue,
    },
  });
  return created(project);
});
