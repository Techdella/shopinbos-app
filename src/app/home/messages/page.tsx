import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { db } from "@/lib/db/client";
import { hasAiProvider } from "@/lib/inbox/ai";
import { listInbox, teamOptions } from "@/lib/inbox/queries";
import { touchSellerSeen } from "@/lib/inbox/service";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, safeQuery } from "@/lib/workspace";
import { UnifiedInbox } from "./UnifiedInbox";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox" };

// The all-in-one inbox: customer conversations from every channel (WhatsApp, Instagram, Messenger, SMS,
// email, Telegram, phone calls, live chat, contact forms) and the seller's supplier and delivery-partner chats.

export default async function SellerMessagesPage({ searchParams }: { searchParams?: Promise<{ c?: string; p?: string }> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");
  const store = workspace.store;

  await touchSellerSeen(store.id);
  const [items, team, canned, channels, settings, suppliers, partners] = await Promise.all([
    listInbox(store.id, user.id),
    teamOptions(store.id, { email: user.email ?? "", name: user.name ?? "You" }),
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
  const unread = items.filter((item) => item.unread > 0 && item.status !== "closed").length;
  const contacts = [
    ...suppliers.filter((s) => s.userId && s.userId !== user.id).map((s) => ({ userId: s.userId, name: s.businessName, role: "Supplier" })),
    ...partners.filter((p) => p.userId && p.userId !== user.id).map((p) => ({ userId: p.userId, name: p.companyName, role: "Delivery partner" })),
  ];

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title="Inbox"
      sub={unread ? `${unread} conversation${unread === 1 ? "" : "s"} waiting for you, across every channel.` : "Every customer message in one place: WhatsApp, Instagram, Messenger, SMS, email, Telegram, calls, live chat and forms."}
      actions={
        <>
          <PillLink href="/home/inbox/auto-replies" icon="clock">Auto-replies</PillLink>
          <PillLink href="/home/inbox/chatbot" icon="sparkle">Peggy chatbot</PillLink>
          <PillLink href="/home/inbox/settings" icon="settings">Settings</PillLink>
          <PillLink href="/home/inbox/channels" icon="plug" tone="ink">Channels · {connected.length + 2} on</PillLink>
        </>
      }
    >
      <UnifiedInbox
        initialItems={items}
        initialKey={params?.c ? `c:${params.c}` : params?.p ? `p:${params.p}` : null}
        me={{ id: user.id, email: user.email ?? "", name: user.name ?? "You", phone: user.phone ?? null }}
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
