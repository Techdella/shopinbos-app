import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PillLink } from "@/components/app-kit";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { hasAiProvider } from "@/lib/inbox/ai";
import { loadAutomation } from "@/lib/inbox/automation.server";
import { requireRole } from "@/lib/server-auth";
import { AutoRepliesClient } from "./AutoRepliesClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Auto-replies" };

export default async function AutoRepliesPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");
  const [settings, automation] = await Promise.all([db.inboxSettings.findUnique({ where: { storeId: store.id } }), loadAutomation(store.id)]);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Auto-replies"
      sub="Answer customers on every channel while you're busy or closed: away message, opening hours, quick replies to common questions."
      actions={
        <>
          <PillLink href="/home/inbox/chatbot" icon="sparkle">Peggy chatbot</PillLink>
          <PillLink href="/home/messages" icon="chat" tone="ink">Open inbox</PillLink>
        </>
      }
    >
      <AutoRepliesClient
        initial={{
          settings: {
            autoReplyEnabled: settings?.autoReplyEnabled ?? false,
            autoReplyMode: settings?.autoReplyMode === "peggy" ? "peggy" : "message",
            awayMessage: settings?.awayMessage ?? "",
          },
          rules: automation.autoReply,
        }}
        ready={automation.ready}
        aiAvailable={hasAiProvider()}
      />
    </SellerPage>
  );
}
