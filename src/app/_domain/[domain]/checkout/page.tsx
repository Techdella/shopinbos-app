import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CheckoutClient } from "@/app/s/[slug]/checkout/CheckoutClient";
import { renderShopperPage } from "@/components/storefront/shopper/shopper-page.server";
import { checkoutDesignFor } from "@/lib/storefront/checkout-design.server";
import { shopperPageMetadata } from "@/lib/commerce/storefront.server";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  return storeRef ? shopperPageMetadata(storeRef.slug, "Checkout") : { title: "Store not found", robots: { index: false } };
}

export default async function CustomDomainCheckoutPage({ params }: Props) {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), storeRef.slug);
  return renderShopperPage({
    slug: storeRef.slug,
    basePath,
    signInPath: null,
    render: (store, commerce, preview) => <CheckoutClient store={store} storeBasePath={basePath} commerce={commerce} preview={preview} design={checkoutDesignFor(store.brandSettings, basePath)} />,
  });
}
