import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MoreActions, PillLink } from "@/components/app-kit";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { hasAiProvider } from "@/lib/inbox/ai";
import { loadAutomation } from "@/lib/inbox/automation.server";
import { requireRole } from "@/lib/server-auth";
import { AutoRepliesClient } from "./AutoRepliesClient";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("inbox");
  return { title: t("autoReplies") };
}

export default async function AutoRepliesPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("inbox");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");
  const [settings, automation] = await Promise.all([db.inboxSettings.findUnique({ where: { storeId: store.id } }), loadAutomation(store.id)]);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("autoReplies")}
      sub={t("ar.sub")}
      actions={
        <>
          <MoreActions>
            <PillLink href="/home/inbox/chatbot" icon="sparkle">{t("chatbot")}</PillLink>
          </MoreActions>
          <PillLink href="/home/messages" icon="chat" tone="ink">{t("ch.openInbox")}</PillLink>
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
