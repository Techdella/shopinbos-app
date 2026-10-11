import type { Metadata } from "next";
import type { ReactNode } from "react";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, EmptyState, Pill, PillLink, TextLink } from "@/components/app-kit";
import { ShareBar, buttonClass } from "@/components/growth/kit";
import { Icon, type IconName } from "@/components/ui/Icon";
import { hasCredentialKey } from "@/lib/inbox/crypto";
import { loadAnalytics } from "@/lib/analytics/load";
import { resolveRange } from "@/lib/analytics/range";
import { FEED_CHANNEL_LABEL, type FeedChannel } from "@/lib/social/feeds";
import { feedHealth, feedUrl, getConnections, productLink } from "@/lib/social/server";
import { channelStatus } from "@/lib/social/status";
import { naira } from "@shared/onboarding";
import { setFeedAdded, disconnectChannel } from "./actions";
import { CopyField, MetaConnectForm, SyncButton } from "./ChannelClient";
import { PostComposer } from "./PostComposer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sell everywhere" };

const CHANNELS: Array<{ key: FeedChannel; icon: IconName; color: string; blurb: string; steps: ReactNode[]; api: boolean; note?: ReactNode }> = [
  {
    key: "google",
    icon: "search",
    color: "#4285F4",
    blurb: "Free product listings and Shopping ads on Google Search, Images and YouTube.",
    api: false,
    steps: [
      <>Open <a href="https://merchants.google.com" target="_blank" rel="noopener noreferrer" className="font-bold text-app-ink underline">Merchant Center</a> and go to Products, then Add products.</>,
      "Choose “Add products from a file”, then “Enter a link to your file”.",
      "Paste the Google feed URL and set it to fetch daily.",
    ],
    note: <>Google asks you to verify the website your product links point to. That&apos;s easiest on your own domain (<TextLink href="/home/domain">Domain</TextLink>).</>,
  },
  {
    key: "meta",
    icon: "instagram",
    color: "#E4405F",
    blurb: "One Meta catalog for your Facebook Shop, Instagram Shopping tags and catalog ads.",
    api: true,
    steps: [
      <>In <a href="https://business.facebook.com/commerce" target="_blank" rel="noopener noreferrer" className="font-bold text-app-ink underline">Commerce Manager</a>, open your catalog (or create one), then Data sources.</>,
      "Choose Data feed, then “Use a URL”, and paste the Meta feed URL.",
      "Pick a daily schedule. To tag products on Instagram, turn on Instagram Shopping for the catalog.",
    ],
  },
  {
    key: "tiktok",
    icon: "tiktok",
    color: "#111111",
    blurb: "A TikTok catalog for product links and catalog ads.",
    api: false,
    steps: [
      <>In <a href="https://ads.tiktok.com" target="_blank" rel="noopener noreferrer" className="font-bold text-app-ink underline">TikTok Ads Manager</a>, go to Assets, then Catalogs, and open or create one.</>,
      "Add products with “Data feed”, choose scheduled updates, and paste the TikTok feed URL.",
      "Set it to update daily.",
    ],
    note: "TikTok Shop checkout is only open in some countries. Where it isn't, the catalog still powers product links and catalog ads.",
  },
  {
    key: "whatsapp",
    icon: "whatsapp",
    color: "#25D366",
    blurb: "Show your products inside WhatsApp Business so customers can browse and send you a cart.",
    api: true,
    steps: [
      "WhatsApp Business uses a Meta catalog. Create one in Commerce Manager from the WhatsApp feed URL (Data feed, “Use a URL”, daily).",
      "In WhatsApp Business (app: Settings, Business tools, Catalog; or WhatsApp Manager for the API) connect that catalog to your number.",
      "Links in this feed are tagged WhatsApp, so orders from it count under WhatsApp.",
    ],
  },
];

