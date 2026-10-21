import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getT } from "@/lib/i18n/server";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { EmptyState, PillLink } from "@/components/app-kit";
import { cleanChannels, isDayKey, isPostFormat, isPostChannel, lagosDayKey, lagosTime } from "@/lib/social-posts/pure";
import { isOwnImageUrl } from "@/lib/ai/images";
import { Composer } from "../_kit/Composer";
import { composerData } from "../_kit/composer-data.server";
import type { ComposerPost, PickMedia } from "../_kit/types";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("socialPosts");
  return { title: t("new.title") };
}

// Create post. Links in: ?date= (a calendar day), ?image= (a Rex picture: "Post" on Rex's image actions),
// ?video= (a reel), ?product=, ?to= (a channel), ?from= (use an earlier post again).

export default async function NewSocialPostPage({ searchParams }: { searchParams: Promise<{ date?: string; image?: string; video?: string; product?: string; to?: string; from?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("socialPosts", "common");
  const query = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, customDomain: true } });
  if (!store) {
    return (
      <SellerPage user={user} store={null} title={t("new.title")}>
        <EmptyState icon="calendar" title={t("noStore.title")} action={<PillLink href="/onboarding" tone="ink">{t("noStore.action")}</PillLink>}>{t("noStore.body")}</EmptyState>
      </SellerPage>
    );
  }
  const data = await composerData(user.id, store);
  const all: PickMedia[] = [...data.media.rex, ...data.media.reels, ...data.media.library, ...data.media.products];
  const source = query.from ? await db.socialPost.findFirst({ where: { id: query.from, storeId: store.id } }) : null;

  // A picture or reel linked in must be one of the seller's own.
  const linked: Pick<PickMedia, "url" | "kind" | "source"> | null | undefined = query.image
    ? (all.find((item) => item.url === query.image) ?? (isOwnImageUrl(query.image) ? { url: query.image, kind: "image", source: "rex" } : null))
    : query.video
      ? all.find((item) => item.source === "reel" && (item.id === query.video || item.url === query.video))
      : null;
  const product = query.product ? data.products.find((item) => item.id === query.product) : null;

  const post: ComposerPost = source
    ? {
        id: null,
        caption: source.caption,
        mediaUrl: source.mediaUrl,
        mediaKind: source.mediaKind === "video" ? "video" : source.mediaUrl ? "image" : null,
        mediaSource: (source.mediaSource as ComposerPost["mediaSource"]) ?? null,
        format: isPostFormat(source.format) ? source.format : null,
        fit: source.fit === "fit" ? "fit" : "cover",
        channels: cleanChannels(source.channels),
        productId: source.productId,
        day: null,
        time: null,
        status: "draft",
      }
    : {
        id: null,
        caption: "",
        mediaUrl: linked?.url ?? product?.image ?? null,
        mediaKind: linked?.kind ?? (product?.image ? "image" : null),
        mediaSource: linked?.source ?? (product?.image ? "product" : null),
        format: linked?.kind === "video" ? "story" : null,
        fit: "cover",
        channels: isPostChannel(query.to) ? [query.to] : [],
        productId: product?.id ?? null,
        day: isDayKey(query.date) && query.date >= lagosDayKey(new Date()) ? query.date : null,
        time: isDayKey(query.date) ? (query.date === lagosDayKey(new Date()) ? nextHalfHour() : "19:30") : null,
        status: "draft",
      };

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("new.title")} sub={t("new.sub")} actions={<PillLink href="/home/marketing/social" icon="arrowLeft">{t("back")}</PillLink>}>
      <Composer post={post} products={data.products} media={data.media} accounts={data.accounts} queueNext={data.queueNext} storeName={store.name} />
    </SellerPage>
  );
}

/** Today in Lagos: the next half hour at least 15 minutes away. */
function nextHalfHour() {
  const soon = new Date(Date.now() + 15 * 60 * 1000);
  const time = lagosTime(soon);
  const [hour, minute] = time.split(":").map(Number);
  const rounded = minute <= 30 ? `${String(hour).padStart(2, "0")}:30` : hour < 23 ? `${String(hour + 1).padStart(2, "0")}:00` : "23:45";
  return rounded;
}
