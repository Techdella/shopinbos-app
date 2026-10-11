import Link from "next/link";
import { notFound } from "next/navigation";
import { AppPage, Card, CardHead, Pill, PillLink, SplitLayout } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { Avatar, field, pillButton, sellerFrame } from "@/components/seller-core";
import { deleteReviewByKey, setReviewFeatured, setReviewProduct, setReviewStatus } from "@/app/actions/reviews";
import { db } from "@/lib/db/client";
import { getGoogleConnection } from "@/lib/reviews/google";
import { parseReviewKey, reviewShareText, shareLinks, sourceLabel, STATUS_LABEL } from "@/lib/reviews/pure";
import { loadReview, productNames, reviewUrls } from "@/lib/reviews/server";
import { ReviewCardExport } from "../ReviewCardExport";
import { LinkOrderForm } from "../_components/LinkOrderForm";
import { ReplyForm } from "../_components/ReplyForm";
import { ShareReview } from "../_components/ShareReview";
import { formatDay, reviewsContext, SourcePill, Stars, STATUS_TONE } from "../_components/shared";

export const dynamic = "force-dynamic";

const METHOD_TEXT = {
  form: "Left on your store by the buyer of a real order.",
  api: "Imported from your Google Business Profile. Google keeps the text in sync.",
  manual: "Imported by you. The text was pasted in, so it can't be verified by Shopinbos.",
  screenshot: "Imported by you from a screenshot. The text was read from the image and checked by you.",
} as const;

