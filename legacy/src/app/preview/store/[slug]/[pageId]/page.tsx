import { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewPageClient } from "./PreviewPageClient";

export const metadata: Metadata = {
  title: "Page Preview",
  robots: "noindex, nofollow" as const,
};

export default async function PreviewPage({ params }: { params: Promise<{ slug: string; pageId: string }> }) {
  const { slug, pageId } = await params;

  return (
    <PreviewPageClient slug={slug} pageId={pageId} />
  );
}
