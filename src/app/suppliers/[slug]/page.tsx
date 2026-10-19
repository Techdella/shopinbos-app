import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Card, CardHead, EmptyState, Pill, PillLink, StatTile } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { KeyValue } from "@/components/logistics/kit";
import { messagesHref } from "@/lib/conversations/pure";
import { formatMoney, type Locale } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

// Public supplier page sellers open from the supplier marketplace (same look as the delivery partner page).

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function fmtMoney(value: number, currency = "NGN", locale: Locale = "en") {
  if (locale !== "en") return formatMoney(Math.round(value), locale, { currency });
  const symbol = currency === "NGN" ? "₦" : `${currency} `;
  return `${symbol}${Math.round(value).toLocaleString("en-NG")}`;
}

function margin(wholesale: number, retail: number) {
  if (!retail) return 0;
  return Math.max(0, Math.round(((retail - wholesale) / retail) * 100));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const supplier = await db.supplier.findFirst({
    where: { slug, status: "active" },
    select: { displayName: true, description: true, bannerUrl: true, verificationStatus: true },
  });

  const t = await getT("marketplace");
  if (!supplier) return { title: t("pub.notFound") };

  return {
    title: t("pub.metaTitle", { name: supplier.displayName }),
    description: supplier.description ?? t("pub.metaDesc", { name: supplier.displayName }),
    openGraph: {
      title: t("pub.metaTitle", { name: supplier.displayName }),
      description: supplier.description ?? undefined,
      images: supplier.bannerUrl ? [supplier.bannerUrl] : undefined,
    },
    // Unverified profiles are private previews and must not be indexed.
    robots: supplier.verificationStatus === "verified" ? undefined : { index: false, follow: false },
  };
}

