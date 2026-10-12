import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { sellerFrame } from "@/components/seller-core";
import { findSample, isSampleId, parseSourcing, similarRange, toFindProduct, type FindProduct } from "@/lib/marketplace/find";
import { ProductDetail } from "../../_components/ProductDetail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Find products" };

const supplierSelect = { id: true, userId: true, slug: true, displayName: true, city: true, rating: true, ratingCount: true, verificationStatus: true } as const;

export default async function MarketplaceProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, brandSettings: true } });
  if (!store) redirect("/builder?firstRun=1");
  const settings = (store.brandSettings && typeof store.brandSettings === "object" ? store.brandSettings : {}) as Record<string, unknown>;
  const sourcing = parseSourcing(settings.sourcing);

  let product: FindProduct | null = null;
  let added = false;
  if (isSampleId(id)) {
    product = findSample(id);
  } else {
    const row = await safeQuery(() => db.supplierProduct.findFirst({
      where: { id, status: "published", supplier: { status: "active", verificationStatus: "verified" } },
      include: { supplier: { select: supplierSelect }, category: { select: { name: true } } },
    }), null);
    if (row) {
      product = toFindProduct(row);
      const [peers, inStore] = await Promise.all([
        safeQuery(() => db.supplierProduct.findMany({
          where: { categoryId: row.categoryId, status: "published", supplier: { status: "active", verificationStatus: "verified" } },
          include: { supplier: { select: supplierSelect }, category: { select: { name: true } } },
          take: 60,
        }), []),
        safeQuery(() => db.storeProduct.count({ where: { storeId: store.id, supplierProductId: row.id } }), 0),
      ]);
      product = { ...product, similar: similarRange(product, peers.map(toFindProduct)) };
      added = inStore > 0;
    }
  }
  if (!product) notFound();

  return (
    <AppFrame {...sellerFrame(user, store)}>
      <div className="w-full px-4 py-6 font-app text-app-ink sm:px-6 xl:px-8 2xl:px-10">
        <ProductDetail product={product} added={added} saved={sourcing.saved.includes(product.id)} notified={sourcing.notifyNewSuppliers} />
      </div>
    </AppFrame>
  );
}
