import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { PillLink } from "@/components/app-kit";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { whatsappStoreView } from "@/lib/whatsapp-store/server";
import { WhatsAppStoreClient } from "./WhatsAppStoreClient";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("inbox");
  return { title: t("ws.title") };
}

export default async function WhatsAppStorePage() {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("inbox");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");
  const view = await whatsappStoreView(store.id);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("ws.title")}
      sub={t("ws.sub")}
      actions={
        <>
          <PillLink href="/home/inbox/chatbot?tab=whatsapp" icon="whatsapp">{t("ws.peggySettings")}</PillLink>
          <PillLink href="/home/orders" icon="package" tone="ink">{t("ws.allOrders")}</PillLink>
        </>
      }
    >
      <PageTip className="mb-5">{tipT("inbox.whatsappStore")}</PageTip>
      <WhatsAppStoreClient initial={view} storeName={store.name} />
    </SellerPage>
  );
}
