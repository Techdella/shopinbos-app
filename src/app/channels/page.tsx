import type { Metadata } from "next";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatNumber } from "@shared/i18n";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, EmptyState, FilterChips, PillLink, TextLink } from "@/components/app-kit";
import { ShareBar } from "@/components/growth/kit";
import { loadAnalytics } from "@/lib/analytics/load";
import { resolveRange } from "@/lib/analytics/range";
import { embeddedSignupConfig } from "@/lib/inbox/channels/whatsapp";
import { feedHealth, productLink } from "@/lib/social/server";
import { channelCards } from "@/lib/sales-channels/server";
import { COMING_SOON_PLATFORMS, PLATFORM_NAME, isOAuthPlatform } from "@/lib/sales-channels/pure";
import { naira } from "@shared/onboarding";
import { ConnectCard, SoonCard } from "./ChannelClient";
import { PostComposer } from "./PostComposer";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("social");
  return { title: t("title") };
}

// Sell everywhere: connect your accounts and start selling. One card per platform with one button ("Connect");
// once connected, "Connected ✓ · n products showing" and a small Disconnect. Platforms we can't connect yet are
// "Coming soon" with "Tell me when it's ready". Posting and per-channel results live in the "Post & share" tab.

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ tab?: string; problem?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("social", "common");
  const query = await searchParams;
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

  const tab = query.tab === "post" ? "post" : "connect";
  const tabs = (
    <FilterChips
      className="mb-5"
      items={[
        { label: t("tab.connect"), href: "/channels", active: tab === "connect" },
        { label: t("tab.post"), href: "/channels?tab=post", active: tab === "post" },
      ]}
    />
  );

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("title")} sub={t("sub")}>
      {tabs}
      {tab === "post" ? <PostAndShare store={store} /> : <ConnectTab store={store} problem={query.problem} />}
    </SellerPage>
  );
}

async function ConnectTab({ store, problem }: { store: { id: string; name: string; slug: string; customDomain: string | null }; problem?: string }) {
  const t = await getT("social", "common");
  const [{ cards, interest, saved }, health] = await Promise.all([channelCards(store.id), feedHealth(store)]);
  const signup = embeddedSignupConfig();
  const failed = isOAuthPlatform(problem) ? PLATFORM_NAME[problem] : null;

  return (
    <div className="grid gap-6">
      {!saved && <p className="m-0 rounded-[14px] bg-app-peach px-4 py-3 text-[14px]">{t("cantSave")}</p>}
      {failed && <p role="status" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger">{t("problem", { name: failed })}</p>}

      <section aria-label={t("tab.connect")} className="grid gap-3">
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <ConnectCard
              key={card.platform}
              platform={card.platform}
              name={PLATFORM_NAME[card.platform]}
              line={t(`p.${card.platform}`)}
              state={card.state}
              accountUrl={card.accountUrl}
              signup={card.platform === "whatsapp" ? signup : null}
            />
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

      <section aria-labelledby="soon-title" className="grid gap-3">
        <h2 id="soon-title" className="m-0 text-[18px] font-extrabold tracking-[-0.2px]">{t("soon.title")}</h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 xl:grid-cols-5">
          {COMING_SOON_PLATFORMS.map((platform) => (
            <SoonCard key={platform} platform={platform} name={PLATFORM_NAME[platform]} noted={interest.includes(platform)} />
          ))}
        </ul>
      </section>
    </div>
  );
}

async function PostAndShare({ store }: { store: { id: string; slug: string; customDomain: string | null } }) {
  const t = await getT("social", "common");
  const locale = await getLocale();
  const now = new Date();
  const range = resolveRange({ range: "30d" }, now);
  const [products, { report }] = await Promise.all([
    db.storeProduct.findMany({
      where: { storeId: store.id, status: "published" },
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: { id: true, name: true, retailPrice: true, images: true },
    }),
    loadAnalytics(store.id, range, now),
  ]);
  const composerProducts = products.map((product) => ({
    id: product.id,
    name: product.name,
    price: naira(product.retailPrice),
    image: product.images[0] ?? null,
    url: productLink(store, product.id),
  }));
  const channelMax = Math.max(1, ...report.channels.map((row) => row.sales));

  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <CardHead title={t("post.title")} sub={t("post.sub")} />
        <div className="mt-4">
          <PostComposer products={composerProducts} />
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <CardHead title={t("sales.title")} sub={t("sales.sub")} action={<TextLink href="/home/analytics">{t("sales.full")}</TextLink>} />
          {report.channels.length ? (
            <ul className="m-0 mt-4 grid list-none gap-4 p-0">
              {report.channels.map((row) => (
                <li key={row.key || "none"}>
                  <ShareBar label={row.label} value={t("sales.paid", { count: formatNumber(row.orders, locale), sales: naira(row.sales) })} share={row.sales / channelMax} />
                  {row.visits > 0 && <div className="mt-1 text-[12.5px] text-app-ink-soft">{t("sales.visits", { count: row.visits })}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("sales.empty")}</p>
          )}
        </Card>
        <Card className="p-5">
          <CardHead title={t("visits.title")} sub={t("visits.sub")} />
          {report.sources.length ? (
            <ul className="m-0 mt-4 grid list-none gap-2 p-0 text-[14px]">
              {report.sources.map((row) => (
                <li key={row.key || "direct"} className="flex justify-between gap-3 border-b border-app-line pb-2 last:border-0">
                  <span className="min-w-0 truncate font-bold">{row.label}</span>
                  <span className="shrink-0 text-app-ink-soft">{row.visits}</span>
                </li>
              ))}
              {report.utmCampaigns.slice(0, 6).map((row) => (
                <li key={`c-${row.key}`} className="flex justify-between gap-3 text-[13px] text-app-ink-soft">
                  <span className="min-w-0 truncate">{t("visits.campaign", { name: row.key })}</span>
                  <span className="shrink-0">{row.visits}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("visits.empty")}</p>
          )}
        </Card>
      </div>

      <AssistantNote action={<PillLink href="/home/peggy" tone="ink" size="sm">{t("askPeggy")}</PillLink>}>{t("peggyNote")}</AssistantNote>
    </div>
  );
}
