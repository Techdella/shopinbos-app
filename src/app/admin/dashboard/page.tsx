import Link from "next/link";
import { updateLogisticsVerification, updateSupplierProductStatus, updateSupplierVerification } from "@/app/actions/admin";
import { AppPage, Card, CardHead, ListCard, ListRow, PillLink, StatTile, TextLink, Thumb } from "@/components/app-kit";
import {
  DecisionButtons,
  OnboardingPill,
  onboardingSubmitted,
  ProductStatusPill,
  VerificationPill,
  adminFrame,
  formatDate,
  formatMoney,
  verificationLabel,
} from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { startOfLagosDay } from "@/lib/dashboard/compute";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { requireRole } from "@/lib/server-auth";

const DAY = 86_400_000;

function lagosGreeting(now: Date) {
  const hour = (now.getUTCHours() + 1) % 24;
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function AdminDashboardPage() {
  const user = await requireRole(["admin"], "/admin/login");

  const now = new Date();
  const today = startOfLagosDay(now);
  // "This week" is today plus the six days before it, in Lagos time.
  const weekStart = new Date(today.getTime() - 6 * DAY);

  const [
    sellers,
    liveStores,
    suppliers,
    products,
    logisticsPartners,
    categories,
    pendingProducts,
    pendingSuppliers,
    pendingLogistics,
    ordersToday,
    weekSales,
  ] = await Promise.all([
    db.user.count({ where: { role: "seller" } }),
    db.store.count({ where: { status: "active", storeProducts: { some: { status: "published" } } } }),
    db.supplier.count(),
    db.supplierProduct.count(),
    db.logisticsPartner.count(),
    db.category.count(),
    db.supplierProduct.count({ where: { status: "pending_review" } }),
    db.supplier.count({ where: { verificationStatus: "pending" } }),
    db.logisticsPartner.count({ where: { verificationStatus: "pending" } }),
    db.retailOrder.count({ where: { createdAt: { gte: today } } }),
    db.retailOrder.aggregate({
      where: { createdAt: { gte: weekStart }, status: { in: [...PAID_ORDER_STATUSES] }, currency: "NGN" },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  const [supplierQueue, logisticsQueue, productQueue, recentProducts] = await Promise.all([
    db.supplier.findMany({
      where: { verificationStatus: "pending" },
      orderBy: { updatedAt: "asc" },
      take: 5,
      select: { id: true, displayName: true, businessName: true, city: true, country: true, logoUrl: true, trustScore: true, onboardingState: true, createdAt: true, _count: { select: { products: true } } },
    }),
    db.logisticsPartner.findMany({
      where: { verificationStatus: "pending" },
      orderBy: { updatedAt: "asc" },
      take: 5,
      select: { id: true, displayName: true, companyName: true, city: true, country: true, logoUrl: true, reliabilityScore: true, onboardingState: true, coverageZones: true, createdAt: true },
    }),
    db.supplierProduct.findMany({
      where: { status: "pending_review" },
      orderBy: { updatedAt: "asc" },
      take: 6,
      select: { id: true, name: true, images: true, wholesalePrice: true, currency: true, supplier: { select: { displayName: true, verificationStatus: true } }, category: { select: { name: true } } },
    }),
    db.supplierProduct.findMany({
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, name: true, status: true, updatedAt: true, images: true, supplier: { select: { displayName: true, verificationStatus: true } } },
    }),
  ]);

  const firstName = user.name.split(" ")[0] || user.name;
  const gmv = weekSales._sum.total ?? 0;
  const waiting = pendingSuppliers + pendingLogistics + pendingProducts;

  return (
    <AppPage
      frame={adminFrame(user)}
      title={`${lagosGreeting(now)}, ${firstName}.`}
      sub={waiting > 0 ? `${waiting} ${waiting === 1 ? "thing needs" : "things need"} your review. Approve what is ready so sellers can find it.` : "Nothing is waiting for review. Here is how the platform looks today."}
      actions={
        <>
          <PillLink href="/admin/marketplace" icon="monitor">Public marketplace</PillLink>
          <PillLink href="/admin/supplier-products?status=pending_review" tone="accent" icon="check">Review products</PillLink>
        </>
      }
    >
      <section aria-label="Platform today" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <StatTile tone="card" label="Sellers" value={sellers.toLocaleString("en-NG")} hint="Accounts with the seller role" />
        <StatTile tone="card" label="Live stores" value={liveStores.toLocaleString("en-NG")} hint="Active, with a published product" />
        <StatTile tone="card" label="Suppliers to verify" value={pendingSuppliers.toLocaleString("en-NG")} hint={`${suppliers.toLocaleString("en-NG")} suppliers in total`} />
        <StatTile tone="card" label="Logistics to verify" value={pendingLogistics.toLocaleString("en-NG")} hint={`${logisticsPartners.toLocaleString("en-NG")} partners in total`} />
        <StatTile tone="card" label="Orders today" value={ordersToday.toLocaleString("en-NG")} hint="Placed in any store since midnight" />
        <StatTile tone="card" label="GMV this week" value={formatMoney(gmv)} hint={`${weekSales._count.toLocaleString("en-NG")} paid naira orders, last 7 days`} />
      </section>

      <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
        <Card className="min-w-0 overflow-hidden">
          <CardHead
            className="px-4 pb-3 pt-4 sm:px-5"
            title="Suppliers waiting"
            sub={`${pendingSuppliers} need a decision`}
            action={<TextLink href="/admin/suppliers?status=pending">See all</TextLink>}
          />
          {supplierQueue.length === 0 ? (
            <p className="m-0 border-t border-app-line px-5 py-6 text-[14px] text-app-ink-soft">No suppliers are waiting for verification.</p>
          ) : (
            <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
              {supplierQueue.map((supplier) => (
                <li key={supplier.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5">
                  <Thumb src={supplier.logoUrl} label={supplier.displayName} size={44} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/suppliers/${supplier.id}`} className="block truncate text-[15px] font-extrabold text-app-ink no-underline hover:underline">{supplier.displayName}</Link>
                    <div className="truncate text-[13px] text-app-ink-soft">
                      {supplier.city}, {supplier.country} · {supplier._count.products} products · joined {formatDate(supplier.createdAt)}
                    </div>
                    <div className="mt-1.5"><OnboardingPill status={onboardingSubmitted(supplier.onboardingState) ? "submitted" : "draft"} /></div>
                  </div>
                  <DecisionButtons
                    action={updateSupplierVerification}
                    fields={{ supplierId: supplier.id, trustScore: String(supplier.trustScore), redirectTo: "/admin/dashboard" }}
                    approve="verified"
                    reject="rejected"
                    subject={supplier.displayName}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHead
            className="px-4 pb-3 pt-4 sm:px-5"
            title="Logistics partners waiting"
            sub={`${pendingLogistics} need a decision`}
            action={<TextLink href="/admin/logistics-partners?status=pending">See all</TextLink>}
          />
          {logisticsQueue.length === 0 ? (
            <p className="m-0 border-t border-app-line px-5 py-6 text-[14px] text-app-ink-soft">No logistics partners are waiting for verification.</p>
          ) : (
            <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
              {logisticsQueue.map((partner) => (
                <li key={partner.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5">
                  <Thumb src={partner.logoUrl} label={partner.displayName} size={44} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/logistics-partners/${partner.id}`} className="block truncate text-[15px] font-extrabold text-app-ink no-underline hover:underline">{partner.displayName}</Link>
                    <div className="truncate text-[13px] text-app-ink-soft">
                      {partner.city}, {partner.country} · {partner.coverageZones.length} zones · joined {formatDate(partner.createdAt)}
                    </div>
                    <div className="mt-1.5"><OnboardingPill status={onboardingSubmitted(partner.onboardingState) ? "submitted" : "draft"} /></div>
                  </div>
                  <DecisionButtons
                    action={updateLogisticsVerification}
                    fields={{ logisticsPartnerId: partner.id, reliabilityScore: String(partner.reliabilityScore), redirectTo: "/admin/dashboard" }}
                    approve="verified"
                    reject="rejected"
                    subject={partner.displayName}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 overflow-hidden xl:col-span-2 2xl:col-span-1">
          <CardHead
            className="px-4 pb-3 pt-4 sm:px-5"
            title="Products in review"
            sub={`${pendingProducts} waiting to be published`}
            action={<TextLink href="/admin/supplier-products?status=pending_review">See all</TextLink>}
          />
          {productQueue.length === 0 ? (
            <p className="m-0 border-t border-app-line px-5 py-6 text-[14px] text-app-ink-soft">No products are waiting for review.</p>
          ) : (
            <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
              {productQueue.map((product) => (
                <li key={product.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5">
                  <Thumb src={product.images[0]} label={product.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-extrabold">{product.name}</div>
                    <div className="truncate text-[13px] text-app-ink-soft">
                      {product.supplier.displayName} · {product.category.name} · {formatMoney(product.wholesalePrice, product.currency)}
                    </div>
                    {product.supplier.verificationStatus !== "verified" && (
                      <div className="mt-1.5"><VerificationPill status={product.supplier.verificationStatus} /></div>
                    )}
                  </div>
                  <DecisionButtons
                    action={updateSupplierProductStatus}
                    fields={{ productId: product.id, redirectTo: "/admin/dashboard" }}
                    approve="published"
                    reject="rejected"
                    subject={product.name}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_380px]">
        <section aria-labelledby="recent-moderation" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="recent-moderation" className="m-0 text-[17px] font-extrabold">Recently changed products</h2>
            <TextLink href="/admin/supplier-products">All products</TextLink>
          </div>
          {recentProducts.length === 0 ? (
            <Card className="px-5 py-6 text-[14px] text-app-ink-soft">No products yet.</Card>
          ) : (
            <ListCard>
              {recentProducts.map((product) => (
                <ListRow key={product.id}>
                  <Thumb src={product.images[0]} label={product.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-bold">{product.name}</div>
                    <div className="truncate text-[13px] text-app-ink-soft">{product.supplier.displayName} · supplier {verificationLabel(product.supplier.verificationStatus).toLowerCase()}</div>
                  </div>
                  <ProductStatusPill status={product.status} />
                  <span className="w-[96px] shrink-0 text-right text-[13px] text-app-ink-soft">{formatDate(product.updatedAt)}</span>
                </ListRow>
              ))}
            </ListCard>
          )}
        </section>

        <Card className="h-fit p-5">
          <CardHead title="Marketplace at a glance" />
          <dl className="m-0 mt-3 divide-y divide-app-line">
            {[
              { label: "Suppliers", value: suppliers, href: "/admin/suppliers" },
              { label: "Supplier products", value: products, href: "/admin/supplier-products" },
              { label: "Logistics partners", value: logisticsPartners, href: "/admin/logistics-partners" },
              { label: "Categories", value: categories, href: "/admin/categories" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-3">
                <dt className="text-[14px]"><Link href={row.href} className="text-app-ink no-underline hover:underline">{row.label}</Link></dt>
                <dd className="m-0 text-[16px] font-extrabold">{row.value.toLocaleString("en-NG")}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </AppPage>
  );
}
