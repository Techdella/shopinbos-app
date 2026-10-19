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
import { ORDER_STATUS, PRODUCT_STATUS, QUOTE_STATUS, money, statusOf, supplierFrame, timeAgo, verificationLabel, type SupplierT } from "@/components/supplier/supplier-kit";
import { DROPSHIP_TO_SHIP, WHOLESALE_TO_SHIP } from "@/lib/supplier-orders/pure";
import { listDropshipOrders } from "@/lib/supplier-orders/views.server";
import { supplierEarnings, supplierOrdersToShip } from "@/lib/supplier-orders/money.server";
import { Mascot } from "@/components/brand/Mascot";
import { getT } from "@/lib/i18n/server";
import { intlLocale } from "@shared/i18n";
import { PromoBanner } from "@/components/pricing/PromoBanner";

// Supplier home in the "Seller app · web" language: greeting, real tiles, orders to ship and quote requests.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("supplier"))("dashboard.metaTitle") };
}

type T = SupplierT;

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

function lagosGreeting(now: Date, t: T) {
  const hour = (now.getUTCHours() + 1) % 24;
  return hour < 12 ? t("dashboard.morning") : hour < 17 ? t("dashboard.afternoon") : t("dashboard.evening");
}

function lagosDate(now: Date, t: T) {
  return new Intl.DateTimeFormat(t.locale === "en" ? "en-GB" : intlLocale(t.locale), { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long" }).format(now);
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
  const t = await getT("supplier", "common");

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
      sub: `${order.seller.name} · ${order.deliveryAddress || t("dashboard.noAddress")}`,
      stage: statusOf(ORDER_STATUS, order.status, t),
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
        title: order.items.length > 1 ? t("dashboard.itemsMore", { name: first?.name ?? t("dashboard.products"), more: order.items.length - 1, units }) : `${first?.name ?? t("dashboard.product")} × ${units}`,
        sub: t("dashboard.dropshipFor", { shop: order.shop, place: order.recipient.address[order.recipient.address.length - 1] ?? order.recipient.name }),
        stage: DROPSHIP_STAGE[order.status] ? { ...DROPSHIP_STAGE[order.status], label: t.dynamic(`dashboard.dropshipStage.${order.status}`, DROPSHIP_STAGE[order.status].label) } : statusOf(DROPSHIP_STAGE, order.status),
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
        <PromoBanner role="supplier" className="xl:col-span-2" />
        <VerificationChecklist
          docs={supplier.verificationDocuments}
          configs={SUPPLIER_DOC_TYPES}
          verificationStatus={supplier.verificationStatus}
          href="/supplier/verification"
          welcome={docsParam === "later"}
        />

        {/* Hero */}
        <Card className="app-wash relative overflow-hidden p-6 sm:p-7">
          <div className="text-[14px] text-app-ink-soft">{lagosDate(now, t)}</div>
          <h1 className="mb-0 mt-3 text-[34px] font-medium leading-[1.05] tracking-[-1px] sm:text-[42px]">
            {t("dashboard.greeting", { greeting: lagosGreeting(now, t), name: firstName })}
            <br />
            <span className="font-extrabold">
              {toShipCount > 0 ? t("dashboard.ordersToShip", { count: toShipCount }) : pendingQuotes > 0 ? t("dashboard.quotesToAnswer", { count: pendingQuotes }) : t("dashboard.caughtUp")}
            </span>
          </h1>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <PillLink href="/supplier/products/new" tone="ink">{t("dashboard.addProduct")}</PillLink>
            <PillLink href="/supplier/quote-requests">{t("dashboard.replyQuotes")}</PillLink>
            <PillLink href={`/suppliers/${supplier.slug}`}>{t("dashboard.publicPage")}</PillLink>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label={t("dashboard.tileToShip")} value={toShipCount.toLocaleString("en-NG")} />
            <StatTile label={t("dashboard.tileQuotes")} value={pendingQuotes.toLocaleString("en-NG")} />
            <StatTile label={t("dashboard.tileEarned")} value={money(earned30.earned)} hint={earnedAll.owed > 0 ? t("dashboard.stillOwed", { amount: money(earnedAll.owed) }) : t("dashboard.allTime", { amount: money(earnedAll.earned) })} />
            <StatTile label={t("dashboard.tileLive")} value={publishedProducts.toLocaleString("en-NG")} hint={t("dashboard.ofCatalogue", { total: totalProducts })} />
          </div>
        </Card>

        {/* Rex's brief */}
        <section className="rounded-[22px] bg-app-peach p-5">
          <div className="mb-4 flex items-center gap-3">
            <Mascot who="rex" className="h-12 w-12" />
            <div>
              <h2 className="m-0 text-[17px] font-extrabold">{t("dashboard.rexBrief")}</h2>
              <div className="text-[13px] text-app-ink-soft">
                {verified ? t("dashboard.isVerified", { name: supplier.displayName }) : t("dashboard.verificationIs", { status: verificationLabel(supplier.verificationStatus, t) })} · {t("dashboard.trustScore", { score: supplier.trustScore })}
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            {toShipCount > 0 && (
              <BriefLink href="/supplier/orders" icon="truck" title={t("dashboard.briefToShip", { count: toShipCount })} hint={t("dashboard.briefToShipHint")} action={t("dashboard.briefShip")} />
            )}
            {pendingQuotes > 0 && (
              <BriefLink href="/supplier/quote-requests" icon="chat" title={t("dashboard.briefQuotes", { count: pendingQuotes })} hint={t("dashboard.briefQuotesHint")} action={t("dashboard.reply")} />
            )}
            {totalProducts === 0 && (
              <BriefLink href="/supplier/products/new" icon="box" title={t("dashboard.briefFirst")} hint={t("dashboard.briefFirstHint")} action={t("add")} />
            )}
            {verified && toShipCount === 0 && pendingQuotes === 0 && totalProducts > 0 && (
              <div className="rounded-[16px] bg-white px-4 py-3 text-[13.5px] text-app-ink-soft">
                {t("dashboard.nothingNeeded")}
              </div>
            )}
          </div>
        </section>

        {/* Orders to ship */}
        <section className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="m-0 text-[17px] font-extrabold">{t("dashboard.ordersHeading")}</h2>
            <TextLink href="/supplier/orders">{t("dashboard.allOrders")}</TextLink>
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
                  <span className="hidden w-[90px] text-[13px] text-app-ink-soft md:block">{timeAgo(order.createdAt, t)}</span>
                  <span className="ml-auto text-right text-[14px] font-extrabold">{money(order.amount, order.currency)}</span>
                </ListRow>
              ))}
            </ListCard>
          ) : (
            <Card className="px-5 py-8 text-center text-[14px] text-app-ink-soft">
              {t("dashboard.nothingToPack")}
            </Card>
          )}
        </section>

        {/* Quote requests */}
        <section className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="m-0 text-[17px] font-extrabold">{t("dashboard.quoteRequests")}</h2>
            <TextLink href="/supplier/quote-requests">{t("seeAll")}</TextLink>
          </div>
          {waitingQuotes.length ? (
            <div className="grid gap-3">
              {waitingQuotes.map((quote) => {
                const status = statusOf(QUOTE_STATUS, quote.status, t);
                return (
                  <Card key={quote.id} as="article" className="p-4">
                    <div className="flex items-start gap-3">
                      <Thumb src={quote.supplierProduct.images[0]} label={quote.supplierProduct.name} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-extrabold">{quote.seller.name}</div>
                        <div className="truncate text-[12.5px] text-app-ink-soft">
                          {t("dashboard.quoteLine", { qty: quote.quantity.toLocaleString("en-NG"), product: quote.supplierProduct.name, destination: quote.destination })}
                        </div>
                      </div>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </div>
                    {quote.notes && <p className="mb-0 mt-3 line-clamp-2 text-[13.5px] leading-[1.5]">&ldquo;{quote.notes}&rdquo;</p>}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-[12.5px] text-app-ink-soft">{timeAgo(quote.createdAt, t)}</span>
                      <PillLink href={`/supplier/quote-requests#quote-${quote.id}`} tone="ink" size="sm">{t("dashboard.reply")}</PillLink>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="px-5 py-8 text-center text-[14px] text-app-ink-soft">
              {t("dashboard.noQuotes")}
            </Card>
          )}
        </section>

        {/* Top products */}
        <section className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="m-0 text-[17px] font-extrabold">{t("dashboard.yourProducts")}</h2>
            <TextLink href="/supplier/products">{t("dashboard.allProducts")}</TextLink>
          </div>
          {topProducts.length ? (
            <ListCard>
              {topProducts.map((product) => {
                const status = statusOf(PRODUCT_STATUS, product.status, t);
                const low = product.stockQuantity < Math.max(product.moq, 5);
                return (
                  <ListRow key={product.id} href={`/supplier/products/${product.id}/edit`}>
                    <Thumb src={product.images[0]} label={product.name} size={44} />
                    <span className="min-w-0 flex-1 basis-[calc(100%-72px)] sm:basis-0 truncate text-[14px] font-extrabold">{product.name}</span>
                    <Pill tone={status.tone}>{status.label}</Pill>
                    <span className={low ? "w-[90px] text-[13px] font-bold text-app-accent-ink" : "w-[90px] text-[13px] text-app-ink-soft"}>
                      {low ? t("dashboard.left", { count: product.stockQuantity }) : t("dashboard.inStock", { count: product.stockQuantity })}
                    </span>
                    <span className="ml-auto text-right text-[14px] font-extrabold">{money(product.wholesalePrice, product.currency)}</span>
                  </ListRow>
                );
              })}
            </ListCard>
          ) : (
            <Card className="px-5 py-8 text-center text-[14px] text-app-ink-soft">
              {t("dashboard.buildCatalogue")} <Link href="/supplier/products/new" className="font-extrabold text-app-accent-ink no-underline">{t("dashboard.addProduct")}</Link>
            </Card>
          )}
        </section>

        <div className="grid min-w-0 content-start gap-5">
          {recommendedLogistics.length > 0 && (
            <Card className="p-5">
              <CardHead title={t("dashboard.partnersIn", { city: supplier.city })} sub={t("dashboard.partnersSub")} />
              <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                {recommendedLogistics.map((partner) => (
                  <li key={partner.id} className="flex min-h-[52px] items-center gap-3 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name="truck" size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-extrabold">{partner.displayName}</span>
                      <span className="block truncate text-[12.5px] text-app-ink-soft">{partner.city} · {partner.estimatedSpeed ?? t("dashboard.standardDelivery")}</span>
                    </span>
                    <span className="text-right text-[13px]">
                      <span className="block font-extrabold">{t("dashboard.rating", { rating: partner.rating.toFixed(1) })}</span>
                      <span className="block text-app-ink-soft">{t("dashboard.base", { amount: money(partner.basePrice) })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {activeSellers.length > 0 && (
            <Card className="p-5">
              <CardHead title={t("dashboard.sellersBuying")} sub={t("dashboard.sellersBuyingSub")} />
              <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                {activeSellers.map((seller) => (
                  <li key={seller.id} className="flex min-h-[52px] items-center gap-3 py-2.5">
                    <Thumb label={seller.name} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-extrabold">{seller.name}</span>
                      <span className="block truncate text-[12.5px] text-app-ink-soft">{[seller.city, seller.country].filter(Boolean).join(" · ") || t("dashboard.noLocation")}</span>
                    </span>
                    <Pill tone="success" dot>{t("dashboard.activeBuyer")}</Pill>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {recommendedLogistics.length === 0 && activeSellers.length === 0 && (
            <AssistantNote who="rex">
              {t("dashboard.rexEmpty", { city: supplier.city })}
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
