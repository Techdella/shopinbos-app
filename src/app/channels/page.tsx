import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, EmptyState, Pill, PillLink, TextLink } from "@/components/app-kit";
import { ShareBar, buttonClass } from "@/components/growth/kit";
import { Icon, type IconName } from "@/components/ui/Icon";
import { hasCredentialKey } from "@/lib/inbox/crypto";
import { loadAnalytics } from "@/lib/analytics/load";
import { resolveRange } from "@/lib/analytics/range";
import { FEED_CHANNEL_LABEL, FEED_KEY_NOTICE, type FeedChannel } from "@/lib/social/feeds";
import { feedHealth, feedUrl, getConnections, productLink } from "@/lib/social/server";
import { catalogFeedUrl, ensureCatalogRow } from "@/lib/whatsapp-catalog/server";
import { channelStatus } from "@/lib/social/status";
import { naira } from "@shared/onboarding";
import { setFeedAdded, disconnectChannel } from "./actions";
import { ChannelAction, CopyField, MetaConnectForm, SyncButton } from "./ChannelClient";
import { SetupHelpRequest } from "@/components/support/SetupHelpRequest";
import { Fold, TechFold } from "@/components/simple/Fold";
import { plainMetaError } from "@/components/simple/plain";
import { PostComposer } from "./PostComposer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sell everywhere" };

// Each channel: one plain action for the seller ("Show my products on …") that opens "Ask us to connect it" and
// Peggy's steps. Feed links, the private key and the Meta catalog token live behind "Show the technical details
// (for the person who manages your … account)" (simplicity rules, section 8A).
const CHANNELS: Array<{ key: FeedChannel; icon: IconName; color: string; name: string; action: string; account: string; blurb: string; steps: ReactNode[]; api: boolean; note?: ReactNode }> = [
  {
    key: "google",
    icon: "search",
    color: "#4285F4",
    name: "Google",
    action: "Show my products on Google",
    account: "Google",
    blurb: "Your products show up free when people search on Google.",
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
    name: "Facebook and Instagram",
    action: "Show my products on Facebook and Instagram",
    account: "Facebook",
    blurb: "Your products in your Facebook Shop and on your Instagram posts.",
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
    name: "TikTok",
    action: "Show my products on TikTok",
    account: "TikTok",
    blurb: "Product links on your TikTok videos and adverts.",
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
    name: "WhatsApp",
    action: "Show my products on WhatsApp",
    account: "WhatsApp Business",
    blurb: "Customers see your products inside WhatsApp and can send you an order.",
    api: true,
    steps: [
      "WhatsApp Business uses a Meta catalog. Create one in Commerce Manager from the WhatsApp feed URL (Data feed, “Use a URL”, daily).",
      "In WhatsApp Business (app: Settings, Business tools, Catalog; or WhatsApp Manager for the API) connect that catalog to your number.",
      "Links in this feed are tagged WhatsApp, so orders from it count under WhatsApp.",
    ],
  },
];

/** What the card says, in plain words, from what we know (src/lib/social/status.ts has the technical label). */
function plainStatus(tone: string, facts: { hasToken: boolean; lastSyncStatus: string | null; lastFetchAt: Date | null; feedAddedAt: Date | null } | null) {
  if (!facts) return "Not set up";
  if (facts.hasToken && facts.lastSyncStatus === "error") return "Needs your help";
  if (facts.hasToken) return "Connected";
  if (facts.lastFetchAt) return tone === "success" ? "Showing your products" : "Not updated for a few days";
  if (facts.feedAddedAt) return "Waiting for the first update";
  return "Not set up";
}

