import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import {
  CUSTOMERS_PAGE_SIZE,
  pageCount,
  searchPattern,
  vipRule,
  type CustomerListQuery,
  type VipRule,
} from "./pure";

// The customers list, worked out in Postgres: orders are grouped into customers (by email, else phone digits,
// else name; the same key as customerKey in ./pure.ts) and counted, summed and sorted there, so a shop with
// thousands of orders never loads them all. Only one page of customers comes back.

/** The SQL twin of customerKey(): lowercase email, else the phone's digits, else "name:" + the name. */
const KEY = Prisma.sql`COALESCE(NULLIF(lower(btrim("buyerEmail")), ''), NULLIF(regexp_replace(coalesce("buyerPhone", ''), '[^0-9]', '', 'g'), ''), 'name:' || lower(btrim("buyerName")))`;
const PHONE_DIGITS = Prisma.sql`regexp_replace(coalesce("buyerPhone", ''), '[^0-9]', '', 'g')`;
const PAID = Prisma.join(PAID_ORDER_STATUSES.map((status) => Prisma.sql`${status}`));

/** One row per customer of the store. `hit` says whether any of their orders matches the search. */
function grouped(storeId: string, q: string) {
  const search = searchPattern(q);
  const hit = search
    ? Prisma.sql`bool_or("buyerName" ILIKE ${search.like} OR "buyerEmail" ILIKE ${search.like}${search.digits ? Prisma.sql` OR ${PHONE_DIGITS} LIKE ${`%${search.digits}%`}` : Prisma.empty})`
    : Prisma.sql`true`;
  return Prisma.sql`
    SELECT ${KEY} AS key,
      count(*)::int AS orders,
      coalesce(sum(total) FILTER (WHERE status::text IN (${PAID})), 0)::float8 AS spent,
      min("createdAt") AS first_at,
      max("createdAt") AS last_at,
      (array_agg("buyerName" ORDER BY "createdAt" DESC))[1] AS name,
      (array_agg(btrim("buyerEmail") ORDER BY "createdAt" DESC) FILTER (WHERE btrim("buyerEmail") <> ''))[1] AS email,
      (array_agg(btrim("buyerPhone") ORDER BY "createdAt" DESC) FILTER (WHERE coalesce(btrim("buyerPhone"), '') <> ''))[1] AS phone,
      bool_or(length(${PHONE_DIGITS}) BETWEEN 10 AND 15) AS has_wa,
      ${hit} AS hit
    FROM "RetailOrder"
    WHERE "storeId" = ${storeId}
    GROUP BY 1`;
}

export interface CustomerStats {
  customers: number;
  returning: number;
  orders: number;
  vip: VipRule;
  counts: { all: number; new: number; returning: number; vip: number; whatsapp: number };
}

/** Totals for the stat tiles and the filter chips, and who counts as a VIP in this shop. */
export async function customerStats(storeId: string): Promise<CustomerStats> {
  const rows = await db.$queryRaw<Array<{ customers: number; p90: number | null; new_count: number; returning_count: number; whatsapp_count: number; orders: number; vip_spend: number; vip_orders: number }>>`
    WITH c AS (${grouped(storeId, "")}),
         p AS (SELECT percentile_disc(0.9) WITHIN GROUP (ORDER BY spent) AS p90 FROM c)
    SELECT count(*)::int AS customers,
      max(p.p90)::float8 AS p90,
      count(*) FILTER (WHERE orders = 1)::int AS new_count,
      count(*) FILTER (WHERE orders >= 2)::int AS returning_count,
      count(*) FILTER (WHERE has_wa)::int AS whatsapp_count,
      coalesce(sum(orders), 0)::int AS orders,
      count(*) FILTER (WHERE spent > 0 AND spent >= p.p90)::int AS vip_spend,
      count(*) FILTER (WHERE orders >= 6)::int AS vip_orders
    FROM c CROSS JOIN p`;
  const row = rows[0];
  const customers = Number(row?.customers ?? 0);
  const vip = vipRule(customers, row?.p90 ?? null);
  return {
    customers,
    returning: Number(row?.returning_count ?? 0),
    orders: Number(row?.orders ?? 0),
    vip,
    counts: {
      all: customers,
      new: Number(row?.new_count ?? 0),
      returning: Number(row?.returning_count ?? 0),
      vip: Number(vip.kind === "spend" ? row?.vip_spend ?? 0 : row?.vip_orders ?? 0),
      whatsapp: Number(row?.whatsapp_count ?? 0),
    },
  };
}

