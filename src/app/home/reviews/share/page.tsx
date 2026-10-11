import { AppPage, Card, CardHead, EmptyState, PillLink, SplitLayout } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { publicReviews, reviewShareText, shareLinks, summarizeReviews } from "@/lib/reviews/pure";
import { loadReviews, reviewUrls } from "@/lib/reviews/server";
import { ReviewCardExport } from "../ReviewCardExport";
import { CopyField } from "../_components/CopyField";
import { ShareReview } from "../_components/ShareReview";
import { WidgetPreview } from "../_components/WidgetPreview";
import { ReviewTabs, SourcePill, Stars, reviewsContext } from "../_components/shared";

export const dynamic = "force-dynamic";

export default async function ShareReviewsPage() {
  const { user, store } = await reviewsContext();
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
      title="Share reviews"
      sub="Show what customers say on your store, your social pages and any other website."
      actions={<PillLink href={urls.wall} icon="globe">Open reviews wall</PillLink>}
    >
      <ReviewTabs active="/home/reviews/share" />
      <SplitLayout
        sideWidth="460px"
        main={
          <>
            <Card className="p-5 sm:p-6">
              <CardHead title="Your reviews wall" sub={`${summary.count} published reviews · featured ones first`} />
              <div className="mt-4 grid gap-4">
                <CopyField label="Reviews wall link" value={urls.wall} />
                <div id="wall-card" className="rounded-[18px] border border-app-line bg-white p-5">
                  <div className="text-[13px] text-app-ink-soft">What customers say about</div>
                  <div className="text-[20px] font-extrabold">{store.name}</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-[40px] font-extrabold leading-none">{summary.rated ? summary.average.toFixed(1) : "–"}</span>
                    <Stars rating={summary.rated ? Math.round(summary.average) : null} size={18} />
                  </div>
                  <div className="mt-1 text-[13px] text-app-ink-soft">{summary.count} {summary.count === 1 ? "review" : "reviews"}</div>
                </div>
                <ShareReview cardId="wall-card" text={wallText} url={urls.wall} links={shareLinks(urls.wall, wallText)} />
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <CardHead title={showcase.length ? "Featured reviews" : "Good reviews to share"} sub={showcase.length ? "Share each one as an image card." : "Feature reviews from a review's page to choose what shows first."} />
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
                <div className="mt-4"><EmptyState icon="star" title="Nothing to share yet" action={<PillLink href="/home/reviews/request" tone="accent">Ask for reviews</PillLink>}>Published reviews show up here once customers leave them.</EmptyState></div>
              )}
            </Card>
          </>
        }
        side={
          <>
            <Card className="p-5">
              <CardHead title="Reviews widget" sub="Paste this on any website (Wix, WordPress, Shopify, your blog) where the reviews should appear." />
              <div className="mt-3 grid gap-3">
                <CopyField label="Embed code" value={snippet} multiline />
                <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">Shows your average and up to 6 reviews (add ?limit=12 to the link for more). It updates on its own when you publish or hide reviews.</p>
                <div className="rounded-[18px] bg-app-canvas p-3">
                  <div className="mb-2 text-[12.5px] font-bold text-app-ink-soft">Preview</div>
                  <WidgetPreview src={urls.widget} />
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <CardHead title="Product pages" />
              <p className="m-0 mt-2 text-[13.5px] leading-[1.55]">Each product page shows its published store reviews with a form for buyers to write one (they confirm their order number and email). Pages also carry review stars for Google search results.</p>
            </Card>
          </>
        }
      />
    </AppPage>
  );
}
