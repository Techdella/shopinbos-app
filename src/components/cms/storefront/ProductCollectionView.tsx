import Link from "next/link";
import { notFound } from "next/navigation";
import { CmsShell } from "@/components/cms/storefront/CmsPages";
import { jsonLdString } from "@/lib/cms/jsonld";
import { cmsCanonical, storeLink, storefrontProductCollection } from "@/lib/cms/storefront";
import { naira } from "@shared/onboarding";

// A product collection's own page (/collections/<slug>), so each collection has an address with its own
// search title, description and share card from the collection's SEO tab.

export async function ProductCollectionRoute({ storeSlug, handle, basePath, customDomain }: { storeSlug: string; handle: string; basePath: string; customDomain?: string | null }) {
  const found = await storefrontProductCollection(storeSlug, handle);
  if (!found) notFound();
  const { store, collection, products } = found;
  const canonical = cmsCanonical(store.slug, `/collections/${collection.slug}`, customDomain);
  const price = (amount: number, currency: string) => (currency === "NGN" ? naira(amount) : `${currency} ${amount.toLocaleString()}`);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: collection.name,
    description: collection.description ?? undefined,
    url: canonical,
    mainEntity: { "@type": "ItemList", itemListElement: products.slice(0, 50).map((product, index) => ({ "@type": "ListItem", position: index + 1, url: canonical.replace(/\/collections\/[^/]+$/, `/product/${product.id}`), name: product.name })) },
  };
  return (
    <CmsShell store={store} basePath={basePath}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <nav className="cms-crumbs" aria-label="Breadcrumb"><Link href={storeLink(basePath, "/")}>{store.name}</Link><span aria-hidden>/</span><span aria-current="page">{collection.name}</span></nav>
      <h1 className="cms-h1">{collection.name}</h1>
      {collection.description && <p className="cms-lede">{collection.description}</p>}
      {products.length === 0 ? (
        <p className="cms-empty">No products here yet.</p>
      ) : (
        <ul className="cms-products" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {products.map((product) => (
            <li key={product.id}>
              <Link href={storeLink(basePath, `/product/${product.id}`)} className="cms-product-tile">
                {product.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.images[0]} alt={product.name} loading="lazy" />
                ) : (
                  <span className="cms-ph" aria-hidden />
                )}
                <strong>{product.name}</strong>
                <span className="cms-small">
                  {price(product.retailPrice, product.currency)}
                  {product.compareAtPrice && product.compareAtPrice > product.retailPrice ? <s style={{ marginLeft: 6 }}>{price(product.compareAtPrice, product.currency)}</s> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CmsShell>
  );
}
