"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { boolSetting, intSetting, safeCity, safeFirstName, str } from "./block-logic";
import { SampleLabel, useReducedMotion, type BlockContext } from "./shared";

interface Card {
  key: string;
  rating: number;
  body: string;
  name: string;
  detail: string;
  verified: boolean;
}

/** The cards to show: approved product reviews; the seller's own testimonials only while there are none. */
export function reviewCards(ctx: Pick<BlockContext, "shopper" | "settings" | "items">, limit: number): Card[] {
  const real = ctx.shopper.reviews.map((review) => ({ key: review.id, rating: review.rating, body: review.body, name: review.buyerName, detail: review.productName ?? "", verified: true }));
  if (real.length) return real.slice(0, limit);
  if (!boolSetting(ctx.settings.useTestimonials, true)) return [];
  return ctx.items
    .map((item, index) => ({ key: `t${index}`, rating: Math.min(5, Math.max(1, Number(item.rating) || 5)), body: str(item.quote), name: safeFirstName(item.person), detail: safeCity(item.city), verified: false }))
    .filter((card) => card.body)
    .slice(0, limit);
}

/** Review carousel: real reviews in a swipeable row with arrows; optional gentle auto-advance (never for reduced motion). */
export function ReviewCarousel({ ctx }: { ctx: BlockContext }) {
  const { copy, settings, look, shopper, headingId } = ctx;
  const t = look.tokens;
  const track = useRef<HTMLUListElement>(null);
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  let cards = reviewCards(ctx, intSetting(settings.limit, 2, 12, 8));
  const sample = ctx.editor && !cards.length;
  if (sample) {
    cards = [
      { key: "s1", rating: 5, body: "Your customers' reviews show here once they review their orders.", name: "Customer", detail: "", verified: false },
      { key: "s2", rating: 5, body: "Until then you can add testimonials customers sent you, in the panel on the right.", name: "Customer", detail: "", verified: false },
      { key: "s3", rating: 5, body: "Made-up reviews are never shown to shoppers.", name: "Customer", detail: "", verified: false },
    ];
  }
  const autoplay = boolSetting(settings.autoplay, false) && !reduced && !paused && cards.length > 1 && ctx.live;

  const step = (direction: number) => {
    const node = track.current;
    if (!node) return;
    const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 4;
    if (direction > 0 && atEnd) node.scrollTo({ left: 0, behavior: reduced ? "auto" : "smooth" });
    else node.scrollBy({ left: direction * Math.max(260, node.clientWidth * 0.8), behavior: reduced ? "auto" : "smooth" });
  };
  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setInterval(() => step(1), 6000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay]);

  if (!cards.length) return null;
  const title = str(copy.title) || "Loved by our customers";
  return (
    <section aria-labelledby={headingId} aria-roledescription="carousel" className="bq-wrap py-12" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
      <style>{`.bqb-rev{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:4px}.bqb-rev::-webkit-scrollbar{display:none}.bqb-rev > li{flex:0 0 85%;scroll-snap-align:start}@container bq (min-width:760px){.bqb-rev > li{flex-basis:calc((100% - 28px)/3)}}`}</style>
      {sample ? <SampleLabel look={look} /> : null}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 id={headingId} className="bq-h text-[26px] @3xl:text-[30px]" style={look.headingStyle}>{title}</h2>
          {shopper.rating && !sample ? <p className="m-0 mt-1.5 text-[13.5px]" style={{ color: t.muted }}><span aria-hidden style={{ color: "#F2A93B" }}>★</span> {shopper.rating.average.toFixed(1)} from {shopper.rating.count} {shopper.rating.count === 1 ? "review" : "reviews"}</p> : null}
        </div>
        {cards.length > 1 ? (
          <div className="flex shrink-0 gap-2">
            <button type="button" className="bq-icon-btn border" style={{ borderColor: t.border }} onClick={() => step(-1)} aria-label="Previous reviews"><Icon name="arrowLeft" size={16} /></button>
            <button type="button" className="bq-icon-btn border" style={{ borderColor: t.border }} onClick={() => step(1)} aria-label="More reviews"><Icon name="chevRight" size={16} /></button>
          </div>
        ) : null}
      </div>
      <ul ref={track} className="bqb-rev m-0 list-none p-0" tabIndex={0} aria-label={`${title}. Swipe or use the arrows for more.`}>
        {cards.map((card, index) => (
          <li key={card.key} aria-roledescription="slide" aria-label={`${index + 1} of ${cards.length}`} className="flex flex-col rounded-[14px] p-5" style={{ background: look.raised, borderRadius: Math.max(look.cardRadius, 6) }}>
            <span aria-hidden style={{ color: "#F2A93B", letterSpacing: 1.5 }}>{"★".repeat(card.rating)}</span>
            <span className="sr-only">{card.rating} out of 5</span>
            <blockquote className="m-0 mt-2 flex-1 text-[15px] leading-6">“{card.body}”</blockquote>
            <p className="m-0 mt-4 text-[13.5px] font-semibold">
              {card.name || "Customer"}
              {card.detail ? <span className="font-normal" style={{ color: t.muted }}> · {card.detail}</span> : null}
            </p>
            {card.verified ? <p className="m-0 mt-1 inline-flex items-center gap-1 text-[12px]" style={{ color: t.muted }}><Icon name="checkCircle" size={13} /> Verified order</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
