// Storefront search and AI visibility: robots rules and robots.txt, sitemaps (paths, absolute URLs on the right
// host, custom-domain canonicals), schema.org builders, llms.txt, verification meta, and the wiring that serves
// them on every store host.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const ROOT = new URL("..", import.meta.url);
const read = (file) => readFileSync(new URL(file, ROOT), "utf8");

const indexing = await import("../src/lib/seo/indexing.ts");
const sitemap = await import("../src/lib/seo/sitemap.ts");
const ld = await import("../src/lib/seo/structured-data.ts");
const llms = await import("../src/lib/seo/llms.ts");
const content = await import("../src/lib/seo/storefront-content.ts");
const head = await import("../src/lib/seo/store-head.ts");
const routing = await import("../src/lib/storefront/host-routing.ts");

// ─── Who may be indexed ──────────────────────────────────────────────────────

test("noindex rules: live stores index; drafts, hidden stores, hidden pages and filtered copies don't", () => {
  assert.equal(indexing.storeHiddenFromSearch({}), false, "off by default");
  assert.equal(indexing.storeHiddenFromSearch({ seo: { hideFromSearch: true } }), true);
  assert.equal(indexing.storeHiddenFromSearch({ seo: { hideFromSearch: "yes" } }), false, "only a real true hides");
  assert.equal(indexing.storeIndexable(true, {}), true);
  assert.equal(indexing.storeIndexable(false, {}), false, "not live (draft, closed, unpaid)");
  assert.equal(indexing.storeIndexable(true, { seo: { hideFromSearch: true } }), false);

  assert.deepEqual(indexing.storePageRobots({ indexable: true }), indexing.INDEX_FOLLOW);
  assert.equal(indexing.INDEX_FOLLOW.googleBot["max-image-preview"], "large");
  assert.deepEqual(indexing.storePageRobots({ indexable: false }), { index: false, follow: false });
  assert.deepEqual(indexing.storePageRobots({ indexable: true, pageNoIndex: true }), { index: false, follow: true });
  assert.deepEqual(indexing.storePageRobots({ indexable: true, variant: true }), { index: false, follow: true }, "search/filter/sort copies");
  assert.deepEqual(indexing.storePageRobots({ indexable: false, variant: true }), { index: false, follow: false });
});

test("only queries that change the listing make a page a variant; tracking parameters don't", () => {
  assert.equal(indexing.hasVariantQuery(undefined), false);
  assert.equal(indexing.hasVariantQuery({}), false);
  assert.equal(indexing.hasVariantQuery({ utm_source: "ig", fbclid: "x", gclid: "y", sib_c: "z", ref: "a" }), false);
  assert.equal(indexing.hasVariantQuery({ q: "bag" }), true);
  assert.equal(indexing.hasVariantQuery({ category: "bags" }), true);
  assert.equal(indexing.hasVariantQuery(new URLSearchParams("sort=price&utm_medium=x")), true);
  assert.equal(indexing.hasVariantQuery({ q: undefined }), false, "absent values don't count");
});

// ─── robots.txt ──────────────────────────────────────────────────────────────

