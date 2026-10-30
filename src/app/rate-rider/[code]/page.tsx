import type { Metadata } from "next";
import { bookingFromReviewCode, reviewTarget } from "@/lib/logistics/rider-messages.server";
import { getT } from "@/lib/i18n/server";
import { RateRiderForm } from "./RateRiderForm";

// The customer's review of their rider: the link the rider sends after the drop (/rate-rider/<job>.<signature>).
// No account needed; one rating per delivered job.

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("rider");
  return { title: t("review.metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function RateRiderPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const t = await getT("rider");
  const bookingId = bookingFromReviewCode(decodeURIComponent(code));
  const target = bookingId ? await reviewTarget(bookingId) : null;

  return (
    <main className="min-h-screen bg-paper px-4 py-12">
      <div className="mx-auto max-w-[440px] rounded-lg border border-navy/[0.06] bg-white p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-teal-deep">{t("review.eyebrow")}</p>
        {target ? (
          <>
            <h1 className="mt-2 font-display text-[26px] font-medium tracking-[-0.025em] text-navy">{t("review.title", { name: target.riderName })}</h1>
            <p className="mt-2 text-[15px] text-muted">{t("review.sub", { company: target.company })}</p>
            <RateRiderForm code={decodeURIComponent(code)} rated={target.rated} />
          </>
        ) : (
          <>
            <h1 className="mt-2 font-display text-[26px] font-medium tracking-[-0.025em] text-navy">{t("review.badTitle")}</h1>
            <p className="mt-2 text-[15px] text-muted">{t("review.badSub")}</p>
          </>
        )}
      </div>
    </main>
  );
}