export default async function ChannelsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, customDomain: true } });

  if (!store) {
    return (
      <SellerPage user={user} store={null} title="Sell everywhere">
        <EmptyState icon="globe" title="Set up your store first" action={<PillLink href="/onboarding" tone="ink">Start setup</PillLink>}>
          Your product feeds and share links need a store and at least one published product.
        </EmptyState>
      </SellerPage>
    );
  }

  const now = new Date();
  const range = resolveRange({ range: "30d" }, now);
  const [health, connections, products, { report }] = await Promise.all([
    feedHealth(store),
    getConnections(store.id),
    db.storeProduct.findMany({
      where: { storeId: store.id, status: "published" },
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: { id: true, name: true, retailPrice: true, images: true },
    }),
    loadAnalytics(store.id, range, now),
  ]);
  const byChannel = new Map((connections ?? []).map((row) => [row.channel, row]));
  const canStoreTokens = hasCredentialKey();
  const composerProducts = products.map((product) => ({
    id: product.id,
    name: product.name,
    price: naira(product.retailPrice),
    image: product.images[0] ?? null,
    url: productLink(store, product.id),
  }));
  const channelMax = Math.max(1, ...report.channels.map((row) => row.sales));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Sell everywhere"
      sub="List your products on Google, Facebook, Instagram, TikTok and WhatsApp, share tagged links, and see what each channel sells."
      actions={<PillLink href="/home/analytics" icon="chart">Analytics</PillLink>}
    >
      <div className="grid gap-5">
        {connections === null && (
          <p className="m-0 rounded-[14px] bg-app-peach px-4 py-3 text-[14px]">Feeds work, but saving channel settings is switched off until the workspace database is updated (docs/migrations/2026-10-12-analytics-social.sql).</p>
        )}

        <section aria-labelledby="catalogs-title" className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="catalogs-title" className="m-0 text-[20px] font-extrabold tracking-[-0.3px]">Product catalogs</h2>
              <p className="mb-0 mt-1 text-[14px] text-app-ink-soft">Each channel reads a live feed of your published products, prices, stock and photos. No keys needed.</p>
            </div>
            <Pill tone={health.listed ? "success" : "warning"} dot>{health.listed} product{health.listed === 1 ? "" : "s"} in your feeds</Pill>
          </div>

          <ul className="m-0 grid list-none gap-4 p-0 lg:grid-cols-2">
            {CHANNELS.map((channel) => {
              const connection = byChannel.get(channel.key) ?? null;
              const status = channelStatus(
                connection
                  ? { feedAddedAt: connection.feedAddedAt, lastFetchAt: connection.lastFetchAt, hasToken: Boolean(connection.tokenEnc), lastSyncAt: connection.lastSyncAt, lastSyncStatus: connection.lastSyncStatus }
                  : null,
                now,
              );
              const file = channel.key === "google" ? "google.xml" : `${channel.key}.csv`;
              const alt = channel.key === "google" ? "google.csv" : `${channel.key}.xml`;
              return (
                <li key={channel.key} id={channel.key} className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-app-line bg-white p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-white" style={{ background: channel.color }} aria-hidden="true">
                      <Icon name={channel.icon} size={22} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="m-0 text-[16px] font-extrabold">{FEED_CHANNEL_LABEL[channel.key]}</h3>
                        <Pill tone={status.tone} dot>{status.label}</Pill>
                      </div>
                      <p className="mb-0 mt-1 text-[13.5px] leading-[1.45] text-app-ink-soft">{channel.blurb}</p>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 text-[13px] font-bold">Feed URL</div>
                    <CopyField value={feedUrl(store.slug, file)} label={`${FEED_CHANNEL_LABEL[channel.key]} feed URL`} />
                    <p className="mb-0 mt-1.5 text-[12.5px] text-app-ink-soft">
                      Also as <a href={feedUrl(store.slug, alt)} target="_blank" rel="noopener noreferrer" className="font-bold text-app-ink underline">{alt}</a>.{" "}
                      <a href={feedUrl(store.slug, file)} target="_blank" rel="noopener noreferrer" className="font-bold text-app-ink underline">Preview</a>
                    </p>
                  </div>

                  <details className="group rounded-[14px] bg-app-canvas px-4 py-3">
                    <summary className="flex min-h-[32px] cursor-pointer list-none items-center justify-between gap-2 text-[14px] font-bold [&::-webkit-details-marker]:hidden">
                      How to connect
                      <Icon name="chevron" size={16} className="transition group-open:rotate-90" />
                    </summary>
                    <ol className="mb-0 mt-2 grid gap-1.5 pl-5 text-[13.5px] leading-[1.5]">
                      {channel.steps.map((step, index) => <li key={index}>{step}</li>)}
                    </ol>
                    {channel.note && <p className="mb-0 mt-2 text-[12.5px] leading-[1.5] text-app-ink-soft">{channel.note}</p>}
                  </details>

                  {connection?.lastSyncMessage && <p className="m-0 text-[12.5px] leading-[1.45] text-app-ink-soft">{connection.lastSyncMessage}</p>}

                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    {connections !== null && (
                      <form action={setFeedAdded}>
                        <input type="hidden" name="channel" value={channel.key} />
                        <input type="hidden" name="added" value={connection?.feedAddedAt ? "0" : "1"} />
                        <button type="submit" className={buttonClass(connection?.feedAddedAt ? "white" : "ink", "sm")}>
                          {connection?.feedAddedAt ? "Undo “I've added it”" : "I've added the feed"}
                        </button>
                      </form>
                    )}
                    {channel.api && connection?.tokenEnc && (
                      <form action={disconnectChannel}>
                        <input type="hidden" name="channel" value={channel.key} />
                        <button type="submit" className={buttonClass("danger", "sm")}>Disconnect API</button>
                      </form>
                    )}
                  </div>

                  {channel.api && connections !== null && (channel.key === "meta" || channel.key === "whatsapp") && (
                    <details className="group border-t border-app-line pt-3" open={Boolean(connection?.tokenEnc)}>
                      <summary className="flex min-h-[32px] cursor-pointer list-none items-center justify-between gap-2 text-[14px] font-bold [&::-webkit-details-marker]:hidden">
                        Instant sync with the Meta API <span className="text-[12.5px] font-normal text-app-ink-soft">optional</span>
                      </summary>
                      <div className="mt-3 grid gap-3">
                        {connection?.tokenEnc ? (
                          <>
                            <p className="m-0 text-[13px] text-app-ink-soft">Catalog {connection.externalId}. Sync sends every product in the feed straight away instead of waiting for the daily fetch.</p>
                            <SyncButton channel={channel.key} />
                          </>
                        ) : (
                          <>
                            <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">
                              For updates within minutes: in Meta Business Settings create a system user with access to this catalog, generate a token with catalog_management, and paste it with the catalog ID. We check it with Meta and store it encrypted.
                            </p>
                            <MetaConnectForm channel={channel.key} canStoreTokens={canStoreTokens} />
                          </>
                        )}
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <Card className="p-5">
          <CardHead
            title="Feed health"
            sub={`${health.listed} listed · ${health.outOfStock} out of stock (listed as out of stock) · ${health.drafts} draft${health.drafts === 1 ? "" : "s"} not listed`}
            action={<TextLink href="/products">Products</TextLink>}
          />
          {health.skipped.length ? (
            <ul className="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-2 2xl:grid-cols-3">
              {health.skipped.slice(0, 30).map((item) => (
                <li key={item.id} className="flex min-w-0 items-center justify-between gap-3 rounded-[14px] bg-app-canvas px-3.5 py-2.5">
                  <a href={`/products/${item.id}`} className="min-w-0 truncate text-[14px] font-bold text-app-ink no-underline hover:underline">{item.name}</a>
                  <Pill tone="warning">{item.reason}</Pill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{health.listed ? "Every published product has a price and a photo, so all of them are in your feeds." : "Publish products with a price and a photo to fill your feeds."}</p>
          )}
        </Card>

        <Card className="p-5">
          <CardHead title="Post a product" sub="Peggy writes the caption; you post it. Every link is tagged so you can see what each post sells." />
          <div className="mt-4">
            <PostComposer products={composerProducts} />
          </div>
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="p-5">
            <CardHead title="Sales by channel" sub="Paid orders, last 30 days" action={<TextLink href="/home/analytics">Full analytics</TextLink>} />
            {report.channels.length ? (
              <ul className="m-0 mt-4 grid list-none gap-4 p-0">
                {report.channels.map((row) => (
                  <li key={row.key || "none"}>
                    <ShareBar label={row.label} value={`${row.orders} paid · ${naira(row.sales)}`} share={row.sales / channelMax} />
                    {row.visits > 0 && <div className="mt-1 text-[12.5px] text-app-ink-soft">{row.visits} visit{row.visits === 1 ? "" : "s"}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">No paid orders in the last 30 days yet.</p>
            )}
          </Card>
          <Card className="p-5">
            <CardHead title="Visits by link" sub="Store visits by source and utm_campaign, last 30 days" />
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
                    <span className="min-w-0 truncate">Campaign: {row.key}</span>
                    <span className="shrink-0">{row.visits}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">Visits show up here once people open your store from a link.</p>
            )}
          </Card>
        </div>

        <AssistantNote action={<PillLink href="/home/peggy" tone="ink" size="sm">Ask Peggy</PillLink>}>
          Peggy can write a post for any product and give you its tagged link. Try “write an Instagram post for my best seller”.
        </AssistantNote>
      </div>
    </SellerPage>
  );
}
