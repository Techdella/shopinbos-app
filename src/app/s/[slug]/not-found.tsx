import type { Metadata } from "next";
import { StorefrontNotFound } from "@/components/errors/StorefrontErrorPages";

export const metadata: Metadata = { title: { absolute: "Not found" }, robots: { index: false } };

// Dressed in the store's theme via the layout's StoreBrandProvider.
export default function StoreNotFound() {
  return <StorefrontNotFound />;
}
