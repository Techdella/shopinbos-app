import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { z } from "zod";

const UpdatePageSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  content: z.record(z.unknown()).optional(),
  isPublished: z.boolean().optional(),
  status: z.enum(["draft", "published", "hidden", "scheduled", "archived"]).optional(),
  publishAt: z.string().datetime().nullable().optional(),
  seo: z.object({
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
    focusKeyword: z.string().optional(),
    socialTitle: z.string().optional(),
    socialDescription: z.string().optional(),
    socialImage: z.string().optional(),
    canonicalUrl: z.string().optional(),
    noIndex: z.boolean().optional(),
  }).optional(),
  navigation: z.object({
    showInMenu: z.boolean().optional(),
    showInFooter: z.boolean().optional(),
    parentPage: z.string().optional(),
    menuLabel: z.string().optional(),
    menuOrder: z.number().optional(),
  }).optional(),
});

export const GET = withSeller(async (req, { user, params }) => {
  const { id } = await params;

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, status: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const page = await db.storePage.findFirst({ where: { id, storeId: store.id } });
  if (!page) return apiError("NOT_FOUND", "Page not found", 404);

  return ok({ ...page, storeStatus: store.status });
});

export const PATCH = withSeller(async (req, { user, params }) => {
  const { id } = await params;

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const page = await db.storePage.findFirst({ where: { id, storeId: store.id } });
  if (!page) return apiError("NOT_FOUND", "Page not found", 404);

  const body = await req.json().catch(() => ({}));
  const parsed = UpdatePageSchema.safeParse(body);
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body");

  const draftContent = (page.draftContent ?? page.content ?? {}) as Record<string, unknown>;
  const updateData: Record<string, unknown> = {};

  if (parsed.data.title) updateData.title = parsed.data.title;
  if (parsed.data.slug) updateData.slug = parsed.data.slug;

  if (parsed.data.seo || parsed.data.navigation || parsed.data.content) {
    const updatedDraft = {
      ...draftContent,
      ...(parsed.data.content ? { ...parsed.data.content } : {}),
      ...(parsed.data.seo ? { seo: { ...(draftContent.seo as Record<string, unknown> ?? {}), ...parsed.data.seo } } : {}),
      ...(parsed.data.navigation ? { navigation: { ...(draftContent.navigation as Record<string, unknown> ?? {}), ...parsed.data.navigation } } : {}),
    };
    updateData.draftContent = updatedDraft as unknown as Prisma.InputJsonValue;
  }

  if (parsed.data.isPublished !== undefined ? parsed.data.isPublished : parsed.data.status === "published") {
    const publishContent = updateData.draftContent ?? draftContent;
    updateData.content = publishContent as unknown as Prisma.InputJsonValue;
    updateData.publishedContent = publishContent as unknown as Prisma.InputJsonValue;
    updateData.isPublished = true;
    updateData.status = "published";
  } else if (parsed.data.isPublished === false) {
    updateData.isPublished = false;
    updateData.status = "draft";
  }

  if (parsed.data.status && parsed.data.status !== "published") {
    updateData.status = parsed.data.status;
    updateData.isPublished = parsed.data.status === "published";
    if (parsed.data.status === "archived") updateData.archivedAt = new Date();
    if (parsed.data.status !== "archived" && page.archivedAt) updateData.archivedAt = null;
  }

  if (parsed.data.publishAt !== undefined) {
    updateData.publishAt = parsed.data.publishAt ? new Date(parsed.data.publishAt) : null;
  }

  const updated = await db.storePage.update({ where: { id }, data: updateData });
  return ok(updated);
});

export const DELETE = withSeller(async (req, { user, params }) => {
  const { id } = await params;

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const page = await db.storePage.findFirst({ where: { id, storeId: store.id } });
  if (!page) return apiError("NOT_FOUND", "Page not found", 404);
  if (page.type === "home") return apiError("BAD_REQUEST", "Cannot delete the home page");

  await db.storePage.delete({ where: { id } });
  return ok({ deleted: true });
});
