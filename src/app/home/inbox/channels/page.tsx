import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PillLink } from "@/components/app-kit";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { channelViews, platformReadiness } from "@/lib/inbox/connect";
import { requireRole } from "@/lib/server-auth";
import { ChannelsClient } from "./ChannelsClient";
import { ConnectAccounts } from "@/app/channels/ConnectAccounts";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("inbox");
  return { title: t("ch.title") };
}

export default async function InboxChannelsPage() {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("inbox");
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
      title={t("ch.title")}
      sub={t("ch.sub")}
      actions={<PillLink href="/home/messages" icon="chat" tone="ink">{t("ch.openInbox")}</PillLink>}
    >
      <PageTip className="mb-5">{tipT("inbox.channels")}</PageTip>
      <section aria-labelledby="connect-yours" className="mb-6 grid gap-3">
        <h2 id="connect-yours" className="m-0 text-[17px] font-extrabold">{t("ch.connectYours")}</h2>
        <p className="m-0 text-[14px] text-app-ink-soft">{t("ch.connectOnce")}</p>
        <ConnectAccounts storeId={store.id} only={["whatsapp", "meta"]} next="/home/inbox/channels" columns="md:grid-cols-2" />
      </section>
      <ChannelsClient
        initial={views}
        platform={platformReadiness()}
        liveChat={{ on: Boolean(chat) && chatMode !== "whatsapp", mode: chatMode }}
        forwardCallsTo={settings?.forwardCallsTo ?? ""}
      />
    </SellerPage>
  );
}
