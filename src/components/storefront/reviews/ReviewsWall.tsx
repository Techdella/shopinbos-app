import type { ReviewSummary } from "@/lib/reviews/pure";
import type { WallReview } from "@/lib/reviews/storefront";

// The store's public reviews wall (/s/[slug]/reviews and /reviews on a custom domain). Plain and neutral so
// it sits well next to any store theme.

function Stars({ rating, size = 15 }: { rating: number | null; size?: number }) {
  if (!rating) return null;
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} style={{ color: "#E8A23A", fontSize: size, letterSpacing: 1 }}>
      {"★".repeat(rating)}<span style={{ color: "#D9D5E0" }}>{"★".repeat(5 - rating)}</span>
    </span>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

export function ReviewsWall({ store, reviews, summary, basePath, page, pageSize = 30 }: { store: { name: string; logoUrl: string | null }; reviews: WallReview[]; summary: ReviewSummary; basePath: string; page: number; pageSize?: number }) {
  const shown = reviews.slice((page - 1) * pageSize, page * pageSize);
  const pages = Math.max(1, Math.ceil(reviews.length / pageSize));
  const home = basePath || "/";
  return (
    <main className="min-h-screen bg-[#FAF8F5] px-4 py-8 text-[#16141F] sm:px-8 lg:px-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <a href={home} className="flex items-center gap-3 text-inherit no-underline">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
          ) : null}
          <span className="text-[18px] font-semibold">{store.name}</span>
        </a>
        <a href={home} className="inline-flex min-h-[44px] items-center rounded-full bg-[#16141F] px-5 text-[14px] font-semibold text-white no-underline">Shop now</a>
      </header>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="h-fit rounded-[20px] border border-black/10 bg-white p-6 lg:sticky lg:top-6">
          <h1 className="m-0 text-[24px] font-semibold">What customers say</h1>
          {summary.count ? (
            <>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-[48px] font-semibold leading-none">{summary.rated ? summary.average.toFixed(1) : "–"}</span>
                <Stars rating={summary.rated ? Math.round(summary.average) : null} size={20} />
              </div>
              <p className="m-0 mt-1 text-[14px] opacity-70">{summary.count} {summary.count === 1 ? "review" : "reviews"}</p>
              <ul className="m-0 mt-4 grid list-none gap-1.5 p-0">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = summary.distribution[star - 1];
                  const pct = summary.rated ? Math.round((count / summary.rated) * 100) : 0;
                  return (
                    <li key={star} className="flex items-center gap-2 text-[13px]">
                      <span className="w-7">{star} ★</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/10"><span className="block h-full rounded-full bg-[#E8A23A]" style={{ width: `${pct}%` }} /></span>
                      <span className="w-8 text-right opacity-70">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="m-0 mt-3 text-[15px] opacity-70">No reviews yet.</p>
          )}
        </div>

        <div>
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 2xl:grid-cols-3">
            {shown.map((review) => (
              <li key={review.key} className="flex flex-col rounded-[20px] border border-black/10 bg-white p-5">
                <div className="flex items-center gap-3">
                  {review.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={review.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full bg-black/[0.06] text-[15px] font-semibold">{review.name.charAt(0)}</span>
                  )}
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[15px] font-semibold">{review.name}</p>
                    <p className="m-0 text-[12.5px] opacity-65">
                      {review.verifiedBuyer ? "Verified buyer · " : ""}{review.imported ? `From ${review.source} · ` : ""}{day(review.date)}
                    </p>
                  </div>
                </div>
                <div className="mt-3"><Stars rating={review.rating} /></div>
                {review.title ? <h2 className="m-0 mt-2 text-[15px] font-semibold">{review.title}</h2> : null}
                {review.body ? <p className="m-0 mt-1.5 whitespace-pre-line text-[14.5px] leading-[1.6]">{review.body}</p> : null}
                {review.images.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.images.slice(0, 4).map((src, index) => (
                      <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`Photo ${index + 1} from ${review.name}`} className="h-20 w-20 rounded-[12px] object-cover" loading="lazy" />
                      </a>
                    ))}
                  </div>
                ) : null}
                {review.product ? <a href={`${basePath}/product/${review.product.id}`} className="mt-3 text-[13px] font-semibold text-inherit underline-offset-2">{review.product.name}</a> : null}
                {review.reply ? (
                  <div className="mt-3 rounded-[14px] bg-black/[0.04] px-3 py-2.5 text-[13.5px] leading-[1.5]"><strong>{store.name}:</strong> {review.reply}</div>
                ) : null}
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3 text-[14px]">
              <span className="opacity-70">Page {page} of {pages}</span>
              <span className="flex gap-2">
                {page > 1 ? <a href={`?page=${page - 1}`} className="inline-flex min-h-[44px] items-center rounded-full border border-black/15 px-4 text-inherit no-underline">Previous</a> : null}
                {page < pages ? <a href={`?page=${page + 1}`} className="inline-flex min-h-[44px] items-center rounded-full border border-black/15 px-4 text-inherit no-underline">Next</a> : null}
              </span>
            </nav>
          ) : null}
        </div>
      </section>
    </main>
  );
}
