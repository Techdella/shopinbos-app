import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { PAID_THROUGH_PAYSTACK, PLAN_SOURCE_SELECT, paidMarkers, planSource, runningGrants } from "@/lib/admin/plan-source.server";

// Admin › Sellers: shops and the business side of their owners. Under the NDPA only what running the platform needs:
// shop details, plan and totals. Owners' contact details stay masked until revealed with a reason (the page), and a
// shop's customers are only ever counted, never listed.

const DAY = 86_400_000;
export const SELLER_FILTERS = ["active", "suspended", "paid", "gifted", "new"] as const;
export type SellerFilter = (typeof SELLER_FILTERS)[number];
export const SELLERS_PER_PAGE = 50;

const PAID_SELLER_MARKERS = paidMarkers("seller");
const paidStatuses = [...PAID_ORDER_STATUSES];

function filterWhere(filter: SellerFilter | undefined, now: Date): Prisma.StoreWhereInput {
  if (filter === "active") return { status: "active" };
  if (filter === "suspended") return { status: { not: "active" } };
  if (filter === "paid") return { user: { aiCredits: { in: PAID_SELLER_MARKERS }, ...PAID_THROUGH_PAYSTACK } };
  if (filter === "gifted") return { user: { aiCredits: { in: PAID_SELLER_MARKERS }, NOT: PAID_THROUGH_PAYSTACK } };
  if (filter === "new") return { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } };
  return {};
}

function searchWhere(q: string | undefined): Prisma.StoreWhereInput {
  if (!q) return {};
  const or: Prisma.StoreWhereInput[] = [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }];
  // A support request names the person's email: match it exactly (never a partial match that lists other people).
  if (q.includes("@")) or.push({ user: { email: { equals: q, mode: "insensitive" } } });
  return { OR: or };
}

export async function sellerCounts(now = new Date()) {
  const [all, ...rest] = await Promise.all([db.store.count(), ...SELLER_FILTERS.map((filter) => db.store.count({ where: filterWhere(filter, now) }))]);
  return { all, ...Object.fromEntries(SELLER_FILTERS.map((filter, index) => [filter, rest[index]])) } as Record<"all" | SellerFilter, number>;
}

export async function listSellers(input: { filter?: SellerFilter; q?: string; page?: number }, now = new Date()) {
  const where: Prisma.StoreWhereInput = { AND: [filterWhere(input.filter, now), searchWhere(input.q)] };
  const page = Math.max(1, input.page ?? 1);
  const [total, stores] = await Promise.all([
    db.store.count({ where }),
    db.store.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * SELLERS_PER_PAGE,
      take: SELLERS_PER_PAGE,
      select: {
        id: true, name: true, slug: true, logoUrl: true, city: true, country: true, status: true, customDomain: true, createdAt: true, userId: true,
        user: { select: { name: true, ...PLAN_SOURCE_SELECT } },
        _count: { select: { storeProducts: true } },
      },
    }),
  ]);
  const ids = stores.map((store) => store.id);
  const userIds = stores.map((store) => store.userId);
  const [orders, active, grants] = await Promise.all([
    ids.length
      ? db.retailOrder.groupBy({ by: ["storeId"], where: { storeId: { in: ids }, status: { in: paidStatuses }, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, _count: { _all: true }, _sum: { total: true } })
      : [],
    userIds.length ? db.userActivityDay.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _max: { day: true } }).catch(() => []) : [],
    runningGrants(userIds, now),
  ]);
  const orderBy = new Map(orders.map((row) => [row.storeId, row]));
  const activeBy = new Map(active.map((row) => [row.userId, row._max.day]));
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / SELLERS_PER_PAGE)),
    rows: stores.map((store) => ({
      ...store,
      ownerFirstName: store.user.name.trim().split(/\s+/)[0] ?? "",
      ...planSource("seller", store.user, grants.get(store.userId)),
      products: store._count.storeProducts,
      orders30: orderBy.get(store.id)?._count._all ?? 0,
      sales30: orderBy.get(store.id)?._sum.total ?? 0,
      lastActive: activeBy.get(store.userId) ?? null,
    })),
  };
}

export async function sellerDetail(storeId: string, now = new Date()) {
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: {
      id: true, name: true, slug: true, description: true, logoUrl: true, city: true, country: true, currency: true, status: true, customDomain: true, createdAt: true, userId: true,
      user: {
        select: {
          id: true, name: true, email: true, phone: true, aiCredits: true, planInterval: true, planStatus: true, planPaidUntil: true, createdAt: true,
          _count: { select: { paymentReceipts: true } },
          wallet: { select: { bankName: true, accountNumber: true, kycStatus: true, status: true } },
        },
      },
      _count: { select: { storeProducts: true } },
    },
  });
  if (!store) return null;
  const since = new Date(now.getTime() - 30 * DAY);
  const paid = { storeId, status: { in: paidStatuses } };
  const [all, recent, customers, lastActive, grants] = await Promise.all([
    db.retailOrder.aggregate({ where: paid, _count: { _all: true }, _sum: { total: true } }),
    db.retailOrder.aggregate({ where: { ...paid, createdAt: { gte: since } }, _count: { _all: true }, _sum: { total: true } }),
    // A count of distinct buyers only: their names and details are the seller's data, not ours to browse.
    db.retailOrder.groupBy({ by: ["buyerEmail"], where: paid }).then((rows) => rows.length),
    db.userActivityDay.findFirst({ where: { userId: store.userId }, orderBy: { day: "desc" }, select: { day: true } }).catch(() => null),
    runningGrants([store.userId], now),
  ]);
  return {
    ...store,
    ...planSource("seller", store.user, grants.get(store.userId)),
    stats: {
      products: store._count.storeProducts,
      orders: all._count._all,
      sales: all._sum.total ?? 0,
      orders30: recent._count._all,
      sales30: recent._sum.total ?? 0,
      customers,
      lastActive: lastActive?.day ?? null,
    },
  };
}

export async function setShopStatus(storeId: string, status: "active" | "suspended") {
  return db.store.update({ where: { id: storeId }, data: { status }, select: { id: true, userId: true } });
}
