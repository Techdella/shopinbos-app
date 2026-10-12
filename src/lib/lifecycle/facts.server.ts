import "server-only";

import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { appBase } from "@/lib/email/compliance.server";
import { PAID_RETAIL_STATUSES } from "@/lib/supplier-orders/pure";
import { summaryWindow, type AdminFacts, type LifecycleFacts, type LifecycleRole } from "./catalog";

// Loads what the lifecycle catalog (./catalog.ts) needs for a batch of users, in a fixed number of grouped queries
// per batch rather than per user. Optional tables (AuthEvent, ActivityEvent) are read best-effort.


const USER_SELECT = {
  id: true,
  role: true,
  name: true,
  email: true,
  supabaseId: true,
  createdAt: true,
  store: {
    select: {
      id: true,
      name: true,
      slug: true,
      customDomain: true,
      currency: true,
      status: true,
      onboardingState: true,
      _count: { select: { storeProducts: true } },
    },
  },
  supplier: {
    select: {
      id: true,
      businessName: true,
      displayName: true,
      verificationStatus: true,
      updatedAt: true,
      payoutAccount: { select: { id: true } },
      _count: { select: { products: true } },
    },
  },
  logisticsPartner: {
    select: {
      id: true,
      companyName: true,
      displayName: true,
      verificationStatus: true,
      coverageZones: true,
      basePrice: true,
      updatedAt: true,
      payoutAccount: { select: { id: true } },
    },
  },
} as const;

const ms = (date: Date | null | undefined) => (date ? date.getTime() : null);
const latest = (...values: Array<number | null | undefined>) => {
  const seen = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return seen.length ? Math.max(...seen) : null;
};
const firstName = (name: string | null | undefined) =>
  String(name ?? "")
    .trim()
    .split(/\s+/)[0] || "there";

/** Runs a query only when it has something to look up. */
function when<T>(condition: unknown, run: () => Promise<T[]>): Promise<T[]> {
  return condition ? run() : Promise.resolve([]);
}

function indexBy<T, K extends keyof T>(rows: T[], key: K) {
  return new Map(rows.map((row) => [String(row[key]), row]));
}

/** Platform-wide numbers for the admin summary (once per run, not per admin). */
export async function loadAdminFacts(now = new Date()): Promise<AdminFacts> {
  const window = summaryWindow(now.getTime());
  const range = { gte: new Date(window.start), lt: new Date(window.end) };
  const [pendingSuppliers, pendingLogistics, signups, orders] = await Promise.all([
    db.supplier.count({ where: { verificationStatus: "pending" } }),
    db.logisticsPartner.count({ where: { verificationStatus: "pending" } }),
    db.user.groupBy({ by: ["role"], where: { createdAt: range }, _count: { _all: true } }),
    db.retailOrder.aggregate({ where: { createdAt: range, status: { in: [...PAID_RETAIL_STATUSES] } }, _count: { _all: true }, _sum: { total: true } }),
  ]);
  const signup = (role: string) => signups.find((row) => row.role === role)?._count._all ?? 0;
  return {
    pendingSuppliers,
    pendingLogistics,
    week: {
      sellers: signup("seller"),
      suppliers: signup("supplier"),
      logistics: signup("logistics_partner"),
      orders: orders._count._all,
      gmv: Number(orders._sum.total ?? 0),
    },
  };
}

