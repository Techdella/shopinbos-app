import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, okList, apiError, parsePagination } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { CustomerSegmentCreateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const [total, segments] = await Promise.all([
    db.customerSegment.count({ where: { storeId: store.id } }),
    db.customerSegment.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return okList(segments, { page, limit, total });
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const parsed = await parseBody(CustomerSegmentCreateSchema, req);
  if ("error" in parsed) return parsed.error;

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const segment = await db.customerSegment.create({
    data: {
      storeId: store.id,
      ...parsed.data,
    },
  });

  return ok(segment, 201);
});
