import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { sellerFrame } from "@/components/seller-core";
import { findSample, isSampleId, parseSourcing, similarRange, toFindProduct, type FindProduct } from "@/lib/marketplace/find";
import { ProductDetail, type MyWholesaleOrder } from "../../_components/ProductDetail";
import { getT } from "@/lib/i18n/server";
import { AssistantNote } from "@/components/app-kit";
import { TipsGate } from "../../_components/TipsGate";
import { VISIBLE_SUPPLIER, agreementWith, nearness, sellerHasPlace, sellerPlace, supplierContact, supplierTrust } from "@/lib/marketplace/agreements.server";
import { listingStep } from "@shared/supplier-trust";
import type { ListingInfo } from "../../_components/BeforeYouList";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketplace");
  return { title: t("ws.findProducts") };
}

const supplierSelect = { id: true, userId: true, slug: true, displayName: true, city: true, rating: true, ratingCount: true, verificationStatus: true, returnPolicy: true, address: true } as const;

export default async function MarketplaceProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, brandSettings: true, city: true, country: true } });
  if (!store) redirect("/builder?firstRun=1");
  const settings = (store.brandSettings && typeof store.brandSettings === "object" ? store.brandSettings : {}) as Record<string, unknown>;
  const sourcing = parseSourcing(settings.sourcing);

  let product: FindProduct | null = null;
  let added = false;
  let wholesaleOrders: MyWholesaleOrder[] = [];
  let listing: ListingInfo | undefined;
  if (isSampleId(id)) {
    product = findSample(id);
  } else {
    const row = await safeQuery(() => db.supplierProduct.findFirst({
      where: { id, status: "published", supplier: VISIBLE_SUPPLIER },
      include: { supplier: { select: supplierSelect }, category: { select: { name: true } } },
    }), null);
    if (row) {
      product = toFindProduct(row);
      const [peers, inStore, mine] = await Promise.all([
        safeQuery(() => db.supplierProduct.findMany({
          where: { categoryId: row.categoryId, status: "published", supplier: { status: "active", verificationStatus: "verified" } }, // price range from verified suppliers only
          include: { supplier: { select: supplierSelect }, category: { select: { name: true } } },
          take: 60,
        }), []),
        safeQuery(() => db.storeProduct.count({ where: { storeId: store.id, supplierProductId: row.id } }), 0),
        safeQuery(() => db.wholesaleOrder.findMany({
          where: { sellerId: user.id, supplierProductId: row.id },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, quantity: true, totalPrice: true, status: true, trackingCode: true, rejectReason: true, createdAt: true },
        }), []),
      ]);
      wholesaleOrders = mine.map((order) => ({ ...order, createdAt: order.createdAt.toISOString() }));
      product = { ...product, similar: similarRange(product, peers.map(toFindProduct)) };
      added = inStore > 0;
      // Who the supplier is and how close (src/lib/marketplace/agreements.server.ts): verification, risk score,
      // distance, and the call / stock check / agreement steps before dropshipping their products.
      const [place, trust, agreement] = await Promise.all([sellerPlace(user.id), supplierTrust([row.supplier.id]), agreementWith(user.id, row.supplier.id)]);
      const distance = nearness(place, { city: row.supplier.city, address: row.supplier.address });
      const info = trust.get(row.supplier.id);
      const step = !sellerHasPlace(place) ? "noPlace" : !distance.near ? "far" : listingStep(agreement);
      const contact = step === "agree" || step === "declined" ? await supplierContact(row.supplier.id) : { phone: null, address: null };
      listing = { step, phone: contact.phone, address: contact.address, supplierNote: agreement?.supplierNote ?? null, shopName: store.name, shopCity: store.city };
      product = {
        ...product,
        // Wholesale (paid to the supplier directly) only from verified suppliers.
        wholesale: product.wholesale && row.supplier.verificationStatus === "verified",
        supplier: { ...product.supplier, km: distance.km, area: distance.area, risk: info?.risk ?? null, verificationStatus: row.supplier.verificationStatus, agreed: agreement?.status === "active" },
      };
    }
  }
  if (!product) notFound();
  const t = await getT("marketplace");

  return (
    <AppFrame {...sellerFrame(user, store)}>
      <div className="w-full px-4 py-6 font-app text-app-ink sm:px-6 xl:px-8 2xl:px-10">
        <ProductDetail
          product={product}
          added={added}
          saved={sourcing.saved.includes(product.id)}
          notified={sourcing.notifyNewSuppliers}
          defaultAddress={[store.city, store.country].filter(Boolean).join(", ")}
          wholesaleOrders={wholesaleOrders}
          listing={product.dropship ? listing : undefined}
          tip={<TipsGate><AssistantNote who="peggy">{t("pd.tip")}</AssistantNote></TipsGate>}
        />
      </div>
    </AppFrame>
  );
}
