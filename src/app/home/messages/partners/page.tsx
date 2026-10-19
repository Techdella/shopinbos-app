import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { MessagesPage, type MessagesSearchParams } from "@/components/conversations/MessagesPage";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("inbox");
  return { title: t("partner.title") };
}

// Seller ↔ supplier and seller ↔ delivery partner chats (the same messenger as the top bar's Messages drawer).
export default async function SellerPartnerMessagesPage({ searchParams }: { searchParams?: Promise<MessagesSearchParams> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("inbox");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title={t("partner.title")}
      sub={t("partner.sub")}
      actions={
        <>
          <PillLink href="/marketplace/suppliers" icon="search">{t("partner.findSuppliers")}</PillLink>
          <PillLink href="/marketplace/logistics" icon="truck">{t("partner.findPartners")}</PillLink>
        </>
      }
    >
      <MessagesPage role="seller" params={params} />
    </AppPage>
  );
}
