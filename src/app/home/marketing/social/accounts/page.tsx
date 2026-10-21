import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getT } from "@/lib/i18n/server";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, EmptyState, PillLink } from "@/components/app-kit";
import { channelCards } from "@/lib/sales-channels/server";
import { PLATFORM_NAME } from "@/lib/sales-channels/pure";
import { SoonCard } from "@/app/channels/ChannelClient";
import { ConnectAccounts } from "@/app/channels/ConnectAccounts";
import { ChannelBadge } from "../_kit/ChannelBadge";
import { SocialNav } from "../_kit/SocialNav";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("socialPosts");
  return { title: t("accounts.title") };
}

// Social posts → Accounts: one Facebook sign-in connects the Page and Instagram so posts go out by themselves (and
// their messages come to the inbox). WhatsApp Status, TikTok and X post with one tap, no sign-in. Pinterest and
// Snapchat are coming soon.

const SOON = ["pinterest", "snapchat"] as const;

export default async function SocialAccountsPage({ searchParams }: { searchParams: Promise<{ problem?: string; connected?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("socialPosts", "common");
  const query = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) {
    return (
      <SellerPage user={user} store={null} title={t("accounts.title")}>
        <EmptyState icon="users" title={t("noStore.title")} action={<PillLink href="/onboarding" tone="ink">{t("noStore.action")}</PillLink>}>{t("noStore.body")}</EmptyState>
      </SellerPage>
    );
  }
  const interest: string[] = await channelCards(store.id).then((result) => result.interest).catch(() => []);

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("accounts.title")} sub={t("accounts.sub")}>
      <SocialNav active="accounts" />
      <div className="grid gap-6">
        {query.problem === "meta" && <p role="status" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger">{t("accounts.problem")}</p>}
        {query.connected === "meta" && <p role="status" className="m-0 rounded-[14px] bg-app-mint px-4 py-3 text-[14px] font-semibold">{t("accounts.connected")}</p>}

        <section aria-labelledby="acc-auto" className="grid gap-3">
          <div>
            <h2 id="acc-auto" className="m-0 text-[18px] font-extrabold tracking-[-0.2px]">{t("accounts.auto")}</h2>
            <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">{t("accounts.autoSub")}</p>
          </div>
          <ConnectAccounts storeId={store.id} only={["meta"]} next="/home/marketing/social/accounts" columns="sm:grid-cols-2" />
          <p className="m-0 text-[13px] text-app-ink-soft">{t("accounts.reconnect")}</p>
        </section>

        <Card className="p-5">
          <CardHead title={t("accounts.tap")} sub={t("accounts.tapSub")} />
          <ul className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-3">
            {(["whatsapp", "tiktok", "x"] as const).map((channel) => (
              <li key={channel} className="flex items-start gap-3 rounded-[16px] bg-app-canvas p-3">
                <ChannelBadge channel={channel} size={32} />
                <div className="min-w-0">
                  <div className="text-[14.5px] font-extrabold">{t(`accounts.${channel}`)}</div>
                  <p className="m-0 mt-0.5 text-[13px] leading-[1.45] text-app-ink-soft">{t(`accounts.${channel}.how`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <section aria-labelledby="acc-soon" className="grid gap-3">
          <h2 id="acc-soon" className="m-0 text-[18px] font-extrabold tracking-[-0.2px]">{t("accounts.soon")}</h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
            {SOON.map((platform) => <SoonCard key={platform} platform={platform} name={PLATFORM_NAME[platform]} noted={interest.includes(platform)} />)}
          </ul>
        </section>
      </div>
    </SellerPage>
  );
}
