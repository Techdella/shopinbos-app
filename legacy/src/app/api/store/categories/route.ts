import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, created, apiError } from "@/lib/api/response";
import { z } from "zod";

export const GET = withSeller(async (req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const categories = await db.category.findMany({
    where: { storeProducts: { some: { storeId: store.id } } },
    orderBy: { name: "asc" },
  });

  return ok(categories);
});

const CreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
});

export const POST = withSeller(async (req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body");

  const existing = await db.category.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) return apiError("CONFLICT", "A category with this slug already exists");

  const category = await db.category.create({
    data: { name: parsed.data.name, slug: parsed.data.slug, description: parsed.data.description ?? null },
  });

  return created(category);
});