export default async function PublicSupplierProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const supplier = await db.supplier.findFirst({
    where: {
      slug,
      status: "active",
    },
    include: {
      products: {
        where: { status: "published" },
        include: { category: true },
        orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
        take: 12,
      },
      _count: { select: { products: { where: { status: "published" } } } },
    },
  });

  if (!supplier) notFound();
  const t = await getT("marketplace");
  const locale = await getLocale();

  const isVerified = supplier.verificationStatus === "verified";
  const initials = supplier.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const quoteHref = `/login?intent=request_quote&supplierSlug=${supplier.slug}`;

  return (
    <div className="app-scope min-h-dvh w-full bg-app-canvas font-app text-app-ink">
      <header className="flex min-h-[64px] items-center justify-between gap-3 border-b border-app-line bg-white px-4 sm:px-6 xl:px-8">
        <Link href="/" className="no-underline" aria-label={t("pub.home")}>
          <BrandLogo className="w-[128px] sm:w-[150px]" />
        </Link>
        <nav className="flex items-center gap-2">
          <span className="hidden sm:block"><PillLink href="/marketplace/suppliers" size="sm">{t("pub.browse")}</PillLink></span>
          {isVerified && <PillLink href={quoteHref} size="sm" tone="ink">{t("pub.contact")}</PillLink>}
        </nav>
      </header>

      <div className="w-full px-4 py-6 sm:px-6 xl:px-8 2xl:px-10">
        <Link href="/marketplace/suppliers" className="mb-5 inline-flex min-h-[40px] items-center gap-1.5 text-[14px] font-bold text-app-ink no-underline hover:underline">
          <Icon name="arrowLeft" size={15} /> {t("sup.title")}
        </Link>

        {!isVerified && (
          <div className="mb-5 flex items-start gap-2.5 rounded-[18px] border border-app-line bg-white px-4 py-3 text-[14px] text-app-ink-soft">
            <Icon name="lock" size={15} />
            <span>{t("pub.private")}</span>
          </div>
        )}

        <Card className="mb-5 overflow-hidden">
          <div
            className="h-[140px] bg-app-ink bg-cover bg-center sm:h-[200px]"
            style={supplier.bannerUrl ? { backgroundImage: `url(${supplier.bannerUrl})` } : undefined}
            aria-hidden
          />
          <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
            {/* Only the logo overlaps the cover, so the name never sits on the dark band. */}
            <span className="-mt-10 grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[20px] border-[3px] border-white bg-app-peach text-[26px] font-extrabold text-app-accent-ink shadow-sm">
              {supplier.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={supplier.logoUrl} alt={t("pub.logo", { name: supplier.displayName })} className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 break-words text-[26px] font-extrabold leading-[1.1] tracking-[-0.6px] sm:text-[30px]">{supplier.displayName}</h1>
                {isVerified ? <Pill tone="success" dot>{t("pub.verified")}</Pill> : <Pill tone="warning" dot>{t("pub.privateProfile")}</Pill>}
              </div>
              <p className="m-0 mt-1 text-[14.5px] text-app-ink-soft">
                {[supplier.city, supplier.country].filter(Boolean).join(", ")} · {supplier.businessType.replace(/_/g, " ")} · {t("pub.products", { count: supplier._count.products })}
              </p>
            </div>
            {isVerified && (
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <PillLink href={quoteHref} tone="accent" icon="send" className="flex-1 sm:flex-none">{t("pub.quote")}</PillLink>
                <PillLink href={messagesHref("seller", { with: supplier.id })} icon="chat" className="flex-1 sm:flex-none">{t("pub.message")}</PillLink>
              </div>
            )}
          </div>
        </Card>

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile tone="card" label={t("pub.trustScore")} value={supplier.trustScore ? `${supplier.trustScore}/100` : t("pub.new")} />
          <StatTile tone="card" label={t("pub.rating")} value={supplier.ratingCount ? `${supplier.rating.toFixed(1)} ★` : t("pub.new")} hint={supplier.ratingCount ? t("pub.reviews", { count: supplier.ratingCount }) : undefined} />
          <StatTile tone="card" label={t("pub.productsLabel")} value={supplier._count.products} />
          <StatTile tone="card" label={t("pub.replies")} value={supplier.responseTimeLabel?.replace(/^replies\s+/i, "") || t("pub.sameDay")} />
        </div>

        <div className="mb-5 grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
          <Card className="p-5">
            <CardHead title={t("pub.about")} />
            <p className="m-0 mt-2 max-w-[760px] text-[15px] leading-[1.6] text-app-ink-soft">
              {supplier.description ?? (isVerified ? t("pub.aboutVerified") : t("pub.aboutPending"))}
            </p>
            {supplier.categories.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {supplier.categories.map((category) => <Pill key={category} tone="ink">{category.replace(/-/g, " ")}</Pill>)}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <CardHead title={t("pub.glance")} />
            <div className="mt-2 divide-y divide-app-line">
              <KeyValue label={t("pub.location")}>{supplier.city}</KeyValue>
              <KeyValue label={t("pub.businessType")}>{supplier.businessType.replace(/_/g, " ")}</KeyValue>
              {!isVerified && <KeyValue label={t("pub.status")}>{supplier.verificationStatus}</KeyValue>}
            </div>
          </Card>
        </div>

        {isVerified && (
          <Card className="p-5">
            <CardHead
              title={t("pub.productsFrom", { name: supplier.displayName })}
              sub={t("pub.productsSub")}
              action={<PillLink href={`/marketplace?supplier=${supplier.slug}`} size="sm">{t("pub.viewInMarket")}</PillLink>}
            />
            {supplier.products.length === 0 ? (
              <EmptyState icon="box" title={t("pub.noProducts")}>{t("pub.noProductsSub")}</EmptyState>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {supplier.products.map((product) => (
                  <Link key={product.id} href={`/marketplace/product/${product.id}`} className="block min-w-0 overflow-hidden rounded-[18px] border border-app-line bg-white text-app-ink no-underline hover:border-app-line-strong">
                    <div className="relative aspect-[4/3] bg-app-canvas">
                      {product.images[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
                      )}
                      {product.dropshipAvailable && <span className="absolute bottom-2 left-2"><Pill tone="accent">{t("pub.dropship")}</Pill></span>}
                    </div>
                    <div className="p-3">
                      <div className="line-clamp-2 text-[14px] font-bold leading-[1.35]">{product.name}</div>
                      <div className="mt-1 truncate text-[12.5px] text-app-ink-soft">{product.category.name} · {t("pub.moq", { count: product.moq })}</div>
                      <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-dashed border-app-line pt-2.5">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-app-ink-faint">{t("pub.cost")}</div>
                          <div className="text-[16px] font-extrabold">{fmtMoney(product.wholesalePrice, product.currency, locale)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-app-success">{t("pub.margin")}</div>
                          <div className="text-[16px] font-extrabold text-app-success">{margin(product.wholesalePrice, product.suggestedRetailPrice)}%</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