export interface CustomerRow {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  orders: number;
  spent: number;
  firstAt: Date;
  lastAt: Date;
}

function filterSql(query: CustomerListQuery, vip: VipRule) {
  switch (query.show) {
    case "new":
      return Prisma.sql`AND orders = 1`;
    case "returning":
      return Prisma.sql`AND orders >= 2`;
    case "vip":
      return vip.kind === "spend" ? Prisma.sql`AND spent > 0 AND spent >= ${vip.min}` : Prisma.sql`AND orders >= ${vip.min}`;
    case "whatsapp":
      return Prisma.sql`AND has_wa`;
    default:
      return Prisma.empty;
  }
}

function orderSql(query: CustomerListQuery) {
  switch (query.sort) {
    case "spent":
      return Prisma.sql`spent DESC, last_at DESC, key`;
    case "orders":
      return Prisma.sql`orders DESC, last_at DESC, key`;
    default:
      return Prisma.sql`last_at DESC, key`;
  }
}

type RawRow = { key: string; orders: number; spent: number; first_at: Date; last_at: Date; name: string; email: string | null; phone: string | null; total: number };

async function listPage(storeId: string, query: CustomerListQuery, vip: VipRule, page: number, size: number) {
  return db.$queryRaw<RawRow[]>`
    WITH c AS (${grouped(storeId, query.q)})
    SELECT key, orders, spent, first_at, last_at, name, email, phone, (count(*) OVER ())::int AS total
    FROM c
    WHERE hit ${filterSql(query, vip)}
    ORDER BY ${orderSql(query)}
    LIMIT ${size} OFFSET ${(page - 1) * size}`;
}

/** One page of customers for the search, filter and sort in the URL. A page past the end shows the last page. */
export async function listCustomers(storeId: string, query: CustomerListQuery, vip: VipRule, size = CUSTOMERS_PAGE_SIZE) {
  let page = query.page;
  let rows = await listPage(storeId, query, vip, page, size);
  if (!rows.length && page > 1) {
    const counted = await db.$queryRaw<Array<{ total: number }>>`
      WITH c AS (${grouped(storeId, query.q)})
      SELECT count(*)::int AS total FROM c WHERE hit ${filterSql(query, vip)}`;
    const total = Number(counted[0]?.total ?? 0);
    page = pageCount(total, size);
    rows = total ? await listPage(storeId, query, vip, page, size) : [];
  }
  const total = Number(rows[0]?.total ?? 0);
  const customers: CustomerRow[] = rows.map((r) => ({
    key: r.key,
    name: r.name?.trim() || r.email || r.phone || "",
    email: r.email,
    phone: r.phone,
    orders: Number(r.orders),
    spent: Number(r.spent),
    firstAt: new Date(r.first_at),
    lastAt: new Date(r.last_at),
  }));
  return { customers, total, page, pages: pageCount(total, size) };
}

// ─── One customer ────────────────────────────────────────────────────────────

/** The store's orders for one customer key, newest first. Empty when the key isn't one of this store's customers. */
export async function customerOrderIds(storeId: string, key: string, limit = 500) {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "RetailOrder" WHERE "storeId" = ${storeId} AND ${KEY} = ${key} ORDER BY "createdAt" DESC LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

/** Name, email and phone for a customer key from their orders (latest non-empty of each), or null if not this store's customer. */
export async function customerContact(storeId: string, key: string) {
  const ids = await customerOrderIds(storeId, key);
  if (!ids.length) return null;
  const orders = await db.retailOrder.findMany({
    where: { id: { in: ids }, storeId },
    orderBy: { createdAt: "desc" },
    select: { id: true, orderNumber: true, buyerName: true, buyerEmail: true, buyerPhone: true, total: true, currency: true, status: true, createdAt: true, deliveryAddress: true, trackingCode: true, logisticsDetails: true, items: true },
  });
  const pick = (values: Array<string | null | undefined>) => values.map((v) => (v ?? "").trim()).find(Boolean) || null;
  return {
    key,
    orders,
    name: pick(orders.map((o) => o.buyerName)) ?? "",
    email: pick(orders.map((o) => o.buyerEmail))?.toLowerCase() ?? null,
    phone: pick(orders.map((o) => o.buyerPhone)),
  };
}

export type CustomerContact = NonNullable<Awaited<ReturnType<typeof customerContact>>>;
