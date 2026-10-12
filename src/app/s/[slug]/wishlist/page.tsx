import type { Metadata } from "next";
import { headers } from "next/headers";
import { WishlistPage } from "@/components/storefront/shopper/WishlistPage";
import { renderShopperPage } from "@/components/storefront/shopper/shopper-page.server";
import { shopperPageMetadata } from "@/lib/commerce/storefront.server";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

// Live store: the wishlist page. Not live: the owner gets a preview (nothing is charged or ordered),
// everyone else "This store isn't open yet".
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return shopperPageMetadata(slug, "Wishlist");
}

export default async function StoreWishlistPage({ params }: Props) {
  const { slug } = await params;
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  return renderShopperPage({
    slug,
    basePath,
    signInPath: `/s/${slug}/wishlist`,
    render: (store, commerce, preview) => <WishlistPage store={store} basePath={basePath} commerce={commerce} preview={preview} />,
  });
}
