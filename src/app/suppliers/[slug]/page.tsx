import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Card, CardHead, EmptyState, Pill, PillLink, StatTile } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { KeyValue } from "@/components/logistics/kit";
import { messagesHref } from "@/lib/conversations/pure";

// Public supplier page sellers open from the supplier marketplace (same look as the delivery partner page).

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function fmtMoney(value: number, currency = "NGN") {
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

  if (!supplier) return { title: "Supplier not found · Shopinbos" };

  return {
    title: `${supplier.displayName} · Shopinbos supplier`,
    description: supplier.description ?? `Source products from ${supplier.displayName} on Shopinbos.`,
    openGraph: {
      title: `${supplier.displayName} · Shopinbos supplier`,
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

  const isVerified = supplier.verificationStatus === "verified";
  const initials = supplier.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const quoteHref = `/login?intent=request_quote&supplierSlug=${supplier.slug}`;

  return (
    <div className="app-scope min-h-dvh w-full bg-app-canvas font-app text-app-ink">
      <header className="flex min-h-[64px] items-center justify-between gap-3 border-b border-app-line bg-white px-4 sm:px-6 xl:px-8">
        <Link href="/" className="no-underline" aria-label="Shopinbos home">
          <BrandLogo className="w-[128px] sm:w-[150px]" />
        </Link>
        <nav className="flex items-center gap-2">
          <span className="hidden sm:block"><PillLink href="/marketplace/suppliers" size="sm">Browse suppliers</PillLink></span>
          {isVerified && <PillLink href={quoteHref} size="sm" tone="ink">Contact supplier</PillLink>}
        </nav>
      </header>

      <div className="w-full px-4 py-6 sm:px-6 xl:px-8 2xl:px-10">
        <Link href="/marketplace/suppliers" className="mb-5 inline-flex min-h-[40px] items-center gap-1.5 text-[14px] font-bold text-app-ink no-underline hover:underline">
          <Icon name="arrowLeft" size={15} /> Suppliers
        </Link>

        {!isVerified && (
          <div className="mb-5 flex items-start gap-2.5 rounded-[18px] border border-app-line bg-white px-4 py-3 text-[14px] text-app-ink-soft">
            <Icon name="lock" size={15} />
            <span>This supplier profile is private while verification is pending. Products and contact are hidden from the marketplace.</span>
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
                <img src={supplier.logoUrl} alt={`${supplier.displayName} logo`} className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 break-words text-[26px] font-extrabold leading-[1.1] tracking-[-0.6px] sm:text-[30px]">{supplier.displayName}</h1>
                {isVerified ? <Pill tone="success" dot>Verified supplier</Pill> : <Pill tone="warning" dot>Private profile</Pill>}
              </div>
              <p className="m-0 mt-1 text-[14.5px] text-app-ink-soft">
                {[supplier.city, supplier.country].filter(Boolean).join(", ")} · {supplier.businessType.replace(/_/g, " ")} · {supplier._count.products} products
              </p>
            </div>
            {isVerified && (
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <PillLink href={quoteHref} tone="accent" icon="send" className="flex-1 sm:flex-none">Request quote</PillLink>
                <PillLink href={messagesHref("seller", { with: supplier.id })} icon="chat" className="flex-1 sm:flex-none">Message supplier</PillLink>
              </div>
            )}
          </div>
        </Card>

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile tone="card" label="Trust score" value={supplier.trustScore ? `${supplier.trustScore}/100` : "New"} />
          <StatTile tone="card" label="Rating" value={supplier.ratingCount ? `${supplier.rating.toFixed(1)} ★` : "New"} hint={supplier.ratingCount ? `${supplier.ratingCount} reviews` : undefined} />
          <StatTile tone="card" label="Products" value={supplier._count.products} />
          <StatTile tone="card" label="Replies" value={supplier.responseTimeLabel?.replace(/^replies\s+/i, "") || "Same day"} />
        </div>

        <div className="mb-5 grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
          <Card className="p-5">
            <CardHead title="About" />
            <p className="m-0 mt-2 max-w-[760px] text-[15px] leading-[1.6] text-app-ink-soft">
              {supplier.description ?? (isVerified ? "This verified Shopinbos supplier is ready for dropship and wholesale sourcing." : "This supplier is completing their verification process.")}
            </p>
            {supplier.categories.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {supplier.categories.map((category) => <Pill key={category} tone="ink">{category.replace(/-/g, " ")}</Pill>)}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <CardHead title="At a glance" />
            <div className="mt-2 divide-y divide-app-line">
              <KeyValue label="Location">{supplier.city}</KeyValue>
              <KeyValue label="Business type">{supplier.businessType.replace(/_/g, " ")}</KeyValue>
              {!isVerified && <KeyValue label="Status">{supplier.verificationStatus}</KeyValue>}
            </div>
          </Card>
        </div>

        {isVerified && (
          <Card className="p-5">
            <CardHead
              title={`Products from ${supplier.displayName}`}
              sub="Published marketplace products sellers can source."
              action={<PillLink href={`/marketplace?supplier=${supplier.slug}`} size="sm">View in marketplace</PillLink>}
            />
            {supplier.products.length === 0 ? (
              <EmptyState icon="box" title="No published products yet">New products show here as soon as the supplier publishes them.</EmptyState>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {supplier.products.map((product) => (
                  <Link key={product.id} href={`/marketplace/product/${product.id}`} className="block min-w-0 overflow-hidden rounded-[18px] border border-app-line bg-white text-app-ink no-underline hover:border-app-line-strong">
                    <div className="relative aspect-[4/3] bg-app-canvas">
                      {product.images[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
                      )}
                      {product.dropshipAvailable && <span className="absolute bottom-2 left-2"><Pill tone="accent">Dropship</Pill></span>}
                    </div>
                    <div className="p-3">
                      <div className="line-clamp-2 text-[14px] font-bold leading-[1.35]">{product.name}</div>
                      <div className="mt-1 truncate text-[12.5px] text-app-ink-soft">{product.category.name} · MOQ {product.moq}</div>
                      <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-dashed border-app-line pt-2.5">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-app-ink-faint">Cost</div>
                          <div className="text-[16px] font-extrabold">{fmtMoney(product.wholesalePrice, product.currency)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-app-success">Margin</div>
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
