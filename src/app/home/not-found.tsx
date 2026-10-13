import type { Metadata } from "next";
import { PortalNotFound } from "@/components/errors/PortalErrorPages";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("home");
  return { title: t("notFoundTitle"), robots: { index: false } };
}

export default function NotFound() {
  return <PortalNotFound portal="seller" />;
}
