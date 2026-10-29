import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, EmptyState, Pill, PillLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { requireRole } from "@/lib/server-auth";
import { safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { getT } from "@/lib/i18n/server";
import { PRODUCT_PLAN_FIRST } from "@/lib/plans/placement";
import { VISIBLE_SUPPLIER, nearbyForSeller } from "@/lib/marketplace/agreements.server";
import { categoriesOf, parseSourcing, toFindProduct } from "@/lib/marketplace/find";
import { inShopIds } from "@/lib/marketplace/quick-add.server";
import { DEFAULT_MARKUP } from "@shared/supplier-markup";
import { messagesHref } from "@/lib/conversations/pure";
import { directorySupplier } from "@/lib/suppliers/directory.server";
import { MarketplaceChatWrapper } from "@/components/marketplace/MarketplaceChatWrapper";
import { ChatButton } from "@/components/marketplace/ChatButton";
import { AskPriceButton } from "@/components/suppliers/AskPriceButton";
import { NotifyMeButton } from "@/components/suppliers/NotifyMeButton";
import { ProductGrid } from "../../_components/ProductGrid";

// One supplier's products for a seller ("See their products" on /marketplace/suppliers), near or far. With none
// live yet: "No products yet", Notify me when they add products (the supplier hears this shop is waiting:
// src/lib/suppliers/product-requests.server.ts), Ask for a price and Chat. The phone app has the same screen
// (apps/mobile/src/app/suppliers/[slug].tsx).

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

const RISK_TONE = { low: "success", medium: "warning", high: "danger" } as const;

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const t = await getT("marketplace");
  const supplier = await db.supplier.findFirst({ where: { slug }, select: { displayName: true } }).catch(() => null);
  return { title: supplier ? t("waitlist.metaTitle", { name: supplier.displayName }) : t("sup.title") };
}

export default async function SupplierProductsPage({ params }: PageProps) {
  const { slug } = await params;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketplace");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, country: true, city: true, brandSettings: true } });
  if (!store) redirect("/builder?firstRun=1");

  const supplier = await directorySupplier(user.id, slug);
  if (!supplier) notFound();

  const [rows, added] = await Promise.all([
    safeQuery(() => db.supplierProduct.findMany({
      where: { status: "published", supplier: { ...VISIBLE_SUPPLIER, id: supplier.id } },
      include: {
        supplier: { select: { id: true, userId: true, slug: true, displayName: true, city: true, address: true, rating: true, ratingCount: true, verificationStatus: true } },
        category: { select: { name: true } },
      },
      orderBy: [PRODUCT_PLAN_FIRST, { trendScore: "desc" }, { createdAt: "desc" }],
      take: 300,
    }), []),
    safeQuery(() => inShopIds(store.id), []),
  ]);
  const decorated = await nearbyForSeller(user.id, rows.map(toFindProduct), new Map(rows.map((row) => [row.supplier.id, row.supplier.address])));
  const products = decorated.products;
  const settings = (store.brandSettings && typeof store.brandSettings === "object" ? store.brandSettings : {}) as Record<string, unknown>;
  const sourcing = parseSourcing(settings.sourcing);
  const location = [supplier.city, supplier.country].filter(Boolean).join(", ");
  const verified = supplier.verificationStatus === "verified";
  const ask = (
    <AskPriceButton
      supplierId={supplier.id}
      supplierName={supplier.name}
      products={products.map((product) => ({ id: product.id, name: product.name, moq: product.moq }))}
      signedIn
      loginHref="/login"
      messagesHref={messagesHref("seller", { with: supplier.id })}
      label={t("pub.quote")}
      tone="ink"
      size="md"
    />
  );

  return (
    <MarketplaceChatWrapper>
      <SellerPage user={user} store={storeSummary(store)} title={supplier.name} sub={t("waitlist.sub")}>
        <div className="grid gap-5">
          <Link href="/marketplace/suppliers" className="inline-flex min-h-[40px] w-fit items-center gap-1.5 text-[14px] font-bold text-app-ink no-underline hover:underline">
            <Icon name="arrowLeft" size={15} /> {t("sup.title")}
          </Link>

          <Card className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
            <span className="block h-16 w-16 shrink-0 overflow-hidden rounded-[16px] border border-app-line bg-white">
              {supplier.logoUrl ? (
                <Image src={supplier.logoUrl} alt="" width={64} height={64} className="h-full w-full object-cover" unoptimized />
              ) : (
                <span className="grid h-full w-full place-items-center bg-app-canvas text-[22px] font-extrabold">{supplier.name.charAt(0).toUpperCase()}</span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 break-words text-[20px] font-extrabold leading-tight">{supplier.name}</h2>
              <p className="m-0 mt-1 flex flex-wrap items-center gap-x-1.5 text-[13.5px] text-app-ink-soft">
                {location ? <span className="inline-flex items-center gap-1"><Icon name="pin" size={13} />{location}</span> : null}
                {supplier.businessType ? <span>· {supplier.businessType.replace(/_/g, " ")}</span> : null}
                {supplier.km !== null ? <span>· {t("trust.km", { km: String(supplier.km) })}</span> : null}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {verified ? <Pill tone="success" dot>{t("trust.verified")}</Pill> : <Pill tone="danger" dot>{supplier.verificationStatus === "pending" ? t("trust.pending") : t("trust.unverified")}</Pill>}
                {supplier.risk ? <Pill tone={RISK_TONE[supplier.risk.level as keyof typeof RISK_TONE] ?? "warning"}>{t.dynamic(`trust.risk.${supplier.risk.level}`, "", { score: supplier.risk.score })}</Pill> : null}
              </div>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              {ask}
              <ChatButton contactId={supplier.id} />
              <PillLink href={`/suppliers/${supplier.slug}`} size="sm" className="min-h-[40px]">{t("sup.profile")}</PillLink>
            </div>
          </Card>

          {products.length === 0 ? (
            <EmptyState
              icon="box"
              title={t("waitlist.emptyTitle")}
              action={
                <div className="grid w-full max-w-[420px] gap-3 text-left">
                  <NotifyMeButton supplierSlug={supplier.slug} supplierName={supplier.name} following={supplier.following} hasProducts={false} />
                  <div className="grid grid-cols-2 gap-2">
                    {ask}
                    <ChatButton contactId={supplier.id} label={t("waitlist.message")} />
                  </div>
                </div>
              }
            >
              {t("waitlist.emptyBody", { name: supplier.name })}
            </EmptyState>
          ) : (
            <>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="m-0 text-[14px] text-app-ink-soft">{t("waitlist.count", { count: products.length, name: supplier.name })}</p>
                <NotifyMeButton supplierSlug={supplier.slug} supplierName={supplier.name} following={supplier.following} hasProducts tone="white" />
              </Card>
              <ProductGrid
                products={products}
                addedIds={added}
                chips={categoriesOf(products).length > 1 ? categoriesOf(products).map((name) => ({ label: name, href: `/marketplace?cat=${encodeURIComponent(name.toLowerCase())}`, active: false })) : []}
                notified={sourcing.notifyNewSuppliers}
                markup={{ markup: sourcing.markup ?? DEFAULT_MARKUP, asked: Boolean(sourcing.markup) }}
                emptyText={t("waitlist.emptyTitle")}
              />
            </>
          )}
        </div>
      </SellerPage>
    </MarketplaceChatWrapper>
  );
}
