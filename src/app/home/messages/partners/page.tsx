import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { MessagesPage, type MessagesSearchParams } from "@/components/conversations/MessagesPage";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Supplier and delivery messages" };

// Seller ↔ supplier and seller ↔ delivery partner chats (the same messenger as the top bar's Messages drawer).
export default async function SellerPartnerMessagesPage({ searchParams }: { searchParams?: Promise<MessagesSearchParams> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title="Supplier and delivery messages"
      sub="Ask suppliers about stock and prices, and sort out pickups with delivery partners. Link a product, order or delivery so everyone's on the same page."
      actions={
        <>
          <PillLink href="/marketplace/suppliers" icon="search">Find suppliers</PillLink>
          <PillLink href="/marketplace/logistics" icon="truck">Find delivery partners</PillLink>
        </>
      }
    >
      <MessagesPage role="seller" params={params} />
    </AppPage>
  );
}
