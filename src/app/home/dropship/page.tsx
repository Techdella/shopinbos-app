import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppPage, EmptyState, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile, Thumb, type Tone } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, Tone> = { active: "success", paused: "warning" };

function stockPill(quantity: number) {
  if (quantity <= 0) return <Pill tone="danger">Out of stock</Pill>;
  if (quantity <= 5) return <Pill tone="accent">{quantity} left</Pill>;
  return <Pill tone="success">{quantity} in stock</Pill>;
}

export default async function SellerDropshipPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  const relationships = await db.dropshipRelationship.findMany({
    where: { sellerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      supplier: { select: { displayName: true, city: true, country: true, trustScore: true } },
      supplierProduct: { select: { name: true, stockQuantity: true, processingTime: true } },
      storeProduct: { select: { id: true, name: true, status: true, images: true } },
    },
  });

  const active = relationships.filter((r) => r.status === "active");
  const lowStock = relationships.filter((r) => r.supplierProduct.stockQuantity > 0 && r.supplierProduct.stockQuantity < 5);
  const suppliers = new Set(relationships.map((r) => r.supplierId)).size;

  return (
    <AppPage
      frame={sellerFrame(user, workspace?.store)}
      title="Dropship"
      sub="Products you sell that suppliers send straight to your buyers."
      actions={<PillLink href="/marketplace?dropship=true" tone="accent" icon="search">Find dropship products</PillLink>}
    >
      <StatGrid className="mb-5">
        <StatTile tone="card" label="Products" value={String(relationships.length)} hint="Linked to a supplier" />
        <StatTile tone="card" label="Active" value={String(active.length)} hint="Selling now" />
        <StatTile tone="card" label="Running low" value={String(lowStock.length)} hint="Fewer than 5 at the supplier" />
        <StatTile tone="card" label="Suppliers" value={String(suppliers)} />
      </StatGrid>

      {relationships.length === 0 ? (
        <EmptyState icon="truck" title="No dropship products yet" action={<PillLink href="/marketplace?dropship=true" tone="ink">Browse the marketplace</PillLink>}>
          Add a dropship product from the marketplace. The supplier holds the stock and sends each order for you.
        </EmptyState>
      ) : (
        <ListCard>
          {relationships.map((r) => {
            const location = [r.supplier.city, r.supplier.country].filter(Boolean).join(", ");
            return (
              <ListRow key={r.id} href={`/products/${r.storeProduct.id}`}>
                <div className="flex w-full min-w-0 items-start gap-3.5 md:items-center md:gap-4">
                  <Thumb src={r.storeProduct.images[0]} label={r.storeProduct.name} />
                  <div className="grid min-w-0 flex-1 items-center gap-x-5 gap-y-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)] xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_minmax(0,0.7fr)_90px_90px]">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-extrabold">{r.storeProduct.name}</div>
                      <div className="truncate text-[13px] text-app-ink-soft">From {r.supplierProduct.name}</div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-app-ink-soft xl:contents">
                      <span className="min-w-0 truncate">
                        <span className="font-bold text-app-ink">{r.supplier.displayName}</span>
                        {location ? ` · ${location}` : ""}
                      </span>
                      <span>{stockPill(r.supplierProduct.stockQuantity)}</span>
                      <span className="truncate">Ships in {r.supplierProduct.processingTime ?? "not listed"}</span>
                      <span>Trust {r.supplier.trustScore ?? "—"}</span>
                      <span><Pill tone={STATUS_TONE[r.status] ?? "info"}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Pill></span>
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
