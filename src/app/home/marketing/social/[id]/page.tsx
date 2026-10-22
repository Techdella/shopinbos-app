import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getLocale, getT } from "@/lib/i18n/server";
import { intlLocale } from "@shared/i18n";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, Pill, PillLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { POST_FORMATS, channelSpec, cleanChannels, formatSize, isPostFormat, lagosDayKey, lagosTime, readResults, type PostStatus } from "@/lib/social-posts/pure";
import { ChannelBadge } from "../_kit/ChannelBadge";
import { Composer } from "../_kit/Composer";
import { composerData } from "../_kit/composer-data.server";
import { OneTapShare } from "../_kit/OneTapShare";
import { PostActionButton } from "../_kit/PostButtons";
import { STATUS_TONE } from "../_kit/PostList";
import { shareProps } from "../_kit/share.server";
import type { ComposerPost } from "../_kit/types";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("socialPosts");
  return { title: t("post.title") };
}

// One social post. Not gone out yet: the composer, to change it. Gone out: what happened on each channel (a link
// to the post on Facebook and Instagram, the reason and "Try again" when it failed, the one-tap buttons for
// WhatsApp, TikTok and X), and "Use again".

export default async function SocialPostPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("socialPosts", "common");
  const locale = await getLocale();
  const { id } = await params;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, customDomain: true } });
  if (!store) notFound();
  const post = await db.socialPost.findFirst({ where: { id, storeId: store.id } });
  if (!post) notFound();
  const back = <PillLink href="/home/marketing/social" icon="arrowLeft">{t("back")}</PillLink>;
  const channels = cleanChannels(post.channels);

  if (post.status === "draft" || post.status === "scheduled") {
    const data = await composerData(user.id, store);
    const editing: ComposerPost = {
      id: post.id,
      caption: post.caption,
      mediaUrl: post.mediaUrl,
      mediaKind: post.mediaKind === "video" ? "video" : post.mediaUrl ? "image" : null,
      mediaSource: (post.mediaSource as ComposerPost["mediaSource"]) ?? null,
      format: isPostFormat(post.format) ? post.format : null,
      fit: post.fit === "fit" ? "fit" : "cover",
      channels,
      productId: post.productId,
      day: post.scheduledAt ? lagosDayKey(post.scheduledAt) : null,
      time: post.scheduledAt ? lagosTime(post.scheduledAt) : null,
      status: post.status,
    };
    return (
      <SellerPage user={user} store={storeSummary(store)} title={post.status === "draft" ? t("post.draft") : t("post.edit")} actions={back}>
        <PageTip className="mb-5">{tipT("social.post")}</PageTip>
        <Composer post={editing} products={data.products} media={data.media} accounts={data.accounts} queueNext={data.queueNext} storeName={store.name} rex={data.rex} />
      </SellerPage>
    );
  }

  const results = readResults(post.results);
  const status = (post.status as PostStatus) in STATUS_TONE ? (post.status as PostStatus) : "posted";
  const format = isPostFormat(post.format) ? post.format : "square";
  const media = post.renderedUrl ?? post.mediaUrl;
  const when = post.postedAt ?? post.scheduledAt;
  const dateFmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("post.title")}
      sub={when ? dateFmt.format(when) : undefined}
      actions={
        <div className="flex flex-wrap gap-2">
          {back}
          <PillLink href={`/home/marketing/social/new?from=${post.id}`} tone="ink" icon="copy">{t("post.again")}</PillLink>
        </div>
      }
    >
      <PageTip className="mb-5">{tipT("social.post")}</PageTip>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-5">
          <CardHead title={t("post.where")} action={<Pill tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Pill>} />
          <ul className="m-0 mt-4 grid list-none gap-3 p-0">
            {channels.map((channel) => {
              const result = results[channel];
              const label = channelSpec(channel).label;
              return (
                <li key={channel} className="flex min-w-0 flex-wrap items-center gap-3 rounded-[16px] border border-app-line p-3">
                  <ChannelBadge channel={channel} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-extrabold">{label}</div>
                    <div className="text-[13px] text-app-ink-soft">
                      {result?.status === "posted" && t("res.posted")}
                      {result?.status === "waiting" && t("res.waiting")}
                      {result?.status === "failed" && <span className="text-app-danger">{result.error}</span>}
                      {result?.status === "ready" && t("res.ready")}
                      {result?.status === "shared" && t("res.shared")}
                      {!result && t("res.pending")}
                    </div>
                  </div>
                  {result?.status === "posted" && result.url && (
                    <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-bold text-app-ink no-underline">
                      {t("res.view", { channel: label })}
                      <Icon name="arrow" size={14} />
                    </a>
                  )}
                  {result?.status === "failed" && result.reconnect && <PillLink href="/home/marketing/social/accounts" size="sm">{t("res.reconnect")}</PillLink>}
                  {(result?.status === "ready" || result?.status === "shared") && <OneTapShare {...shareProps(post, channel)} />}
                </li>
              );
            })}
          </ul>
          {(status === "failed" || status === "partial") && (
            <div className="mt-4">
              <PostActionButton postId={post.id} action="retry" tone="ink" />
            </div>
          )}
        </Card>

        <Card className="p-4">
          {media && (
            <div className="relative w-full overflow-hidden rounded-[14px] bg-app-canvas" style={{ aspectRatio: `${POST_FORMATS[format].width} / ${POST_FORMATS[format].height}` }}>
              {post.mediaKind === "video" ? (
                <video src={media} controls playsInline className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
            </div>
          )}
          <div className="mt-2 font-mono text-[11.5px] text-app-ink-soft">{t(`fmt.${format}`)} · {formatSize(format)}</div>
          <p className="mb-0 mt-3 whitespace-pre-line break-words text-[14px] leading-[1.55]">{post.caption || t("list.noCaption")}</p>
        </Card>
      </div>
    </SellerPage>
  );
}
