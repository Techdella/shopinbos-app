"use client";

import { useState } from "react";
import { PillButton } from "@/components/app-ui";
import { respondToReview } from "@/app/actions/reviews";
import { useToast } from "@/components/ui/Toast";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { intlLocale, type Locale } from "@shared/i18n";

interface ReviewData {
  id: string;
  rating: number;
  comment: string | null;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  reviewer: { name: string; role: string };
  booking: { pickup: string; dest: string } | null;
}

function shortDate(iso: string, locale: Locale) {
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : intlLocale(locale), { day: "numeric", month: "short", year: "numeric" });
}

export function ReviewsClient({ reviews }: { reviews: ReviewData[] }) {
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const t = useT("logistics");
  const locale = useLocale();

  async function handleReply(reviewId: string) {
    const text = replyText[reviewId]?.trim();
    if (!text) return;
    setReplying((prev) => ({ ...prev, [reviewId]: true }));
    const formData = new FormData();
    formData.set("reviewId", reviewId);
    formData.set("response", text);
    const res = await respondToReview(formData);
    setReplying((prev) => ({ ...prev, [reviewId]: false }));
    if (res.success) {
      toast(t("reviews.posted"), "success");
      setReplyText((prev) => ({ ...prev, [reviewId]: "" }));
    } else {
      toast(res.error ?? t("reviews.postFailed"), "error");
    }
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-app-line bg-white">
      <ul className="m-0 list-none divide-y divide-app-line p-0">
        {reviews.map((review) => (
          <li key={review.id} className="px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 truncate text-[15px] font-extrabold">{review.reviewer.name}</span>
              <span className="rounded-full bg-app-canvas px-2.5 py-1 text-[12px] font-bold text-app-ink-soft">{t.dynamic(`reviews.role.${review.reviewer.role}`, review.reviewer.role.replace(/_/g, " "))}</span>
              <span className="ml-auto text-[15px] text-app-ink-soft">{shortDate(review.createdAt, locale)}</span>
            </div>
            <div className="mt-1 text-[15px] tracking-[2px]" aria-label={t("reviews.outOf5", { rating: review.rating })}>
              <span className="text-[#F2A93B]">{"★".repeat(review.rating)}</span>
              <span className="text-app-track">{"★".repeat(Math.max(0, 5 - review.rating))}</span>
            </div>
            {review.comment && <p className="m-0 mt-1.5 text-[15px] leading-[1.55]">{review.comment}</p>}
            {review.booking && <p className="m-0 mt-1 text-[15px] text-app-ink-soft">{review.booking.pickup} → {review.booking.dest}</p>}

            {review.response ? (
              <div className="mt-3 rounded-[16px] bg-app-canvas px-4 py-3 text-[15px]">
                <div className="mb-0.5 text-[15px] font-bold text-app-ink-soft">{t("reviews.yourReply")}{review.respondedAt ? ` · ${shortDate(review.respondedAt, locale)}` : ""}</div>
                {review.response}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2 sm:flex-nowrap">
                <label htmlFor={`reply-${review.id}`} className="sr-only">{t("reviews.replyTo", { name: review.reviewer.name })}</label>
                <input
                  id={`reply-${review.id}`}
                  placeholder={t("reviews.placeholder")}
                  value={replyText[review.id] ?? ""}
                  onChange={(event) => setReplyText((prev) => ({ ...prev, [review.id]: event.target.value }))}
                  className="h-11 min-w-0 flex-1 basis-full rounded-full border border-app-line bg-white px-4 text-[15px] outline-none placeholder:text-app-ink-faint focus:border-app-ink sm:basis-auto"
                />
                <PillButton size="sm" className="min-h-[44px]" onClick={() => handleReply(review.id)} busy={replying[review.id]} disabled={!replyText[review.id]?.trim()}>
                  {t("reviews.reply")}
                </PillButton>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
