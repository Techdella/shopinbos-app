import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Icon } from "@/components/ui/Icon";
import { messagesHref } from "@/lib/conversations/pure";

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

  return (
    <main style={{ minHeight: "100vh", background: "var(--canvas)", color: "var(--ink-900)" }}>
      <header style={{ height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", background: "var(--paper)", borderBottom: "1px solid var(--ink-100)" }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <BrandLogo className="w-[150px]" />
        </Link>
        <nav style={{ display: "flex", gap: 10 }}>
          <Link className="dbtn dBtn-ghost dBtn-sm" href="/marketplace/suppliers">Browse suppliers</Link>
          {isVerified && <Link className="dbtn dBtn-mint dBtn-sm" href={`/login?intent=request_quote&supplierSlug=${supplier.slug}`}>Contact supplier</Link>}
        </nav>
      </header>

      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "28px" }}>
        {!isVerified && (
          <div className="card" style={{ padding: "12px 18px", marginBottom: 16, background: "var(--amber-50)", borderColor: "var(--amber-200)", fontSize: 13, color: "var(--amber-800)", display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="lock" size={14} />
            This supplier profile is currently private — verification is pending. Products and contact are hidden from the marketplace.
          </div>
        )}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ height: 240, position: "relative", background: supplier.bannerUrl ? undefined : "linear-gradient(135deg, #D4A574, #6B4A2C 55%, #195754)" }}>
            {supplier.bannerUrl && <Image src={supplier.bannerUrl} alt="" fill style={{ objectFit: "cover" }} unoptimized />}
          </div>
          <div style={{ padding: "0 28px 28px", marginTop: -54, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
              <div style={{ width: 108, height: 108, borderRadius: 18, border: "5px solid var(--paper)", overflow: "hidden", background: "linear-gradient(135deg, var(--amber-500), var(--rose-500))", display: "grid", placeItems: "center", color: "white", fontFamily: "var(--font-accent)", fontSize: 34, fontWeight: 700 }}>
                {supplier.logoUrl ? <Image src={supplier.logoUrl} alt={supplier.displayName} width={108} height={108} style={{ objectFit: "cover", width: "100%", height: "100%" }} unoptimized /> : initials}
              </div>
              <div style={{ flex: 1, paddingBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <h1 style={{ margin: 0, fontFamily: "var(--font-accent)", fontSize: 38, fontWeight: 500, lineHeight: 1 }}>{supplier.displayName}</h1>
                  {isVerified ? (
                    <span className="badge badge-success"><span className="badge-dot" /> Verified supplier</span>
                  ) : (
                    <span className="badge badge-warn"><span className="badge-dot" /> Private profile</span>
                  )}
                </div>
                <div style={{ marginTop: 7, color: "var(--ink-600)", fontSize: 14 }}>
                  {supplier.city}, {supplier.country} · {supplier.businessType.replace(/_/g, " ")} · {supplier._count.products} products
                </div>
              </div>
              {isVerified && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link className="dbtn dBtn-ghost" href={messagesHref("seller", { with: supplier.id })}>Message supplier</Link>
                  <Link className="dbtn dBtn-mint" href={`/login?intent=request_quote&supplierSlug=${supplier.slug}`}>Request quote</Link>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.6fr", gap: 24, marginTop: 24 }}>
              <div>
                <p style={{ fontSize: 15, lineHeight: 1.8, color: "var(--ink-700)", margin: 0 }}>
                  {supplier.description ?? (isVerified ? "This verified Shopinbos supplier is ready for dropship and wholesale sourcing." : "This supplier is completing their verification process.")}
                </p>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 16 }}>
                  {supplier.categories.map((category) => <span key={category} className="chip on">{category}</span>)}
                  {supplier.responseTimeLabel && <span className="chip">{supplier.responseTimeLabel}</span>}
                </div>
              </div>
              <div className="card" style={{ padding: 16 }}>
                {[
                  ["Trust score", supplier.trustScore || 0],
                  ["Rating", `${supplier.rating.toFixed(1)} (${supplier.ratingCount})`],
                  ["Products", supplier._count.products],
                  ["Location", supplier.city],
                  isVerified ? null : ["Status", supplier.verificationStatus],
                ].filter(Boolean).map((entry, index) => {
                  const [label, value] = entry as [string, string | number];
                  return (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: index ? "1px solid var(--ink-100)" : "none", fontSize: 13 }}>
                      <span style={{ color: "var(--ink-500)" }}>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {isVerified && (
          <>
            <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Products from {supplier.displayName}</h2>
                <div style={{ marginTop: 4, color: "var(--ink-500)", fontSize: 13 }}>Published marketplace products sellers can source.</div>
              </div>
              <Link className="dbtn dBtn-ghost dBtn-sm" href={`/marketplace?supplier=${supplier.slug}`}>View in marketplace</Link>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14, marginTop: 16 }}>
              {supplier.products.map((product) => (
                <div key={product.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ aspectRatio: "4/3", position: "relative", background: "linear-gradient(135deg, #E9DDC2, #7A5C1A)" }}>
                    {product.images[0] && <Image src={product.images[0]} alt={product.name} fill style={{ objectFit: "cover" }} unoptimized />}
                    {product.dropshipAvailable && <span className="badge badge-mint" style={{ position: "absolute", left: 10, bottom: 10 }}>Dropship</span>}
                  </div>
                  <div style={{ padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.35 }}>{product.name}</div>
                    <div style={{ color: "var(--ink-500)", fontSize: 12, marginTop: 4 }}>{product.category.name} · MOQ {product.moq}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--ink-150)" }}>
                      <div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-500)", textTransform: "uppercase", fontWeight: 700 }}>Cost</div>
                        <div className="money" style={{ fontSize: 18 }}>{fmtMoney(product.wholesalePrice, product.currency)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10.5, color: "var(--success)", textTransform: "uppercase", fontWeight: 700 }}>Margin</div>
                        <div className="money" style={{ fontSize: 18, color: "var(--success)" }}>{margin(product.wholesalePrice, product.suggestedRetailPrice)}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {supplier.products.length === 0 && (
                <div className="card" style={{ padding: 30, color: "var(--ink-500)", textAlign: "center", gridColumn: "1 / -1" }}>
                  No published products yet.
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
