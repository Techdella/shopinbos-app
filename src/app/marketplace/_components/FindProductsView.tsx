import Link from "next/link";
import { PillLink } from "@/components/app-kit";
import { cx } from "@/components/app-ui/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { IMPORT_EXAMPLES, IMPORT_HOW_IT_WORKS, type FindProduct, type PeggyInsight, type TrendIdea } from "@/lib/marketplace/find";
import { ProductGrid } from "./ProductGrid";
import { ChinaImportForm } from "./ChinaImportForm";

export type FindTab = "nigeria" | "china" | "trending";

const PROMISES: Array<{ icon: IconName; title: string; sub: string }> = [
  { icon: "box", title: "No stock", sub: "They hold it" },
  { icon: "tag", title: "Your label", sub: "Packed as yours" },
  { icon: "shield", title: "Paid after delivery", sub: "Money held safely" },
];

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
}

/** Body of "Find products to sell" under the page title: tabs, search, and the active tab. */
export function FindProductsView({ tab, country, q, cat, categories, products, sampleMode, supplierName, insight, trends, addedIds, notified, error, focusPhoto }: FindProductsViewProps) {
  const hrefFor = findHref;
  const tabs: Array<{ id: FindTab; label: string }> = [
    { id: "nigeria", label: country },
    { id: "china", label: "China · 1688" },
    { id: "trending", label: "Trending" },
  ];
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Where to source from" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 md:pb-0">
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
            </Link>
          ))}
        </nav>
        <form action="/marketplace" method="get" role="search" className="flex min-h-[46px] w-full items-center gap-2 rounded-full border border-app-line bg-white pl-4 pr-1.5 md:w-[320px]">
          <Icon name="search" size={16} className="shrink-0 text-app-ink-soft" />
          {cat && tab === "nigeria" ? <input type="hidden" name="cat" value={cat} /> : null}
          <input name="q" defaultValue={q} placeholder="Shoes, bags, beauty…" aria-label="Search products and suppliers" className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] outline-none placeholder:text-app-ink-faint" />
          <Link href={hrefFor("china", { photo: "1" })} aria-label="Search with a photo" title="Search with a photo" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas hover:text-app-ink">
            <Icon name="image" size={17} />
          </Link>
        </form>
      </div>

      {tab === "nigeria" && (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <div className="flex items-start gap-3 rounded-[18px] bg-app-peach px-4 py-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/app/peggy.png" alt="Peggy" className="h-9 w-9 shrink-0 object-contain" />
              <p className="m-0 min-w-0 text-[14px] leading-[1.5]">
                {insight.category ? (
                  <Link href={hrefFor("nigeria", { cat: insight.category })} className="font-extrabold text-app-ink no-underline hover:underline">{insight.lead}</Link>
                ) : (
                  <strong className="font-extrabold">{insight.lead}</strong>
                )}{" "}
                {insight.body}
              </p>
            </div>
            <ul className="m-0 grid list-none grid-cols-3 gap-2 rounded-[18px] border border-app-line bg-white p-3 sm:gap-3 sm:px-4">
              {PROMISES.map((promise) => (
                <li key={promise.title} className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2.5">
                  <Icon name={promise.icon} size={17} className="shrink-0 text-app-ink" />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-extrabold leading-tight sm:text-[13px]">{promise.title}</span>
                    <span className="block text-[12px] leading-tight text-app-ink-soft">{promise.sub}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {sampleMode && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[16px] border border-dashed border-app-line-strong bg-white px-4 py-3">
              <span className="rounded-full bg-[#FDF0D5] px-2.5 py-1 text-[12px] font-extrabold text-[#8A5A00]">Sample products</span>
              <span className="text-[14px] font-extrabold">Suppliers are joining</span>
              <span className="w-full text-[13.5px] text-app-ink-soft sm:w-auto sm:min-w-0 sm:flex-1">These show how it works. Real products from verified suppliers appear here as they list.</span>
            </div>
          )}

          {supplierName && (
            <p className="m-0 text-[14px] text-app-ink-soft">
              From <strong className="text-app-ink">{supplierName}</strong> · <Link href={hrefFor("nigeria", { q, cat })} className="font-extrabold text-app-accent-ink no-underline hover:underline">All suppliers</Link>
            </p>
          )}

          <ProductGrid
            products={products}
            addedIds={addedIds}
            chips={[{ label: "All", href: hrefFor("nigeria", { q }), active: !cat }, ...categories.map((name) => ({ label: name, href: hrefFor("nigeria", { q, cat: name.toLowerCase() }), active: cat === name }))]}
            notified={notified}
            emptyText={q ? `Nothing matches “${q}”${cat ? ` in ${cat}` : ""}. Try another word, or ask our sourcing partner to find it in China.` : "Nothing here yet. Try another category."}
          />
        </>
      )}

      {tab === "china" && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <ChinaImportForm examples={IMPORT_EXAMPLES} error={error} focusPhoto={focusPhoto} />
          <section className="rounded-[22px] border border-app-line bg-white p-4 sm:p-5">
            <h2 className="m-0 text-[15.5px] font-extrabold">How importing works</h2>
            <ol className="m-0 mt-3 grid list-none gap-3 p-0">
              {IMPORT_HOW_IT_WORKS.map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-app-canvas text-[14px] font-extrabold">{index + 1}</span>
                  <span className="pt-1 text-[14px] leading-[1.45]">{step}</span>
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
                  <h2 className="m-0 text-[15.5px] font-extrabold">{trend.title}</h2>
                  <p className="mb-0 mt-1.5 text-[13.5px] text-app-ink-soft">{trend.reason}</p>
                  <div className="mt-auto pt-3">
                    <PillLink href={hrefFor("nigeria", { q: trend.query })} size="sm">Find suppliers</PillLink>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 rounded-[22px] border border-app-line bg-white px-5 py-10 text-center text-[14.5px] text-app-ink-soft">Nothing is trending yet. Check back as more suppliers list products.</p>
        )
      )}
    </div>
  );
}
