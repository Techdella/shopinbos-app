import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

function fmtMoney(n: number, sym = "₦") {
  return `${sym}${Math.round(n).toLocaleString("en-US")}`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Active",
  active: "Active",
  archived: "Archived",
};

const STATUS_VARIANT: Record<string, string> = {
  draft: "soft",
  published: "success",
  active: "success",
  archived: "ink",
};

const VISIBILITY_LABEL: Record<string, string> = {
  hidden: "Hidden",
  storefront: "Storefront",
  featured: "Featured",
  collection_only: "Collection Only",
};

const VISIBILITY_VARIANT: Record<string, string> = {
  hidden: "ink",
  storefront: "mint",
  featured: "amber",
  collection_only: "indigo",
};

const INVENTORY_LABEL: Record<string, string> = {
  seller: "Seller Inventory",
  dropshipping: "Dropshipping",
  source_on_demand: "Source-On-Demand",
  print_on_demand: "Print-On-Demand",
  digital: "Digital",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; visibility?: string }>
}) {
  const { status, visibility } = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");

  const storeId = workspace.store.id;
  const where: Record<string, unknown> = { storeId };
  if (status && status !== "all") where.status = status;
  if (visibility && visibility !== "all") where.visibility = visibility;

  const products = await db.storeProduct.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      images: true,
      retailPrice: true,
      compareAtPrice: true,
      currency: true,
      status: true,
      visibility: true,
      inventoryType: true,
      currentStock: true,
      lowStockThreshold: true,
      featured: true,
      tags: true,
      createdAt: true,
      category: { select: { id: true, name: true } },
    },
  });

  const activeTab = status || "all";
  const visibilityTab = visibility || "all";
  const counts = {
    all: products.length,
    draft: await db.storeProduct.count({ where: { storeId, status: "draft" } }),
    active: await db.storeProduct.count({ where: { storeId, status: { in: ["published", "active"] } } }),
    archived: await db.storeProduct.count({ where: { storeId, status: "archived" } }),
  };

  return (
    <AppFrame
      role="seller"
      storeName={workspace.store.name}
      storeSlug={workspace.store.slug}
      storeInitial={workspace.store.name?.[0]?.toUpperCase()}
      storeLogoUrl={workspace.store.logoUrl}
      userName={user.name}
      userInitials={user.name?.split(" ").map((p: string) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px 28px 40px", background: "var(--canvas)" }}>
        <PageHead
          title="Products"
          sub="Manage your products"
          actions={
            <div className="flex items-center gap-2">
              <Link href="/products/import" className="dbtn dBtn-ghost dBtn-sm" style={{ textDecoration: "none" }}>
                <Icon name="download" size={14} /> Import
              </Link>
              <Link href="/products/new" className="dbtn dBtn-mint dBtn-sm" style={{ textDecoration: "none" }}>
                <Icon name="plus" size={14} /> Add product
              </Link>
            </div>
          }
        />

        <div className="design-tabs">
          {["all", "draft", "active", "archived"].map((t) => (
            <Link
              key={t}
              href={`/products?status=${t}${visibility && visibility !== "all" ? `&visibility=${visibility}` : ""}`}
              className={`tab${t === activeTab ? " on" : ""}`}
              style={{ textDecoration: "none", textTransform: "capitalize" }}
            >
              {t === "all" ? "All" : STATUS_LABEL[t] ?? t}
              {(counts as any)[t] !== undefined && (
                <span className="tab-count">{(counts as any)[t]}</span>
              )}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-500)" }}>
            Visibility:
          </span>
          <div className="flex gap-1.5">
            {["all", "storefront", "featured", "hidden"].map((v) => (
              <Link
                key={v}
                href={`/products?visibility=${v}${status && status !== "all" ? `&status=${status}` : ""}`}
                className="dbtn text-[12px] no-underline"
                style={{
                  background: v === visibilityTab ? "var(--teal-100)" : "transparent",
                  color: v === visibilityTab ? "var(--teal-800)" : "var(--ink-600)",
                  border: "1px solid var(--ink-150)",
                  borderRadius: 8,
                  padding: "4px 10px",
                }}
              >
                {v === "all" ? "All" : VISIBILITY_LABEL[v] ?? v}
              </Link>
            ))}
          </div>
        </div>

        <div className="text-[13px]" style={{ color: "var(--ink-500)" }}>
          {products.length} product{products.length !== 1 ? "s" : ""}
        </div>

        {products.length === 0 ? (
          <div className="card" style={{ padding: "48px 0", textAlign: "center" }}>
            <div className="text-[40px] mb-3">📦</div>
            <div className="font-semibold text-[16px]" style={{ color: "var(--ink-900)", marginBottom: 8 }}>No products found</div>
            <div className="text-[13px]" style={{ color: "var(--ink-500)", marginBottom: 20 }}>
              {status || visibility ? "Try different filters." : "Add your first product to get started."}
            </div>
            <Link href="/products/new" className="dbtn dBtn-mint" style={{ textDecoration: "none" }}>
              <Icon name="plus" size={14} /> Add product
            </Link>
          </div>
        ) : (
          <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {products.map((p) => {
              const stock = p.currentStock;
              const isLow = stock > 0 && stock <= p.lowStockThreshold;
              const isOos = stock === 0;
              return (
                <Link key={p.id} href={`/products/${p.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div
                    className="card card-hover overflow-hidden flex flex-col"
                    style={{
                      padding: 0,
                      borderRadius: 14,
                      background: "var(--paper)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ aspectRatio: "4/3", background: "var(--ink-50)", position: "relative", overflow: "hidden" }}>
                      {p.images?.[0] ? (
                        <Image src={p.images[0]} alt={p.name} fill style={{ objectFit: "cover" }} unoptimized />
                      ) : (
                        <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--ink-300)" }}>
                          <Icon name="image" size={36} />
                        </div>
                      )}
                      {p.featured && (
                        <div style={{ position: "absolute", top: 8, right: 8 }}>
                          <Badge variant="amber" dot>Featured</Badge>
                        </div>
                      )}
                    </div>

                    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                      <div>
                        <div className="font-semibold text-[14px] leading-tight" style={{ color: "var(--ink-900)", marginBottom: 2 }}>{p.name}</div>
                        {p.description && (
                          <div className="text-[12px] leading-snug line-clamp-2" style={{ color: "var(--ink-500)" }}>
                            {p.description}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[16px]" style={{ color: "var(--ink-900)", fontFamily: "var(--font-accent)" }}>
                          {fmtMoney(p.retailPrice)}
                        </span>
                        {p.compareAtPrice && p.compareAtPrice > p.retailPrice && (
                          <span className="text-[12px] line-through" style={{ color: "var(--ink-400)" }}>
                            {fmtMoney(p.compareAtPrice)}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5 items-center">
                        <Badge variant={(STATUS_VARIANT[p.status] ?? "soft") as any}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </Badge>
                        <Badge variant={(VISIBILITY_VARIANT[p.visibility] ?? "ink") as any}>
                          {VISIBILITY_LABEL[p.visibility] ?? p.visibility}
                        </Badge>
                        <Badge variant="mint">
                          {INVENTORY_LABEL[p.inventoryType] ?? p.inventoryType}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--ink-600)" }}>
                        <Icon name="box" size={13} color="var(--ink-400)" />
                        {isOos ? (
                          <span style={{ color: "var(--danger)", fontWeight: 600 }}>Out of stock</span>
                        ) : isLow ? (
                          <span style={{ color: "var(--warning)", fontWeight: 600 }}>{stock} left — low stock</span>
                        ) : (
                          <span>{stock} in stock</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppFrame>
  );
}
