import type { ReactNode } from "react";
import { LiveChatWidget } from "@/components/messaging/LiveChatWidget";

// Every storefront page gets the store's chat box (it hides itself in the builder preview and when the
// seller hasn't turned live chat on).
export default async function StorefrontLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      {children}
      <LiveChatWidget slug={slug} />
    </>
  );
}
