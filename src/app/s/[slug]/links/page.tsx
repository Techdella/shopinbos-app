import type { Metadata } from "next";
import { bioMetadata, renderBioPage } from "./bio-page.server";

// Link in bio: https://<store>/links, the page sellers put in their Instagram and TikTok bio.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return bioMetadata(slug);
}

export default async function BioLinksPage({ params }: Props) {
  const { slug } = await params;
  return renderBioPage(slug);
}
