import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, okList, apiError } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/response";
import { ProductPageTemplateCreateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);

  const where = { storeId: store.id };

  const [total, templates] = await Promise.all([
    db.productPageTemplate.count({ where }),
    db.productPageTemplate.findMany({
      where,
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
  ]);

  return okList(templates, { page, limit, total });
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = ProductPageTemplateCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  if (parsed.data.isDefault) {
    await db.productPageTemplate.updateMany({
      where: { storeId: store.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  const template = await db.productPageTemplate.create({
    data: {
      ...parsed.data,
      storeId: store.id,
    },
  });

  return ok(template, 201);
});
