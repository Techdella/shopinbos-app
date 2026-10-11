import type { ReactNode } from "react";
import { LiveChatWidget } from "@/components/messaging/LiveChatWidget";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";

// The store's chat box on custom-domain storefronts.
export default async function CustomDomainLayout({ children, params }: { children: ReactNode; params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByCustomDomain(domain).catch(() => null);
  return (
    <>
      {children}
      {store ? <LiveChatWidget slug={store.slug} /> : null}
    </>
  );
}
