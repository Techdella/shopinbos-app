import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { customerStats, listCustomers } from "@/lib/customers/queries.server";
import { customerBadge, parseCustomerListQuery } from "@/lib/customers/pure";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LIMIT = 50;

// GET /api/app/customers?page=&limit=&q=&show=all|new|returning|vip|whatsapp&sort=recent|spent|orders&segment=<id>
// One page of the seller's customers, the same list (search, filter, saved segment, sort, grouping) as /home/customers, with the
// numbers for the filter chips. Each customer's `key` opens them with GET /api/app/customers/profile?key=.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, currency: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const query = parseCustomerListQuery(req.nextUrl.searchParams);
  const asked = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(asked) && asked >= 1 ? Math.min(asked, MAX_LIMIT) : MAX_LIMIT;

  const stats = await customerStats(store.id);
  const list = stats.customers ? await listCustomers(store.id, query, stats.vip, limit) : { customers: [], total: 0, page: 1, pages: 1 };

  return NextResponse.json({
    data: list.customers.map((c) => ({
      key: c.key,
      name: c.name,
      email: c.email,
      phone: c.phone,
      orders: c.orders,
      spent: c.spent,
      badge: customerBadge(c, stats.vip),
      firstAt: c.firstAt.toISOString(),
      lastAt: c.lastAt.toISOString(),
    })),
    meta: {
      page: list.page,
      limit,
      total: list.total,
      pages: list.pages,
      currency: store.currency || "NGN",
      stats: { customers: stats.customers, returning: stats.returning, orders: stats.orders, counts: stats.counts },
    },
  });
});
