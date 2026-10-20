import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getT } from "@/lib/i18n/server";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, EmptyState, FilterChips, PillLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { buttonClass } from "@/components/growth/kit";
import { POST_FORMATS, POST_FORMAT_KEYS, formatForShape, formatSize } from "@/lib/social-posts/pure";
import { REX_REEL_HREF, rexImageHref } from "../_kit/links";
import { loadPostMedia } from "../_kit/media.server";
import { SocialNav } from "../_kit/SocialNav";
import type { PickMedia } from "../_kit/types";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("socialPosts");
  return { title: t("designs.title") };
}

// Rex designs: the pictures Rex made and the reels from the Video studio, ready to use in a post. "Make one" opens
// Rex at the size each kind of post needs (square and portrait posts, stories and reels, landscape).

export default async function RexDesignsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("socialPosts", "common");
  const { show } = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) {
    return (
      <SellerPage user={user} store={null} title={t("designs.title")}>
        <EmptyState icon="sparkle" title={t("noStore.title")} action={<PillLink href="/onboarding" tone="ink">{t("noStore.action")}</PillLink>}>{t("noStore.body")}</EmptyState>
      </SellerPage>
    );
  }
  const media = await loadPostMedia(user.id, store.id);
  const filter = show === "pictures" || show === "reels" ? show : "all";
  const items: PickMedia[] = filter === "pictures" ? media.rex : filter === "reels" ? media.reels : [...media.reels, ...media.rex].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("designs.title")} sub={t("designs.sub")}>
      <SocialNav active="designs" />
      <div className="grid gap-5">
        <section aria-labelledby="make-title" className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 id="make-title" className="m-0 text-[16px] font-extrabold">{t("designs.make")}</h2>
          <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">{t("designs.makeSub")}</p>
          <ul className="m-0 mt-4 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-5">
            {POST_FORMAT_KEYS.map((key) => (
              <li key={key}>
                <Link href={rexImageHref(key)} className="grid h-full gap-2 rounded-[16px] border border-app-line bg-app-canvas p-3 text-app-ink no-underline hover:border-app-ink">
                  <span className="grid h-[72px] place-items-center">
                    <span className="block rounded-[6px] border-2 border-app-ink bg-white" style={{ height: 64, aspectRatio: `${POST_FORMATS[key].width} / ${POST_FORMATS[key].height}`, maxWidth: 100 }} />
                  </span>
                  <span className="text-[14px] font-extrabold">{t(`fmt.${key}`)}</span>
                  <span className="text-[12px] text-app-ink-soft">{t(`fmt.${key}.for`)}</span>
                  <span className="font-mono text-[11px] text-app-ink-soft">{POST_FORMATS[key].ratio} · {formatSize(key)}</span>
                </Link>
              </li>
            ))}
            <li>
              <Link href={REX_REEL_HREF} className="grid h-full gap-2 rounded-[16px] border border-app-line bg-app-ink p-3 text-white no-underline hover:brightness-110">
                <span className="grid h-[72px] place-items-center"><Icon name="play" size={30} /></span>
                <span className="text-[14px] font-extrabold">{t("designs.reel")}</span>
                <span className="text-[12px] opacity-75">{t("designs.reelFor")}</span>
                <span className="font-mono text-[11px] opacity-75">9:16 · 1080 × 1920</span>
              </Link>
            </li>
          </ul>
        </section>

        <FilterChips
          items={[
            { label: t("designs.all"), href: "/home/marketing/social/designs", active: filter === "all", count: media.rex.length + media.reels.length },
            { label: t("designs.pictures"), href: "/home/marketing/social/designs?show=pictures", active: filter === "pictures", count: media.rex.length },
            { label: t("designs.reels"), href: "/home/marketing/social/designs?show=reels", active: filter === "reels", count: media.reels.length },
          ]}
        />

        {items.length ? (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => {
              const shape = item.kind === "video" ? "story" : formatForShape(item.width, item.height);
              const use = item.source === "reel" ? `/home/marketing/social/new?video=${encodeURIComponent(item.id)}` : `/home/marketing/social/new?image=${encodeURIComponent(item.url)}`;
              return (
                <li key={`${item.source}-${item.id}`} className="grid content-start gap-2 rounded-[18px] border border-app-line bg-white p-2">
                  <div className="relative overflow-hidden rounded-[12px] bg-app-canvas">
                    {item.kind === "video" ? (
                      <video src={item.url} poster={item.poster ?? undefined} muted playsInline preload="metadata" controls className="block aspect-[9/16] w-full bg-app-ink object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt={item.label ?? ""} loading="lazy" className="block aspect-square w-full object-cover" />
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">{item.kind === "video" ? t("designs.reelTag") : shape ? POST_FORMATS[shape].ratio : t("designs.picTag")}</span>
                  </div>
                  {item.label && <div className="truncate px-1 text-[12.5px] font-bold">{item.label}</div>}
                  <Link href={use} className={buttonClass("ink", "sm", "w-full")}>
                    <Icon name="send" size={14} />
                    {t("designs.use")}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="sparkle" title={t("designs.emptyTitle")} action={<PillLink href={rexImageHref("portrait")} tone="ink" icon="sparkle">{t("designs.emptyAction")}</PillLink>}>
            {t("designs.emptyBody")}
          </EmptyState>
        )}

        <AssistantNote who="rex" action={<PillLink href="/studio" size="sm">{t("designs.studio")}</PillLink>}>{t("designs.note")}</AssistantNote>
      </div>
    </SellerPage>
  );
}
