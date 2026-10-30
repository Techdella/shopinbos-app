import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppPage, MoreActions, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { db } from "@/lib/db/client";
import { hasAiProvider } from "@/lib/inbox/ai";
import { listInbox, teamOptions } from "@/lib/inbox/queries";
import { touchSellerSeen } from "@/lib/inbox/service";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, safeQuery } from "@/lib/workspace";
import { UnifiedInbox } from "./UnifiedInbox";
import { getT } from "@/lib/i18n/server";
import { listShopRiderThreads } from "@/lib/logistics/rider-messages.server";
import { parseContextParam } from "@/lib/conversations/pure";
import { asSellerInboxFilter, riderChatParam } from "@shared/seller-inbox";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("inbox");
  return { title: t("title") };
}

// The one chat inbox: customer conversations from every channel (WhatsApp, Instagram, Messenger, SMS, email,
// Telegram, phone calls, live chat, contact forms), the seller's supplier and delivery-partner chats, and the riders
// carrying the shop's parcels. ?c= customer chat, ?p= partner conversation, ?r= delivery job, ?with=&ctx= starts a
// partner chat, ?kind= picks a chip (old /home/messages/partners links redirect here).

type Params = { c?: string; p?: string; r?: string; with?: string; ctx?: string; kind?: string };

const SAFE_ID = /^[\w-]{1,64}$/;

export default async function SellerMessagesPage({ searchParams }: { searchParams?: Promise<Params> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("inbox", "common");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");
  const store = workspace.store;

  await touchSellerSeen(store.id);
  const [items, riders, team, canned, channels, settings, suppliers, partners] = await Promise.all([
    listInbox(store.id, user.id),
    safeQuery(() => listShopRiderThreads(user.id), []),
    teamOptions(store.id, { email: user.email ?? "", name: user.name ?? t("you") }),
    safeQuery(() => db.inboxCannedReply.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true, body: true } }), []),
    safeQuery(() => db.inboxChannel.findMany({ where: { storeId: store.id, status: "connected" }, select: { channel: true } }), []),
    safeQuery(() => db.inboxSettings.findUnique({ where: { storeId: store.id }, select: { autoReplyEnabled: true } }), null),
    safeQuery(() => db.supplier.findMany({
      where: { status: "active", verificationStatus: "verified" },
      orderBy: [{ trustScore: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: { userId: true, businessName: true },
    }), []),
    safeQuery(() => db.logisticsPartner.findMany({
      where: { status: "active", verificationStatus: "verified" },
      orderBy: [{ reliabilityScore: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: { userId: true, companyName: true },
    }), []),
  ]);

  const connected = channels.map((c) => c.channel);
  const unread = items.filter((item) => item.unread > 0 && item.status !== "closed").length + riders.filter((rider) => rider.unread > 0).length;
  const one = (value: string | undefined) => (value && SAFE_ID.test(value) ? value : null);
  const rider = riderChatParam(params?.r);
  const initialKey = one(params?.c) ? `c:${params!.c}` : one(params?.p) ? `p:${params!.p}` : rider ? `r:${rider}` : null;
  const startWith = !initialKey && one(params?.with) ? { with: params!.with!, context: parseContextParam(params?.ctx) } : null;
  const contacts = [
    ...suppliers.filter((s) => s.userId && s.userId !== user.id).map((s) => ({ userId: s.userId, name: s.businessName, role: t("role.supplier") })),
    ...partners.filter((p) => p.userId && p.userId !== user.id).map((p) => ({ userId: p.userId, name: p.companyName, role: t("role.partner") })),
  ];

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={t("title")}
      sub={unread ? t("waiting", { count: unread }) : t("sub")}
      actions={
        <>
          <MoreActions>
            <PillLink href="/home/inbox/auto-replies" icon="clock">{t("autoReplies")}</PillLink>
            <PillLink href="/home/inbox/chatbot" icon="sparkle">{t("chatbot")}</PillLink>
            <PillLink href="/home/inbox/settings" icon="settings">{t("settings")}</PillLink>
          </MoreActions>
          <PillLink href="/home/inbox/channels" icon="plug" tone="ink">{t("channelsOn", { count: connected.length + 2 })}</PillLink>
        </>
      }
    >
      <UnifiedInbox
        initialItems={items}
        initialRiders={riders}
        initialKey={initialKey}
        initialFilter={asSellerInboxFilter(params?.kind) ?? "all"}
        startWith={startWith}
        me={{ id: user.id, email: user.email ?? "", name: user.name ?? t("you"), phone: user.phone ?? null }}
        team={team}
        canned={canned}
        connected={connected}
        aiAvailable={hasAiProvider()}
        autoReplyOn={Boolean(settings?.autoReplyEnabled)}
        partnerContacts={contacts}
      />
    </AppPage>
  );
}
