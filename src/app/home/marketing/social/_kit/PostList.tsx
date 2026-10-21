import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Pill, type Tone } from "@/components/app-kit";
import { cx } from "@/components/app-ui/cx";
import { getT } from "@/lib/i18n/server";
import { cleanChannels, readResults, readyToShare, type PostStatus } from "@/lib/social-posts/pure";
import { ChannelBadge } from "./ChannelBadge";
import { PostActionButton } from "./PostButtons";

// A post as a row (queue, posted, drafts) and its little picture. Server components.

export interface ListPost {
  id: string;
  caption: string;
  mediaUrl: string | null;
  mediaKind: string | null;
  renderedUrl: string | null;
  format: string;
  channels: string[];
  status: string;
  scheduledAt: Date | null;
  postedAt: Date | null;
  results: unknown;
}

export const STATUS_TONE: Record<PostStatus, Tone> = { draft: "muted", scheduled: "info", publishing: "info", posted: "success", partial: "warning", failed: "danger" };

export function PostThumb({ post, size = 56, className }: { post: Pick<ListPost, "mediaUrl" | "mediaKind" | "renderedUrl">; size?: number; className?: string }) {
  const url = post.renderedUrl ?? post.mediaUrl;
  if (!url) {
    return (
      <span className={cx("grid shrink-0 place-items-center rounded-[10px] bg-app-canvas text-app-ink-soft", className)} style={{ width: size, height: size }}>
        <Icon name="document" size={Math.round(size * 0.4)} />
      </span>
    );
  }
  if (post.mediaKind === "video") {
    return (
      <span className={cx("relative block shrink-0 overflow-hidden rounded-[10px] bg-app-ink", className)} style={{ width: size, height: size }}>
        <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center text-white"><Icon name="play" size={Math.round(size * 0.35)} /></span>
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" loading="lazy" className={cx("shrink-0 rounded-[10px] bg-app-canvas object-cover", className)} style={{ width: size, height: size }} />;
}

export async function PostList({ posts, when, empty }: { posts: ListPost[]; when: (date: Date) => string; empty: string }) {
  const t = await getT("socialPosts");
  if (!posts.length) return <p className="m-0 rounded-[18px] border border-app-line bg-white p-5 text-[14px] text-app-ink-soft">{empty}</p>;
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {posts.map((post) => {
        const channels = cleanChannels(post.channels);
        const results = readResults(post.results);
        const ready = readyToShare(channels, results).length;
        const status = (post.status as PostStatus) in STATUS_TONE ? (post.status as PostStatus) : "draft";
        const date = post.postedAt ?? post.scheduledAt;
        return (
          <li key={post.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-[18px] border border-app-line bg-white p-3 sm:flex-nowrap">
            <Link href={`/home/marketing/social/${post.id}`} className="flex min-w-0 flex-1 items-center gap-3 text-app-ink no-underline">
              <PostThumb post={post} />
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-bold">{date ? when(date) : t("list.noTime")}</span>
                  <Pill tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Pill>
                  {ready > 0 && <Pill tone="accent">{t("list.ready", { count: ready })}</Pill>}
                </span>
                <span className="truncate text-[13.5px] text-app-ink-soft">{post.caption || t("list.noCaption")}</span>
              </span>
              <span className="flex shrink-0 -space-x-1">
                {channels.map((channel) => (
                  <ChannelBadge key={channel} channel={channel} size={22} className={cx("ring-2 ring-white", results[channel]?.status === "failed" && "opacity-40")} />
                ))}
              </span>
            </Link>
            {status === "scheduled" && <PostActionButton postId={post.id} action="now" />}
            {(status === "failed" || status === "partial") && <PostActionButton postId={post.id} action="retry" />}
          </li>
        );
      })}
    </ul>
  );
}
