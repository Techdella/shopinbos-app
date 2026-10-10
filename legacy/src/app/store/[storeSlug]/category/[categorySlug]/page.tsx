import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default async function PublicStoreCategoryPage({
  params,
}: {
  params: Promise<{ storeSlug: string; categorySlug: string }>;
}) {
  const { storeSlug, categorySlug } = await params;
  const store = await db.store.findUnique({
    where: { slug: storeSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      currency: true,
      status: true,
      brandSettings: true,
      storeProducts: {
        where: { status: "published" },
        select: {
          id: true,
          name: true,
          description: true,
          images: true,
          retailPrice: true,
          currency: true,
          category: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!store || store.status !== "active") notFound();

  const matchingProducts = store.storeProducts.filter((product) => {
    const category = product.category;
    if (!category) return false;
    return category.slug === categorySlug || slugify(category.name) === categorySlug;
  });
  const categoryName = matchingProducts[0]?.category?.name ?? categorySlug.replace(/-/g, " ");
  const settings = (store.brandSettings as any) ?? {};
  const theme = settings.palette ?? settings.themeTokens ?? {};
  const accent = theme.accent ?? theme.ctaBg ?? "#1B7B6A";
  const paper = theme.paperBg ?? "#FAF7F1";
  const ink = theme.ink ?? theme.heroBg ?? "#0B262C";

  return (
    <main style={{ minHeight: "100vh", background: paper, color: ink, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <nav style={{ background: "#fff", borderBottom: "1px solid rgba(11,38,44,.12)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", height: 64, padding: "0 22px", display: "flex", alignItems: "center", gap: 12 }}>
          <Link href={`/store/${store.slug}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: ink }}>
            {store.logoUrl ? <Image src={store.logoUrl} alt={store.name} width={30} height={30} style={{ borderRadius: 8, objectFit: "cover" }} unoptimized /> : null}
            <strong>{store.name}</strong>
          </Link>
          <span style={{ color: "rgba(11,38,44,.35)" }}>/</span>
          <span style={{ fontSize: 13, textTransform: "capitalize", color: "rgba(11,38,44,.62)" }}>{categoryName}</span>
          <Link href={`/store/${store.slug}/cart`} style={{ marginLeft: "auto", color: accent, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Cart</Link>
        </div>
      </nav>

      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "44px 22px 70px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 800, color: accent, marginBottom: 8 }}>Category</div>
          <h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.08, textTransform: "capitalize" }}>{categoryName}</h1>
        </div>

        {matchingProducts.length === 0 ? (
          <div style={{ border: "1px solid rgba(11,38,44,.12)", borderRadius: 14, background: "#fff", padding: 42, textAlign: "center" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>No products in this category yet</h2>
            <p style={{ margin: "0 auto 20px", maxWidth: 460, color: "rgba(11,38,44,.62)", lineHeight: 1.6 }}>
              This category is ready, but the seller has not published matching products yet.
            </p>
            <Link href={`/store/${store.slug}`} style={{ display: "inline-block", background: accent, color: "#fff", borderRadius: 8, padding: "12px 18px", fontWeight: 800, textDecoration: "none" }}>
              Continue shopping
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 18 }}>
            {matchingProducts.map((product) => (
              <Link key={product.id} href={`/store/${store.slug}/product/${product.id}`} style={{ textDecoration: "none", color: "inherit", background: "#fff", border: "1px solid rgba(11,38,44,.10)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ aspectRatio: "4/3", background: "rgba(11,38,44,.06)", position: "relative" }}>
                  {product.images[0] ? (
                    <Image src={product.images[0]} alt={product.name} fill style={{ objectFit: "cover" }} unoptimized />
                  ) : (
                    <div style={{ height: "100%", display: "grid", placeItems: "center", color: "rgba(11,38,44,.45)", fontSize: 13 }}>No image</div>
                  )}
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 5 }}>{product.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(11,38,44,.58)", minHeight: 34 }}>{product.description?.slice(0, 72) ?? "View product details"}</div>
                  <div style={{ marginTop: 12, fontWeight: 900, color: accent }}>{money(product.retailPrice, product.currency)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
