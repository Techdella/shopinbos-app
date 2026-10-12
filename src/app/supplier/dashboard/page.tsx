import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppFrame } from "@/components/shell/AppFrame";
import { AssistantNote, type Tone, Card, CardHead, ListCard, ListRow, Pill, PillLink, StageDot, StatTile, TextLink, Thumb } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { VerificationChecklist } from "@/components/verification/VerificationChecklist";
import { SUPPLIER_DOC_TYPES } from "@shared/verification-docs";
import { ORDER_STATUS, PRODUCT_STATUS, QUOTE_STATUS, VERIFICATION_LABEL, money, statusOf, supplierFrame, timeAgo } from "@/components/supplier/supplier-kit";
import { DROPSHIP_TO_SHIP, WHOLESALE_TO_SHIP } from "@/lib/supplier-orders/pure";
import { listDropshipOrders } from "@/lib/supplier-orders/views.server";
import { supplierEarnings, supplierOrdersToShip } from "@/lib/supplier-orders/money.server";

// Supplier home in the "Seller app · web" language: greeting, real tiles, orders to ship and quote requests.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today" };

const DROPSHIP_STAGE: Record<string, { label: string; tone: "accent" | "warning" }> = {
  pending: { label: "New: accept it", tone: "accent" },
  accepted: { label: "To pack", tone: "warning" },
};

/** One row of "Orders to ship": wholesale and dropship orders in one list, oldest first. */
interface ShipRow {
  key: string;
  href: string;
  image: string | null | undefined;
  title: string;
  sub: string;
  stage: { label: string; tone: Tone };
  createdAt: Date;
  amount: number;
  currency: string;
}

