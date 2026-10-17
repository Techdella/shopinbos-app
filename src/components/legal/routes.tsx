import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentAppUser } from "@/lib/server-auth";
import { summarize } from "@/lib/cms/richtext";
import { cmsCanonical, storeContentRobots } from "@/lib/cms/storefront";
import { EMPTY_SEO, seoMetadata } from "@/lib/seo/fields";
import { legalLinks, legalPagePath, legalPageStatus } from "@/lib/legal/pages";
import { storefrontLegal } from "@/lib/legal/server";
import { loadStoreChrome } from "@/lib/storefront/product-page.server";
import { LegalIndexView, LegalPageView } from "./LegalPageView";

// Shared bodies of the storefront policy routes: /s/[slug]/policies[/<key>] and the custom-domain twins.
// Unpublished pages 404, except for the store owner opening the editor's Preview link (?preview=1).

async function ownerPreview(ownerId: string, wanted: boolean) {
  if (!wanted) return false;
  const user = await getCurrentAppUser().catch(() => null);
  return Boolean(user && user.id === ownerId);
}

async function findPage(storeSlug: string, key: string, previewWanted: boolean) {
  const found = await storefrontLegal(storeSlug);
  if (!found) return null;
  const page = found.pages.find((entry) => entry.key === key);
  if (!page || legalPageStatus(page) === "empty") return null;
  const live = found.active && legalPageStatus(page) === "published";
  if (live) return { ...found, page, preview: false };
  // The owner may preview a draft (or a page on a store that isn't live yet).
  if (await ownerPreview(found.ownerId, previewWanted)) return { ...found, page, preview: true };
  return null;
}

export async function legalMetadata(storeSlug: string, key: string, previewWanted: boolean, customDomain?: string | null): Promise<Metadata> {
  const found = await findPage(storeSlug, key, previewWanted);
  if (!found) return { title: "Not found" };
  const { store, page, preview } = found;
  const meta = seoMetadata(page.seo, {
    title: page.title,
    titleSuffix: store.name,
    description: summarize(page.doc, 155),
    image: store.logoUrl,
    canonical: cmsCanonical(store.slug, legalPagePath(page.key), customDomain ?? store.customDomain),
    siteName: store.name,
  }) as Metadata;
  return preview ? { ...meta, robots: { index: false, follow: false } } : { ...meta, robots: await storeContentRobots(storeSlug, page.seo.noIndex) };
}

export async function LegalRoute({ storeSlug, pageKey, basePath, previewWanted }: { storeSlug: string; pageKey: string; basePath: string; previewWanted: boolean }) {
  const found = await findPage(storeSlug, pageKey, previewWanted);
  if (!found) notFound();
  const chrome = await loadStoreChrome(storeSlug);
  return <LegalPageView store={found.store} page={found.page} basePath={basePath} preview={found.preview} chrome={chrome} />;
}

export async function legalIndexMetadata(storeSlug: string, customDomain?: string | null): Promise<Metadata> {
  const found = await storefrontLegal(storeSlug);
  if (!found || !found.active) return { title: "Not found" };
  const meta = seoMetadata(
    EMPTY_SEO,
    { title: "Policies", titleSuffix: found.store.name, description: `Policies of ${found.store.name}: delivery, returns, privacy and terms.`, image: found.store.logoUrl, canonical: cmsCanonical(found.store.slug, "/policies", customDomain ?? found.store.customDomain), siteName: found.store.name },
  ) as Metadata;
  return { ...meta, robots: await storeContentRobots(storeSlug) };
}

export async function LegalIndexRoute({ storeSlug, basePath }: { storeSlug: string; basePath: string }) {
  const found = await storefrontLegal(storeSlug);
  if (!found || !found.active) notFound();
  const chrome = await loadStoreChrome(storeSlug);
  return <LegalIndexView store={found.store} pages={legalLinks(found.store.brandSettings)} basePath={basePath} chrome={chrome} />;
}
