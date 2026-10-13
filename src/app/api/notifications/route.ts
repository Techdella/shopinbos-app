import { NextRequest } from "next/server";
import { z } from "zod";
import type { NotificationType, Prisma } from "@prisma/client";
import { withAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError, parsePagination } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { NOTIFY_CATEGORY_KEYS, categoryForType, isNotifyCategory, type NotifyCategory } from "@shared/notifications";

// The bell: every role's notifications, newest first. ?tab=unread | orders | money | messages | deliveries | stock |
// marketing | account. Old rows (before notify()) have no category, so they're matched by their type.

const ALL_TYPES: NotificationType[] = ["order", "payout", "peggy", "marketplace", "system", "inventory", "logistics", "products", "customers", "suppliers", "store_builder", "marketing", "rexai", "checkout", "category", "health", "activity", "dropshipping"];

function categoryWhere(category: NotifyCategory): Prisma.NotificationWhereInput {
  const types = ALL_TYPES.filter((type) => categoryForType(type) === category);
  return { OR: [{ category }, { category: null, type: { in: types } }] };
}

/** Old filters (?category=orders, ?type=order) keep working. */
const LEGACY_CATEGORY: Record<string, NotifyCategory> = { payments: "money", inventory: "stock", logistics: "deliveries", customers: "messages", system: "account", products: "account", suppliers: "orders", rexai: "marketing", store_builder: "marketing" };

export const GET = withAuth(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const params = req.nextUrl.searchParams;
  const { page, limit, skip } = parsePagination(params);
  const tab = params.get("tab") ?? params.get("category") ?? "all";
  const read = params.get("read");
  const type = params.get("type");

  const filters: Prisma.NotificationWhereInput[] = [{ userId: user.id }];
  if (tab === "unread" || read === "false") filters.push({ read: false });
  else if (read === "true") filters.push({ read: true });
  const category = isNotifyCategory(tab) ? tab : LEGACY_CATEGORY[tab];
  if (category) filters.push(categoryWhere(category));
  if (type && (ALL_TYPES as string[]).includes(type)) filters.push({ type: type as NotificationType });
  const where: Prisma.NotificationWhereInput = { AND: filters };

  const [total, rows, unreadCount] = await Promise.all([
    db.notification.count({ where }),
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
    db.notification.count({ where: { userId: user.id, read: false } }),
  ]);
  const totalPages = Math.ceil(total / limit);
  const items = rows.map((row) => ({ ...row, category: isNotifyCategory(row.category) ? row.category : categoryForType(row.type) }));

  return ok({
    items,
    pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
    unreadCount,
    categories: NOTIFY_CATEGORY_KEYS,
  });
});

const PatchSchema = z.union([
  z.object({ all: z.literal(true), tab: z.string().max(20).optional() }),
  z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(200) }),
  z.object({ id: z.string().min(1).max(64) }),
]);

/** Mark read: { all: true } (optionally one tab), { ids: [...] } or { id }. */
export const PATCH = withAuth(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Provide 'all', 'ids', or 'id'");
  const body = parsed.data;
  const now = new Date();
  let where: Prisma.NotificationWhereInput;
  if ("all" in body) {
    const category = body.tab && isNotifyCategory(body.tab) ? body.tab : null;
    where = category ? { AND: [{ userId: user.id, read: false }, categoryWhere(category)] } : { userId: user.id, read: false };
  } else if ("ids" in body) {
    where = { id: { in: body.ids }, userId: user.id, read: false };
  } else {
    where = { id: body.id, userId: user.id, read: false };
  }
  const updated = await db.notification.updateMany({ where, data: { read: true, readAt: now } });
  const unreadCount = await db.notification.count({ where: { userId: user.id, read: false } });
  return ok({ success: true, updated: updated.count, unreadCount });
});
