import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, EmptyState, PillLink, TextLink } from "@/components/app-kit";
import { feedHealth } from "@/lib/social/server";
import { channelCards } from "@/lib/sales-channels/server";
import { MARKETPLACE_PLATFORMS, PLATFORM_NAME, isOAuthPlatform } from "@/lib/sales-channels/pure";
import { SoonCard } from "./ChannelClient";
import { ConnectAccounts } from "./ConnectAccounts";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("social");
  return { title: t("title") };
}

// Sell everywhere: the marketplaces Nigerian sellers sell on (Jumia, Konga, Jiji, Amazon, eBay, Etsy), each
// "Coming soon" with "Tell me when it's ready", and Google, which already shows the shop's products. Posting to
// Instagram, Facebook, WhatsApp and TikTok moved to Marketing > Social posts; old "Post & share" links go there.

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ tab?: string; problem?: string; connected?: string; image?: string; product?: string; to?: string }> }) {
  const query = await searchParams;
  if (query.tab === "post") {
    const params = new URLSearchParams();
    for (const key of ["image", "product", "to"] as const) if (query[key]) params.set(key, query[key]!);
    redirect(`/home/marketing/social/new${params.size ? `?${params}` : ""}`);
  }
  const user = await requireRole(["seller"], "/login");
  const t = await getT("social", "common");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, customDomain: true } });

  if (!store) {
    return (
      <SellerPage user={user} store={null} title={t("title")}>
        <EmptyState icon="globe" title={t("noStore.title")} action={<PillLink href="/onboarding" tone="ink">{t("noStore.action")}</PillLink>}>
          {t("noStore.body")}
        </EmptyState>
      </SellerPage>
    );
  }

  const [{ interest, saved }, health] = await Promise.all([channelCards(store.id), feedHealth(store)]);
  const failed = isOAuthPlatform(query.problem) ? PLATFORM_NAME[query.problem] : null;
  const done = !failed && isOAuthPlatform(query.connected) ? PLATFORM_NAME[query.connected] : null;

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("title")} sub={t("sub")}>
      <div className="grid gap-6">
        {!saved && <p className="m-0 rounded-[14px] bg-app-peach px-4 py-3 text-[14px]">{t("cantSave")}</p>}
        {failed && <p role="status" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger">{t("problem", { name: failed })}</p>}
        {done && <p role="status" className="m-0 rounded-[14px] bg-app-mint px-4 py-3 text-[14px] font-semibold">{t("connectedOk", { name: done })}</p>}

        <section aria-labelledby="mk-title" className="grid gap-3">
          <div>
            <h2 id="mk-title" className="m-0 text-[18px] font-extrabold tracking-[-0.2px]">{t("mk.title")}</h2>
            <p className="mb-0 mt-1 max-w-[720px] text-[13.5px] text-app-ink-soft">{t("mk.sub")}</p>
          </div>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[420px]:grid-cols-2 lg:grid-cols-3">
            {MARKETPLACE_PLATFORMS.map((platform) => (
              <SoonCard key={platform} platform={platform} name={PLATFORM_NAME[platform]} line={t(`mk.${platform}`)} noted={interest.includes(platform)} />
            ))}
          </ul>
          <p className="m-0 text-[13.5px] text-app-ink-soft">
            {t("ready", { count: health.listed })}
            {health.skipped.length > 0 && (
              <>
                {" · "}
                <TextLink href="/products">{t("fix", { count: health.skipped.length })}</TextLink>
              </>
            )}
          </p>
        </section>

        <section aria-labelledby="live-title" className="grid gap-3">
          <div>
            <h2 id="live-title" className="m-0 text-[18px] font-extrabold tracking-[-0.2px]">{t("live.title")}</h2>
            <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">{t("live.sub")}</p>
          </div>
          {/* TikTok only shows for a store that linked it before (src/lib/sales-channels/server.ts), so it can disconnect. */}
          <ConnectAccounts storeId={store.id} only={["google", "tiktok"]} columns="sm:grid-cols-2 xl:grid-cols-3" />
        </section>

        <AssistantNote action={<PillLink href="/home/marketing/social" tone="ink" size="sm" icon="calendar">{t("moved.link")}</PillLink>}>{t("moved")}</AssistantNote>
      </div>
    </SellerPage>
  );
}
