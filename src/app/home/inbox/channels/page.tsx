import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PillLink } from "@/components/app-kit";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { channelViews, platformReadiness } from "@/lib/inbox/connect";
import { inboxAddress } from "@/lib/inbox/channels/email";
import { requireRole } from "@/lib/server-auth";
import { ChannelsClient } from "./ChannelsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox channels" };

export default async function InboxChannelsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");

  const [views, chat, settings] = await Promise.all([
    channelViews(store.id),
    db.liveChatConfig.findUnique({ where: { storeId: store.id }, select: { mode: true } }),
    db.inboxSettings.findUnique({ where: { storeId: store.id }, select: { forwardCallsTo: true } }),
  ]);
  const chatMode = chat?.mode ?? "contact_form";

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Inbox channels"
      sub="Connect the places your customers message you. Replies go back on the same channel, from your inbox."
      actions={<PillLink href="/home/messages" icon="chat" tone="ink">Open inbox</PillLink>}
    >
      <ChannelsClient
        initial={views}
        platform={platformReadiness()}
        inboxAddress={inboxAddress(store.slug)}
        liveChat={{ on: Boolean(chat) && chatMode !== "whatsapp", mode: chatMode }}
        forwardCallsTo={settings?.forwardCallsTo ?? ""}
      />
    </SellerPage>
  );
}
