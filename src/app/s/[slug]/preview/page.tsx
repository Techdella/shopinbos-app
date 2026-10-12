import { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { resolveStorefront } from "@/lib/storefront/public-store.server";
import { StoreClosedPage } from "@/components/storefront/shopper/StoreClosedPage";
import { PreviewClient } from "./PreviewClient";

// /s/[slug]/preview (the builder's Preview button): the store with the owner's draft. Works before the store
// is live for its owner; anyone else sees the store as it is, or "not open yet".

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const view = await resolveStorefront(slug);
  if (view.access === "missing") return { title: "Store Preview", robots: "noindex, nofollow" as const };
  const name = view.access === "closed" ? view.brand.name : view.store.name;
  return { title: { absolute: `Preview: ${name}` }, robots: "noindex, nofollow" as const };
}

export default async function PreviewPage({ params }: Props) {
  const { slug } = await params;
  const view = await resolveStorefront(slug);
  if (view.access === "missing") notFound();

  const storeBasePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  if (view.access === "closed") {
    return <StoreClosedPage store={view.brand} basePath={storeBasePath} path={`/s/${slug}/preview`} />;
  }
  return <PreviewClient store={view.store} storeBasePath={storeBasePath} live={view.access === "live"} />;
}
