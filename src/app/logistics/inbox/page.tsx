import type { Metadata } from "next";
import { PartnerPage } from "@/components/logistics/kit";
import { MessagesPage, type MessagesSearchParams } from "@/components/conversations/MessagesPage";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("inbox.title") };
}

// Delivery partner ↔ seller and ↔ supplier chats.
export default async function LogisticsInboxPage({ searchParams }: { searchParams?: Promise<MessagesSearchParams> }) {
  const params = await searchParams;
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const t = await getT("logistics");

  return (
    <PartnerPage frame={{ user, partner }} title={t("inbox.title")} sub={t("inbox.sub")}>
      <MessagesPage role="logistics_partner" params={params} />
    </PartnerPage>
  );
}
