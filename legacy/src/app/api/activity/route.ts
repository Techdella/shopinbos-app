import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, okList, apiError, parsePagination } from "@/lib/api/response";
import { ActivityEventCreateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const type = req.nextUrl.searchParams.get("type");

  const where: Record<string, unknown> = { storeId: store.id };
  if (type) where.type = type;

  const [total, events] = await Promise.all([
    db.activityEvent.count({ where }),
    db.activityEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return okList(events, { page, limit, total });
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = ActivityEventCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const event = await db.activityEvent.create({
    data: {
      storeId: store.id,
      userId: user.id,
      type: parsed.data.type,
      title: parsed.data.title,
      description: parsed.data.description,
      metadata: parsed.data.metadata,
    },
  });

  return ok(event, 201);
});