export async function loadLifecycleFacts(userIds: string[], admin?: AdminFacts | null): Promise<Map<string, LifecycleFacts>> {
  const out = new Map<string, LifecycleFacts>();
  if (!userIds.length) return out;

  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: USER_SELECT });

  const storeIds = users.flatMap((user) => (user.store ? [user.store.id] : []));
  const sellerIds = users.filter((user) => user.role === "seller").map((user) => user.id);
  const supplierIds = users.flatMap((user) => (user.supplier ? [user.supplier.id] : []));
  const partnerIds = users.flatMap((user) => (user.logisticsPartner ? [user.logisticsPartner.id] : []));
  const supabaseIds = users.map((user) => user.supabaseId);

  const [
    storeFlags,
    paid,
    dropship,
    sellerBookings,
    activity,
    logins,
    supplierProducts,
    supplierDropship,
    dropshipOrders,
    wholesaleOrders,
    bookings,
    delivered,
    riders,
  ] = await Promise.all([
    when(
      storeIds.length,
      () =>
        db.$queryRaw<Array<{ id: string; published: boolean; bank: boolean }>>`
        SELECT id,
          COALESCE(("brandSettings" #> '{editor,published}') NOT IN ('null'::jsonb, 'false'::jsonb), false) AS published,
          (COALESCE(NULLIF("brandSettings" #>> '{payoutBank,paystackRecipientCode}', ''), NULLIF("brandSettings" #>> '{payoutBank,accountNumberMask}', '')) IS NOT NULL) AS bank
        FROM "Store" WHERE id = ANY(${storeIds})`,
    ),
    when(storeIds.length, () =>
      db.retailOrder.groupBy({
        by: ["storeId"],
        where: { storeId: { in: storeIds }, status: { in: [...PAID_RETAIL_STATUSES] } },
        _count: { _all: true },
        _sum: { total: true },
        _max: { createdAt: true },
      }),
    ),
    when(storeIds.length, () =>
      db.dropshipRelationship.groupBy({ by: ["storeId"], where: { storeId: { in: storeIds }, status: "active" }, _count: { _all: true } }),
    ),
    when(sellerIds.length, () => db.deliveryBooking.groupBy({ by: ["sellerId"], where: { sellerId: { in: sellerIds } }, _count: { _all: true } })),
    when(sellerIds.length, () => db.activityEvent.groupBy({ by: ["userId"], where: { userId: { in: sellerIds } }, _max: { createdAt: true } }).catch(() => [])),
    db.authEvent.groupBy({ by: ["supabaseId"], where: { supabaseId: { in: supabaseIds }, type: "login_success" }, _max: { createdAt: true } }).catch(() => []),
    when(supplierIds.length, () =>
      db.supplierProduct.groupBy({ by: ["supplierId", "status"], where: { supplierId: { in: supplierIds } }, _count: { _all: true } }),
    ),
    when(supplierIds.length, () =>
      db.supplierProduct.groupBy({
        by: ["supplierId"],
        where: { supplierId: { in: supplierIds }, status: "published", dropshipAvailable: true },
        _count: { _all: true },
      }),
    ),
    when(supplierIds.length, () =>
      db.supplierOrder.groupBy({
        by: ["supplierId"],
        where: { supplierId: { in: supplierIds }, status: { notIn: ["rejected", "cancelled"] } },
        _count: { _all: true },
        _sum: { costTotal: true },
        _max: { updatedAt: true },
      }),
    ),
    when(supplierIds.length, () =>
      db.wholesaleOrder.groupBy({
        by: ["supplierId"],
        where: { supplierId: { in: supplierIds }, status: { notIn: ["cancelled", "refunded"] } },
        _count: { _all: true },
        _sum: { totalPrice: true },
        _max: { updatedAt: true },
      }),
    ),
    when(partnerIds.length, () =>
      db.deliveryBooking.groupBy({
        by: ["logisticsPartnerId"],
        where: { logisticsPartnerId: { in: partnerIds } },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
    ),
    when(partnerIds.length, () =>
      db.deliveryBooking.groupBy({
        by: ["logisticsPartnerId"],
        where: { logisticsPartnerId: { in: partnerIds }, status: "delivered" },
        _count: { _all: true },
      }),
    ),
    when(partnerIds.length, () =>
      db.logisticsTeamMember.groupBy({
        by: ["logisticsPartnerId"],
        where: { logisticsPartnerId: { in: partnerIds }, role: "rider", status: "active" },
        _count: { _all: true },
      }),
    ),
  ]);

  const flags = indexBy(storeFlags, "id");
  const paidBy = indexBy(paid, "storeId");
  const dropshipBy = indexBy(dropship, "storeId");
  const sellerBookingsBy = indexBy(sellerBookings, "sellerId");
  const activityBy = indexBy(activity as Array<{ userId: string; _max: { createdAt: Date | null } }>, "userId");
  const loginsBy = indexBy(logins as Array<{ supabaseId: string | null; _max: { createdAt: Date | null } }>, "supabaseId");
  const dropshipProductsBy = indexBy(supplierDropship, "supplierId");
  const dropshipOrdersBy = indexBy(dropshipOrders, "supplierId");
  const wholesaleOrdersBy = indexBy(wholesaleOrders, "supplierId");
  const bookingsBy = indexBy(bookings, "logisticsPartnerId");
  const deliveredBy = indexBy(delivered, "logisticsPartnerId");
  const ridersBy = indexBy(riders, "logisticsPartnerId");

  const appUrl = appBase();

  for (const user of users) {
    const lastLogin = ms(loginsBy.get(user.supabaseId)?._max.createdAt);
    const facts: LifecycleFacts = {
      userId: user.id,
      role: user.role as LifecycleRole,
      firstName: firstName(user.name),
      email: user.email,
      createdAt: user.createdAt.getTime(),
      lastActiveAt: lastLogin,
      appUrl,
    };

    if (user.role === "seller" && user.store) {
      const store = user.store;
      const flag = flags.get(store.id);
      const totals = paidBy.get(store.id);
      const lastPaid = ms(totals?._max.createdAt);
      facts.seller = {
        storeName: store.name,
        storeUrl: buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain }),
        currency: store.currency || "NGN",
        // Store.status defaults to "active", so it alone doesn't mean launched (same test as onboarding-status.ts).
        live: store.onboardingState === "LIVE" || (store.status === "active" && Boolean(flag?.published)),
        products: store._count.storeProducts,
        payoutBank: Boolean(flag?.bank),
        paidOrders: totals?._count._all ?? 0,
        revenue: Number(totals?._sum.total ?? 0),
        lastPaidOrderAt: lastPaid,
        dropshipProducts: dropshipBy.get(store.id)?._count._all ?? 0,
        deliveryBookings: sellerBookingsBy.get(user.id)?._count._all ?? 0,
      };
      facts.lastActiveAt = latest(lastLogin, ms(activityBy.get(user.id)?._max.createdAt), lastPaid);
    }

    if (user.role === "supplier" && user.supplier) {
      const supplier = user.supplier;
      const counts = supplierProducts.filter((row) => row.supplierId === supplier.id);
      const dropshipRow = dropshipOrdersBy.get(supplier.id);
      const wholesaleRow = wholesaleOrdersBy.get(supplier.id);
      facts.supplier = {
        businessName: supplier.businessName || supplier.displayName,
        verification: supplier.verificationStatus,
        products: counts.reduce((sum, row) => sum + row._count._all, 0),
        liveProducts: counts.find((row) => row.status === "published")?._count._all ?? 0,
        dropshipProducts: dropshipProductsBy.get(supplier.id)?._count._all ?? 0,
        orders: (dropshipRow?._count._all ?? 0) + (wholesaleRow?._count._all ?? 0),
        revenue: Number(dropshipRow?._sum.costTotal ?? 0) + Number(wholesaleRow?._sum.totalPrice ?? 0),
        payoutAccount: Boolean(supplier.payoutAccount),
      };
      facts.lastActiveAt = latest(lastLogin, ms(supplier.updatedAt), ms(dropshipRow?._max.updatedAt), ms(wholesaleRow?._max.updatedAt));
    }

    if (user.role === "logistics_partner" && user.logisticsPartner) {
      const partner = user.logisticsPartner;
      const bookingRow = bookingsBy.get(partner.id);
      facts.logistics = {
        companyName: partner.companyName || partner.displayName,
        verification: partner.verificationStatus,
        coverageZones: partner.coverageZones.length,
        priced: partner.basePrice > 0,
        bookings: bookingRow?._count._all ?? 0,
        delivered: deliveredBy.get(partner.id)?._count._all ?? 0,
        riders: ridersBy.get(partner.id)?._count._all ?? 0,
        payoutAccount: Boolean(partner.payoutAccount),
      };
      facts.lastActiveAt = latest(lastLogin, ms(partner.updatedAt), ms(bookingRow?._max.updatedAt));
    }

    if (user.role === "admin") facts.admin = admin ?? null;

    out.set(user.id, facts);
  }
  return out;
}
