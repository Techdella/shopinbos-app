import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { payLinkMetadata } from "@/lib/payment-links/public.server";
import { renderPayLinkPage } from "@/app/s/[slug]/pay/[code]/pay-page.server";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ domain: string; code: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain, code } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  return storeRef ? payLinkMetadata(storeRef.slug, code) : { title: "Store not found", robots: { index: false } };
}

export default async function CustomDomainPayLinkPage({ params }: Props) {
  const { domain, code } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();
  return renderPayLinkPage(storeRef.slug, code, null);
}
