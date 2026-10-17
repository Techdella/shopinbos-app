import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { bioMetadata, renderBioPage } from "@/app/s/[slug]/links/bio-page.server";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  return storeRef ? bioMetadata(storeRef.slug) : { title: "Store not found", robots: { index: false } };
}

export default async function CustomDomainBioLinksPage({ params }: Props) {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();
  return renderBioPage(storeRef.slug);
}
