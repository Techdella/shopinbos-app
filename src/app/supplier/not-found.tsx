import type { Metadata } from "next";
import { PortalNotFound } from "@/components/errors/PortalErrorPages";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("supplier"))("notFound.metaTitle"), robots: { index: false } };
}

export default function NotFound() {
  return <PortalNotFound portal="supplier" />;
}
