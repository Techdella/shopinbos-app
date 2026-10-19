import Link from "next/link";
import { PillLink } from "@/components/app-kit";
import { cx } from "@/components/app-ui/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { IMPORT_HOW_IT_WORKS, type FindProduct, type PeggyInsight, type TrendIdea } from "@/lib/marketplace/find";
import { ProductGrid } from "./ProductGrid";
import { Mascot } from "@/components/brand/Mascot";
import { getT } from "@/lib/i18n/server";

export type FindTab = "nigeria" | "china" | "trending";

const PROMISES = [
  { icon: "box", key: "stock" },
  { icon: "tag", key: "label" },
  { icon: "shield", key: "paid" },
] as const satisfies ReadonlyArray<{ icon: IconName; key: string }>;

type MarketT = Awaited<ReturnType<typeof getT<["marketplace"]>>>;

// Peggy's default tip comes from lib/marketplace/find in English; the default one is translated here.
function insightText(t: MarketT, insight: PeggyInsight) {
  if (insight.lead === "Start with one product you can test this week.") return { lead: t("find.insight.lead"), body: t("find.insight.body") };
  return { lead: insight.lead, body: insight.body };
}

/** /marketplace URL for a tab, keeping the search and category where they apply. */
export function findHref(tab: FindTab, extra: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  if (tab !== "nigeria") params.set("tab", tab);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const qs = params.toString();
  return qs ? `/marketplace?${qs}` : "/marketplace";
}

export interface FindProductsViewProps {
  tab: FindTab;
  /** The local tab's label: the store's country. */
  country: string;
  q: string;
  cat: string;
  categories: string[];
  products: FindProduct[];
  sampleMode: boolean;
  supplierName?: string;
  insight: PeggyInsight;
  trends: TrendIdea[];
  addedIds: string[];
  notified: boolean;
  error?: string;
  focusPhoto?: boolean;
  /** For now only suppliers near the seller show; without a city set, none do. */
  nearby?: { hasPlace: boolean; city: string | null };
}

