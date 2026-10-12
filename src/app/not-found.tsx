import type { Metadata } from "next";
import { AppNotFound } from "@/components/errors/AppErrorPages";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return <AppNotFound />;
}