test("a live store's robots.txt welcomes search and AI crawlers, keeps shopper flows out and names its sitemap", () => {
  const txt = indexing.storeRobotsTxt({ indexable: true, sitemapUrl: "https://adas.ng/sitemap.xml", llmsUrl: "https://adas.ng/llms.txt" });
  for (const bot of ["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "Claude-SearchBot", "Google-Extended", "Applebot-Extended", "*"]) {
    assert.match(txt, new RegExp(`^User-agent: ${bot.replace("*", "\\*")}$`, "m"), bot);
  }
  assert.match(txt, /^Allow: \/$/m);
  for (const path of ["/cart", "/checkout", "/order/", "/wishlist", "/api/", "/preview", "/pay/", "/*?q=", "/*?sort="]) {
    assert.ok(txt.includes(`Disallow: ${path}\n`), path);
  }
  assert.doesNotMatch(txt, /^Disallow: \/$/m, "nothing blocks the whole store");
  assert.match(txt, /^Sitemap: https:\/\/adas\.ng\/sitemap\.xml$/m);
  assert.match(txt, /# .*https:\/\/adas\.ng\/llms\.txt/);
  // One group: every named crawler gets the same rules as *.
  const groups = txt.trim().split(/\n\n+/).filter((block) => block.includes("User-agent"));
  assert.equal(groups.length, 1);
});

test("stores that aren't live or are hidden keep every crawler out", () => {
  const txt = indexing.storeRobotsTxt({ indexable: false, sitemapUrl: "https://adas.ng/sitemap.xml" });
  assert.equal(txt, "User-agent: *\nDisallow: /\n");
});

test("the app host's robots.txt keeps portals private but never blocks stores", () => {
  const txt = indexing.appRobotsTxt({ sitemapUrl: "https://app.shopinbos.com/sitemap.xml" });
  assert.match(txt, /^Allow: \/s\/$/m);
  for (const path of ["/api/", "/home", "/admin", "/builder", "/onboarding", "/supplier/", "/s/*/cart", "/s/*/checkout", "/s/*/order/"]) assert.ok(txt.includes(`Disallow: ${path}\n`), path);
  assert.doesNotMatch(txt, /^Disallow: \/s\/?$/m);
  assert.doesNotMatch(txt, /^Disallow: \/$/m);
  assert.match(txt, /^Allow: \/logistics\/partners$/m, "public partner pages stay open");
  assert.match(txt, /^Sitemap: https:\/\/app\.shopinbos\.com\/sitemap\.xml$/m);
});

test("store hosts serve their own robots.txt, sitemap and llms.txt (rewritten to the store)", () => {
  for (const file of ["/robots.txt", "/sitemap.xml", "/llms.txt", "/llms-full.txt"]) {
    assert.deepEqual(routing.storePathAction(file, "adas"), { action: "rewrite", pathname: `/s/adas${file}` });
  }
  for (const route of ["robots.txt", "sitemap.xml", "llms.txt", "llms-full.txt"]) {
    assert.ok(existsSync(new URL(`src/app/s/[slug]/${route}/route.ts`, ROOT)), route);
  }
  assert.ok(existsSync(new URL("src/app/robots.txt/route.ts", ROOT)));
  assert.ok(existsSync(new URL("src/app/sitemap.xml/route.ts", ROOT)));
  const proxy = read("src/proxy.ts");
  assert.doesNotMatch(proxy, /X-Robots-Tag/i, "no blanket noindex header on store pages");
  assert.doesNotMatch(proxy, /rateLimit|ratelimit|isBot/i, "no bot blocking or rate limiting in front of storefronts");
  assert.doesNotMatch(read("next.config.ts"), /X-Robots-Tag/i);
});

// ─── Sitemaps ────────────────────────────────────────────────────────────────

const env = { ...process.env };
async function withEnv(vars, fn) {
  Object.assign(process.env, vars);
  try {
    const storefront = await import("../src/lib/domains/storefront.ts");
    return await fn(storefront);
  } finally {
    for (const key of Object.keys(vars)) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  }
}

const sampleInput = (url) => ({
  url,
  storeUpdatedAt: "2026-10-01T00:00:00.000Z",
  pages: [{ path: "/shop" }, { path: "/" }, { path: "/about" }, { path: "/lookbook", noIndex: true }],
  products: [
    { id: "p1", images: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/a.jpg", "data:image/png;base64,xx", "/relative.png"], updatedAt: "2026-10-02T10:00:00.000Z" },
    { id: "p2", images: [], updatedAt: new Date("2026-09-01T00:00:00Z") },
    { id: "hidden", images: [], noIndex: true },
  ],
  collections: [{ slug: "new-in", imageUrl: "https://cdn.example.com/c.jpg" }],
  cms: [{ slug: "blog", items: [{ slug: "how-to-tie-gele", image: null, updatedAt: "2026-08-01" }, { slug: "draft-ish", noIndex: true }] }],
  extraPaths: [{ path: "/policies" }, { path: "/policies/refund-policy" }, { path: "/about" }],
});

test("sitemap entries: home first, clean page paths, products with photos, collections, posts, policies; nothing hidden or twice", async () => {
  await withEnv({ NEXT_PUBLIC_APP_URL: "https://app.shopinbos.com", NEXT_PUBLIC_ROOT_DOMAIN: "mybos.store", NEXT_PUBLIC_STORE_SUBDOMAINS: "true" }, async (storefront) => {
    const url = (path) => storefront.buildStorefrontUrl({ slug: "adas", customDomain: null }, path);
    const entries = sitemap.storeSitemapEntries(sampleInput(url));
    const locs = entries.map((entry) => entry.loc);
    assert.equal(locs[0], "https://adas.mybos.store/");
    assert.deepEqual(locs, [
      "https://adas.mybos.store/",
      "https://adas.mybos.store/shop",
      "https://adas.mybos.store/about",
      "https://adas.mybos.store/collections/new-in",
      "https://adas.mybos.store/product/p1",
      "https://adas.mybos.store/product/p2",
      "https://adas.mybos.store/blog",
      "https://adas.mybos.store/blog/how-to-tie-gele",
      "https://adas.mybos.store/policies",
      "https://adas.mybos.store/policies/refund-policy",
    ]);
    assert.ok(locs.every((loc) => loc.startsWith("https://")), "absolute");
    const p1 = entries.find((entry) => entry.loc.endsWith("/product/p1"));
    assert.deepEqual(p1.images, [{ loc: "https://cdn.example.com/a.jpg" }], "deduped, only absolute http(s) images");
    const xml = sitemap.sitemapXml(entries);
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
    assert.match(xml, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
    assert.match(xml, /<url><loc>https:\/\/adas\.mybos\.store\/product\/p1<\/loc><lastmod>2026-10-02T10:00:00.000Z<\/lastmod><image:image><image:loc>https:\/\/cdn\.example\.com\/a\.jpg<\/image:loc><\/image:image><\/url>/);
    assert.match(xml, /<loc>https:\/\/adas\.mybos\.store\/<\/loc><lastmod>2026-10-01T00:00:00.000Z<\/lastmod>/, "pages fall back to the store's date");
  });
});

test("a store with its own domain lists only its own-domain URLs; without subdomains, the app path is the address", async () => {
  await withEnv({ NEXT_PUBLIC_APP_URL: "https://app.shopinbos.com", NEXT_PUBLIC_ROOT_DOMAIN: "mybos.store", NEXT_PUBLIC_STORE_SUBDOMAINS: "true" }, async (storefront) => {
    const url = (path) => storefront.buildStorefrontUrl({ slug: "adas", customDomain: "www.adas.ng" }, path);
    const locs = sitemap.storeSitemapEntries(sampleInput(url)).map((entry) => entry.loc);
    assert.ok(locs.every((loc) => loc.startsWith("https://www.adas.ng/")), locs.join("\n"));
    assert.ok(!locs.some((loc) => loc.includes("mybos.store") || loc.includes("/s/adas")), "never the free address too");
  });
  await withEnv({ NEXT_PUBLIC_APP_URL: "https://app.shopinbos.com", NEXT_PUBLIC_ROOT_DOMAIN: "shopinbos.com", NEXT_PUBLIC_STORE_SUBDOMAINS: "" }, async (storefront) => {
    const url = (path) => storefront.buildStorefrontUrl({ slug: "adas", customDomain: null }, path);
    const locs = sitemap.storeSitemapEntries(sampleInput(url)).map((entry) => entry.loc);
    assert.equal(locs[0], "https://app.shopinbos.com/s/adas");
    assert.ok(locs.includes("https://app.shopinbos.com/s/adas/product/p1"));
  });
  // The sitemap route redirects to the canonical host instead of serving duplicates.
  const route = read("src/app/s/[slug]/sitemap.xml/route.ts");
  assert.match(route, /onRequestHost\(sitemapUrl, request\.headers\.get\("host"\)\)\) return NextResponse\.redirect\(`\$\{sitemapUrl\}\$\{search\}`, 301\)/);
});

test("large stores get a sitemap index of ?part=N files", () => {
  const entries = Array.from({ length: 5 }, (_, i) => ({ loc: `https://adas.ng/product/${i}`, lastmod: `2026-0${i + 1}-01T00:00:00.000Z` }));
  const index = sitemap.renderStoreSitemap(entries, "https://adas.ng/sitemap.xml", null, 2);
  assert.match(index, /<sitemapindex/);
  assert.equal((index.match(/<sitemap>/g) ?? []).length, 3);
  assert.match(index, /<loc>https:\/\/adas\.ng\/sitemap\.xml\?part=3<\/loc><lastmod>2026-05-01T00:00:00.000Z<\/lastmod>/);
  assert.match(sitemap.renderStoreSitemap(entries, "https://adas.ng/sitemap.xml", 3, 2), /<loc>https:\/\/adas\.ng\/product\/4<\/loc>/);
  assert.equal(sitemap.renderStoreSitemap(entries, "https://adas.ng/sitemap.xml", 4, 2), null, "out of range is a 404");
  assert.equal(sitemap.renderStoreSitemap(entries, "https://adas.ng/sitemap.xml", 1.5, 2), null);
  assert.match(sitemap.renderStoreSitemap(entries, "https://adas.ng/sitemap.xml", null), /<urlset/, "small stores get one file");
  assert.equal(sitemap.xmlEscape(`a&b<c>"d'`), "a&amp;b&lt;c&gt;&quot;d&apos;");
});

test("which store pages go in the sitemap: snapshot and page rows, standard keys by type, custom pages by slug", () => {
  const store = {
    brandSettings: { editor: { published: { pages: [
      { pageType: "home", slug: "", title: "Home" },
      { pageType: "about", slug: "about", title: "Our story" },
      { pageType: "custom", slug: "lookbook", title: "Lookbook" },
      { pageType: "custom", slug: "secret", title: "Secret", seo: { noIndex: true } },
      { pageType: "checkout", slug: "checkout", title: "Checkout" },
      { pageType: "wishlist", slug: "wishlist", title: "Wishlist" },
      { pageType: "cart", slug: "cart", title: "Cart" },
    ] } } },
    pages: [{ type: "faq", slug: "faq", title: "FAQ", content: { seo: { noIndex: false } } }],
  };
  const refs = sitemap.storefrontPageRefs(store);
  assert.deepEqual(refs.map((ref) => [ref.key, ref.path, ref.noIndex]), [
    ["home", "/", false],
    ["about", "/about", false],
    ["lookbook", "/lookbook", false],
    ["secret", "/secret", true],
    ["faq", "/faq", false],
    ["products", "/shop", false],
  ]);
  assert.equal(refs.find((ref) => ref.key === "about").title, "Our story");
});

// ─── Structured data ─────────────────────────────────────────────────────────

/** No empty strings, nulls, NaN, empty arrays or objects anywhere. */
function assertClean(value, at = "$") {
  if (Array.isArray(value)) {
    assert.ok(value.length > 0, `${at} is an empty array`);
    value.forEach((entry, i) => assertClean(entry, `${at}[${i}]`));
  } else if (value && typeof value === "object") {
    assert.ok(Object.keys(value).length > 0, `${at} is an empty object`);
    for (const [key, entry] of Object.entries(value)) assertClean(entry, `${at}.${key}`);
  } else {
    assert.ok(value !== null && value !== undefined, `${at} is empty`);
    if (typeof value === "string") assert.ok(value.trim() !== "", `${at} is an empty string`);
    if (typeof value === "number") assert.ok(Number.isFinite(value), `${at} is not a number`);
  }
}

test("GTINs are only kept with a valid check digit", () => {
  assert.equal(ld.validGtin("4006381333931"), "4006381333931", "EAN-13");
  assert.equal(ld.validGtin("036000291452"), "036000291452", "UPC-A");
  assert.equal(ld.validGtin("9638-5074"), "96385074", "EAN-8 with a dash");
  assert.equal(ld.validGtin("4006381333932"), undefined, "wrong check digit");
  assert.equal(ld.validGtin("ABC123"), undefined);
  assert.equal(ld.validGtin("00000000"), undefined);
  assert.equal(ld.validGtin(null), undefined);
});

test("Product: required fields, offers with availability, shipping, rating only from reviews, nothing empty", () => {
  const product = ld.productLd(
    {
      url: "https://adas.ng/product/p1",
      name: "Ankara tote",
      description: "<p>Hand-made   tote</p>",
      images: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/a.jpg", "", null, "/rel.jpg"],
      sku: "TOTE-1",
      barcode: "4006381333931",
      brand: "",
      category: "Bags",
      currency: "NGN",
      price: { min: 15000, max: 15000 },
      availability: "InStock",
      seller: { name: "Ada's", url: "https://adas.ng/" },
      shipping: { country: "NG", fee: 2500, currency: "NGN", estimatedDays: "1-3 days" },
      returns: { country: "NG", days: 7, url: "https://adas.ng/policies/refund-policy" },
      rating: { average: 4.66, count: 3 },
      reviews: [{ author: "Bola", rating: 5, date: "2026-09-01T10:00:00Z", title: "", body: "Lovely" }, { author: "", rating: 4 }],
    },
    new Date("2026-10-16T00:00:00Z"),
  );
  assertClean(product);
  assert.equal(product["@type"], "Product");
  assert.equal(product.description, "Hand-made tote");
  assert.deepEqual(product.image, ["https://cdn.example.com/a.jpg"]);
  assert.equal(product.gtin13, "4006381333931");
  assert.deepEqual(product.brand, { "@type": "Brand", name: "Ada's" }, "falls back to the store");
  assert.equal(product.offers["@type"], "Offer");
  assert.equal(product.offers.price, 15000);
  assert.equal(product.offers.priceCurrency, "NGN");
  assert.equal(product.offers.availability, "https://schema.org/InStock");
  assert.equal(product.offers.itemCondition, "https://schema.org/NewCondition");
  assert.equal(product.offers.priceValidUntil, "2027-10-16");
  assert.equal(product.offers.url, "https://adas.ng/product/p1");
  assert.equal(product.offers.shippingDetails.shippingDestination.addressCountry, "NG");
  assert.deepEqual(product.offers.shippingDetails.deliveryTime.transitTime, { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" });
  assert.equal(product.offers.hasMerchantReturnPolicy.merchantReturnDays, 7);
  assert.equal(product.offers.hasMerchantReturnPolicy.returnPolicyCategory, "https://schema.org/MerchantReturnFiniteReturnWindow");
  assert.deepEqual(product.aggregateRating, { "@type": "AggregateRating", ratingValue: 4.7, reviewCount: 3, bestRating: 5, worstRating: 1 });
  assert.equal(product.review.length, 1, "reviews without an author are dropped");
  assert.equal(product.review[0].datePublished, "2026-09-01");
});

test("Product: price ranges are an AggregateOffer; sold-out, back order; no rating without reviews; bad shipping skipped", () => {
  const product = ld.productLd({
    url: "https://adas.ng/product/p2",
    name: "Gele",
    currency: "NGN",
    price: { min: 5000, max: 9000 },
    offerCount: 3,
    availability: "BackOrder",
    seller: { name: "Ada's", url: "https://adas.ng/" },
    shipping: { country: "Nigeria", fee: 1000, currency: "NGN" },
    rating: { average: 0, count: 0 },
    reviews: [{ author: "x", rating: 5 }],
  });
  assertClean(product);
  assert.equal(product.description, "Gele", "never empty");
  assert.equal(product.offers["@type"], "AggregateOffer");
  assert.equal(product.offers.lowPrice, 5000);
  assert.equal(product.offers.highPrice, 9000);
  assert.equal(product.offers.offerCount, 3);
  assert.equal(product.offers.availability, "https://schema.org/BackOrder");
  assert.equal(product.offers.shippingDetails, undefined, "country must be an ISO code");
  assert.equal(product.aggregateRating, undefined);
  assert.equal(product.review, undefined, "no reviews without a rating");
  assert.equal(ld.productLd({ url: "https://a.ng/p", name: "X", currency: "NGN", price: { min: 1, max: 1 }, availability: "OutOfStock", seller: { name: "A", url: "https://a.ng/" } }).offers.availability, "https://schema.org/OutOfStock");
  assert.equal(ld.conditionFromLabel("UK used"), "UsedCondition");
  assert.equal(ld.conditionFromLabel("Refurbished"), "RefurbishedCondition");
  assert.equal(ld.conditionFromLabel(undefined), "NewCondition");
  assert.deepEqual(ld.parseDayRange("2-3 weeks"), { min: 14, max: 21 });
  assert.deepEqual(ld.parseDayRange("Same day"), { min: 0, max: 0 });
  assert.equal(ld.parseDayRange("soon"), null);
  assert.equal(ld.countryCode("Nigeria"), "NG");
  assert.equal(ld.countryCode("gh"), "GH");
  assert.equal(ld.countryCode("Atlantis"), undefined);
});

test("store organisation: OnlineStore by default, LocalBusiness with a street address and hours; WebSite search", () => {
  const org = ld.storeOrganizationLd({
    name: "Ada's",
    url: "https://adas.ng/",
    logo: "https://cdn.example.com/logo.png",
    description: "Ankara bags made in Lagos.",
    sameAs: ["https://instagram.com/adas", "javascript:alert(1)", "https://instagram.com/adas", null],
    email: "hello@adas.ng",
    phone: "",
    address: { line1: "12 Allen Avenue", city: "Ikeja", state: "Lagos", country: "Nigeria" },
  });
  assertClean(org);
  assert.equal(org["@type"], "OnlineStore");
  assert.equal(org["@id"], "https://adas.ng/#store");
  assert.deepEqual(org.sameAs, ["https://instagram.com/adas"]);
  assert.equal(org.address.addressCountry, "NG");
  assert.equal(org.contactPoint.email, "hello@adas.ng");
  assert.equal(org.contactPoint.telephone, undefined);
  const shop = ld.storeOrganizationLd({ name: "Ada's", url: "https://adas.ng/", address: { line1: "12 Allen Avenue", city: "Ikeja", country: "NG" }, openingHours: ["Mo-Sa 09:00-18:00"] });
  assert.equal(shop["@type"], "LocalBusiness");
  const bare = ld.storeOrganizationLd({ name: "Ada's", url: "https://app.shopinbos.com/s/adas" });
  assertClean(bare);
  assert.equal(bare.address, undefined);

  const site = ld.websiteLd({ name: "Ada's", url: "https://adas.ng/", searchUrl: "https://adas.ng/shop" });
  assertClean(site);
  assert.equal(site.potentialAction.target.urlTemplate, "https://adas.ng/shop?q={search_term_string}");
  assert.equal(site.potentialAction["query-input"], "required name=search_term_string");
  assert.deepEqual(site.publisher, { "@id": "https://adas.ng/#store" });
});

test("breadcrumbs, item lists, FAQ pages and page types", () => {
  assert.equal(ld.breadcrumbLd([{ name: "Ada's", url: "https://adas.ng/" }]), null, "one step is no trail");
  const crumbs = ld.breadcrumbLd([{ name: "Ada's", url: "https://adas.ng/" }, { name: "Bags", url: "https://adas.ng/shop?category=bags" }, { name: "Tote", url: "https://adas.ng/product/p1" }]);
  assertClean(crumbs);
  assert.deepEqual(crumbs.itemListElement.map((entry) => entry.position), [1, 2, 3]);
  assert.equal(crumbs.itemListElement[2].item, "https://adas.ng/product/p1");

  assert.equal(ld.itemListLd({ items: [] }), null);
  const list = ld.itemListLd({ name: "Shop", url: "https://adas.ng/shop", items: [{ url: "https://adas.ng/product/p1", name: "Tote", image: "" }, { url: "not a url" }] });
  assertClean(list);
  assert.equal(list.numberOfItems, 1);

  assert.equal(ld.faqPageLd([{ question: "Delivery?", answer: "" }]), null, "unanswered questions aren't shown, so aren't marked up");
  const faq = ld.faqPageLd([{ question: "Do you deliver to Abuja?", answer: "Yes, in 2-3 days." }, { question: "do you deliver to abuja?", answer: "dup" }], "https://adas.ng/faq");
  assertClean(faq);
  assert.equal(faq.mainEntity.length, 1);
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, "Yes, in 2-3 days.");

  const about = ld.webPageLd({ type: "AboutPage", name: "Our story", url: "https://adas.ng/about", storeUrl: "https://adas.ng/", description: "" });
  assertClean(about);
  assert.equal(about["@type"], "AboutPage");
  assert.deepEqual(about.about, { "@id": "https://adas.ng/#store" });
  assert.equal(content.pageSchemaType("contact"), "ContactPage");
  assert.equal(content.pageSchemaType("products"), "CollectionPage");
  assert.equal(content.pageSchemaType("lookbook"), "WebPage");
});

test("FAQ markup comes only from visible FAQ sections, with blank answers filled from the store's settings", () => {
  const store = {
    brandSettings: { editor: { published: { pages: [
      { pageType: "home", slug: "", sections: [{ kind: "faq", visible: false, items: [{ question: "Hidden?", answer: "Yes" }] }] },
      { pageType: "faq", slug: "faq", sections: [
        { kind: "hero", items: [] },
        { kind: "faq", items: [{ question: "Do you deliver?", answer: "", answerSource: "delivery" }, { question: "Can I pay on delivery?", answer: "", answerSource: "payment" }, { question: "Unanswered?", answer: "" }] },
      ] },
      { pageType: "custom", slug: "lookbook", sections: [] },
    ] } } },
  };
  const shopper = { announcement: null, delivery: [{ name: "Lagos", regions: ["Lagos"], fee: 2000, freeOver: null, alwaysFree: false, estimatedDays: "1-2 days", pickupOnly: false }], flatRate: null, payOnDelivery: true, payOnDeliveryLimit: null, paymentLabels: ["Card", "Pay on delivery"], whatsappNumber: null, collections: [], rating: null, reviews: [] };
  const page = content.storefrontContentPage(store, "faq");
  const qas = content.pageFaqs(page, shopper, "NGN");
  assert.deepEqual(qas.map((qa) => qa.question), ["Do you deliver?", "Can I pay on delivery?"]);
  assert.match(qas[0].answer, /Lagos/);
  assert.match(qas[1].answer, /^Yes\. Pay on delivery/);
  assert.deepEqual(content.pageFaqs(content.storefrontContentPage(store, "home"), shopper, "NGN"), [], "hidden sections don't count");
  assert.equal(content.storefrontContentPage(store, "lookbook")?.pageType, "custom", "custom pages by slug");
  assert.equal(content.storefrontContentPage(store, "contact"), null);
  assert.equal(content.storeFaqs(store, shopper, "NGN").length, 2);
});

// ─── llms.txt ────────────────────────────────────────────────────────────────

test("llms.txt: summary, key pages, products with price and stock, policies and contact, all absolute", () => {
  const input = {
    name: "Ada's [Closet]",
    url: "https://adas.ng/",
    summary: "Hand-made Ankara bags and gele from Lagos.\nShipped nationwide.",
    location: "Lagos, Nigeria",
    currency: "NGN",
    pages: [{ title: "Shop all products", url: "https://adas.ng/shop" }, { title: "Our story", url: "https://adas.ng/about" }],
    categories: [{ title: "Bags", url: "https://adas.ng/shop?category=bags" }],
    collections: [],
    products: Array.from({ length: 3 }, (_, i) => ({ name: `Tote ${i}`, url: `https://adas.ng/product/p${i}`, price: "₦15,000", available: i !== 2, category: "Bags", description: "A sturdy tote." })),
    totalProducts: 120,
    policies: [{ title: "Returns", url: "https://adas.ng/policies/refund-policy" }],
    facts: ["Delivery: Lagos ₦2,000"],
    faqs: [{ question: "Do you deliver?", answer: "Yes." }],
    contact: { email: "hello@adas.ng", whatsapp: "+234 800 000 0000" },
    rating: { average: 4.75, count: 12 },
  };
  const short = llms.storeLlmsTxt(input, 2);
  assert.match(short, /^# Ada's Closet\n\n> Hand-made Ankara bags and gele from Lagos\. Shipped nationwide\.\n/);
  assert.match(short, /Rated 4\.8 out of 5 from 12 customer reviews\./);
  assert.match(short, /## Key pages\n\n- \[Shop all products\]\(https:\/\/adas\.ng\/shop\)/);
  assert.match(short, /- \[Tote 0\]\(https:\/\/adas\.ng\/product\/p0\): ₦15,000, in stock, Bags\n/);
  assert.match(short, /…and 118 more in the shop/);
  assert.match(short, /## Policies\n\n- \[Returns\]\(https:\/\/adas\.ng\/policies\/refund-policy\)/);
  assert.match(short, /- WhatsApp: https:\/\/wa\.me\/2348000000000/);
  assert.doesNotMatch(short, /## Collections/, "empty sections are left out");
  assert.doesNotMatch(short, /Do you deliver/, "FAQs are in the full version");
  const full = llms.storeLlmsFullTxt(input);
  assert.match(full, /- \[Tote 2\]\(https:\/\/adas\.ng\/product\/p2\): ₦15,000, sold out, Bags\. A sturdy tote\./);
  assert.match(full, /### Do you deliver\?\n\nYes\./);
  assert.ok(full.endsWith("\n") && !full.endsWith("\n\n"));
});

// ─── Head ────────────────────────────────────────────────────────────────────

test("verification meta for search consoles, from the store's integrations (pasted tags work too)", () => {
  assert.deepEqual(head.storeVerificationMeta({}), {});
  assert.deepEqual(head.storeVerificationMeta(null), {});
  assert.deepEqual(head.storeVerificationMeta({ gaSiteVerification: '<meta name="google-site-verification" content="abcDEF_123-xyz" />' }), { verification: { google: "abcDEF_123-xyz" } });
  assert.deepEqual(
    head.storeVerificationMeta({ googleSiteVerification: "g-token", bingSiteVerification: "B1NG", pinterestVerification: "p1nt", facebookDomainVerification: "fbtoken", yandexVerification: "y4ndex" }),
    { verification: { google: "g-token", yandex: "y4ndex", other: { "msvalidate.01": "B1NG", "p:domain_verify": "p1nt", "facebook-domain-verification": "fbtoken" } } },
  );
  assert.deepEqual(head.storeVerificationMeta({ gaSiteVerification: '"><script>alert(1)</script>' }), {}, "anything that isn't a token is dropped");
  const meta = head.storeHeadMetadata({ name: "Ada's" }, "https://app.shopinbos.com/s/adas");
  assert.equal(meta.metadataBase.toString(), "https://app.shopinbos.com/");
});

// ─── Wiring ──────────────────────────────────────────────────────────────────

test("storefront pages: canonical on the store's own address, robots from the store's state, JSON-LD from the shared builders", () => {
  const route = read("src/app/s/[slug]/storefront-route.tsx");
  assert.match(route, /storePageRobots\(\{ indexable, pageNoIndex: pageSeo\?\.seo\.noIndex, variant \}\)/);
  assert.match(route, /storeOrganizationJsonLd\(slug\)/);
  assert.match(route, /websiteLd\(/);
  assert.doesNotMatch(route, /"@type": "Product"/, "no Product markup outside product pages");
  const product = read("src/app/s/[slug]/product/[productId]/ProductPageView.tsx");
  assert.match(product, /productLd\(/);
  assert.match(product, /breadcrumbLd\(/);
  assert.match(product, /buildStorefrontUrl\(\{ slug: data\.store\.slug, customDomain: customDomain \?\? data\.store\.customDomain/, "product canonical prefers the store's own domain");
  assert.doesNotMatch(product, /NEXT_PUBLIC_APP_URL/);
  assert.doesNotMatch(read("src/lib/cms/storefront.ts"), /NEXT_PUBLIC_APP_URL/, "CMS canonicals follow the store's address too");
  assert.match(read("src/app/s/[slug]/order/[orderId]/page.tsx"), /robots: \{ index: false, follow: false \}/);
  // Classic templates: menu items and product names are real links on a live store.
  const surface = read("src/components/storefront/TemplateStorefrontSurface.tsx");
  assert.match(surface, /pageHref: liveHref \?/);
  assert.match(surface, /productHref: liveHref \?/);
  assert.match(surface, /<ProductTitleLink href=\{href\}>\{product\.title\}<\/ProductTitleLink>/);
  // The seller's switch.
  assert.match(read("src/app/actions/workspace.ts"), /hideFromSearch: formData\.get\("hideFromSearch"\) === "on"/);
  assert.match(read("src/app/home/seo/page.tsx"), /name="hideFromSearch" defaultChecked=\{hiddenFromSearch\}/);
});
