import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage, MoreActions, PillLink } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { updateSupplierProduct } from "@/app/actions/supplier";
import { SupplierProductForm } from "@/components/supplier/SupplierProductForm";
import { getT } from "@/lib/i18n/server";
import { supplierLevelView } from "@/lib/supplier-levels.server";
import { pendingPriceView } from "@/lib/marketplace/price-notice.server";
import { noticeDay } from "@shared/price-notice";
import { naira } from "@/lib/marketplace/find";

export default async function EditSupplierProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const { id } = await params;
  const query = searchParams ? await searchParams : {};

  const [product, categories, level] = await Promise.all([
    db.supplierProduct.findFirst({
      where: { id, supplierId: supplier.id },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        categoryId: true,
        images: true,
        status: true,
        wholesalePrice: true,
        wholesalePriceTo: true,
        suggestedRetailPrice: true,
        currency: true,
        stockQuantity: true,
        moq: true,
        pricingTiers: true,
        dropshipAvailable: true,
        bulkOrderAvailable: true,
        sampleAvailable: true,
        deliveryRegions: true,
        processingTime: true,
        preorderEnabled: true,
        preorderShipsAt: true,
        preorderLimit: true,
        preorderTaken: true,
        preorderNote: true,
        preorderDepositPct: true,
        priceMode: true,
        dropshipPrice: true,
        preorderPrice: true,
        minRetailPrice: true,
        dropshipMinQty: true,
        handlingDays: true,
        sizeBand: true,
        pendingPrice: true,
        pendingPriceAt: true,
        updatedAt: true,
        category: { select: { name: true, slug: true } },
      },
    }),
    db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    }),
    // Pre-orders open at Established: the form shows the goals left until then.
    supplierLevelView(supplier.id).catch(() => null),
  ]);

  if (!product) notFound();
  const t = await getT("supplier");
  const tm = await getT("marketplace");
  // A price rise waiting out its 7 days' notice to the shops selling it (shared/price-notice.ts).
  const pending = pendingPriceView(product);
  const { pendingPrice: _pending, pendingPriceAt: _pendingAt, ...formProduct } = product;
  void _pending;
  void _pendingAt;

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title={product.name}
      sub={t("editProduct.sub", { category: product.category.name })}
      actions={
        <>
          <MoreActions>
            <PillLink href="/supplier/products">{t("dashboard.allProducts")}</PillLink>
          </MoreActions>
          <PillLink href="/supplier/products/new" icon="plus">{t("editProduct.newProduct")}</PillLink>
        </>
      }
    >
      {pending ? (
        <p role="status" data-testid="price-notice" className="mb-4 rounded-[16px] bg-[#FDF0D5] px-4 py-3 text-[14px] font-bold leading-[1.5] text-[#5C3D00]">
          {tm("notice.supplierPending", { price: naira(pending.wholesalePrice), date: noticeDay(pending.at), now: naira(product.wholesalePrice) })}
        </p>
      ) : (
        <p className="mb-4 text-[13.5px] leading-[1.5] text-app-ink-soft">{tm("notice.supplierRule")}</p>
      )}
      <SupplierProductForm
        mode="edit"
        action={updateSupplierProduct}
        categories={categories}
        product={formProduct}
        error={query?.error}
        saved={query?.saved === "1"}
        level={level}
      />
    </AppPage>
  );
}
