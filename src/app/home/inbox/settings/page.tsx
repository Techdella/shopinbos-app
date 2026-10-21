import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, PillLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { hasAiProvider } from "@/lib/inbox/ai";
import { requireRole } from "@/lib/server-auth";
import { InboxSettingsClient } from "./InboxSettingsClient";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("inbox");
  return { title: t("set.title") };
}

export default async function InboxSettingsPage() {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("inbox");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");

  const [settings, canned, voice, email] = await Promise.all([
    db.inboxSettings.findUnique({ where: { storeId: store.id } }),
    db.inboxCannedReply.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true, body: true } }),
    db.inboxChannel.findUnique({ where: { storeId_channel: { storeId: store.id, channel: "voice" } }, select: { status: true } }),
    db.inboxChannel.findUnique({ where: { storeId_channel: { storeId: store.id, channel: "email" } }, select: { status: true, displayName: true } }),
  ]);
  const emailOn = email?.status === "connected";

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("set.title")}
      sub={t("set.sub")}
      actions={<PillLink href="/home/messages" icon="chat" tone="ink">{t("ch.openInbox")}</PillLink>}
    >
      <PageTip className="mb-5">{tipT("inbox.settings")}</PageTip>
      {/* Email: connect the seller's own address (Gmail or their domain) on its own page. */}
      <Card className="mb-5 flex flex-wrap items-center gap-3 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name="mail" size={19} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[16px] font-extrabold">{t("email.title")}</h2>
          <p className="mb-0 mt-0.5 break-words text-[13.5px] leading-[1.5] text-app-ink-soft">{emailOn && email?.displayName ? t("email.card.sendsFrom", { address: email.displayName }) : t("email.card.blurb")}</p>
        </div>
        <PillLink href="/home/inbox/email" tone={emailOn ? "white" : "ink"}>{emailOn ? t("email.card.manage") : t("email.card.connect")}</PillLink>
      </Card>
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
