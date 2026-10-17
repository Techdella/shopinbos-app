import type { Metadata } from "next";
import { payLinkMetadata } from "@/lib/payment-links/public.server";
import { renderPayLinkPage } from "./pay-page.server";

// A payment link: https://<store>/pay/<code>. The products, delivery and the store's ways to pay, through the normal
// checkout; a paid one-time link says "Paid. Thank you!", an expired one points back to the store.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string; code: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, code } = await params;
  return payLinkMetadata(slug, code);
}

export default async function PayLinkPage({ params }: Props) {
  const { slug, code } = await params;
  return renderPayLinkPage(slug, code, `/s/${slug}/pay/${code}`);
}
