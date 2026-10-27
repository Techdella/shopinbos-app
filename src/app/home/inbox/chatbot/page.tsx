import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MoreActions, PillLink } from "@/components/app-kit";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { hasAiProvider } from "@/lib/inbox/ai";
import { loadAutomation } from "@/lib/inbox/automation.server";
import { embeddedSignupConfig } from "@/lib/inbox/channels/whatsapp";
import { channelViews, platformReadiness, type ChannelView } from "@/lib/inbox/connect";
import { requireRole } from "@/lib/server-auth";
import { ChatbotClient } from "./ChatbotClient";
import { WhatsAppPeggyClient } from "./WhatsAppPeggyClient";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("inbox");
  return { title: t("chatbot") };
}

const tabClass = (active: boolean) =>
  `inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[14px] font-bold no-underline ${active ? "bg-app-ink text-white" : "text-app-ink hover:bg-black/[0.04]"}`;

export default async function ChatbotPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("inbox");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");
  const tab = (await searchParams).tab === "whatsapp" ? "whatsapp" : "livechat";
  const [automation, liveChat] = await Promise.all([loadAutomation(store.id), db.liveChatConfig.findUnique({ where: { storeId: store.id }, select: { mode: true } }).catch(() => null)]);

  const tabs = (
    <nav aria-label={t("bot.where")} className="mb-5 inline-flex flex-wrap gap-1 rounded-full border border-app-line bg-white p-1">
      <Link href="/home/inbox/chatbot" className={tabClass(tab === "livechat")} aria-current={tab === "livechat" ? "page" : undefined}>{t("bot.storeChat")}</Link>
      <Link href="/home/inbox/chatbot?tab=whatsapp" className={tabClass(tab === "whatsapp")} aria-current={tab === "whatsapp" ? "page" : undefined}>WhatsApp</Link>
    </nav>
  );

  if (tab === "whatsapp") {
    // Each lookup falls back on its own, so one failing query can't take the whole page down.
    const [views, owner] = await Promise.all([
      channelViews(store.id).catch((error: Error) => {
        console.error("[whatsapp-page] channel views failed", error.message?.slice(0, 200));
        return [];
      }),
      db.user.findUnique({ where: { id: user.id }, select: { phone: true } }).catch(() => null),
    ]);
    const view: ChannelView = views.find((v) => v.channel === "whatsapp") ?? { channel: "whatsapp", status: "disconnected", displayName: null, account: null, connectedAt: null, lastError: null, webhookUrl: null, verifyToken: null };
    const platform = platformReadiness();
    return (
      <SellerPage
        user={user}
        store={storeSummary(store)}
        title={t("bot.waTitle")}
        sub={t("bot.waSub")}
        actions={
          <>
            <MoreActions>
              <PillLink href="/home/inbox/channels" icon="plug">{t("ar.channels")}</PillLink>
            </MoreActions>
            <PillLink href="/home/messages" icon="chat" tone="ink">{t("ch.openInbox")}</PillLink>
          </>
        }
      >
        {tabs}
        <PageTip className="mb-5">{tipT("inbox.chatbot")}</PageTip>
        <WhatsAppPeggyClient
          initialBot={automation.chatbot}
          initialView={view}
          ready={automation.ready}
          aiAvailable={hasAiProvider()}
          hoursOn={automation.autoReply.hours.enabled}
          encryptionReady={platform.encryption}
          signup={embeddedSignupConfig()}
          ownerPhone={owner?.phone ?? ""}
        />
      </SellerPage>
    );
  }

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("chatbot")}
      sub={t("bot.sub")}
      actions={
        <>
          <MoreActions>
            <PillLink href="/home/inbox/auto-replies" icon="clock">{t("autoReplies")}</PillLink>
            <PillLink href="/home/marketing/chat" icon="chat">{t("bot.widget")}</PillLink>
          </MoreActions>
        </>
      }
    >
      {tabs}
      <PageTip className="mb-5">{tipT("inbox.chatbot")}</PageTip>
      <ChatbotClient initial={automation.chatbot} hoursOn={automation.autoReply.hours.enabled} ready={automation.ready} aiAvailable={hasAiProvider()} widgetOn={Boolean(liveChat) && liveChat?.mode !== "whatsapp"} storeName={store.name} />
    </SellerPage>
  );
}
