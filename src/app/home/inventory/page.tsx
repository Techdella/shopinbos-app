import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { AppPage, EmptyState, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile, Thumb, cx, type Tone } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatNumber } from "@shared/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("products");
  return { title: t("inv.title") };
}

function stockStatus(current: number, threshold: number): { label: "inv.out" | "inv.low" | "inv.in"; tone: Tone } {
  if (current <= 0) return { label: "inv.out", tone: "danger" };
  if (current <= threshold) return { label: "inv.low", tone: "accent" };
  return { label: "inv.in", tone: "success" };
}

export default async function InventoryPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("products", "common");
  const locale = await getLocale();
  const num = (value: number) => formatNumber(value, locale);
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store;

  const products = store
    ? await db.storeProduct.findMany({
        where: { storeId: store.id },
        orderBy: [{ currentStock: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          name: true,
          sku: true,
          status: true,
          currentStock: true,
          reservedStock: true,
          soldStock: true,
          incomingStock: true,
          lowStockThreshold: true,
          images: true,
          retailPrice: true,
          currency: true,
          fulfillmentType: true,
          supplierProductId: true,
          supplierProduct: {
            select: {
              stockQuantity: true,
              supplier: { select: { displayName: true } },
            },
          },
        },
      })
    : [];

  const totalProducts = products.length;
  const outOfStock = products.filter((p) => p.currentStock <= 0).length;
  const lowStock = products.filter((p) => p.currentStock > 0 && p.currentStock <= p.lowStockThreshold).length;
  const merchantFulfilled = products.filter((p) => p.fulfillmentType === "merchant_fulfilled");
  const totalUnits = merchantFulfilled.reduce((sum, p) => sum + p.currentStock, 0);

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={t("inv.title")}
      sub={t("inv.sub")}
      actions={
        <>
          <PillLink href="/products" tone="ink">{t("inv.manage")}</PillLink>
        </>
      }
    >
      <StatGrid className="mb-5">
        <StatTile tone="card" label={t("inv.products")} value={num(totalProducts)} />
        <StatTile tone="card" label={t("inv.units")} value={num(totalUnits)} hint={t("inv.ownStock")} />
        <StatTile tone="card" label={t("inv.low")} value={num(lowStock)} />
        <StatTile tone="card" label={t("inv.out")} value={num(outOfStock)} />
      </StatGrid>

      {outOfStock > 0 || lowStock > 0 ? (
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[18px] bg-app-peach px-4 py-3 text-[14px]" role="status">
          <span className="min-w-0 flex-1">
            {outOfStock > 0 && `${t("inv.outCount", { count: outOfStock })} `}
            {lowStock > 0 && t("inv.lowCount", { count: lowStock })}
          </span>
          <Link href="/marketplace" className="font-extrabold text-app-accent-ink no-underline hover:underline">{t("inv.source")}</Link>
        </div>
      ) : null}

      {products.length === 0 ? (
        <EmptyState icon="box" title={t("inv.empty")} action={<PillLink href="/products/new" tone="ink" icon="plus">{t("addProduct")}</PillLink>}>
          {t("inv.emptySub")}
        </EmptyState>
      ) : (
        <ListCard>
          {products.map((p) => {
            const status = stockStatus(p.currentStock, p.lowStockThreshold);
            const isDropship = p.fulfillmentType === "dropship";
            const supplierStock = p.supplierProduct?.stockQuantity;
            const source = isDropship && p.supplierProduct?.supplier?.displayName
              ? p.supplierProduct.supplier.displayName
              : isDropship ? t("inv.supplier") : t("list.ownStock");
            const count = isDropship ? supplierStock : p.currentStock;
            return (
              <ListRow key={p.id} href={`/products/${p.id}`}>
                <div className="flex w-full min-w-0 items-start gap-3.5 md:items-center md:gap-4">
                  <Thumb src={p.images[0]} label={p.name} />
                  <div className="grid min-w-0 flex-1 items-center gap-x-5 gap-y-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_auto] xl:grid-cols-[minmax(0,1.8fr)_130px_100px_80px_100px_130px]">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-extrabold">{p.name}</div>
                      <div className="truncate text-[13px] text-app-ink-soft">{[p.sku, source].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-app-ink-soft xl:contents">
                      <span>{isDropship ? <Pill tone="muted">{t("list.dropship")}</Pill> : <Pill tone={status.tone} dot>{t(status.label)}</Pill>}</span>
                      <span>{isDropship ? "—" : t("inv.reserved", { count: p.reservedStock })}</span>
                      <span>{t("list.sold", { count: p.soldStock })}</span>
                      <span className={cx(!isDropship && p.incomingStock > 0 && "font-bold text-app-success")}>
                        {!isDropship && p.incomingStock > 0 ? t("inv.coming", { count: p.incomingStock }) : "—"}
                      </span>
                    </div>
                    <div className={cx("text-[15px] font-extrabold md:text-right", !isDropship && p.currentStock <= p.lowStockThreshold && "text-app-accent-ink")}>
                      {count ?? "—"} <span className="text-[12.5px] font-semibold text-app-ink-soft">{isDropship ? t("inv.atSupplier") : t("inv.inStock")}</span>
                    </div>
                  </div>
                </div>
              </ListRow>
            );
          })}
        </ListCard>
      )}
    </AppPage>
  );
}
