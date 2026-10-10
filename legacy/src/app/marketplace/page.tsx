import Image from "next/image";
import Link from "next/link";
import { AppFrame } from "@/components/shell/AppFrame";
import { addMarketplaceProduct } from "@/app/actions/workspace";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { MarketplaceFilters } from "./MarketplaceFilters";

export const dynamic = "force-dynamic";

function fmtMoney(n: number) {
  return "\u20A6" + n.toLocaleString("en-NG");
}

function calcMargin(wholesale: number, retail: number) {
  if (!retail || retail === 0) return 0;
  return Math.round(((retail - wholesale) / retail) * 100);
}

const CATEGORY_FILTERS = ["Fashion", "Beauty & wellness", "Home & living", "Food & pantry", "Accessories"];
const COUNTRY_FILTERS  = [["\uD83C\uDDF3\uD83C\uDDEC Nigeria", "Nigeria"], ["\uD83C\uDDEC\uD83C\uDDED Ghana", "Ghana"], ["\uD83C\uDFF0\uD83C\uDFEA Kenya", "Kenya"], ["\uD83C\uDFFF\uD83C\uDFE6 South Africa", "South Africa"]];

const GRAD_PAIRS = [
  ["#D4A574", "#6B4A2C"],
  ["#F2E2C8", "#D4A574"],
  ["#E9DDC2", "#7A5C1A"],
  ["#E8A647", "#B97511"],
  ["#1f3a5f", "#0c2542"],
  ["#8a5a3c", "#3a2614"],
  ["#E8A647", "#7d5616"],
  ["#C84A32", "#7d2616"],
  ["#FAEBE0", "#C84A32"],
  ["#195754", "#0c4a44"],
  ["#E9DDC2", "#4a423a"],
  ["#3a2614", "#1a1208"],
];

type PageProps = {
  searchParams?: Promise<{ category?: string; country?: string; fulfilment?: string; margin?: string; near?: string; q?: string }>;
};

