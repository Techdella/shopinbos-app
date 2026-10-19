import { livePromotionsFor } from "@/lib/pricing/promotions.server";
import { untilText } from "@shared/price-promotions";
import { cx } from "@/components/app-kit";

// The live price promotions for this kind of account (Admin › Pricing › Promotions): headline, the old and new
// prices, and when it ends. Renders nothing when there are none. Server component; the prices are already live
// through the price book, this only tells people.
export async function PromoBanner({ role, className }: { role: "seller" | "supplier" | "logistics_partner"; className?: string }) {
  const promos = await livePromotionsFor(role).catch(() => []);
  if (!promos.length) return null;
  return (
    <div className={cx("grid gap-3", className)}>
      {promos.map((promo) => (
        <section key={promo.id} aria-label={promo.headline} className="rounded-[22px] bg-app-ink p-5 text-white">
          <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-white/70">Limited time · {untilText(promo.endsAt)}</p>
          <h2 className="mb-0 mt-1.5 text-[19px] font-extrabold leading-tight">{promo.headline}</h2>
          {promo.message && <p className="mb-0 mt-1.5 text-[14px] text-white/85">{promo.message}</p>}
          {promo.changes.length > 0 && (
            <ul className="mb-0 mt-2.5 grid gap-1 pl-0 text-[14px]">
              {promo.changes.map((change) => (
                <li key={change.key} className="list-none">
                  {change.label} <s className="text-white/60">{change.from}</s> → <strong>{change.to}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
