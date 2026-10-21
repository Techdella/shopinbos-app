import { AppPage, Card, CardHead, EmptyState, PillLink, SplitLayout } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { publicReviews, reviewShareText, shareLinks, summarizeReviews } from "@/lib/reviews/pure";
import { loadReviews, reviewUrls } from "@/lib/reviews/server";
import { ReviewCardExport } from "../ReviewCardExport";
import { CopyField } from "../_components/CopyField";
import { ShareReview } from "../_components/ShareReview";
import { WidgetPreview } from "../_components/WidgetPreview";
import { ReviewTabs, SourcePill, Stars, reviewsContext } from "../_components/shared";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";

export default async function ShareReviewsPage() {
  const { user, store } = await reviewsContext();
  const tipT = await getT("tips");
  const t = await getT("reviews");
  const published = publicReviews(await loadReviews(store.id, { approvedOnly: true, take: 500 }));
  const summary = summarizeReviews(published);
  const urls = reviewUrls(store.slug);
  const wallText = summary.count ? `${summary.average.toFixed(1)} out of 5 from ${summary.count} customer reviews of ${store.name}` : `Reviews of ${store.name}`;
  const showcase = published.filter((item) => item.featured).slice(0, 6);
  const picks = showcase.length ? showcase : published.filter((item) => (item.rating ?? 0) >= 4 && (item.body || item.title).trim()).slice(0, 4);
  const snippet = `<script src="${urls.widget}" async></script>`;

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={t("shareP.title")}
      sub={t("shareP.sub")}
      actions={<PillLink href={urls.wall} icon="globe">{t("shareP.openWall")}</PillLink>}
    >
      <ReviewTabs active="/home/reviews/share" />
      <PageTip className="mb-5">{tipT("reviews.share")}</PageTip>
      <SplitLayout
        sideWidth="460px"
        main={
          <>
            <Card className="p-5 sm:p-6">
              <CardHead title={t("shareP.wall")} sub={t("shareP.wallSub", { count: summary.count })} />
              <div className="mt-4 grid gap-4">
                <CopyField label={t("shareP.wallLink")} value={urls.wall} />
                <div id="wall-card" className="rounded-[18px] border border-app-line bg-white p-5">
                  <div className="text-[13px] text-app-ink-soft">{t("shareP.whatSay")}</div>
                  <div className="text-[20px] font-extrabold">{store.name}</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-[40px] font-extrabold leading-none">{summary.rated ? summary.average.toFixed(1) : "–"}</span>
                    <Stars rating={summary.rated ? Math.round(summary.average) : null} size={18} />
                  </div>
                  <div className="mt-1 text-[13px] text-app-ink-soft">{t("shareP.reviews", { count: summary.count })}</div>
                </div>
                <ShareReview cardId="wall-card" text={wallText} url={urls.wall} links={shareLinks(urls.wall, wallText)} />
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <CardHead title={showcase.length ? t("shareP.featured") : t("shareP.good")} sub={showcase.length ? t("shareP.featuredSub") : t("shareP.goodSub")} />
              {picks.length ? (
                <ul className="m-0 mt-4 grid list-none gap-4 p-0 2xl:grid-cols-2">
                  {picks.map((item) => {
                    const text = reviewShareText(item, store.name);
                    return (
                      <li key={item.key} className="rounded-[18px] border border-app-line p-4">
                        <div id={`review-${item.id}`} className="rounded-[14px] bg-white p-2">
                          <div className="flex flex-wrap items-center gap-2"><Stars rating={item.rating} /><SourcePill item={item} /></div>
                          <p className="m-0 mt-2 whitespace-pre-line text-[15px] leading-[1.55]">{(item.body || item.title).slice(0, 400)}</p>
                          <p className="m-0 mt-2 text-[13px] font-bold">{item.authorName} <span className="font-normal text-app-ink-soft">· {store.name}</span></p>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <ShareReview cardId={`review-${item.id}`} text={text} url={urls.wall} links={shareLinks(urls.wall, text)} />
                          <div><ReviewCardExport reviewId={item.id} /></div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="mt-4"><EmptyState icon="star" title={t("shareP.nothing")} action={<PillLink href="/home/reviews/request" tone="accent">{t("tabs.ask")}</PillLink>}>{t("shareP.nothingBody")}</EmptyState></div>
              )}
            </Card>
          </>
        }
        side={
          <>
            <Card className="p-5">
              <CardHead title={t("shareP.widget")} sub={t("shareP.widgetSub")} />
              <div className="mt-3 grid gap-3">
                <CopyField label={t("shareP.embed")} value={snippet} multiline />
                <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("shareP.widgetNote")}</p>
                <div className="rounded-[18px] bg-app-canvas p-3">
                  <div className="mb-2 text-[12.5px] font-bold text-app-ink-soft">{t("shareP.preview")}</div>
                  <WidgetPreview src={urls.widget} />
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <CardHead title={t("shareP.productPages")} />
              <p className="m-0 mt-2 text-[13.5px] leading-[1.55]">{t("shareP.productPagesBody")}</p>
            </Card>
          </>
        }
      />
    </AppPage>
  );
}
