import "server-only";
import { db } from "@/lib/db/client";
import { SUPPLIER_PLAN_FIRST } from "@/lib/plans/placement";
import { VISIBLE_SUPPLIER, nearness, sellerHasPlace, sellerPlace, supplierTrust } from "@/lib/marketplace/agreements.server";

// Suppliers a seller can browse (web /marketplace/suppliers and the phone app's Suppliers): every visible supplier,
// near or far; the nearest first, then the safest. Each with where they are, how far, verification and risk, how
// many products are live and whether the seller follows them ("Notify me when they add products").

const SELECT = {
  id: true, userId: true, slug: true, displayName: true, description: true, logoUrl: true, bannerUrl: true, categories: true,
  city: true, address: true, country: true, businessType: true, verificationStatus: true,
  _count: { select: { products: { where: { status: "published" as const } } } },
} as const;

export interface DirectorySupplier {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  city: string;
  country: string;
  businessType: string;
  categories: string[];
  km: number | null;
  near: boolean;
  verificationStatus: string;
  risk: { score: number; level: string } | null;
  products: number;
  following: boolean;
}

type Row = { id: string; userId: string; slug: string; displayName: string; description: string | null; logoUrl: string | null; bannerUrl: string | null; categories: string[]; city: string; address: string | null; country: string; businessType: string; verificationStatus: string; _count: { products: number } };

async function decorate(sellerId: string, rows: Row[]) {
  const place = await sellerPlace(sellerId);
  const hasPlace = sellerHasPlace(place);
  const ids = rows.map((row) => row.id);
  const [trust, follows] = await Promise.all([
    supplierTrust(ids),
    ids.length ? db.supplierFollow.findMany({ where: { userId: sellerId, supplierId: { in: ids } }, select: { supplierId: true } }).catch(() => []) : Promise.resolve([]),
  ]);
  const followed = new Set(follows.map((row) => row.supplierId));
  const out = rows.map((row): DirectorySupplier => {
    const distance = nearness(place, { city: row.city, address: row.address });
    const info = trust.get(row.id);
    return {
      id: row.id,
      slug: row.slug,
      name: row.displayName,
      description: row.description,
      logoUrl: row.logoUrl,
      bannerUrl: row.bannerUrl,
      city: row.city,
      country: row.country,
      businessType: row.businessType,
      categories: row.categories,
      km: typeof distance.km === "number" ? Math.max(1, Math.round(distance.km)) : null,
      near: !hasPlace || distance.near,
      verificationStatus: info?.verificationStatus ?? row.verificationStatus,
      risk: info ? { score: info.risk.score, level: info.risk.level } : null,
      products: row._count.products,
      following: followed.has(row.id),
    };
  });
  return { hasPlace, suppliers: out };
}

/** Every visible supplier for this seller, nearest first (then verified, then lower risk). */
export async function supplierDirectory(sellerId: string, filters: { q?: string; category?: string } = {}) {
  const q = (filters.q ?? "").trim().slice(0, 120);
  const rows = await db.supplier.findMany({
    where: {
      ...VISIBLE_SUPPLIER,
      ...(q ? { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { businessName: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] } : {}),
      ...(filters.category ? { categories: { has: filters.category } } : {}),
    },
    orderBy: [SUPPLIER_PLAN_FIRST, { trustScore: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: SELECT,
  });
  const { hasPlace, suppliers } = await decorate(sellerId, rows);
  const ordered = [...suppliers].sort((a, b) => Number(b.near) - Number(a.near) || Number(b.verificationStatus === "verified") - Number(a.verificationStatus === "verified") || (a.km ?? 1e9) - (b.km ?? 1e9) || (a.risk?.score ?? 100) - (b.risk?.score ?? 100));
  return { hasPlace, suppliers: ordered };
}

/** One supplier (by slug or id) as the seller sees it, or null. */
export async function directorySupplier(sellerId: string, ref: string) {
  const row = await db.supplier.findFirst({ where: { ...VISIBLE_SUPPLIER, OR: [{ slug: ref }, { id: ref }] }, select: SELECT });
  if (!row) return null;
  return (await decorate(sellerId, [row])).suppliers[0] ?? null;
}
