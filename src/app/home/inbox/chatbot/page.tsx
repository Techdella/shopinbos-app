import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PillLink } from "@/components/app-kit";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { hasAiProvider } from "@/lib/inbox/ai";
import { loadAutomation } from "@/lib/inbox/automation.server";
import { requireRole } from "@/lib/server-auth";
import { ChatbotClient } from "./ChatbotClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Peggy chatbot" };

export default async function ChatbotPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");
  const [automation, liveChat] = await Promise.all([loadAutomation(store.id), db.liveChatConfig.findUnique({ where: { storeId: store.id }, select: { mode: true } }).catch(() => null)]);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Peggy chatbot"
      sub="Let Peggy answer shoppers on your store's live chat, from your own products, prices and delivery settings."
      actions={
        <>
          <PillLink href="/home/inbox/auto-replies" icon="clock">Auto-replies</PillLink>
          <PillLink href="/home/marketing/chat" icon="chat">Live chat widget</PillLink>
        </>
      }
    >
      <ChatbotClient initial={automation.chatbot} hoursOn={automation.autoReply.hours.enabled} ready={automation.ready} aiAvailable={hasAiProvider()} widgetOn={Boolean(liveChat) && liveChat?.mode !== "whatsapp"} storeName={store.name} />
    </SellerPage>
  );
}
