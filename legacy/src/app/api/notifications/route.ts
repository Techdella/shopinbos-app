import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError, parsePagination } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

const CATEGORY_TYPE_MAP: Record<string, string> = {
  orders: "order",
  inventory: "inventory",
  payments: "payout",
  logistics: "logistics",
  products: "products",
  customers: "customers",
  suppliers: "suppliers",
  store_builder: "store_builder",
  marketing: "marketing",
  rexai: "rexai",
  system: "system",
};

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const type = req.nextUrl.searchParams.get("type");
  const priority = req.nextUrl.searchParams.get("priority");
  const read = req.nextUrl.searchParams.get("read");
  const category = req.nextUrl.searchParams.get("category");

  const where: Record<string, unknown> = { userId: user.id };

  if (type) where.type = type;
  if (priority) where.priority = priority;
  if (read === "true") where.read = true;
  else if (read === "false") where.read = false;

  if (category && category !== "unread") {
    const mapped = CATEGORY_TYPE_MAP[category];
    if (mapped) where.type = mapped;
  }

  const baseFilter = category === "unread" ? { userId: user.id, read: false } : { userId: user.id };

  const [total, notifications, unreadCount] = await Promise.all([
    db.notification.count({ where }),
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.notification.count({ where: { ...baseFilter } }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return ok({
    items: notifications,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    unreadCount,
  });
});

export const PATCH = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => ({})) as { all?: boolean; ids?: string[]; id?: string };

  if (body.all) {
    await db.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true, readAt: new Date() },
    });
  } else if (body.ids?.length) {
    await db.notification.updateMany({
      where: { id: { in: body.ids }, userId: user.id },
      data: { read: true, readAt: new Date() },
    });
  } else if (body.id) {
    await db.notification.updateMany({
      where: { id: body.id, userId: user.id },
      data: { read: true, readAt: new Date() },
    });
  } else {
    return apiError("BAD_REQUEST", "Provide 'all', 'ids', or 'id'");
  }

  return ok({ success: true });
});
