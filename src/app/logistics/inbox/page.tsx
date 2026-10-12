import type { Metadata } from "next";
import { PartnerPage } from "@/components/logistics/kit";
import { MessagesPage, type MessagesSearchParams } from "@/components/conversations/MessagesPage";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox" };

// Delivery partner ↔ seller and ↔ supplier chats.
export default async function LogisticsInboxPage({ searchParams }: { searchParams?: Promise<MessagesSearchParams> }) {
  const params = await searchParams;
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  return (
    <PartnerPage frame={{ user, partner }} title="Inbox" sub="Talk to sellers and suppliers about pickups, deliveries and payment on delivery.">
      <MessagesPage role="logistics_partner" params={params} />
    </PartnerPage>
  );
}
