import type { Metadata } from "next";
import { PartnerPage } from "@/components/logistics/kit";
import { LogisticsMessenger } from "@/components/logistics/chats/LogisticsMessenger";
import { parseContextParam } from "@/lib/conversations/pure";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";
import { getT } from "@/lib/i18n/server";
import { riderParam } from "@shared/logistics-chats";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("chats.title") };
}

// Messages: the delivery partner's riders, shops and suppliers in one WhatsApp-style page
// (components/logistics/chats/LogisticsMessenger.tsx). ?rider=<id> opens a rider's chat ("<rider> sent a message"
// and the Riders page's "Message" button link here), ?c=<conversationId> a conversation, ?with=…&ctx=… starts one.
export default async function LogisticsInboxPage({ searchParams }: { searchParams?: Promise<{ c?: string; with?: string; ctx?: string; rider?: string }> }) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const t = await getT("logistics");
  const rider = riderParam(params.rider);
  const initial = rider
    ? { rider }
    : params.with
      ? { with: params.with.slice(0, 64), context: parseContextParam(params.ctx) }
      : params.c
        ? { conversation: params.c.slice(0, 64), context: parseContextParam(params.ctx) }
        : null;

  return (
    <PartnerPage frame={{ user, partner }} title={t("chats.title")} sub={t("chats.sub")}>
      <LogisticsMessenger initial={initial} />
    </PartnerPage>
  );
}