function lagosGreeting(now: Date) {
  const hour = (now.getUTCHours() + 1) % 24;
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function lagosDate(now: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long" }).format(now);
}

async function getRecommendedLogistics(supplier: { city: string; country: string }) {
  return db.logisticsPartner.findMany({
    where: {
      status: "active",
      verificationStatus: "verified",
      OR: [
        { coverageZones: { has: supplier.city } },
        { city: supplier.city },
      ],
    },
    take: 4,
    select: {
      id: true,
      displayName: true,
      city: true,
      rating: true,
      reliabilityScore: true,
      estimatedSpeed: true,
      basePrice: true,
    },
    orderBy: [{ rating: "desc" }, { reliabilityScore: "desc" }],
  });
}

async function getActiveSellersByCategory(supplier: { id: string }) {
  const supplierProducts = await db.supplierProduct.findMany({
    where: { supplierId: supplier.id },
    select: { categoryId: true },
    take: 50,
  });
  const categoryIds = [...new Set(supplierProducts.map((p) => p.categoryId))];

  if (categoryIds.length === 0) return [];

  const recentOrders = await db.wholesaleOrder.findMany({
    where: {
      supplierProduct: { categoryId: { in: categoryIds } },
      supplierId: { not: supplier.id },
      status: { in: ["confirmed", "processing", "shipped", "delivered"] },
    },
    select: {
      seller: { select: { id: true, name: true, city: true, country: true } },
    },
    distinct: ["sellerId"],
    take: 4,
    orderBy: { createdAt: "desc" },
  });

  return recentOrders.map((o) => o.seller).filter((s) => s.id);
}

export default async function SupplierDashboardPage({ searchParams }: { searchParams: Promise<{ docs?: string }> }) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const { docs: docsParam } = await searchParams;

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalProducts,
    publishedProducts,
    pendingQuotes,
    toShip,
    earned30,
    earnedAll,
    wholesaleToShip,
    dropshipToShip,
    waitingQuotes,
    topProducts,
    recommendedLogistics,
    activeSellers,
  ] = await Promise.all([
    db.supplierProduct.count({ where: { supplierId: supplier.id } }),
    db.supplierProduct.count({ where: { supplierId: supplier.id, status: "published" } }),
    db.supplierQuoteRequest.count({ where: { supplierId: supplier.id, status: "pending" } }),
    // Wholesale and dropship orders alike (src/lib/supplier-orders/money.server.ts).
    supplierOrdersToShip(supplier.id),
    supplierEarnings(supplier.id, { since: monthAgo }),
    supplierEarnings(supplier.id),
    db.wholesaleOrder.findMany({
      where: { supplierId: supplier.id, status: { in: [...WHOLESALE_TO_SHIP] } },
      orderBy: { createdAt: "asc" },
      take: 6,
      select: {
        id: true,
        quantity: true,
        totalPrice: true,
        currency: true,
        deliveryAddress: true,
        status: true,
        createdAt: true,
        seller: { select: { name: true } },
        supplierProduct: { select: { name: true, images: true } },
      },
    }),
    listDropshipOrders(supplier.id, { statuses: DROPSHIP_TO_SHIP, order: "asc", take: 6 }),
    db.supplierQuoteRequest.findMany({
      where: { supplierId: supplier.id, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        quantity: true,
        destination: true,
        notes: true,
        status: true,
        createdAt: true,
        seller: { select: { name: true } },
        supplierProduct: { select: { name: true, images: true } },
      },
    }),
    db.supplierProduct.findMany({
      where: { supplierId: supplier.id },
      orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        images: true,
        wholesalePrice: true,
        currency: true,
        stockQuantity: true,
        moq: true,
      },
    }),
    getRecommendedLogistics(supplier),
    getActiveSellersByCategory(supplier),
  ]);

  const toShipCount = toShip.total;
  const ordersToShip: ShipRow[] = [
    ...wholesaleToShip.map((order): ShipRow => ({
      key: `w-${order.id}`,
      href: "/supplier/orders?kind=wholesale",
      image: order.supplierProduct.images[0],
      title: `${order.supplierProduct.name} × ${order.quantity.toLocaleString("en-NG")}`,
      sub: `${order.seller.name} · ${order.deliveryAddress || "No address yet"}`,
      stage: statusOf(ORDER_STATUS, order.status),
      createdAt: order.createdAt,
      amount: order.totalPrice,
      currency: order.currency,
    })),
    ...dropshipToShip.orders.map((order): ShipRow => {
      const units = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const first = order.items[0];
      return {
        key: `d-${order.id}`,
        href: "/supplier/orders?kind=dropship",
        image: first?.image,
        title: order.items.length > 1 ? `${first?.name ?? "Products"} and ${order.items.length - 1} more · ${units} units` : `${first?.name ?? "Product"} × ${units}`,
        sub: `A shop sold it: ${order.shop} · ${order.recipient.address[order.recipient.address.length - 1] ?? order.recipient.name}`,
        stage: statusOf(DROPSHIP_STAGE, order.status),
        createdAt: new Date(order.createdAt),
        amount: order.costTotal,
        currency: order.currency,
      };
    }),
  ]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 6);

  const firstName = user.name.split(/\s+/)[0] || user.name;
  const verified = supplier.verificationStatus === "verified";

  return (
    <AppFrame {...supplierFrame(user, supplier)}>
      <div className="grid w-full gap-5 px-4 py-6 font-app text-app-ink sm:px-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:px-8 2xl:grid-cols-[minmax(0,1fr)_480px] 2xl:px-10">
        <VerificationChecklist
          docs={supplier.verificationDocuments}
          configs={SUPPLIER_DOC_TYPES}
          verificationStatus={supplier.verificationStatus}
          href="/supplier/verification"
          welcome={docsParam === "later"}
        />

        {/* Hero */}
        <Card className="app-wash relative overflow-hidden p-6 sm:p-7">
          <div className="text-[14px] text-app-ink-soft">{lagosDate(now)}</div>
          <h1 className="mb-0 mt-3 text-[34px] font-medium leading-[1.05] tracking-[-1px] sm:text-[42px]">
            {lagosGreeting(now)}, {firstName}.
            <br />
            <span className="font-extrabold">
              {toShipCount > 0 ? `${toShipCount} order${toShipCount === 1 ? "" : "s"} to pack.` : pendingQuotes > 0 ? `${pendingQuotes} shop${pendingQuotes === 1 ? "" : "s"} asking for your price.` : "You're all caught up."}
            </span>
          </h1>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <PillLink href="/supplier/products/new" tone="ink">Add product</PillLink>
            <PillLink href="/supplier/quote-requests">Tell them your price</PillLink>
            <PillLink href={`/suppliers/${supplier.slug}`}>See your public page</PillLink>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Orders to ship" value={toShipCount.toLocaleString("en-NG")} />
            <StatTile label="Shops waiting for your price" value={pendingQuotes.toLocaleString("en-NG")} />
            <StatTile label="Earned, 30 days" value={money(earned30.earned)} hint={earnedAll.owed > 0 ? `${money(earnedAll.owed)} still owed to you` : `${money(earnedAll.earned)} all time`} />
            <StatTile label="Products live" value={publishedProducts.toLocaleString("en-NG")} hint={`of ${totalProducts} in your catalogue`} />
          </div>
        </Card>

        {/* Rex's brief */}
        <section className="rounded-[22px] bg-app-peach p-5">
          <div className="mb-4 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/app/rex.png" alt="Rex" className="h-12 w-12 object-contain" />
            <div>
              <h2 className="m-0 text-[17px] font-extrabold">Rex&apos;s brief</h2>
              <div className="text-[13px] text-app-ink-soft">
                {verified ? `${supplier.displayName} is verified` : `Verification: ${VERIFICATION_LABEL[supplier.verificationStatus] ?? supplier.verificationStatus}`} · trust score {supplier.trustScore}
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            {toShipCount > 0 && (
              <BriefLink href="/supplier/orders" icon="truck" title={`${toShipCount} order${toShipCount === 1 ? "" : "s"} to ship`} hint="Mark them shipped with a tracking code." action="Ship" />
            )}
            {pendingQuotes > 0 && (
              <BriefLink href="/supplier/quote-requests" icon="chat" title={`${pendingQuotes} quote request${pendingQuotes === 1 ? "" : "s"} waiting`} hint="Sellers buy from the supplier who answers first." action="Reply" />
            )}
            {totalProducts === 0 && (
              <BriefLink href="/supplier/products/new" icon="box" title="Add your first product" hint="Draft it now and send it to review when it's ready." action="Add" />
            )}
            {verified && toShipCount === 0 && pendingQuotes === 0 && totalProducts > 0 && (
              <div className="rounded-[16px] bg-white px-4 py-3 text-[13.5px] text-app-ink-soft">
                Nothing needs you right now. Every order is moving and every shop has your price.
              </div>
            )}
          </div>
        </section>

        {/* Orders to ship */}
        <section className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="m-0 text-[17px] font-extrabold">New orders and orders to pack</h2>
            <TextLink href="/supplier/orders">All orders</TextLink>
          </div>
          {ordersToShip.length ? (
            <ListCard>
              {ordersToShip.map((order) => (
                <ListRow key={order.key} href={order.href}>
                  <Thumb src={order.image ?? undefined} label={order.title} size={44} />
                  <span className="min-w-0 flex-1 basis-[calc(100%-72px)] sm:basis-0">
                    <span className="block truncate text-[14px] font-extrabold">{order.title}</span>
                    <span className="block truncate text-[12.5px] text-app-ink-soft">{order.sub}</span>
                  </span>
                  <span className="hidden w-[130px] sm:block"><StageDot tone={order.stage.tone}>{order.stage.label}</StageDot></span>
                  <span className="hidden w-[90px] text-[13px] text-app-ink-soft md:block">{timeAgo(order.createdAt)}</span>
                  <span className="ml-auto text-right text-[14px] font-extrabold">{money(order.amount, order.currency)}</span>
                </ListRow>
              ))}
            </ListCard>
          ) : (
            <Card className="px-5 py-8 text-center text-[14px] text-app-ink-soft">
              Nothing to pack. New orders from shops land here first.
            </Card>
          )}
        </section>

        {/* Quote requests */}
        <section className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="m-0 text-[17px] font-extrabold">Shops asking for your price</h2>
            <TextLink href="/supplier/quote-requests">See all</TextLink>
          </div>
          {waitingQuotes.length ? (
            <div className="grid gap-3">
              {waitingQuotes.map((quote) => {
                const status = statusOf(QUOTE_STATUS, quote.status);
                return (
                  <Card key={quote.id} as="article" className="p-4">
                    <div className="flex items-start gap-3">
                      <Thumb src={quote.supplierProduct.images[0]} label={quote.supplierProduct.name} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-extrabold">{quote.seller.name}</div>
                        <div className="truncate text-[12.5px] text-app-ink-soft">
                          {quote.quantity.toLocaleString("en-NG")} × {quote.supplierProduct.name} to {quote.destination}
                        </div>
                      </div>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </div>
                    {quote.notes && <p className="mb-0 mt-3 line-clamp-2 text-[13.5px] leading-[1.5]">&ldquo;{quote.notes}&rdquo;</p>}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-[12.5px] text-app-ink-soft">{timeAgo(quote.createdAt)}</span>
                      <PillLink href={`/supplier/quote-requests#quote-${quote.id}`} tone="ink" size="sm">Reply</PillLink>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="px-5 py-8 text-center text-[14px] text-app-ink-soft">
              No shops waiting for your price. When a shop wants to buy in bulk, it shows up here.
            </Card>
          )}
        </section>

        {/* Top products */}
        <section className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="m-0 text-[17px] font-extrabold">Your products</h2>
            <TextLink href="/supplier/products">All products</TextLink>
          </div>
          {topProducts.length ? (
            <ListCard>
              {topProducts.map((product) => {
                const status = statusOf(PRODUCT_STATUS, product.status);
                const low = product.stockQuantity < Math.max(product.moq, 5);
                return (
                  <ListRow key={product.id} href={`/supplier/products/${product.id}/edit`}>
                    <Thumb src={product.images[0]} label={product.name} size={44} />
                    <span className="min-w-0 flex-1 basis-[calc(100%-72px)] sm:basis-0 truncate text-[14px] font-extrabold">{product.name}</span>
                    <Pill tone={status.tone}>{status.label}</Pill>
                    <span className={low ? "w-[90px] text-[13px] font-bold text-app-accent-ink" : "w-[90px] text-[13px] text-app-ink-soft"}>
                      {low ? `${product.stockQuantity} left` : `${product.stockQuantity.toLocaleString("en-NG")} in stock`}
                    </span>
                    <span className="ml-auto text-right text-[14px] font-extrabold">{money(product.wholesalePrice, product.currency)}</span>
                  </ListRow>
                );
              })}
            </ListCard>
          ) : (
            <Card className="px-5 py-8 text-center text-[14px] text-app-ink-soft">
              Add products to build your catalogue. <Link href="/supplier/products/new" className="font-extrabold text-app-accent-ink no-underline">Add product</Link>
            </Card>
          )}
        </section>

        <div className="grid min-w-0 content-start gap-5">
          {recommendedLogistics.length > 0 && (
            <Card className="p-5">
              <CardHead title={`Delivery partners in ${supplier.city}`} sub="Verified and rated by sellers" />
              <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                {recommendedLogistics.map((partner) => (
                  <li key={partner.id} className="flex min-h-[52px] items-center gap-3 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name="truck" size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-extrabold">{partner.displayName}</span>
                      <span className="block truncate text-[12.5px] text-app-ink-soft">{partner.city} · {partner.estimatedSpeed ?? "Standard delivery"}</span>
                    </span>
                    <span className="text-right text-[13px]">
                      <span className="block font-extrabold">{partner.rating.toFixed(1)} rating</span>
                      <span className="block text-app-ink-soft">{money(partner.basePrice)} base</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {activeSellers.length > 0 && (
            <Card className="p-5">
              <CardHead title="Sellers buying in your categories" sub="Recent wholesale buyers from other suppliers" />
              <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                {activeSellers.map((seller) => (
                  <li key={seller.id} className="flex min-h-[52px] items-center gap-3 py-2.5">
                    <Thumb label={seller.name} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-extrabold">{seller.name}</span>
                      <span className="block truncate text-[12.5px] text-app-ink-soft">{[seller.city, seller.country].filter(Boolean).join(" · ") || "Location not set"}</span>
                    </span>
                    <Pill tone="success" dot>Active buyer</Pill>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {recommendedLogistics.length === 0 && activeSellers.length === 0 && (
            <AssistantNote who="rex">
              Rex shows delivery partners in {supplier.city} and sellers buying in your categories here once there are some to show.
            </AssistantNote>
          )}
        </div>
      </div>
    </AppFrame>
  );
}

function BriefLink({ href, icon, title, hint, action }: { href: string; icon: "shield" | "truck" | "chat" | "box"; title: string; hint: string; action: string }) {
  return (
    <Link href={href} className="flex min-h-[56px] items-center gap-3 rounded-[16px] bg-white px-4 py-2.5 text-app-ink no-underline hover:shadow-sm">
      <Icon name={icon} size={18} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-extrabold">{title}</span>
        <span className="block truncate text-[12.5px] text-app-ink-soft">{hint}</span>
      </span>
      <span className="rounded-full bg-app-ink px-3.5 py-2 text-[13px] font-extrabold text-white">{action}</span>
    </Link>
  );
}