export default async function ChannelsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, customDomain: true } });

  if (!store) {
    return (
      <SellerPage user={user} store={null} title="Sell everywhere">
        <EmptyState icon="globe" title="Set up your shop first" action={<PillLink href="/onboarding" tone="ink">Start setup</PillLink>}>
          To show your products on other apps, you need a shop and at least one product.
        </EmptyState>
      </SellerPage>
    );
  }

  const now = new Date();
  const range = resolveRange({ range: "30d" }, now);
  const [health, connections, products, { report }, feedKey] = await Promise.all([
    feedHealth(store),
    getConnections(store.id),
    db.storeProduct.findMany({
      where: { storeId: store.id, status: "published" },
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: { id: true, name: true, retailPrice: true, images: true },
    }),
    loadAnalytics(store.id, range, now),
    // The store's private feed key (shared with the WhatsApp catalog feed; rotated there). Created on first view.
    ensureCatalogRow(store.id).then((row) => row.feedToken).catch(() => null),
  ]);
  // WhatsApp gets the catalog feed in Meta's format; the other channels their own file. All carry the key.
  const channelFeedUrl = (channel: FeedChannel, file: string) => (feedKey ? (channel === "whatsapp" ? catalogFeedUrl(store.slug, feedKey) : feedUrl(store.slug, file, feedKey)) : null);
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
      sub="Show your products on Google, Facebook, Instagram, TikTok and WhatsApp, share links, and see where your sales come from."
      actions={<PillLink href="/home/analytics" icon="chart">Analytics</PillLink>}
    >
      <div className="grid gap-5">
        {connections === null && (
          <p className="m-0 rounded-[14px] bg-app-peach px-4 py-3 text-[14px]">Your products still show where they&apos;re connected, but changes here can&apos;t be saved right now. Tap Help and we&apos;ll sort it out.</p>
        )}

        <section aria-labelledby="catalogs-title" className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="catalogs-title" className="m-0 text-[20px] font-extrabold tracking-[-0.3px]">Product catalogs</h2>
              <p className="mb-0 mt-1 text-[15px] text-app-ink-soft">Pick an app. We&apos;ll connect it for you, or Peggy shows you how. Your prices, photos and what&apos;s in stock stay up to date by themselves.</p>
            </div>
            <Pill tone={health.listed ? "success" : "warning"} dot>{health.listed} product{health.listed === 1 ? "" : "s"} ready to show</Pill>
          </div>

          <ul className="m-0 grid list-none gap-4 p-0 lg:grid-cols-2">
            {CHANNELS.map((channel) => {
              const connection = byChannel.get(channel.key) ?? null;
              const facts = connection
                ? { feedAddedAt: connection.feedAddedAt, lastFetchAt: connection.lastFetchAt, hasToken: Boolean(connection.tokenEnc), lastSyncAt: connection.lastSyncAt, lastSyncStatus: connection.lastSyncStatus }
                : null;
              const status = channelStatus(facts, now);
              const statusLabel = plainStatus(status.tone, facts);
              const working = statusLabel === "Connected" || statusLabel === "Showing your products";
              const file = channel.key === "google" ? "google.xml" : `${channel.key}.csv`;
              const alt = channel.key === "google" ? "google.csv" : `${channel.key}.xml`;
              const feedUrlFor = channelFeedUrl(channel.key, file);
              const syncFailed = Boolean(connection?.tokenEnc) && connection?.lastSyncStatus === "error";
              return (
                <li key={channel.key} id={channel.key} className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-app-line bg-white p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-white" style={{ background: channel.color }} aria-hidden="true">
                      <Icon name={channel.icon} size={22} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="m-0 text-[17px] font-extrabold">{channel.name}</h3>
                        <Pill tone={status.tone} dot>{statusLabel}</Pill>
                      </div>
                      <p className="mb-0 mt-1 text-[14.5px] leading-[1.45] text-app-ink-soft">{channel.blurb}</p>
                    </div>
                  </div>

                  {syncFailed && <p className="m-0 rounded-[12px] bg-app-danger-tint px-3 py-2 text-[14px] text-app-danger">{plainMetaError(connection?.lastSyncMessage)}</p>}

                  <ChannelAction label={channel.action} done={working}>
                    <SetupHelpRequest
                      title={channel.action}
                      description={`We'll connect your ${channel.account} account for you and message you when your products are showing.`}
                      feature={`channel_${channel.key}`}
                      softwareQuestion={`Do you already have a ${channel.account} page or account for your business?`}
                      softwarePlaceholder="Yes, it's called…"
                    />
                    <Fold summary="Or do it yourself with Peggy's steps">
                      <ol className="m-0 grid gap-1.5 pl-5 text-[14px] leading-[1.5]">
                        {channel.steps.map((step, index) => <li key={index}>{step}</li>)}
                      </ol>
                      <p className="mb-0 mt-2 text-[13px] leading-[1.5] text-app-ink-soft">The link to paste is under &quot;Show the technical details&quot; below.</p>
                      {channel.note && <p className="mb-0 mt-2 text-[13px] leading-[1.5] text-app-ink-soft">{channel.note}</p>}
                    </Fold>
                  </ChannelAction>

                  <TechFold forWho={`the person who manages your ${channel.account} account`}>
                    <div className="grid min-w-0 gap-3">
                      <div className="min-w-0">
                        <div className="mb-1.5 text-[13px] font-bold">Feed URL <span className="font-normal text-app-ink-soft">(private)</span></div>
                        {feedUrlFor ? (
                          <>
                            <CopyField value={feedUrlFor} label={`${FEED_CHANNEL_LABEL[channel.key]} feed URL`} />
                            <p className="mb-0 mt-1.5 text-[12.5px] text-app-ink-soft">
                              {channel.key === "whatsapp" ? (
                                <>In Meta&apos;s catalog format. Sync and problems are on <Link href="/home/inbox/whatsapp-catalog" className="font-bold text-app-ink underline">WhatsApp catalog</Link>.{" "}</>
                              ) : (
                                <>Also as <a href={channelFeedUrl(channel.key, alt)!} target="_blank" rel="noopener noreferrer" className="font-bold text-app-ink underline">{alt}</a>.{" "}</>
                              )}
                              <a href={feedUrlFor} target="_blank" rel="noopener noreferrer" className="font-bold text-app-ink underline">Preview</a>
                            </p>
                          </>
                        ) : (
                          <p className="m-0 text-[13px] text-app-ink-soft">Feed links are switched off until the workspace database is updated (docs/migrations/2026-10-15-whatsapp-catalog.sql).</p>
                        )}
                      </div>
                      <p className="m-0 rounded-[12px] bg-[#FDF0D5] px-3 py-2 text-[12.5px] leading-[1.5] text-[#5C3D00]">
                        <b>{FEED_KEY_NOTICE}</b> The link carries the store&apos;s private key, so keep it private.{" "}
                        <Link href="/home/inbox/whatsapp-catalog" className="font-bold text-[#5C3D00] underline">Change the key</Link> if a link has leaked.
                      </p>
                      <p className="m-0 text-[12.5px] text-app-ink-soft">Status: {status.label}.</p>
                      {connection?.lastSyncMessage && <p className="m-0 break-words text-[12.5px] leading-[1.45] text-app-ink-soft">{connection.lastSyncMessage}</p>}

                      <div className="flex flex-wrap items-center gap-2">
                        {connections !== null && (
                          <form action={setFeedAdded}>
                            <input type="hidden" name="channel" value={channel.key} />
                            <input type="hidden" name="added" value={connection?.feedAddedAt ? "0" : "1"} />
                            <button type="submit" className={buttonClass("white", "sm")}>
                              {connection?.feedAddedAt ? "Undo “I've added it”" : "I've added the feed"}
                            </button>
                          </form>
                        )}
                        {channel.api && connection?.tokenEnc && (
                          <form action={disconnectChannel}>
                            <input type="hidden" name="channel" value={channel.key} />
                            <button type="submit" className={buttonClass("danger", "sm")}>Disconnect</button>
                          </form>
                        )}
                      </div>

                      {channel.api && connections !== null && (channel.key === "meta" || channel.key === "whatsapp") && (
                        <div className="grid gap-3 border-t border-app-line pt-3">
                          <div className="text-[14px] font-bold">Faster updates with the Meta API <span className="text-[12.5px] font-normal text-app-ink-soft">optional</span></div>
                          {connection?.tokenEnc ? (
                            <>
                              <p className="m-0 text-[13px] text-app-ink-soft">Catalog {connection.externalId}. This sends every product straight away instead of waiting for the daily update.</p>
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
                      )}
                    </div>
                  </TechFold>
                </li>
              );
            })}
          </ul>
        </section>

        <Card className="p-5">
          <CardHead
            title="Products other apps can show"
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
            <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{health.listed ? "Every product has a price and a photo, so all of them can show on other apps." : "Add products with a price and a photo, and they'll show on the apps you connect."}</p>
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
            <CardHead title="Visits by link" sub="Where people came from when they opened your shop, last 30 days" />
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
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">Visits show up here once people open your shop from a link.</p>
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
