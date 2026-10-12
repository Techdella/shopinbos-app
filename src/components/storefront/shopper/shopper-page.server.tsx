import "server-only";
import { Suspense } from "react";
import type React from "react";
import { notFound } from "next/navigation";
import { loadCommerceContext } from "@/lib/commerce/storefront.server";
import { resolveStorefront, type PublicStore } from "@/lib/storefront/public-store.server";
import { PreviewFrame } from "./PreviewBar";
import { StoreClosedPage } from "./StoreClosedPage";
import type { ShopperCommerce } from "./types";

// One way for the bag, wishlist and checkout routes (/s/[slug]/… and custom domains) to render: the live
// page, the owner's preview under the preview bar, or "This store isn't open yet" for everyone else.

export async function renderShopperPage({
  slug,
  basePath,
  signInPath,
  render,
}: {
  slug: string;
  basePath: string;
  /** This page's path for the owner's "sign in to preview" link; null where there is no sign-in (custom domains). */
  signInPath: string | null;
  render: (store: PublicStore, commerce: ShopperCommerce, preview: boolean) => React.ReactNode;
}) {
  const [view, commerce] = await Promise.all([resolveStorefront(slug), loadCommerceContext(slug)]);
  if (view.access === "missing") notFound();
  if (view.access === "closed") return <StoreClosedPage store={view.brand} basePath={basePath} path={signInPath} />;
  const page = <Suspense>{render(view.store, commerce, view.access === "preview")}</Suspense>;
  return view.access === "preview" ? <PreviewFrame>{page}</PreviewFrame> : page;
}
