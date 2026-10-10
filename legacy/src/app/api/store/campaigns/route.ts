import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, okList, apiError, parsePagination } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { BroadcastCampaignCreateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const status = req.nextUrl.searchParams.get("status");

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const where: Record<string, unknown> = { storeId: store.id };
  if (status) where.status = status;

  const [total, campaigns] = await Promise.all([
    db.broadcastCampaign.count({ where: where as any }),
    db.broadcastCampaign.findMany({
      where: where as any,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return okList(campaigns, { page, limit, total });
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const parsed = await parseBody(BroadcastCampaignCreateSchema, req);
  if ("error" in parsed) return parsed.error;

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const campaign = await db.broadcastCampaign.create({
    data: {
      storeId: store.id,
      ...parsed.data,
      status: "draft",
    },
  });

  return ok(campaign, 201);
});
