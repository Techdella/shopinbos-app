"use client";

import { useState } from "react";
import { ProductReviewForm } from "../../reviews/ProductReviewForm";
import type { BoutiqueLook } from "../look";
import type { ProductReviewEntry } from "../BoutiqueProductView";
import { ratingBreakdown } from "./pdp-logic";

export const STAR_COLOUR = "#F2A93B";

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  const rounded = Math.round(rating);
  return (
    <span aria-hidden style={{ color: STAR_COLOUR, fontSize: size, letterSpacing: 1.5, lineHeight: 1 }}>
      {"★".repeat(rounded)}
      <span style={{ opacity: 0.3 }}>{"★".repeat(Math.max(0, 5 - rounded))}</span>
    </span>
  );
}

interface Props {
  id: string;
  title: string;
  look: BoutiqueLook;
  storeName: string;
  productId: string;
  productName: string;
  reviews: ProductReviewEntry[];
  avgRating: number;
  reviewCount: number;
  /** Store slug for the live "Write a review" form. */
  reviewSlug?: string;
  interactive: boolean;
}

/** Real reviews from customers who ordered: average, star breakdown, the reviews and (live) the review form. */
export function PdpReviews(props: Props) {
  const { look } = props;
  const t = look.tokens;
  const [all, setAll] = useState(false);
  const canWrite = props.interactive && Boolean(props.reviewSlug);
  if (!props.reviewCount && !props.reviews.length && !canWrite && props.interactive) return null;

  const shown = all ? props.reviews : props.reviews.slice(0, 4);
  const breakdown = ratingBreakdown(props.reviews);

  return (
    <section id={props.id} aria-labelledby={`${props.id}-title`} className="scroll-mt-24">
      <h2 id={`${props.id}-title`} className="bq-h mb-6 text-[26px]" style={look.headingStyle}>{props.title}</h2>
      <div className="bq-pdp2-reviews">
        <div>
          {props.reviewCount ? (
            <>
              <div className="flex items-end gap-3">
                <span className="text-[44px] font-semibold leading-none">{props.avgRating.toFixed(1)}</span>
                <span className="pb-1"><Stars rating={props.avgRating} size={18} /></span>
              </div>
              <p className="mt-2 text-[13.5px]" style={{ color: t.muted }}>From {props.reviewCount} {props.reviewCount === 1 ? "review" : "reviews"} by customers who ordered.</p>
              {props.reviews.length ? (
                <ul className="mt-4 grid gap-1.5" aria-label="Ratings breakdown">
                  {breakdown.map((row) => (
                    <li key={row.star} className="flex items-center gap-2 text-[12.5px]" style={{ color: t.muted }}>
                      <span className="w-8 shrink-0">{row.star} ★</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: look.raised }}>
                        <span className="block h-full rounded-full" style={{ width: `${row.percent}%`, background: STAR_COLOUR }} />
                      </span>
                      <span className="w-6 shrink-0 text-right">{row.count}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="text-[14.5px]" style={{ color: t.muted }}>No reviews yet. Customers can review this after their order arrives.</p>
          )}
          {canWrite ? (
            <div className="mt-5">
              <ProductReviewForm slug={props.reviewSlug!} productId={props.productId} productName={props.productName} accent={t.accent} ink={t.ink} />
            </div>
          ) : null}
        </div>
        {shown.length ? (
          <div>
            <ul className="grid gap-3">
              {shown.map((review) => (
                <li key={review.id} className="p-4" style={{ background: look.raised, borderRadius: Math.max(look.cardRadius, 6) }}>
                  <div className="flex items-center justify-between gap-2">
                    <Stars rating={review.rating} />
                    <span className="sr-only">{review.rating} out of 5</span>
                    <time className="text-[12px]" dateTime={review.createdAt} style={{ color: t.muted }}>{new Date(review.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" })}</time>
                  </div>
                  {review.title ? <p className="mt-2 text-[14px] font-semibold">{review.title}</p> : null}
                  {review.body ? <p className="mt-1 text-[14px] leading-6" style={{ color: t.muted }}>{review.body}</p> : null}
                  {review.images?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {review.images.slice(0, 4).map((src, index) => (
                        <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`Photo ${index + 1} from ${review.buyerName}`} loading="lazy" className="h-16 w-16 rounded-[10px] object-cover" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 text-[13px] font-semibold">{review.buyerName}</p>
                  {review.sellerReply ? <p className="mt-2 border-l-2 pl-3 text-[13px]" style={{ borderColor: t.accent, color: t.muted }}><strong style={{ color: t.ink }}>{props.storeName}:</strong> {review.sellerReply}</p> : null}
                </li>
              ))}
            </ul>
            {props.reviews.length > 4 && !all ? (
              <button type="button" onClick={() => setAll(true)} className="bq-btn mt-4" style={look.secondaryButton}>Show all {props.reviews.length} reviews</button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
