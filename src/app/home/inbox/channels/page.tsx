import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PillLink } from "@/components/app-kit";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { channelViews, platformReadiness } from "@/lib/inbox/connect";
import { embeddedSignupConfig } from "@/lib/inbox/channels/whatsapp";
import { isMetaLoginChannel, META_LOGIN_PENDING_COOKIE, metaLoginConfigured, pendingChoices } from "@/lib/inbox/meta-login";
import { requireRole } from "@/lib/server-auth";
import { ChannelsClient } from "./ChannelsClient";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("inbox");
  return { title: t("ch.title") };
}

export default async function InboxChannelsPage({ searchParams }: { searchParams: Promise<{ meta?: string; channel?: string }> }) {
  const query = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("inbox");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");

  // Back from "Connect with Facebook" with several Pages: list them (names only) so the card can ask which one.
  const pendingCookie = query.meta === "pick" ? (await cookies()).get(META_LOGIN_PENDING_COOKIE)?.value : undefined;
  const [views, chat, settings, pick] = await Promise.all([
    channelViews(store.id),
    db.liveChatConfig.findUnique({ where: { storeId: store.id }, select: { mode: true } }),
    db.inboxSettings.findUnique({ where: { storeId: store.id }, select: { forwardCallsTo: true } }),
    pendingCookie ? pendingChoices(pendingCookie, store.id).catch(() => null) : null,
  ]);
  const metaReturn = query.meta && isMetaLoginChannel(query.channel) && query.meta !== "pick" ? { channel: query.channel, result: query.meta } : null;
  const chatMode = chat?.mode ?? "contact_form";

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("ch.title")}
      sub={t("ch.sub")}
      actions={<PillLink href="/home/messages" icon="chat" tone="ink">{t("ch.openInbox")}</PillLink>}
    >
      <ChannelsClient
        initial={views}
        platform={platformReadiness()}
        liveChat={{ on: Boolean(chat) && chatMode !== "whatsapp", mode: chatMode }}
        forwardCallsTo={settings?.forwardCallsTo ?? ""}
        whatsappSignup={embeddedSignupConfig()}
        facebookLogin={metaLoginConfigured()}
        metaReturn={metaReturn}
        pick={pick}
      />
    </SellerPage>
  );
}
