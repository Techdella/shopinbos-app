import { notFound, redirect } from "next/navigation";
import { publishedPageSlug } from "@/lib/cms/server";
import { CmsCollectionView, CmsItemView } from "@/components/cms/storefront/CmsPages";
import { cmsCanonical, itemReferences, storefrontCollection, storefrontItem } from "@/lib/cms/storefront";
import { loadStoreChrome } from "@/lib/storefront/product-page.server";

// Shared bodies of the storefront CMS routes: /s/[slug]/<collection>[/<item>], the custom-domain
// equivalents, and the old /blog URLs (now the Blog collection).

export async function CollectionRoute({ storeSlug, collectionSlug, basePath, customDomain }: { storeSlug: string; collectionSlug: string; basePath: string; customDomain?: string | null }) {
  const found = await storefrontCollection(storeSlug, collectionSlug);
  if (!found) {
    // /about, /contact…: store pages live on the home route as ?page=.
    const page = await publishedPageSlug(storeSlug, collectionSlug);
    if (page) redirect(`${basePath}/?page=${page}`);
    notFound();
  }
  const { store, collection, items, fields, settings } = found;
  const chrome = await loadStoreChrome(storeSlug);
  return (
    <CmsCollectionView
      store={store}
      collection={collection}
      items={items}
      fields={fields}
      layout={settings.layout}
      basePath={basePath}
      canonical={cmsCanonical(store.slug, `/${collection.slug}`, customDomain)}
      chrome={chrome}
    />
  );
}

export async function ItemRoute({ storeSlug, collectionSlug, itemSlug, basePath, customDomain }: { storeSlug: string; collectionSlug: string; itemSlug: string; basePath: string; customDomain?: string | null }) {
  const found = await storefrontItem(storeSlug, collectionSlug, itemSlug);
  if (!found) notFound();
  const { store, collection, item, fields, siblings } = found;
  const [refs, chrome] = await Promise.all([itemReferences(store.id, fields, (item.data ?? {}) as Record<string, unknown>, basePath), loadStoreChrome(storeSlug)]);
  return (
    <CmsItemView
      store={store}
      collection={collection}
      item={item}
      fields={fields}
      siblings={siblings}
      basePath={basePath}
      canonical={cmsCanonical(store.slug, `/${collection.slug}/${item.slug}`, customDomain)}
      refs={refs}
      chrome={chrome}
    />
  );
}
