import { Card, CardHead } from "@/components/app-kit";
import { BoostForm } from "@/components/plans/BoostForm";
import { getT } from "@/lib/i18n/server";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { includedFeaturedWeeksLeft, myExtras } from "@/lib/plans/extras.server";
import { boostPrices } from "@shared/platform-pricing";
import { logisticsLimits, planKeyFor } from "@shared/plans";
import { db } from "@/lib/db/client";
import { westAfricaCountries } from "@/lib/data/west-africa";

// Billing: featured weeks for a supplier (themselves and their products) or a delivery partner (per state), what's
// running now, and Supplier Pro's included weeks (src/lib/plans/extras.server.ts).
export async function BoostsCard({ userId, role }: { userId: string; role: "supplier" | "logistics_partner" }) {
  const [t, book, running] = await Promise.all([getT("payments"), getPriceBook(), myExtras(userId)]);
  const prices = boostPrices(book);
  const naira = (amount: number) => `₦${amount.toLocaleString("en-NG")}`;
  const date = (value: Date | null) => (value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(value) : "");
  const boosts = running.filter((row) => row.kind.endsWith("_boost"));

  let body: React.ReactNode;
  if (role === "supplier") {
    const [included, products] = await Promise.all([
      includedFeaturedWeeksLeft(userId),
      db.supplierProduct.findMany({ where: { supplier: { userId }, status: "published" }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, name: true } }),
    ]);
    body = (
      <div className="mt-4 grid gap-5">
        <div className="grid gap-2">
          <p className="m-0 text-[14px] text-app-ink-soft">{t("bo.supplierSub", { price: naira(prices.supplierWeek) })}</p>
          {included.included > 0 ? <p className="m-0 text-[13px] font-bold">{t("bo.included", { count: included.included })}</p> : null}
          <BoostForm kind="supplier_boost" unitPrice={prices.supplierWeek} includedLeft={included.left} />
        </div>
        {products.length ? (
          <div className="grid gap-2 border-t border-app-line pt-4">
            <p className="m-0 text-[14px] text-app-ink-soft">{t("bo.productSub", { price: naira(prices.productWeek) })}</p>
            <BoostForm kind="product_boost" unitPrice={prices.productWeek} targetLabel={t("bo.product")} targets={products.map((product) => ({ value: product.id, label: product.name }))} />
          </div>
        ) : null}
      </div>
    );
  } else {
    const user = await db.user.findUnique({ where: { id: userId }, select: { aiCredits: true } });
    const badge = logisticsLimits(planKeyFor("logistics_partner", user?.aiCredits)).featuredIncluded;
    const states = westAfricaCountries.find((country) => country.code === "NG")?.regions ?? [];
    body = (
      <div className="mt-4 grid gap-2">
        <p className="m-0 text-[14px] text-app-ink-soft">{t("bo.partnerSub", { price: naira(prices.logisticsStateWeek) })}</p>
        {badge ? <p className="m-0 text-[13px] font-bold">{t("bo.badge")}</p> : null}
        <BoostForm kind="logistics_boost" unitPrice={prices.logisticsStateWeek} targetLabel={t("bo.state")} targets={states.map((state) => ({ value: state, label: state }))} />
      </div>
    );
  }

  return (
    <Card className="p-5">
      <CardHead title={t("bo.title")} />
      {body}
      {boosts.length ? (
        <ul className="m-0 mt-4 grid list-none gap-1.5 border-t border-app-line p-0 pt-4 text-[13.5px]">
          {boosts.map((row) => (
            <li key={row.reference} className="flex flex-wrap justify-between gap-2">
              <span className="font-bold">{row.targetId && row.kind === "logistics_boost" ? row.targetId : t.dynamic(`bo.kind.${row.kind}`, row.kind)}</span>
              <span className="text-app-ink-soft">{row.startsAt && row.startsAt <= new Date() ? t("bo.running") : date(row.startsAt)} · {t("bo.until", { date: date(row.endsAt) })}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
