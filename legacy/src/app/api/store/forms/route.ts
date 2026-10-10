import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, okList, apiError, parsePagination } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { StoreFormCreateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const [total, forms] = await Promise.all([
    db.storeForm.count({ where: { storeId: store.id } }),
    db.storeForm.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return okList(forms, { page, limit, total });
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const parsed = await parseBody(StoreFormCreateSchema, req);
  if ("error" in parsed) return parsed.error;

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const form = await db.storeForm.create({
    data: {
      storeId: store.id,
      ...parsed.data,
    },
  });

  return ok(form, 201);
});
