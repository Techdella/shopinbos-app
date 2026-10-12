import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PillLink } from "@/components/app-kit";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { hasAiProvider } from "@/lib/inbox/ai";
import { requireRole } from "@/lib/server-auth";
import { InboxSettingsClient } from "./InboxSettingsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox settings" };

export default async function InboxSettingsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");

  const [settings, canned, voice] = await Promise.all([
    db.inboxSettings.findUnique({ where: { storeId: store.id } }),
    db.inboxCannedReply.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true, body: true } }),
    db.inboxChannel.findUnique({ where: { storeId_channel: { storeId: store.id, channel: "voice" } }, select: { status: true } }),
  ]);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Inbox settings"
      sub="Auto-replies, the Peggy chatbot, saved replies and where calls ring."
      actions={<PillLink href="/home/messages" icon="chat" tone="ink">Open inbox</PillLink>}
    >
      <InboxSettingsClient
        initial={{
          autoReplyEnabled: settings?.autoReplyEnabled ?? false,
          autoReplyMode: settings?.autoReplyMode === "peggy" ? "peggy" : "message",
          awayMessage: settings?.awayMessage ?? "",
          forwardCallsTo: settings?.forwardCallsTo ?? "",
        }}
        canned={canned}
        aiAvailable={hasAiProvider()}
        voiceConnected={voice?.status === "connected"}
      />
    </SellerPage>
  );
}