export default async function ReviewDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  const ref = parseReviewKey(key);
  if (!ref) notFound();
  const { user, store } = await reviewsContext();
  const item = await loadReview(store.id, ref.kind, ref.id);
  if (!item) notFound();

  const [products, order, google] = await Promise.all([
    productNames(store.id),
    item.orderId ? db.retailOrder.findFirst({ where: { id: item.orderId, storeId: store.id }, select: { id: true, orderNumber: true, status: true, total: true } }) : null,
    item.source === "google" ? getGoogleConnection(store.id) : null,
  ]);
  const product = item.productId ? products.get(item.productId) : null;
  const urls = reviewUrls(store.slug);
  const shareText = reviewShareText(item, store.name);
  const cardId = `review-${item.id}`;
  const googleReply = item.source === "google" && item.importMethod === "api" ? (google ? "synced" : "local") : null;

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={`Review from ${item.authorName}`}
      sub={`${sourceLabel(item.source)} · ${formatDay(item.createdAt)}`}
      actions={<PillLink href="/home/reviews" icon="arrowLeft">All reviews</PillLink>}
    >
      <SplitLayout
        main={
          <>
            {/* The review, exactly as the customer wrote it. This card is also the shareable image. */}
            <Card as="article" className="p-5 sm:p-6">
              <div id={cardId} className="rounded-[18px] bg-white p-1">
                <div className="flex items-start gap-3.5">
                  {item.authorPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.authorPhotoUrl} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <Avatar name={item.authorName} size={48} />
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="m-0 truncate text-[17px] font-extrabold">{item.authorName}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Stars rating={item.rating} size={16} />
                      <SourcePill item={item} />
                      {item.verifiedBuyer ? <Pill tone="success">Verified buyer</Pill> : null}
                    </div>
                  </div>
                </div>
                {item.title ? <h3 className="m-0 mt-4 text-[16px] font-bold">{item.title}</h3> : null}
                {item.body ? <p className="m-0 mt-2 whitespace-pre-line text-[15px] leading-[1.6]">{item.body}</p> : <p className="m-0 mt-3 text-[14px] text-app-ink-soft">Stars only, no written review.</p>}
                {product ? <p className="m-0 mt-3 text-[13px] text-app-ink-soft">About <span className="font-semibold text-app-ink">{product.name}</span> · {store.name}</p> : <p className="m-0 mt-3 text-[13px] text-app-ink-soft">{store.name}</p>}
                {item.reply ? (
                  <div className="mt-4 rounded-[16px] bg-app-mint px-4 py-3">
                    <div className="text-[12.5px] font-bold text-app-forest">Reply from {store.name}</div>
                    <p className="m-0 mt-0.5 whitespace-pre-line text-[14px] leading-[1.5]">{item.reply}</p>
                  </div>
                ) : null}
              </div>

              {item.images.length ? (
                <div className="mt-4" data-export-skip="true">
                  <h3 className="m-0 mb-2 text-[14px] font-bold">Photos</h3>
                  <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 xl:grid-cols-6">
                    {item.images.map((src, index) => (
                      <li key={src}>
                        <a href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-[14px] border border-app-line">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`Photo ${index + 1} from ${item.authorName}`} className="aspect-square w-full object-cover" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {item.sourceUrl ? (
                <p className="m-0 mt-4 text-[13px]"><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-app-accent-ink">Open on {sourceLabel(item.source)}</a></p>
              ) : null}
            </Card>

            <Card className="p-5 sm:p-6">
              <CardHead title={item.reply ? "Your reply" : "Reply"} sub={item.repliedAt ? `Last saved ${formatDay(item.repliedAt)}` : "Replies are public: they show under the review."} />
              <div className="mt-4">
                <ReplyForm reviewKey={item.key} initial={item.reply ?? ""} authorName={item.authorName} google={googleReply} />
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <CardHead title="Share this review" sub="Post it as an image or send people to your reviews wall." />
              <div className="mt-4 grid gap-3">
                <ShareReview cardId={cardId} text={shareText} url={urls.wall} links={shareLinks(urls.wall, shareText)} />
                <div><ReviewCardExport reviewId={item.id} /></div>
              </div>
            </Card>
          </>
        }
        side={
          <>
            <Card className="p-5">
              <CardHead title="On your store" sub={STATUS_LABEL[item.status]} action={<Pill tone={STATUS_TONE[item.status]} dot>{STATUS_LABEL[item.status]}</Pill>} />
              <p className="m-0 mt-2 text-[13.5px] leading-[1.5] text-app-ink-soft">
                {item.status === "approved" ? "Shown on your store, reviews wall and widget." : item.status === "pending" ? "Not shown yet. Publish it, or hide it." : "Hidden from your store, wall and widget. You can still reply and share it here."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["approved", "pending", "rejected"] as const).filter((status) => status !== item.status).map((status) => (
                  <form key={status} action={setReviewStatus}>
                    <input type="hidden" name="key" value={item.key} />
                    <input type="hidden" name="status" value={status} />
                    <button type="submit" className={status === "approved" ? pillButton.ink : pillButton.white}>
                      {status === "approved" ? <><Icon name="check" size={14} /> Publish</> : status === "pending" ? "Move to waiting" : <><Icon name="eye" size={14} /> Hide</>}
                    </button>
                  </form>
                ))}
                <form action={setReviewFeatured}>
                  <input type="hidden" name="key" value={item.key} />
                  <input type="hidden" name="featured" value={item.featured ? "0" : "1"} />
                  <button type="submit" className={item.featured ? pillButton.accent : pillButton.white} aria-pressed={item.featured}>
                    <Icon name="star" size={14} /> {item.featured ? "Featured" : "Feature on store"}
                  </button>
                </form>
              </div>
              <p className="m-0 mt-3 text-[12.5px] leading-[1.5] text-app-ink-soft">Featured reviews show first on your reviews wall and widget. Featuring publishes the review.</p>
            </Card>

            <Card className="p-5">
              <CardHead title="Details" />
              <dl className="m-0 mt-3 grid gap-3 text-[14px]">
                <div><dt className="text-[12.5px] text-app-ink-soft">Where it came from</dt><dd className="m-0 mt-0.5">{METHOD_TEXT[item.importMethod]}</dd></div>
                {item.authorEmail ? <div><dt className="text-[12.5px] text-app-ink-soft">Customer email</dt><dd className="m-0 mt-0.5 break-all">{item.authorEmail}</dd></div> : null}
                {order ? (
                  <div><dt className="text-[12.5px] text-app-ink-soft">Order</dt><dd className="m-0 mt-0.5"><Link href={`/home/orders/${order.id}`} className="font-bold text-app-accent-ink">{order.orderNumber}</Link> · {order.status}</dd></div>
                ) : null}
              </dl>

              {item.kind === "external" ? (
                <div className="mt-4 grid gap-4 border-t border-app-line pt-4">
                  <form action={setReviewProduct} className="grid gap-2">
                    <input type="hidden" name="key" value={item.key} />
                    <label htmlFor="productId" className={field.label}>Product</label>
                    <div className="flex flex-wrap gap-2">
                      <select id="productId" name="productId" defaultValue={item.productId ?? ""} className={`${field.select} min-w-[160px] flex-1`}>
                        <option value="">The whole shop</option>
                        {[...products.entries()].map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
                      </select>
                      <button type="submit" className={pillButton.white}>Save</button>
                    </div>
                  </form>
                  <LinkOrderForm reviewKey={item.key} orderNumber={order?.orderNumber ?? null} />
                </div>
              ) : null}

              <div className="mt-4 rounded-[16px] bg-app-canvas px-4 py-3 text-[13px] leading-[1.5] text-app-ink-soft">
                <span className="font-bold text-app-ink">Why can&apos;t I edit the words?</span> A review is the customer&apos;s own words, so Shopinbos never changes them. If a review is unfair, abusive or not about you, hide it and reply instead.
              </div>
            </Card>

            <Card className="p-5">
              <CardHead title="Delete" />
              <p className="m-0 mt-2 text-[13.5px] leading-[1.5] text-app-ink-soft">
                {item.kind === "store" ? "Deleting removes it for good. Hiding is usually better: you keep the record and can bring it back." : item.source === "google" && item.importMethod === "api" ? "This removes it from Shopinbos only; it stays on Google and comes back on the next import. Hide it instead to keep it off your store." : "This removes the imported copy from Shopinbos."}
              </p>
              <details className="mt-3">
                <summary className={`${pillButton.danger} w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden`}><Icon name="trash" size={14} /> Delete review</summary>
                <form action={deleteReviewByKey} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="key" value={item.key} />
                  <span className="text-[13px]">Delete for good?</span>
                  <button type="submit" className={pillButton.danger}>Yes, delete</button>
                </form>
              </details>
            </Card>
          </>
        }
      />
    </AppPage>
  );
}
