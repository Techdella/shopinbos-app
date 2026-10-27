import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import Link from "next/link";
import { AssistantNote, EmptyState, Pill, PillLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { TipsGate } from "../_components/TipsGate";
import { requireRole } from "@/lib/server-auth";
import { safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { wholesaleRef } from "@/lib/supplier-orders/wholesale.server";
import { VISIBLE_SUPPLIER } from "@/lib/marketplace/agreements.server";
import { PRODUCT_PLAN_FIRST } from "@/lib/plans/placement";
import { naira, parsePricingTiers } from "@/lib/marketplace/find";
import { WHOLESALE_PAY_PREFIX, confirmWholesalePayment, payableWholesaleOrders } from "@/lib/supplier-orders/wholesale-payments.server";
import { WholesaleOrders, type SellerWholesaleRow } from "../_components/WholesaleOrders";
import { formatDate } from "@shared/i18n";
import { wholesalePayStep } from "@shared/preorder";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketplace");
  return { title: t("ws.title") };
}

const placedFormat = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

// Sourcing → Find products → Wholesale orders: stock the seller bought from suppliers, newest first, and the
// products verified suppliers in the seller's country sell wholesale (same rules as placeWholesaleOrder).
export default async function SellerWholesaleOrdersPage({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketplace");
  const locale = await getLocale();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true, city: true, country: true } });
  if (!store) redirect("/builder?firstRun=1");

  // Back from Paystack after "Pay": confirm with Paystack before saying it's paid (the webhook does the same).
  const query = await searchParams;
  const reference = String(query.reference ?? query.trxref ?? "").slice(0, 60);
  const payment = reference.startsWith(WHOLESALE_PAY_PREFIX) ? await confirmWholesalePayment(reference, user.id).catch(() => null) : null;

  const orders = await safeQuery(() => db.wholesaleOrder.findMany({
    where: { sellerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, status: true, rejectReason: true, trackingCode: true, quantity: true, unitPrice: true, totalPrice: true, currency: true, createdAt: true, paidAt: true, paidOutAt: true,
      preorder: true, preorderShipsAt: true, preorderReadyAt: true, depositKobo: true, depositPaidAt: true,
      supplier: { select: { displayName: true, slug: true, userId: true } },
      supplierProduct: { select: { id: true, name: true, images: true } },
    },
  }), []);

  const country = store.country || "Nigeria";
  const city = (store.city ?? "").trim().toLowerCase();
  const available = await safeQuery(() => db.supplierProduct.findMany({
    where: {
      status: "published",
      bulkOrderAvailable: true,
      supplier: { ...VISIBLE_SUPPLIER, verificationStatus: "verified", userId: { not: user.id }, country: { equals: country, mode: "insensitive" } },
    },
    orderBy: [PRODUCT_PLAN_FIRST, { trendScore: "desc" }, { createdAt: "desc" }],
    take: 60,
    select: {
      id: true, name: true, images: true, wholesalePrice: true, currency: true, moq: true, stockQuantity: true, pricingTiers: true,
      supplier: { select: { displayName: true, slug: true, city: true } },
    },
  }), []);
  // Suppliers in the seller's city first: they can go and see the stock.
  const wholesaleProducts = [...available].sort((a, b) => Number((b.supplier.city ?? "").trim().toLowerCase() === city) - Number((a.supplier.city ?? "").trim().toLowerCase() === city));
  const fromPrice = (product: typeof available[number]) => Math.min(product.wholesalePrice, ...parsePricingTiers(product.pricingTiers).map((tier) => tier.price));
  const price = (amount: number, currency: string) => (currency === "NGN" ? naira(amount) : `${currency} ${Math.round(amount).toLocaleString("en-NG")}`);

  const payable = await payableWholesaleOrders(orders).catch(() => new Set<string>());
  const rows: SellerWholesaleRow[] = orders.map((order) => ({
    id: order.id,
    ref: wholesaleRef(order.id),
    status: order.status,
    rejectReason: order.rejectReason,
    trackingCode: order.trackingCode,
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    totalPrice: order.totalPrice,
    currency: order.currency,
    placed: locale === "en" ? placedFormat.format(order.createdAt) : formatDate(order.createdAt, locale),
    supplier: { name: order.supplier.displayName, slug: order.supplier.slug },
    product: { id: order.supplierProduct.id, name: order.supplierProduct.name, image: order.supplierProduct.images[0] ?? null },
    paid: !!order.paidAt,
    canPay: payable.has(order.id),
    payKobo: payable.has(order.id) ? wholesalePayStep(order)?.kobo ?? null : null,
    preorder: order.preorder ? { ships: order.preorderShipsAt ? formatDate(order.preorderShipsAt, locale, { day: "numeric", month: "short", timeZone: "UTC" }) : null } : null,
  }));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("ws.title")}
      sub={t("ws.lead")}
      actions={
        <>
          <PillLink href="/home/preorders?view=suppliers" icon="clock">{t("ws.preorders")}</PillLink>
          <PillLink href="/marketplace" icon="search">{t("ws.findProducts")}</PillLink>
        </>
      }
    >
      <div className="mb-4">
        <TipsGate>
          <AssistantNote who="peggy">{t("ws.tip")}</AssistantNote>
        </TipsGate>
      </div>
      {payment && (
        <p role={payment.ok ? "status" : "alert"} className={`mb-4 rounded-[16px] px-4 py-3 text-[14px] font-bold ${payment.ok ? "bg-app-success-tint text-app-success" : "bg-app-danger-tint text-app-danger"}`}>
          {payment.ok ? t("ws.paidNotice") : payment.error}
        </p>
      )}
      <section aria-labelledby="ws-orders">
        <h2 id="ws-orders" className="m-0 mb-3 text-[18px] font-extrabold">{t("ws.yourOrders")}</h2>
        {rows.length ? (
          <WholesaleOrders initial={rows} />
        ) : (
          <EmptyState icon="box" title={t("ws.empty")} action={<PillLink href="#ws-available" tone="ink">{t("ws.browse")}</PillLink>}>
            {t("ws.emptySub")}
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="ws-available-title" id="ws-available" className="mt-8 scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="ws-available-title" className="m-0 text-[18px] font-extrabold">{t("ws.availableTitle")}</h2>
            <p className="m-0 mt-1 text-[14px] text-app-ink-soft">{t("ws.availableSub", { country })}</p>
          </div>
          <PillLink href="/marketplace/suppliers" size="sm" icon="people">{t("ws.seeSuppliers")}</PillLink>
        </div>
        {wholesaleProducts.length === 0 ? (
          <EmptyState icon="search" title={t("ws.noneAvailable")} action={<PillLink href="/marketplace" tone="ink">{t("ws.findProducts")}</PillLink>}>
            {t("ws.noneAvailableSub")}
          </EmptyState>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {wholesaleProducts.map((product) => {
              const href = `/marketplace/product/${encodeURIComponent(product.id)}?buy=wholesale`;
              return (
                <li key={product.id} className="flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-app-line bg-white sm:rounded-[22px]">
                  <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-app-canvas" aria-label={product.name}>
                    {product.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.images[0]} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]" />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-app-ink-faint"><Icon name="image" size={32} /></span>
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-3.5">
                    <h3 className="m-0 text-[14.5px] font-extrabold leading-tight sm:text-[15.5px]">
                      <Link href={href} className="text-app-ink no-underline hover:underline">{product.name}</Link>
                    </h3>
                    <p className="m-0 truncate text-[12.5px] text-app-ink-soft">
                      <Link href={`/suppliers/${product.supplier.slug}`} className="text-app-ink-soft no-underline hover:underline">{product.supplier.displayName}</Link>
                      {product.supplier.city ? ` · ${product.supplier.city}` : ""}
                    </p>
                    <div><Pill tone="success" dot>{t("trust.verified")}</Pill></div>
                    <p className="m-0 text-[14px]">{t("ws.from")} <strong className="font-extrabold">{price(fromPrice(product), product.currency)}</strong> {t("ws.each")}</p>
                    <p className="m-0 text-[12.5px] text-app-ink-soft">
                      {t("ws.minOrder", { count: Math.max(1, product.moq).toLocaleString("en-NG") })}
                      {product.stockQuantity > 0 ? ` · ${t("ws.inStock", { count: product.stockQuantity.toLocaleString("en-NG") })}` : ""}
                    </p>
                    <div className="mt-auto pt-2">
                      <Link href={href} className="inline-flex min-h-[40px] w-full items-center justify-center whitespace-nowrap rounded-full bg-app-ink px-3 text-[13.5px] font-bold text-white no-underline hover:bg-black">
                        {t("ws.buy")}
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </SellerPage>
  );
}
