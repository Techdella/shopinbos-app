import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { PillLink } from "@/components/app-kit";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { catalogView, syncIfDirty } from "@/lib/whatsapp-catalog/server";
import { embeddedSignupConfig } from "@/lib/inbox/channels/whatsapp";
import { WhatsAppCatalogClient } from "./WhatsAppCatalogClient";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("inbox");
  return { title: t("cat.title") };
}

export default async function WhatsAppCatalogPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("inbox");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");
  const view = await catalogView(store.id).catch((error: Error) => {
    console.error("[whatsapp-catalog] page data failed", error.message?.slice(0, 200));
    return null;
  });
  if (!view) redirect("/builder?firstRun=1");
  // Product changes since the last sync go to Meta after this page has been sent (never blocks the page).
  if (view.catalog.id && view.catalog.dirty && !view.catalog.syncing) after(() => syncIfDirty(store.id).then(() => undefined).catch(() => undefined));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("cat.title")}
      sub={t("cat.sub")}
      actions={
        <>
          <PillLink href="/home/inbox/chatbot?tab=whatsapp" icon="whatsapp">{t("cat.settings")}</PillLink>
          <PillLink href="/products" icon="bag">{t("cat.products")}</PillLink>
        </>
      }
    >
      <WhatsAppCatalogClient initial={view} storeName={store.name} signup={embeddedSignupConfig()} />
    </SellerPage>
  );
}