/** Body of "Find products to sell" under the page title: tabs, search, and the active tab. */
export async function FindProductsView({ tab, country, q, cat, categories, products, sampleMode, supplierName, insight, trends, addedIds, notified, nearby }: FindProductsViewProps) {
  const t = await getT("marketplace");
  const hrefFor = findHref;
  const tip = insightText(t, insight);
  const tabs: Array<{ id: FindTab; label: string }> = [
    { id: "nigeria", label: country },
    { id: "china", label: t("find.tab.china") },
    { id: "trending", label: t("find.tab.trending") },
  ];
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav aria-label={t("find.sourceFrom")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 md:pb-0">
          {tabs.map((item) => (
            <Link
              key={item.id}
              href={hrefFor(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
              className={cx(
                "inline-flex min-h-[40px] shrink-0 items-center rounded-full border px-4 text-[14px] font-extrabold no-underline",
                tab === item.id ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
              )}
            >
              {item.label}
              {item.id === "china" ? <span className="ml-1.5 rounded-full bg-app-peach px-2 py-0.5 text-[11px] font-extrabold text-app-ink">{t("find.soon")}</span> : null}
            </Link>
          ))}
        </nav>
        <form action="/marketplace" method="get" role="search" className="flex min-h-[46px] w-full items-center gap-2 rounded-full border border-app-line bg-white pl-4 pr-1.5 md:w-[320px]">
          <Icon name="search" size={16} className="shrink-0 text-app-ink-soft" />
          {cat && tab === "nigeria" ? <input type="hidden" name="cat" value={cat} /> : null}
          <input name="q" defaultValue={q} placeholder={t("find.searchPh")} aria-label={t("find.searchLabel")} className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] outline-none placeholder:text-app-ink-faint" />
        </form>
      </div>

      {tab === "nigeria" && (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <div className="flex items-start gap-3 rounded-[18px] bg-app-peach px-4 py-3.5">
              <Mascot who="peggy" size={36} />
              <p className="m-0 min-w-0 text-[14px] leading-[1.5]">
                {insight.category ? (
                  <Link href={hrefFor("nigeria", { cat: insight.category })} className="font-extrabold text-app-ink no-underline hover:underline">{tip.lead}</Link>
                ) : (
                  <strong className="font-extrabold">{tip.lead}</strong>
                )}{" "}
                {tip.body}
              </p>
            </div>
            <ul className="m-0 grid list-none grid-cols-3 gap-2 rounded-[18px] border border-app-line bg-white p-3 sm:gap-3 sm:px-4">
              {PROMISES.map((promise) => (
                <li key={promise.key} className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2.5">
                  <Icon name={promise.icon} size={17} className="shrink-0 text-app-ink" />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-extrabold leading-tight sm:text-[13px]">{t(`find.promise.${promise.key}`)}</span>
                    <span className="block text-[12px] leading-tight text-app-ink-soft">{t(`find.promise.${promise.key}Sub`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {nearby ? (
            <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[16px] px-4 py-3", nearby.hasPlace ? "border border-app-line bg-white" : "bg-[#FDF0D5]")}>
              <Icon name={nearby.hasPlace ? "pin" : "shield"} size={17} className="shrink-0" />
              <span className="min-w-0 flex-1 text-[13.5px] leading-[1.5]">
                {nearby.hasPlace ? t("trust.nearbyOnly", { city: nearby.city ?? "" }) : t("trust.addCity")}
              </span>
              {!nearby.hasPlace ? <PillLink href="/home/settings" size="sm">{t("trust.addCityBtn")}</PillLink> : null}
            </div>
          ) : null}

          {sampleMode && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[16px] border border-dashed border-app-line-strong bg-white px-4 py-3">
              <span className="rounded-full bg-[#FDF0D5] px-2.5 py-1 text-[12px] font-extrabold text-[#8A5A00]">{t("find.sampleBadge")}</span>
              <span className="text-[14px] font-extrabold">{t("find.joining")}</span>
              <span className="w-full text-[13.5px] text-app-ink-soft sm:w-auto sm:min-w-0 sm:flex-1">{t("find.joiningSub")}</span>
            </div>
          )}

          {supplierName && (
            <p className="m-0 text-[14px] text-app-ink-soft">
              {(() => {
                const [before, after = ""] = t("find.from", { name: "\u0001" }).split("\u0001");
                return <>{before}<strong className="text-app-ink">{supplierName}</strong>{after}</>;
              })()} · <Link href={hrefFor("nigeria", { q, cat })} className="font-extrabold text-app-accent-ink no-underline hover:underline">{t("find.allSuppliers")}</Link>
            </p>
          )}

          <ProductGrid
            products={products}
            addedIds={addedIds}
            chips={[{ label: t("find.all"), href: hrefFor("nigeria", { q }), active: !cat }, ...categories.map((name) => ({ label: name, href: hrefFor("nigeria", { q, cat: name.toLowerCase() }), active: cat === name }))]}
            notified={notified}
            emptyText={q ? (cat ? t("find.noMatchIn", { q, cat }) : t("find.noMatch", { q })) : t("find.nothingYet")}
          />
        </>
      )}

      {tab === "china" && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {/* Importing goes through trusted middlemen; it isn't open to sellers yet. */}
          <section className="rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
            <span className="inline-flex rounded-full bg-app-peach px-3 py-1 text-[12px] font-extrabold uppercase tracking-[0.08em]">{t("find.comingSoon")}</span>
            <h2 className="m-0 mt-3 text-[20px] font-extrabold tracking-[-0.01em]">{t("find.china.title")}</h2>
            <p className="m-0 mt-2 max-w-[560px] text-[14.5px] leading-[1.55] text-app-ink-soft">
              {t("find.china.body", { country })}
            </p>
            <Link href={hrefFor("nigeria")} className="mt-4 inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14.5px] font-extrabold text-white no-underline">
              {t("find.china.shop", { country })}
            </Link>
          </section>
          <section className="rounded-[22px] border border-app-line bg-white p-4 sm:p-5">
            <h2 className="m-0 text-[15.5px] font-extrabold">{t("find.howItWillWork")}</h2>
            <ol className="m-0 mt-3 grid list-none gap-3 p-0">
              {IMPORT_HOW_IT_WORKS.map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-app-canvas text-[14px] font-extrabold">{index + 1}</span>
                  <span className="pt-1 text-[14px] leading-[1.45]">{t.dynamic(`find.how.${index}`, step)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {tab === "trending" && (
        trends.length ? (
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3 sm:gap-4">
            {trends.map((trend) => (
              <li key={trend.title} className="flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-app-line bg-white">
                <div className="aspect-[16/9] bg-app-canvas">
                  {trend.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={trend.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h2 className="m-0 text-[15.5px] font-extrabold">{t.dynamic(`find.trend.${trend.title}`, trend.title)}</h2>
                  <p className="mb-0 mt-1.5 text-[13.5px] text-app-ink-soft">{t.dynamic(`find.trend.${trend.reason}`, trend.reason)}</p>
                  <div className="mt-auto pt-3">
                    <PillLink href={hrefFor("nigeria", { q: trend.query })} size="sm">{t("find.findSuppliers")}</PillLink>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 rounded-[22px] border border-app-line bg-white px-5 py-10 text-center text-[14.5px] text-app-ink-soft">{t("find.noTrends")}</p>
        )
      )}
    </div>
  );
}
