import type { Metadata } from "next";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { PillLink } from "@/components/app-kit";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { catalogView, syncIfDirty } from "@/lib/whatsapp-catalog/server";
import { WhatsAppCatalogClient } from "./WhatsAppCatalogClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "WhatsApp catalog" };

export default async function WhatsAppCatalogPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");
  const view = await catalogView(store.id);
  if (!view) redirect("/builder?firstRun=1");
  // Product changes since the last sync go to Meta after this page has been sent (never blocks the page).
  if (view.catalog.id && view.catalog.dirty && !view.catalog.syncing) after(() => syncIfDirty(store.id).then(() => undefined).catch(() => undefined));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="WhatsApp catalog"
      sub="Customers look through your products inside WhatsApp and send you the order without leaving the chat."
      actions={
        <>
          <PillLink href="/home/inbox/chatbot?tab=whatsapp" icon="whatsapp">WhatsApp settings</PillLink>
          <PillLink href="/products" icon="bag">Products</PillLink>
        </>
      }
    >
      <WhatsAppCatalogClient initial={view} storeName={store.name} />
    </SellerPage>
  );
}
