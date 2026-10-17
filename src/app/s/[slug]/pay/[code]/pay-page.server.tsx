import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PayLinkClient } from "./PayLinkClient";
import { renderShopperPage } from "@/components/storefront/shopper/shopper-page.server";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { isBotUserAgent } from "@/lib/analytics/sources";
import { loadPublicPayLink } from "@/lib/payment-links/public.server";
import { recordLinkView } from "@/lib/payment-links/service.server";

/** The pay page for both addresses of a store (/s/<slug>/pay/<code> and the store's own domain). */
export async function renderPayLinkPage(slug: string, code: string, signInPath: string | null) {
  const requestHeaders = await headers();
  const link = await loadPublicPayLink(slug, code);
  if (!link) notFound();
  const basePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);
  // Link previews (WhatsApp, Instagram…) fetch the page too; only people count as views.
  if (link.status === "active" && !isBotUserAgent(requestHeaders.get("user-agent"))) await recordLinkView(link.id);
  return renderShopperPage({
    slug,
    basePath,
    signInPath,
    render: (store, commerce, preview) => <PayLinkClient store={store} storeBasePath={basePath} commerce={commerce} preview={preview} link={link} />,
  });
}