function norm(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export default async function MarketplacePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");

  const store = workspace.store;

  const [verifiedSupplierCount, allProducts] = await Promise.all([
    safeQuery(() => db.supplier.count({ where: { status: "active", verificationStatus: "verified" } }), 0),
    safeQuery(() => db.supplierProduct.findMany({
      where: { status: "published", supplier: { status: "active", verificationStatus: "verified" } },
      include: { supplier: true, category: true },
      orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
      take: 50,
    }), []),
  ]);

  const selectedCategory = norm(params?.category);
  const selectedCountry = norm(params?.country);
  const selectedFulfilment = norm(params?.fulfilment);
  const selectedMargin = params?.margin ? parseInt(params.margin) : 0;
  const selectedNear = norm(params?.near);
  const searchQuery = norm(params?.q);
  const storeCity = norm(store.city);
  const storeCountry = norm(store.country);
  const preferredCategories = [
    ...new Set(
      workspace.storeProducts
        .map((product) => product.supplierProduct?.category?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  ];

  let products = allProducts;
  if (selectedCategory) {
    products = products.filter((p) => norm(p.category?.name) === selectedCategory);
  }
  if (selectedCountry) {
    products = products.filter((p) => norm(p.supplier?.country) === selectedCountry);
  }
  if (selectedFulfilment === "dropship") {
    products = products.filter((p) => p.dropshipAvailable);
  }
  if (selectedFulfilment === "wholesale") {
    products = products.filter((p) => p.bulkOrderAvailable);
  }
  if (selectedFulfilment === "sample") {
    products = products.filter((p) => p.sampleAvailable);
  }
  if (selectedMargin > 0) {
    products = products.filter((p) => calcMargin(Number(p.wholesalePrice), Number(p.suggestedRetailPrice)) >= selectedMargin);
  }
  if (searchQuery) {
    products = products.filter((p) => [
      p.name,
      p.description,
      p.category?.name,
      p.supplier?.displayName,
      p.supplier?.city,
      p.supplier?.country,
    ].some((value) => norm(value).includes(searchQuery)));
  }

  products = [...products].sort((a, b) => {
    const localScore = (product: typeof products[number]) => {
      const cityScore = storeCity && norm(product.supplier?.city) === storeCity ? 3 : 0;
      const countryScore = storeCountry && norm(product.supplier?.country) === storeCountry ? 2 : 0;
      const categoryScore = preferredCategories.some((category) => norm(category) === norm(product.category?.name)) ? 1 : 0;
      return cityScore + countryScore + categoryScore;
    };
    return localScore(b) - localScore(a) || Number(b.trendScore) - Number(a.trendScore);
  });

  const trendingProducts = workspace.trendingProducts;
  const nearbySupplierCount = new Set(
    allProducts
      .filter((product) =>
        (storeCity && norm(product.supplier?.city) === storeCity) ||
        (storeCountry && norm(product.supplier?.country) === storeCountry),
      )
      .map((product) => product.supplierId),
  ).size;
  const peggySuggestions = [
    preferredCategories.length > 0
      ? `Restock around ${preferredCategories.slice(0, 2).join(" and ")} because your catalog already leans there.`
      : "Start with high-margin dropship products so you can test demand before buying stock.",
    nearbySupplierCount > 0
      ? `${nearbySupplierCount} verified supplier${nearbySupplierCount === 1 ? "" : "s"} match your store location. Prioritize them for faster fulfillment.`
      : "No nearby supplier match yet, so compare country-wide partners by trust score and response time.",
    "Pair products with a logistics partner before launch so checkout delivery promises stay realistic.",
  ];

  return (
    <AppFrame
      role="seller"
      storeName={store.name}
      storeSlug={store.slug}
      storeInitial={store.name?.[0]?.toUpperCase()}
      userName={user.name ?? "You"}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px 28px 40px", background: "var(--canvas)" }}>
        <div className="pg-hero">
          <div>
            <h1>
              Marketplace.{" "}
              <span style={{ color: "var(--teal-700)", fontStyle: "italic" }}>{verifiedSupplierCount.toLocaleString()} verified suppliers.</span>
            </h1>
            <div className="pg-sub">
              Add dropship-ready stock to your store in 2 taps. Or browse for wholesale.
            </div>
          </div>
          <div className="pg-acts">
            <Link href="/home/settings?tab=Notifications" className="dbtn dBtn-ghost dBtn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              Alerts
            </Link>
            <button type="button" className="dbtn dBtn-ghost dBtn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Saved
            </button>
            <Link href="/home/peggy?task=source_products" className="dbtn dBtn-mint dBtn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              Ask Peggy to source
            </Link>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", borderLeft: "3px solid var(--teal-600)" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--teal-700)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Peggy suggestions</div>
            <div style={{ display: "grid", gap: 4 }}>
              {peggySuggestions.map((suggestion) => (
                <div key={suggestion} style={{ fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.45 }}>{suggestion}</div>
              ))}
            </div>
          </div>
          <Link href={`/home/peggy?task=marketplace&city=${encodeURIComponent(store.city ?? "")}&country=${encodeURIComponent(store.country)}`} className="dbtn dBtn-mint dBtn-sm">
            Ask Peggy
          </Link>
        </div>

        {trendingProducts.length > 0 && (
          <div className="card" style={{ marginBottom: 20, background: "linear-gradient(110deg, var(--teal-900), var(--teal-800) 60%, var(--teal-700))", borderColor: "var(--teal-900)", color: "white" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.1)", display: "grid", placeItems: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffd66b"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#94e0d3", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Trending this week · {trendingProducts[0]?.category?.name ?? "Fashion"}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>Top dropship picks for sellers like you</div>
                </div>
              </div>
              <Link href="/marketplace?trending=true" style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.2)", padding: "6px 12px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontWeight: 600, textDecoration: "none" }}>
                See all trending →
              </Link>
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
              {trendingProducts.slice(0, 5).map((p, i) => {
                const [c1, c2] = GRAD_PAIRS[i % GRAD_PAIRS.length];
                return (
                  <div key={p.id} style={{ minWidth: 180, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    {p.images?.[0] ? (
                      <div style={{ aspectRatio: "5/4", borderRadius: 8, position: "relative", overflow: "hidden" }}>
                        <Image src={p.images[0]} alt={p.name} fill style={{ objectFit: "cover" }} unoptimized />
                      </div>
                    ) : (
                      <div style={{ aspectRatio: "5/4", borderRadius: 8, background: `linear-gradient(135deg, ${c1}, ${c2})` }} />
                    )}
                    <div style={{ fontSize: 11.5, fontWeight: 600 }}>{p.name}</div>
                    <Link href={`/suppliers/${p.supplier.slug}`} style={{ fontSize: 10.5, color: "#94e0d3", textDecoration: "none" }}>{p.supplier.displayName}</Link>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: "#94e0d3" }}>RRP {fmtMoney(Number(p.suggestedRetailPrice))}</span>
                      <span style={{ fontWeight: 700, color: "#ffd66b" }}>{calcMargin(Number(p.wholesalePrice), Number(p.suggestedRetailPrice))}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20, alignItems: "start" }}>
          <div className="card" style={{ padding: 14, position: "sticky", top: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Filters</div>
              <a href="/marketplace" style={{ background: "none", border: "none", color: "var(--teal-700)", fontSize: 11.5, cursor: "pointer", fontWeight: 600, textDecoration: "none" }}>Reset</a>
            </div>
            <div className="hr" />

            <form method="GET" action="/marketplace" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {selectedCategory ? <input type="hidden" name="category" value={selectedCategory} /> : null}
              {selectedCountry ? <input type="hidden" name="country" value={selectedCountry} /> : null}
              {selectedFulfilment ? <input type="hidden" name="fulfilment" value={selectedFulfilment} /> : null}
              {selectedMargin > 0 ? <input type="hidden" name="margin" value={String(selectedMargin)} /> : null}
              {selectedNear ? <input type="hidden" name="near" value={selectedNear} /> : null}
              <input name="q" className="inp" defaultValue={params?.q ?? ""} placeholder="Search products, suppliers, cities..." style={{ height: 34, fontSize: 12.5 }} />
              <button type="submit" className="dbtn dBtn-mint dBtn-sm" style={{ justifyContent: "center" }}>Search</button>
            </form>

            <MarketplaceFilters
              groups={[
                { l: "Near me", name: "near", opts: [["Same city", "city"], ["Same country", "country"]] },
                { l: "Fulfilment", name: "fulfilment", opts: [["Dropship", "dropship"], ["Wholesale", "wholesale"], ["Sample first", "sample"]] },
                { l: "Country", name: "country", opts: COUNTRY_FILTERS.map(([label, val]) => [label, val.toLowerCase()]) },
                { l: "Category", name: "category", opts: CATEGORY_FILTERS.map((c) => [c, c.toLowerCase()]) },
                { l: "Margin", name: "margin", opts: [["40%+", "40"], ["50%+", "50"], ["60%+", "60"]] },
              ]}
              selected={{
                near: selectedNear,
                fulfilment: selectedFulfilment,
                country: selectedCountry,
                category: selectedCategory,
                margin: selectedMargin > 0 ? String(selectedMargin) : "",
              }}
              query={params?.q}
            />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                <Link href="/marketplace" className="chip on" style={{ textDecoration: "none" }}>Products</Link>
                <Link href="/marketplace/suppliers" className="chip" style={{ textDecoration: "none" }}>Suppliers</Link>
                <Link href="/marketplace/logistics" className="chip" style={{ textDecoration: "none" }}>Logistics</Link>
                <span className="chip on">Dropship</span>
                {searchQuery && <span className="chip on">Search: {params?.q}</span>}
                {selectedNear && <span className="chip on">Near: {selectedNear === "city" ? store.city ?? "city" : store.country}</span>}
                {selectedFulfilment && <span className="chip on">{selectedFulfilment}</span>}
                {selectedCountry && <span className="chip on">{selectedCountry}</span>}
                {selectedMargin > 0 && <span className="chip on">Margin {selectedMargin}%+</span>}
                {selectedCategory && <span className="chip on">{selectedCategory}</span>}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-600)" }}>
                {products.length} results
              </div>
            </div>

            {products.length === 0 ? (
              <div className="card" style={{ padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 14, color: "var(--ink-500)" }}>
                  No published marketplace products yet. Once suppliers list products, they appear here.
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {products.map((p, i) => {
                  const [c1, c2] = GRAD_PAIRS[i % GRAD_PAIRS.length];
                  const margin   = calcMargin(Number(p.wholesalePrice), Number(p.suggestedRetailPrice));
                  return (
                    <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }}>
                      <div style={{ aspectRatio: "4/3", background: p.images?.[0] ? undefined : `linear-gradient(135deg, ${c1}, ${c2})`, position: "relative" }}>
                        {p.images?.[0] && (
                          <Image src={p.images[0]} alt={p.name} fill style={{ objectFit: "cover" }} unoptimized />
                        )}
                        <div style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.85)", display: "grid", placeItems: "center" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-700)" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                        </div>
                        <div style={{ position: "absolute", bottom: 10, left: 10 }}>
                          <span style={{ padding: "2px 7px", background: "rgba(255,255,255,0.92)", borderRadius: 5, fontSize: 9.5, fontWeight: 700, color: "var(--teal-800)", letterSpacing: "0.04em", textTransform: "uppercase" }}>DROPSHIP</span>
                        </div>
                      </div>
                      <div style={{ padding: "11px 13px 13px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.25, flex: 1 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: "var(--amber-500)", fontWeight: 600, whiteSpace: "nowrap" }}>
                            ★ {p.trendScore > 0 ? (Math.min(5, 3 + p.trendScore / 50)).toFixed(1) : "4.7"}
                          </div>
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 10 }}>
                          <Link href={`/suppliers/${p.supplier.slug}`} style={{ color: "inherit", textDecoration: "none" }}>{p.supplier.displayName}</Link> · {p.supplier.city ?? "Africa"}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, paddingBottom: 8, borderBottom: "1px dashed var(--ink-150)" }}>
                          <div>
                            <div style={{ fontSize: 10.5, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Cost from</div>
                            <div className="money" style={{ fontSize: 18, fontWeight: 400 }}>{fmtMoney(Number(p.wholesalePrice))}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 10.5, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>RRP</div>
                            <div className="money" style={{ fontSize: 14, color: "var(--ink-700)" }}>{fmtMoney(Number(p.suggestedRetailPrice))}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 10.5, color: "var(--success)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}>Margin</div>
                            <div className="money" style={{ fontSize: 18, fontWeight: 400, color: "var(--success)" }}>{margin}%</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--ink-500)", marginBottom: 10 }}>
                          MOQ {p.moq} · ships in 3 days
                        </div>
                        <form action={addMarketplaceProduct} style={{ display: "flex", gap: 6 }}>
                          <input type="hidden" name="supplierProductId" value={p.id} />
                          <Link href={`/marketplace?product=${p.id}`} className="dbtn dBtn-ghost dBtn-sm" style={{ padding: "5px 9px" }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          </Link>
                          <button type="submit" className="dbtn dBtn-soft dBtn-sm" style={{ flex: 1, justifyContent: "center" }}>Add to store</button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
