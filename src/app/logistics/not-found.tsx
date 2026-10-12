import type { Metadata } from "next";
import { PortalNotFound } from "@/components/errors/PortalErrorPages";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return <PortalNotFound portal="logistics_partner" />;
}
