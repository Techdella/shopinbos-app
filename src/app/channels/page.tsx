import type { Metadata } from "next";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatNumber, type TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";
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
import { PostScheduler } from "./PostScheduler";
import { pagesLoginConfig } from "@/lib/meta/pages-login.server";
import { scheduledPosts, socialAccounts } from "@/lib/social/publish.server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("social");
  return { title: t("title") };
}

// Each channel: one plain action for the seller ("Show my products on …") that opens "Ask us to connect it" and
// Peggy's steps. Feed links, the private key and the Meta catalog token live behind "Show the technical details
// (for the person who manages your … account)" (simplicity rules, section 8A).
type SocialT = TFunction<MessageKey<"social"> | MessageKey<"common">>;
type Channel = { key: FeedChannel; icon: IconName; color: string; name: string; action: string; account: string; blurb: string; steps: ReactNode[]; api: boolean; note?: ReactNode };
const linkClass = "font-bold text-app-ink underline";

function channelsFor(t: SocialT): Channel[] {
  return [
    {
      key: "google",
      icon: "search",
      color: "#4285F4",
      name: "Google",
      action: t("ch.google.action"),
      account: "Google",
      blurb: t("ch.google.blurb"),
      api: false,
      steps: [
        <>{t("ch.google.step1Before")} <a href="https://merchants.google.com" target="_blank" rel="noopener noreferrer" className={linkClass}>Merchant Center</a> {t("ch.google.step1After")}</>,
        t("ch.google.step2"),
        t("ch.google.step3"),
      ],
      note: <>{t("ch.google.note")} (<TextLink href="/home/domain">{t("ch.google.domain")}</TextLink>).</>,
    },
    {
      key: "meta",
      icon: "instagram",
      color: "#E4405F",
      name: t("ch.meta.name"),
      action: t("ch.meta.action"),
      account: "Facebook",
      blurb: t("ch.meta.blurb"),
      api: true,
      steps: [
        <>{t("ch.meta.step1Before")} <a href="https://business.facebook.com/commerce" target="_blank" rel="noopener noreferrer" className={linkClass}>Commerce Manager</a>{t("ch.meta.step1After")}</>,
        t("ch.meta.step2"),
        t("ch.meta.step3"),
      ],
    },
    {
      key: "tiktok",
      icon: "tiktok",
      color: "#111111",
      name: "TikTok",
      action: t("ch.tiktok.action"),
      account: "TikTok",
      blurb: t("ch.tiktok.blurb"),
      api: false,
      steps: [
        <>{t("ch.tiktok.step1Before")} <a href="https://ads.tiktok.com" target="_blank" rel="noopener noreferrer" className={linkClass}>TikTok Ads Manager</a>{t("ch.tiktok.step1After")}</>,
        t("ch.tiktok.step2"),
        t("ch.tiktok.step3"),
      ],
      note: t("ch.tiktok.note"),
    },
    {
      key: "whatsapp",
      icon: "whatsapp",
      color: "#25D366",
      name: "WhatsApp",
      action: t("ch.whatsapp.action"),
      account: "WhatsApp Business",
      blurb: t("ch.whatsapp.blurb"),
      api: true,
      steps: [t("ch.whatsapp.step1"), t("ch.whatsapp.step2"), t("ch.whatsapp.step3")],
    },
  ];
}

type PlainStatus = "notSetUp" | "needsHelp" | "connected" | "showing" | "stale" | "waiting";

/** What the card says, in plain words, from what we know (src/lib/social/status.ts has the technical label). */
function plainStatus(tone: string, facts: { hasToken: boolean; lastSyncStatus: string | null; lastFetchAt: Date | null; feedAddedAt: Date | null } | null): PlainStatus {
  if (!facts) return "notSetUp";
  if (facts.hasToken && facts.lastSyncStatus === "error") return "needsHelp";
  if (facts.hasToken) return "connected";
  if (facts.lastFetchAt) return tone === "success" ? "showing" : "stale";
  if (facts.feedAddedAt) return "waiting";
  return "notSetUp";
}

export default async function ChannelsPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("social", "common");
  const locale = await getLocale();
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

  const now = new Date();
  const range = resolveRange({ range: "30d" }, now);
  const [health, connections, products, { report }, feedKey, schedulerAccounts, schedulerPosts] = await Promise.all([
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
    // The post scheduler's tables arrive with docs/migrations/2026-10-22-social-scheduler.sql.
    socialAccounts(store.id).catch(() => []),
    scheduledPosts(store.id).catch(() => []),
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
  const CHANNELS = channelsFor(t);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("title")}
      sub={t("sub")}
      actions={<PillLink href="/home/analytics" icon="chart">{t("analytics")}</PillLink>}
    >
      <div className="grid gap-5">
        {connections === null && (
          <p className="m-0 rounded-[14px] bg-app-peach px-4 py-3 text-[14px]">{t("cantSave")}</p>
        )}

        <section aria-labelledby="catalogs-title" className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="catalogs-title" className="m-0 text-[20px] font-extrabold tracking-[-0.3px]">{t("catalogs.title")}</h2>
              <p className="mb-0 mt-1 text-[15px] text-app-ink-soft">{t("catalogs.sub")}</p>
            </div>
            <Pill tone={health.listed ? "success" : "warning"} dot>{t("catalogs.ready", { count: health.listed })}</Pill>
          </div>

          <ul className="m-0 grid list-none gap-4 p-0 lg:grid-cols-2">
            {CHANNELS.map((channel) => {
              const connection = byChannel.get(channel.key) ?? null;
              const facts = connection
                ? { feedAddedAt: connection.feedAddedAt, lastFetchAt: connection.lastFetchAt, hasToken: Boolean(connection.tokenEnc), lastSyncAt: connection.lastSyncAt, lastSyncStatus: connection.lastSyncStatus }
                : null;
              const status = channelStatus(facts, now);
              const plain = plainStatus(status.tone, facts);
              const statusLabel = t(`status.${plain}`);
              const working = plain === "connected" || plain === "showing";
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
                      description={t("help.desc", { account: channel.account })}
                      feature={`channel_${channel.key}`}
                      softwareQuestion={t("help.question", { account: channel.account })}
                      softwarePlaceholder={t("help.placeholder")}
                    />
                    <Fold summary={t("help.diy")}>
                      <ol className="m-0 grid gap-1.5 pl-5 text-[14px] leading-[1.5]">
                        {channel.steps.map((step, index) => <li key={index}>{step}</li>)}
                      </ol>
                      <p className="mb-0 mt-2 text-[13px] leading-[1.5] text-app-ink-soft">{t("help.linkBelow")}</p>
                      {channel.note && <p className="mb-0 mt-2 text-[13px] leading-[1.5] text-app-ink-soft">{channel.note}</p>}
                    </Fold>
                  </ChannelAction>

                  <TechFold forWho={t("forWho", { account: channel.account })}>
                    <div className="grid min-w-0 gap-3">
                      <div className="min-w-0">
                        <div className="mb-1.5 text-[13px] font-bold">{t("feed.url")} <span className="font-normal text-app-ink-soft">{t("feed.private")}</span></div>
                        {feedUrlFor ? (
                          <>
                            <CopyField value={feedUrlFor} label={t("feed.label", { channel: FEED_CHANNEL_LABEL[channel.key] })} />
                            <p className="mb-0 mt-1.5 text-[12.5px] text-app-ink-soft">
                              {channel.key === "whatsapp" ? (
                                <>{t("feed.metaFormat")} <Link href="/home/inbox/whatsapp-catalog" className="font-bold text-app-ink underline">{t("feed.waCatalog")}</Link>.{" "}</>
                              ) : (
                                <>{t("feed.alsoAs")} <a href={channelFeedUrl(channel.key, alt)!} target="_blank" rel="noopener noreferrer" className="font-bold text-app-ink underline">{alt}</a>.{" "}</>
                              )}
                              <a href={feedUrlFor} target="_blank" rel="noopener noreferrer" className="font-bold text-app-ink underline">{t("feed.preview")}</a>
                            </p>
                          </>
                        ) : (
                          <p className="m-0 text-[13px] text-app-ink-soft">{t("feed.off")}</p>
                        )}
                      </div>
                      <p className="m-0 rounded-[12px] bg-[#FDF0D5] px-3 py-2 text-[12.5px] leading-[1.5] text-[#5C3D00]">
                        <b>{FEED_KEY_NOTICE}</b> {t("feed.keyPrivate")}{" "}
                        <Link href="/home/inbox/whatsapp-catalog" className="font-bold text-[#5C3D00] underline">{t("feed.changeKey")}</Link> {t("feed.ifLeaked")}
                      </p>
                      <p className="m-0 text-[12.5px] text-app-ink-soft">{t("feed.status", { status: status.label })}</p>
                      {connection?.lastSyncMessage && <p className="m-0 break-words text-[12.5px] leading-[1.45] text-app-ink-soft">{connection.lastSyncMessage}</p>}

                      <div className="flex flex-wrap items-center gap-2">
                        {connections !== null && (
                          <form action={setFeedAdded}>
                            <input type="hidden" name="channel" value={channel.key} />
                            <input type="hidden" name="added" value={connection?.feedAddedAt ? "0" : "1"} />
                            <button type="submit" className={buttonClass("white", "sm")}>
                              {connection?.feedAddedAt ? t("feed.undoAdded") : t("feed.added")}
                            </button>
                          </form>
                        )}
                        {channel.api && connection?.tokenEnc && (
                          <form action={disconnectChannel}>
                            <input type="hidden" name="channel" value={channel.key} />
                            <button type="submit" className={buttonClass("danger", "sm")}>{t("api.disconnect")}</button>
                          </form>
                        )}
                      </div>

                      {channel.api && connections !== null && (channel.key === "meta" || channel.key === "whatsapp") && (
                        <div className="grid gap-3 border-t border-app-line pt-3">
                          <div className="text-[14px] font-bold">{t("api.title")} <span className="text-[12.5px] font-normal text-app-ink-soft">{t("api.optional")}</span></div>
                          {connection?.tokenEnc ? (
                            <>
                              <p className="m-0 text-[13px] text-app-ink-soft">{t("api.connected", { id: connection.externalId ?? "" })}</p>
                              <SyncButton channel={channel.key} />
                            </>
                          ) : (
                            <>
                              <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">
                                {t("api.how")}
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
            title={t("health.title")}
            sub={t("health.sub", { listed: health.listed, outOfStock: health.outOfStock, drafts: health.drafts })}
            action={<TextLink href="/products">{t("health.products")}</TextLink>}
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
            <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{health.listed ? t("health.allGood") : t("health.empty")}</p>
          )}
        </Card>

        <Card className="p-5">
          <CardHead title={t("sched.title")} sub={t("sched.sub")} />
          <div className="mt-4">
            <PostScheduler config={pagesLoginConfig()} products={composerProducts} initialAccounts={schedulerAccounts} initialPosts={schedulerPosts} />
          </div>
        </Card>

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

        <AssistantNote action={<PillLink href="/home/peggy" tone="ink" size="sm">{t("askPeggy")}</PillLink>}>
          {t("peggyNote")}
        </AssistantNote>
      </div>
    </SellerPage>
  );
}
