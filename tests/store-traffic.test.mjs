// Store traffic (/home/analytics/traffic), Settings › Connections and the storefront tags: input cleaning, referrer
// classification, the report maths, the strict ID validators, and that tags only reach live store pages.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const traffic = await import("../src/lib/analytics/traffic.ts");
const { resolveRange } = await import("../src/lib/analytics/range.ts");
const html = await import("../src/lib/security/html.ts");
const integ = await import("../src/lib/storefront/integrations.ts");
const sc = await import("../src/lib/search-console/pure.ts");

// ─── Cleaning what the beacon sends ─────────────────────────────────────────────

test("store paths: the free address and a custom domain count the same page; private tails and junk are dropped", () => {
  const p = (path) => traffic.normalizeStorePath(path, "adas");
  assert.deepEqual(p("/s/adas"), { path: "/", kind: "home" });
  assert.deepEqual(p("/"), { path: "/", kind: "home" });
  assert.deepEqual(p("/s/adas/shop?q=ankara"), { path: "/shop", kind: "shop" });
  assert.deepEqual(p("/products"), { path: "/shop", kind: "shop" });
  assert.deepEqual(p("/About/"), { path: "/about", kind: "page" });
  assert.deepEqual(p("/product/cmabc123XYZ"), { path: "/product/cmabc123XYZ", kind: "product", productId: "cmabc123XYZ" });
  assert.deepEqual(p("/collections/summer-sale"), { path: "/collections/summer-sale", kind: "collection" });
  assert.deepEqual(p("/blog/how-to-tie-gele"), { path: "/blog/how-to-tie-gele", kind: "blog_post" });
  assert.deepEqual(p("/checkout"), { path: "/checkout", kind: "checkout" });
  // Order ids, payment codes and review tokens are never kept.
  assert.deepEqual(p("/order/ord_123"), { path: "/order", kind: "order" });
  assert.deepEqual(p("/pay/PAY-9X"), { path: "/pay", kind: "pay" });
  assert.deepEqual(p("/review/tok.secret"), { path: "/review", kind: "reviews" });
  for (const bad of ["/s/adas/preview", "/preview/about", "/api/public/x", "https://evil.com/", "/a/b/c/d", "/<script>", "/product/a b", "/product/x/y", "", 42]) {
    assert.equal(p(bad), null, String(bad));
  }
});

test("referrer hosts are cut to the host and classified: Google, Instagram, WhatsApp, AI search, direct", () => {
  assert.equal(traffic.normalizeReferrerHost("https://www.Google.com/search?q=ankara"), "google.com");
  assert.equal(traffic.normalizeReferrerHost("l.instagram.com"), "l.instagram.com");
  assert.equal(traffic.normalizeReferrerHost("javascript:alert(1)"), "");
  assert.equal(traffic.normalizeReferrerHost("not a host"), "");
  const source = (referrerHost, ref) => traffic.trafficSource({ referrerHost, ref, ownHosts: ["adas.mybos.store", "adasfabrics.com"] }).key;
  assert.equal(source("www.google.com.ng"), "google");
  assert.equal(source("google.com"), "google");
  assert.equal(source("l.instagram.com"), "instagram");
  assert.equal(source("lm.facebook.com"), "facebook");
  assert.equal(source("web.whatsapp.com"), "whatsapp");
  assert.equal(source("wa.me"), "whatsapp");
  assert.equal(source("chatgpt.com"), "chatgpt");
  assert.equal(source("chat.openai.com"), "chatgpt");
  assert.equal(source("www.perplexity.ai"), "perplexity");
  assert.equal(source("gemini.google.com"), "gemini", "Gemini is AI, not Google search");
  assert.equal(source("t.co"), "x");
  assert.equal(source("www.bing.com"), "bing");
  assert.equal(source("nairaland.com"), "referral");
  assert.equal(source(""), "direct");
  assert.equal(source("adasfabrics.com"), "direct", "the store's own domain isn't a source");
  assert.equal(source("google.com", "wa"), "whatsapp", "a ?ref= tag wins over the referrer");
  assert.equal(traffic.classifyReferrer("chatgpt.com").kind, "ai");
  assert.equal(traffic.classifyReferrer("google.com").kind, "search");
  assert.equal(traffic.classifyReferrer("instagram.com").kind, "social");
  assert.equal(traffic.classifyReferrer("wa.me").kind, "messaging");
});

test("devices, places and searches keep no personal data", () => {
  assert.equal(traffic.deviceClass("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"), "mobile");
  assert.equal(traffic.deviceClass("Mozilla/5.0 (Linux; Android 13; SM-A135F) Mobile Safari/537.36"), "mobile");
  assert.equal(traffic.deviceClass("Mozilla/5.0 (Linux; Android 13; SM-X200) Safari/537.36"), "tablet");
  assert.equal(traffic.deviceClass("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet");
  assert.equal(traffic.deviceClass("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120"), "desktop");
  assert.equal(traffic.normalizeCountry("ng"), "NG");
  assert.equal(traffic.normalizeCountry("XX"), "");
  assert.equal(traffic.normalizeCountry("<b>"), "");
  assert.equal(traffic.normalizeCity("Port%20Harcourt"), "Port Harcourt");
  assert.equal(traffic.normalizeCity("<script>"), "");
  assert.equal(traffic.normalizeSearchTerm("  Ankara   Gown! "), "ankara gown");
  for (const personal of ["ada@example.com", "08031234567", "+234 803 123 4567", "https://evil.com", "x"]) assert.equal(traffic.normalizeSearchTerm(personal), "", personal);
});

test("one beacon → counters: the landing details once per session, nothing identifying", () => {
  const path = traffic.normalizeStorePath("/shop", "adas");
  const rows = traffic.trafficIncrements(
    { type: "page_view", path, search: "ankara", entry: { referrerHost: "l.instagram.com", medium: "social", campaign: "Sallah Sale" }, newVisitor: true },
    { userAgent: "Mozilla/5.0 (iPhone) Mobile", country: "NG", city: "Lagos", ownHosts: ["adas.mybos.store"] },
  );
  const keys = rows.map((row) => `${row.metric}|${row.dim}|${row.value}|${row.amount}`).sort();
  assert.deepEqual(keys, [
    "entry|path|/shop|1",
    "new_visitor|||1",
    "page_view|path|/shop|1",
    "page_view|||1",
    "search|term|ankara|1",
    "session|campaign|sallah-sale|1",
    "session|city|Lagos|1",
    "session|country|NG|1",
    "session|device|mobile|1",
    "session|medium|social|1",
    "session|referrer|l.instagram.com|1",
    "session|source|instagram|1",
    "session|||1",
  ].sort());
  assert.doesNotMatch(JSON.stringify(rows), /iPhone|Mozilla/, "the user agent itself is never stored");
  // A later page of the same session adds a page view only.
  const later = traffic.trafficIncrements({ type: "page_view", path: traffic.normalizeStorePath("/about", "adas") }, { userAgent: "x" });
  assert.deepEqual(later.map((row) => row.metric), ["page_view", "page_view"]);
  // Engaged time is capped at 30 minutes per report.
  const engaged = traffic.trafficIncrements({ type: "engagement", path, seconds: 99_999 }, {});
  assert.equal(engaged.find((row) => row.metric === "engaged_seconds" && row.dim === "").amount, traffic.MAX_ENGAGED_SECONDS);
  assert.deepEqual(traffic.trafficIncrements({ type: "engagement", path, seconds: 0 }, {}), []);
});

// ─── The report ─────────────────────────────────────────────────────────────────

test("computeTraffic: totals, change vs before, top pages, sources, funnel and conversion", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const range = resolveRange({ range: "7d" }, now); // 9 Oct .. 15 Oct; previous 2 Oct .. 8 Oct
  const row = (day, metric, dim, value, count) => ({ day, metric, dim, value, count });
  const rows = [
    row("2026-10-14", "session", "", "", 6),
    row("2026-10-15", "session", "", "", 4),
    row("2026-10-05", "session", "", "", 5),
    row("2026-10-14", "page_view", "", "", 20),
    row("2026-10-15", "page_view", "", "", 10),
    row("2026-10-14", "page_view", "path", "/", 12),
    row("2026-10-14", "page_view", "path", "/product/p1", 8),
    row("2026-10-15", "page_view", "path", "/shop", 10),
    row("2026-10-14", "entry", "path", "/", 7),
    row("2026-10-15", "entry", "path", "/product/p1", 3),
    row("2026-10-14", "session", "source", "instagram", 5),
    row("2026-10-14", "session", "source", "direct", 3),
    row("2026-10-15", "session", "source", "chatgpt", 2),
    row("2026-10-14", "session", "device", "mobile", 8),
    row("2026-10-14", "session", "device", "desktop", 2),
    row("2026-10-14", "engaged_seconds", "", "", 600),
    row("2026-10-14", "engaged_view", "", "", 10),
    row("2026-10-14", "engaged_seconds", "path", "/", 300),
    row("2026-10-14", "engaged_view", "path", "/", 5),
    row("2026-10-14", "search", "term", "ankara", 4),
    row("2026-10-14", "new_visitor", "", "", 2),
  ];
  const funnelRows = [
    { day: "2026-10-14", metric: "product_view", productId: "p1", count: 8 },
    { day: "2026-10-14", metric: "add_to_cart", productId: "p1", count: 3 },
    { day: "2026-10-14", metric: "checkout_start", productId: "", count: 2 },
  ];
  const orders = [
    { createdAt: new Date("2026-10-14T10:00:00Z"), items: [{ productId: "p1", quantity: 2 }] },
    { createdAt: new Date("2026-10-05T10:00:00Z"), items: [{ productId: "p1", quantity: 1 }] },
  ];
  const report = traffic.computeTraffic({ range, now, rows, funnelRows, orders, products: [{ id: "p1", name: "Ankara tote", image: null }], since: "2026-10-01" });
  assert.equal(report.kpis.sessions, 10);
  assert.equal(report.previous.sessions, 5);
  assert.equal(report.change.sessions, 100);
  assert.equal(report.kpis.pageViews, 30);
  assert.equal(report.kpis.pagesPerSession, 3);
  assert.equal(report.kpis.avgEngagedSeconds, 60);
  assert.equal(report.kpis.newVisitors, 2);
  assert.equal(report.kpis.paidOrders, 1);
  assert.equal(report.kpis.conversionRate, 0.1);
  assert.deepEqual(report.topPages.map((page) => [page.path, page.label, page.views]), [["/", "Home page", 12], ["/shop", "Shop", 10], ["/product/p1", "Ankara tote", 8]]);
  assert.equal(report.topPages[0].avgSeconds, 60);
  assert.equal(report.topPages[0].entries, 7);
  assert.deepEqual(report.sources.map((s) => [s.key, s.count, s.kind]), [["instagram", 5, "social"], ["direct", 3, "direct"], ["chatgpt", 2, "ai"]]);
  assert.equal(report.sourceKinds.find((k) => k.key === "ai").count, 2);
  assert.equal(report.devices[0].key, "mobile");
  assert.equal(report.devices[0].share, 0.8);
  assert.deepEqual(report.searchTerms.map((s) => [s.key, s.count]), [["ankara", 4]]);
  assert.deepEqual(report.products.map((p) => [p.name, p.views, p.addToBag, p.orders, p.unitsSold]), [["Ankara tote", 8, 3, 1, 2]]);
  assert.deepEqual(report.funnel.map((step) => step.count), [10, 8, 3, 2, 1]);
  assert.equal(report.series.length, 7);
  assert.equal(report.series.at(-1).sessions, 4);
  assert.equal(report.series.at(-2).sessions, 6);
  assert.equal(report.series.at(-4).previousSessions, 5, "the previous period lines up day by day");
  // "Today" is one point: counters are daily.
  assert.equal(traffic.computeTraffic({ range: resolveRange({ range: "today" }, now), now, rows, funnelRows, orders, products: [], since: null }).series.length, 1);
});

test("Ask Peggy gets the card's numbers in plain text, short enough for the chat box", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const report = traffic.computeTraffic({ range: resolveRange({ range: "30d" }, now), now, rows: [{ day: "2026-10-14", metric: "session", dim: "source", value: "google", count: 3 }, { day: "2026-10-14", metric: "session", dim: "", value: "", count: 3 }], funnelRows: [], orders: [], products: [], since: null });
  const context = traffic.trafficContext(report, "sources", "Last 30 days");
  assert.match(context, /Visits 3/);
  assert.match(context, /Google 3/);
  const prompt = traffic.askPeggyPrompt(context);
  assert.match(prompt, /^Explain what these numbers mean for my store and what I should do next/);
  assert.ok(prompt.length <= 1900 && prompt.length < 2000, "fits /home/peggy?ask= (2,000 characters)");
  // Peggy can read the same numbers for follow-ups, for the seller's own store only.
  assert.match(read("src/lib/ai/peggy/social-tools.ts"), /loadTraffic\(ctx\.store\.id, range\)/);
  assert.match(read("src/lib/ai/peggy/prompt.ts"), /store_traffic_report/);
});

// ─── Connections: strict validators ──────────────────────────────────────────────

test("every connection ID accepts the real format and refuses script injection", () => {
  const INJECT = ["</script><script>alert(1)</script>", "G-1');alert(1);//", "\"><img src=x onerror=alert(1)>", "javascript:alert(1)", "1234'+alert(1)+'", "", null, 42, {}];
  const cases = [
    [html.gaMeasurementId, ["G-ABC123XYZ"], ["UA-12345-1", "G-"]],
    [html.gtmContainerId, ["GTM-ABC1234", " gtm-abcd12 "], ["GTM-", "GTM-ABC'1"]],
    [html.metaPixelId, ["123456789012345"], ["12345", "1234567890abc"]],
    [html.tiktokPixelId, ["C4ABCDEF1234567890AB"], ["C4AB", "C4ABCDEF-1234567890"]],
    [html.googleSiteVerification, ["abcDEF_123-xyzABCdef0987654321", '<meta name="google-site-verification" content="abcDEF_123-xyzABCdef0987654321" />'], ["short", '<meta name="other" content="abcDEF_123-xyzABCdef0987654321">', '<meta name="google-site-verification" content="abc"><script>']],
    [html.bingSiteVerification, ["0123456789ABCDEF0123456789ABCDEF", '<meta name="msvalidate.01" content="0123456789abcdef0123456789abcdef" />'], ["0123456789ABCDEFG123456789ABCDEF"]],
    [html.facebookDomainVerification, ["abcdefghijklmnopqrstuvwxyz1234", '<meta name="facebook-domain-verification" content="abcdefghijklmnopqrstuvwxyz1234" />'], ["ABCDEFGHIJKLMNOPQRSTUVWXYZ1234"]],
    [html.pinterestSiteVerification, ["0123456789abcdef0123456789abcdef", '<meta name="p:domain_verify" content="0123456789abcdef0123456789abcdef"/>'], ["0123456789abcdef"]],
  ];
  for (const [fn, good, bad] of cases) {
    for (const value of good) assert.notEqual(fn(value), "", `${fn.name} accepts ${value}`);
    for (const value of [...bad, ...INJECT]) assert.equal(fn(value), "", `${fn.name} refuses ${String(value)}`);
  }
  assert.equal(html.googleSiteVerification('<meta name="google-site-verification" content="abcDEF_123-xyzABCdef0987654321" />'), "abcDEF_123-xyzABCdef0987654321", "a pasted tag gives its code");
  assert.equal(html.gtmContainerId(" gtm-abcd12 "), "GTM-ABCD12");
});

test("the Connections form names each malformed field and keeps only clean values", () => {
  const form = { googleAnalyticsId: "G-ABCD1234", metaPixelId: "</script>", tiktokPixelId: "", gaSiteVerification: "abcDEF_123-xyzABCdef0987654321" };
  const { values, invalid } = integ.parseIntegrationsForm((name) => form[name] ?? null);
  assert.deepEqual(invalid, ["metaPixelId"]);
  assert.equal(values.googleAnalyticsId, "G-ABCD1234");
  assert.equal(values.metaPixelId, "");
  // Values are validated again when read, so a bad value saved by hand never reaches a page.
  const read = integ.readIntegrations({ integrations: { googleAnalyticsId: "G-1');alert(1);//", gtmContainerId: "GTM-ABC1234", bingSiteVerification: "<script>" } });
  assert.equal(read.googleAnalyticsId, "");
  assert.equal(read.gtmContainerId, "GTM-ABC1234");
  assert.equal(read.bingSiteVerification, "");
  assert.deepEqual(integ.readIntegrations(null), integ.EMPTY_INTEGRATIONS);
});

test("verification tags become Next.js metadata, and scripts carry nothing but checked IDs", () => {
  const all = {
    ...integ.EMPTY_INTEGRATIONS,
    googleAnalyticsId: "G-ABCD1234",
    gtmContainerId: "GTM-ABC1234",
    metaPixelId: "123456789012345",
    tiktokPixelId: "C4ABCDEF1234567890AB",
    gaSiteVerification: "abcDEF_123-xyzABCdef0987654321",
    bingSiteVerification: "0123456789ABCDEF0123456789ABCDEF",
    facebookDomainVerification: "abcdefghijklmnopqrstuvwxyz1234",
    pinterestSiteVerification: "0123456789abcdef0123456789abcdef",
  };
  assert.deepEqual(integ.storeVerificationMetadata(all), {
    verification: {
      google: "abcDEF_123-xyzABCdef0987654321",
      other: { "msvalidate.01": "0123456789ABCDEF0123456789ABCDEF", "facebook-domain-verification": "abcdefghijklmnopqrstuvwxyz1234", "p:domain_verify": "0123456789abcdef0123456789abcdef" },
    },
  });
  assert.deepEqual(integ.storeVerificationMetadata(integ.EMPTY_INTEGRATIONS), {});
  const scripts = integ.trackingScripts(all);
  assert.deepEqual(scripts.map((s) => s.id), ["ga4-src", "ga4-init", "gtm-init", "meta-pixel", "tiktok-pixel"]);
  assert.equal(scripts[0].src, "https://www.googletagmanager.com/gtag/js?id=G-ABCD1234");
  assert.match(scripts[1].inline, /gtag\('config',"G-ABCD1234"\)/);
  assert.match(scripts[3].inline, /fbq\('init',"123456789012345"\)/);
  assert.equal(integ.gtmNoscriptSrc(all), "https://www.googletagmanager.com/ns.html?id=GTM-ABC1234");
  // Even if a caller skipped readIntegrations, a bad ID produces no script.
  assert.deepEqual(integ.trackingScripts({ ...integ.EMPTY_INTEGRATIONS, googleAnalyticsId: "G-1');alert(1);//", metaPixelId: "1</script>" }), []);
  assert.deepEqual(integ.trackingScripts(integ.EMPTY_INTEGRATIONS), []);
  assert.equal(integ.sitemapUrl("https://adas.mybos.store/"), "https://adas.mybos.store/sitemap.xml");
});

test("tags and the traffic beacon render on live store pages only, never in the owner's preview", () => {
  assert.equal(integ.isPreviewPath("/s/adas/preview"), true);
  assert.equal(integ.isPreviewPath("/preview?x=1"), true);
  assert.equal(integ.isPreviewPath("/s/adas/product/p1"), false);
  assert.equal(integ.isPreviewPath(null), false);
  const layout = read("src/app/s/[slug]/layout.tsx");
  assert.match(layout, /const preview = isPreviewPath\(requestHeaders\.get\("x-shopinbos-path"\)\);/);
  assert.match(layout, /const integrations = preview \? null : await liveStoreIntegrations\(brand\);/);
  assert.match(layout, /\{integrations && \(\s*<>\s*<StoreTrackingTags integrations=\{integrations\} slug=\{slug\} consent=\{consent\} currency=/);
  const live = read("src/lib/storefront/tracking.server.ts");
  assert.match(live, /if \(!brand\?\.active\) return null;/, "a closed or inactive store gets no tags");
  assert.match(live, /hasPublishedStorefront\(brand\.brandSettings, 0\)/, "an unpublished store gets no tags");
  assert.match(live, /return live \? readIntegrations\(brand\.brandSettings\) : null;/);
  // The verification <meta> tags go through the store head metadata, on the live home page only.
  const route = read("src/app/s/[slug]/storefront-route.tsx");
  assert.match(route, /storeVerificationMetadata\(readIntegrations\(store\.brandSettings\)\)/);
  const beacon = read("src/components/storefront/StoreTrafficBeacon.tsx");
  assert.match(beacon, /preview/);
  assert.match(beacon, /window\.top !== window\.self/, "not inside the builder frame");
  assert.match(beacon, /globalPrivacyControl/, "Do Not Track / GPC limit what is sent");
  const api = read("src/app/api/public/store/[slug]/traffic/route.ts");
  assert.match(api, /checkRateLimit\(/);
  assert.match(api, /isBotUserAgent\(/);
  assert.match(api, /store\.status !== "active"/);
});

// ─── Search Console ─────────────────────────────────────────────────────────────

test("Search Console: properties are validated and matched to the store, answers parsed", () => {
  assert.equal(sc.validSiteUrl("sc-domain:adasfabrics.com"), "sc-domain:adasfabrics.com");
  assert.equal(sc.validSiteUrl("https://adas.mybos.store/"), "https://adas.mybos.store/");
  assert.equal(sc.validSiteUrl("javascript:alert(1)"), "");
  assert.equal(sc.validSiteUrl("https://evil.com/<script>"), "");
  const sites = sc.matchingSites(
    [{ siteUrl: "https://other.com/", permissionLevel: "siteOwner" }, { siteUrl: "sc-domain:adasfabrics.com", permissionLevel: "siteOwner" }, { siteUrl: "https://adas.mybos.store/", permissionLevel: "siteUnverifiedUser" }],
    ["adas.mybos.store", "www.adasfabrics.com"],
  );
  assert.deepEqual(sites, [{ siteUrl: "sc-domain:adasfabrics.com", matches: true }, { siteUrl: "https://other.com/", matches: false }]);
  const perf = sc.parsePerformance({ rows: [{ clicks: 12, impressions: 400, ctr: 0.03, position: 8.24 }] }, { rows: [{ keys: ["ankara bag lagos"], clicks: 5, impressions: 90, ctr: 0.055, position: 4.1 }] }, {});
  assert.deepEqual(perf.totals, { clicks: 12, impressions: 400, ctr: 0.03, position: 8.2 });
  assert.equal(perf.queries[0].key, "ankara bag lagos");
  assert.deepEqual(perf.pages, []);
  assert.deepEqual(sc.parsePerformance(null, null, null).totals, { clicks: 0, impressions: 0, ctr: null, position: null });
  // Signing in with Google is optional and gated on the Google client (shared, or the older Search Console one)
  // plus token encryption.
  const server = read("src/lib/search-console/google.server.ts");
  assert.match(server, /googleClient\("searchConsole"\)\.id && googleClient\("searchConsole"\)\.secret && encryptionConfigured\(\)/);
  assert.match(server, /accessToken: sealSecret\(/);
  assert.match(server, /webmasters\.readonly/);
});

test("the migration is additive and matches the schema", () => {
  const sql = read("docs/migrations/2026-11-03-store-traffic-connections.sql");
  assert.match(sql, /Run BEFORE deploying/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "StoreTrafficDaily"/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "StoreTrafficDaily_storeId_day_metric_dim_value_key"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "SearchConsoleConnection"/);
  assert.doesNotMatch(sql, /DROP |ALTER TABLE "Store" /);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model StoreTrafficDaily \{[\s\S]*@@unique\(\[storeId, day, metric, dim, value\]\)/);
  assert.match(read("src/lib/analytics/traffic-record.ts"), /ON CONFLICT \("storeId", "day", "metric", "dim", "value"\)/);
});

// ─── Unique visitors: HyperLogLog ───────────────────────────────────────────────

const hll = await import("../src/lib/analytics/hll.ts");
const { createHash } = await import("node:crypto");
const visitorHash = (id) => createHash("sha256").update(`visitor-${id}`).digest();
const sketchOf = (ids) => {
  const sketch = hll.createSketch();
  for (const id of ids) hll.addHash(sketch, visitorHash(id));
  return sketch;
};
const span = (from, to) => Array.from({ length: to - from }, (_, i) => from + i);

test("HyperLogLog: estimates within the expected error, from a handful of visitors to a quarter million", () => {
  assert.equal(hll.estimate(hll.createSketch()), 0);
  assert.equal(hll.estimate(sketchOf([1])), 1);
  // Small numbers are near exact (each visitor lands in its own register).
  for (const n of [5, 20, 60]) assert.ok(Math.abs(hll.estimate(sketchOf(span(0, n))) - n) <= 1, `n=${n}`);
  // p = 12: standard error 1.04/√4096 ≈ 1.6%; allow 3 standard errors.
  for (const n of [500, 3_000, 10_000, 50_000, 250_000]) {
    const error = Math.abs(hll.estimate(sketchOf(span(0, n))) - n) / n;
    assert.ok(error < 0.05, `n=${n}: ${(error * 100).toFixed(2)}%`);
  }
  // Adding the same visitor again never changes the sketch.
  const sketch = sketchOf(span(0, 100));
  const before = Buffer.from(sketch.registers).toString("hex");
  for (const id of span(0, 100)) assert.equal(hll.addHash(sketch, visitorHash(id)), false);
  assert.equal(Buffer.from(sketch.registers).toString("hex"), before);
  assert.throws(() => hll.addHash(sketch, new Uint8Array(4)));
});

test("HyperLogLog: merged days count a person once; merging is exact and order-free", () => {
  // 7 days of 2,000 visitors each, 1,500 of them the same people every day: 5,000 distinct people, 14,000 daily visits.
  const days = span(0, 7).map((day) => sketchOf([...span(0, 1500), ...span(10_000 + day * 500, 10_000 + day * 500 + 500)]));
  const merged = hll.mergeSketches(days);
  const error = Math.abs(hll.estimate(merged) - 5_000) / 5_000;
  assert.ok(error < 0.05, `merged ${hll.estimate(merged)}`);
  assert.ok(days.reduce((sum, day) => sum + hll.estimate(day), 0) > 13_000, "adding up the days would count regulars 7 times");
  // A union sketch built directly has exactly the same registers as the merge, in any order.
  const direct = sketchOf([...span(0, 1500), ...span(10_000, 13_500)]);
  assert.deepEqual(merged.registers, direct.registers);
  assert.deepEqual(hll.mergeSketches([...days].reverse()).registers, merged.registers);
  assert.equal(hll.estimate(hll.mergeSketches([])), 0);
  assert.throws(() => hll.mergeInto(hll.createSketch(12), hll.createSketch(10)));
});

test("HyperLogLog: stored as sparse or dense bytes, round trips, and refuses junk", () => {
  for (const n of [0, 3, 300, 20_000]) {
    const sketch = sketchOf(span(0, n));
    const bytes = hll.serializeSketch(sketch);
    assert.equal(bytes[0], 1);
    assert.equal(bytes[1], 12);
    assert.equal(bytes[2], n >= 20_000 ? 0 : 1, "sparse until a third of the registers are set");
    if (n === 3) assert.equal(bytes.length, 3 + 3 * 3, "a quiet day is a few bytes");
    if (n === 20_000) assert.equal(bytes.length, 3 + 4096);
    assert.deepEqual(hll.deserializeSketch(bytes).registers, sketch.registers);
  }
  assert.equal(hll.deserializeSketch(null), null);
  assert.equal(hll.deserializeSketch(new Uint8Array([2, 12, 0])), null, "unknown version");
  assert.equal(hll.deserializeSketch(new Uint8Array([1, 12, 0, 1, 2])), null, "dense with the wrong length");
  assert.equal(hll.deserializeSketch(new Uint8Array([1, 12, 1, 0xff, 0xff, 3])), null, "register out of range");
  assert.equal(hll.deserializeSketch(new Uint8Array([1, 12, 1, 0, 1])), null, "half a sparse entry");
});

test("the traffic report: unique visitors over the range, per day, new and returning", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const r = resolveRange({ range: "7d" }, now); // 9 Oct .. 15 Oct; previous 2 Oct .. 8 Oct
  // The same 40 people on the 14th and 15th, plus 10 new people on the 15th; 25 people in the period before.
  const sketches = new Map([
    ["2026-10-14", sketchOf(span(0, 40))],
    ["2026-10-15", sketchOf(span(0, 50))],
    ["2026-10-05", sketchOf(span(500, 525))],
  ]);
  const row = (day, metric, count) => ({ day, metric, dim: "", value: "", count });
  const rows = [row("2026-10-14", "session", 60), row("2026-10-15", "session", 70), row("2026-10-05", "session", 30), row("2026-10-15", "new_visitor", 10)];
  const report = traffic.computeTraffic({ range: r, now, rows, sketches, funnelRows: [], orders: [], products: [], since: null });
  const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1, `${label}: ${actual} vs ${expected}`);
  near(report.kpis.uniqueVisitors, 50, "not 90 (40 + 50 added up)");
  assert.equal(report.kpis.newVisitors, 10);
  near(report.kpis.returningVisitors, 40, "returning");
  near(report.previous.uniqueVisitors, 25, "before");
  assert.ok(report.change.uniqueVisitors > 90 && report.change.uniqueVisitors < 110);
  near(report.series.at(-1).visitors, 50, "15 Oct");
  near(report.series.at(-2).visitors, 40, "14 Oct");
  near(report.series.at(-4).previousVisitors, 25, "5 Oct");
  assert.equal("visitors" in report.kpis, false, "the old summed metric is gone");
  // Never more unique visitors than visits, never fewer than first-timers.
  const capped = traffic.computeTraffic({ range: r, now, rows: [row("2026-10-15", "session", 30)], sketches, funnelRows: [], orders: [], products: [], since: null });
  assert.equal(capped.kpis.uniqueVisitors, 30);
  const none = traffic.computeTraffic({ range: r, now, rows: [row("2026-10-15", "new_visitor", 3)], funnelRows: [], orders: [], products: [], since: null });
  assert.equal(none.kpis.uniqueVisitors, 3);
  assert.match(traffic.trafficContext(report, "overview", "Last 7 days"), /unique visitors \d+ \(\+\d+(\.\d)?% vs before\) \(new 10, returning \d+\)/);
  // Beacons no longer add a per-day "visitor" counter.
  const beacon = traffic.trafficIncrements({ type: "page_view", path: traffic.normalizeStorePath("/", "adas"), newVisitor: true }, {});
  assert.deepEqual(beacon.map((item) => item.metric).sort(), ["new_visitor", "page_view", "page_view"]);
});

test("unique visitors stay private: random token, hashed with a server secret, never stored", () => {
  const server = read("src/lib/analytics/visitor-sketch.server.ts");
  assert.match(server, /createHmac\("sha256"/);
  assert.match(server, /update\(`\$\{storeId\}\\u0000\$\{token\}`\)/, "the hash is per store");
  assert.match(server, /const env = process\.env;\s*return env\.TRAFFIC_VISITOR_SECRET \|\|/);
  assert.match(server, /FOR UPDATE/, "two beacons at once both land");
  assert.doesNotMatch(server, /console\.\w+\([^)]*token/);
  const api = read("src/app/api/public/store/[slug]/traffic/route.ts");
  assert.match(api, /visitor: z\.string\(\)\.regex\(VISITOR_TOKEN\)\.optional\(\)/);
  assert.match(api, /parsed\.data\.visitor && !limited \? recordVisitor\(store\.id, parsed\.data\.visitor\)/);
  const beacon = read("src/components/storefront/StoreTrafficBeacon.tsx");
  assert.doesNotMatch(beacon, /document\.cookie/, "the traffic beacon sets no cookie");
  assert.match(beacon, /crypto\.getRandomValues\(bytes\)/);
  assert.match(beacon, /const TOKEN_DAYS = 90;/);
  assert.match(beacon, /if \(local && !limited && readStoredConsent\(slug\)\?\.analytics !== false\) \{/, "no token with DNT / GPC or after a no to analytics");
  const sql = read("docs/migrations/2026-11-04-store-visitor-sketches.sql");
  assert.match(sql, /Run BEFORE deploying/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "StoreVisitorSketch"/);
  assert.match(sql, /"sketch" BYTEA NOT NULL/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "StoreVisitorSketch_storeId_day_key"/);
  assert.match(sql, /ALTER TABLE "StoreVisitorSketch" ENABLE ROW LEVEL SECURITY;/);
  assert.doesNotMatch(sql, /DROP |"token"|"hash"/i);
  assert.match(read("prisma/schema.prisma"), /model StoreVisitorSketch \{[\s\S]*sketch\s+Bytes[\s\S]*@@unique\(\[storeId, day\]\)/);
});

// ─── Cookie banner and the seller's tags ────────────────────────────────────────

const consent = await import("../src/lib/storefront/consent.ts");
const consentConfig = await import("../src/lib/storefront/consent-config.ts");
const tags = await import("../src/lib/storefront/tag-events.ts");
const ALL_TAGS = { ...integ.EMPTY_INTEGRATIONS, googleAnalyticsId: "G-ABCD1234", gtmContainerId: "GTM-ABC1234", metaPixelId: "123456789012345", tiktokPixelId: "C4ABCDEF1234567890AB" };

test("cookie banner: shown only with third-party tags, seller settings cleaned, policy page picked", () => {
  const none = integ.EMPTY_INTEGRATIONS;
  const verificationOnly = { ...none, gaSiteVerification: "abcDEF_123-xyzABCdef0987654321" };
  assert.equal(consentConfig.storeConsentConfig("adas", none, {}), null);
  assert.equal(consentConfig.storeConsentConfig("adas", verificationOnly, {}), null, "verification codes set nothing");
  assert.deepEqual(consent.tagCategories(ALL_TAGS), { analytics: ["Google Analytics", "Google Tag Manager"], marketing: ["Meta Pixel", "TikTok Pixel"] });
  assert.equal(consentConfig.storeConsentConfig("adas", ALL_TAGS, { cookieBanner: { enabled: false } }), null, "the seller turned it off");
  const legal = { legalPages: { "privacy-policy": { title: "Privacy policy", published: true }, "cookie-policy": { title: "Cookies", published: true }, "refund-policy": { title: "Refunds", published: true } } };
  const config = consentConfig.storeConsentConfig("adas", ALL_TAGS, legal);
  assert.deepEqual(config.policy, { title: "Cookies", path: "/policies/cookie-policy" }, "on by default, cookie policy first");
  assert.equal(consentConfig.storeConsentConfig("adas", ALL_TAGS, { ...legal, cookieBanner: { policy: "refund-policy" } }).policy.path, "/policies/refund-policy");
  assert.equal(consentConfig.storeConsentConfig("adas", ALL_TAGS, { ...legal, cookieBanner: { policy: "none" } }).policy, null);
  assert.equal(consentConfig.storeConsentConfig("adas", ALL_TAGS, { legalPages: { "privacy-policy": { title: "Privacy", published: true } } }).policy.path, "/policies/privacy-policy");
  assert.equal(consentConfig.storeConsentConfig("adas", ALL_TAGS, { legalPages: { "cookie-policy": { title: "Draft", published: false } } }).policy, null, "drafts are never linked");
  // Seller text is plain and short; unknown policy values read as automatic.
  assert.deepEqual(consent.readCookieBanner({ cookieBanner: { message: "  We use <b>cookies</b>\n<script>x</script>  ", policy: "../evil" } }), { enabled: true, message: "We use cookies x", policy: "auto" });
  assert.equal(consent.cleanBannerMessage("a".repeat(400)).length, consent.BANNER_MESSAGE_MAX);
  const form = { cookieBannerForm: "1", cookieBannerMessage: "Hi", cookieBannerPolicy: "privacy-policy" };
  assert.deepEqual(consent.parseCookieBannerForm((name) => form[name] ?? null), { enabled: false, message: "Hi", policy: "privacy-policy" }, "an unticked box is off");
  assert.equal(consent.parseCookieBannerForm(() => null), null, "a form without the card changes nothing");
  assert.match(read("src/app/actions/connections.ts"), /parseCookieBannerForm\(\(name\) => formData\.get\(name\)\)/);
});

test("cookie choice: stored 180 days in a first-party cookie, Consent Mode v2 denied until agreed", () => {
  const at = Math.floor(Date.parse("2026-10-15T12:00:00Z") / 1000);
  const choice = { analytics: true, marketing: false, at };
  assert.equal(consent.serializeConsent(choice), `1.a1m0.${at}`);
  assert.deepEqual(consent.parseConsent(consent.serializeConsent(choice), at * 1000), choice);
  assert.equal(consent.parseConsent(`1.a1m0.${at}`, (at + 181 * 86_400) * 1000), null, "asked again after 180 days");
  for (const bad of ["", "2.a1m1.1760000000", "1.a2m0.1760000000", "1.a1m0", null, 5]) assert.equal(consent.parseConsent(bad, at * 1000), null, String(bad));
  assert.equal(consent.readCookie(`x=1; sib_consent=1.a0m1.${at}; y=2`, "sib_consent"), `1.a0m1.${at}`);
  assert.equal(consent.consentCookie(choice, { path: "/s/adas", secure: true }), `sib_consent=1.a1m0.${at}; Max-Age=15552000; Path=/s/adas; SameSite=Lax; Secure`);
  assert.match(consent.consentCookie(choice, { path: "/x;domain=evil.com" }), /Path=\/; SameSite=Lax$/);
  assert.deepEqual(consent.googleConsentState(null), { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  assert.deepEqual(consent.googleConsentState({ analytics: true, marketing: false }), { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  const script = consent.googleConsentScript({ analytics: true, marketing: true });
  assert.ok(script.indexOf("'consent','default'") < script.indexOf("'consent','update'"), "default first, then the choice");
  assert.match(script, /'default',\{"analytics_storage":"denied","ad_storage":"denied","ad_user_data":"denied","ad_personalization":"denied"\}/);
  assert.equal(consent.bannerText("analyticsHint", { tools: "Google Analytics" }), "Helps the store see how people use it (Google Analytics).");
  assert.equal(consent.bannerText("acceptAll", {}, "yo"), "Accept all", "English until stores have a shopper language");
  // Every tag is labelled with the consent it needs.
  assert.deepEqual(integ.trackingScripts(ALL_TAGS).map((s) => [s.id, s.category]), [["ga4-src", "analytics"], ["ga4-init", "analytics"], ["gtm-init", "analytics"], ["meta-pixel", "marketing"], ["tiktok-pixel", "marketing"]]);
});

test("the banner loads nothing third-party before consent, and is reachable and reopenable", () => {
  const banner = read("src/components/storefront/StoreConsent.tsx");
  assert.doesNotMatch(read("src/components/storefront/StoreTrackingTags.tsx"), /next\/script/, "no tag is rendered by the server any more");
  assert.match(banner, /if \(next\.analytics && has\("analytics"\) && !loaded\.current\.analytics\) \{\s*if \(config\) inject\(\{ id: "google-consent", category: "analytics", inline: googleConsentScript\(next\) \}\);/);
  assert.match(banner, /if \(next\.marketing && has\("marketing"\) && !loaded\.current\.marketing\) \{/);
  assert.match(banner, /const stored = readStoredConsent\(slug\);\s*if \(stored\) \{/);
  assert.match(banner, /w\.fbq\?\.\("consent", "revoke"\)/);
  assert.match(banner, /w\.gtag\("consent", "update", googleConsentState\(next\)\)/);
  assert.match(banner, /role="dialog"\s*aria-modal="false"\s*aria-labelledby=\{titleId\}\s*aria-describedby=\{bodyId\}/);
  assert.match(banner, /COOKIE_SETTINGS_EVENT, reopen/);
  assert.match(banner, /endsWith\(COOKIE_SETTINGS_HASH\)/);
  assert.match(banner, /decide\(\{ analytics: false, marketing: false \}\)/, "one tap to refuse");
  assert.match(banner, /tagPageView\(\);/, "pixels hear about in-store page changes");
  assert.match(read("src/components/storefront/shopper/StoreFooterBadges.tsx"), /badges\.cookieSettings \? <CookieSettingsButton color=\{muted\} \/> : null/);
  assert.match(read("src/app/s/[slug]/layout.tsx"), /cookieSettings: Boolean\(consent\)/);
});

test("shop events for the tags: GA4, Meta and TikTok names, value, currency, ids; only what was agreed", () => {
  const data = { items: [{ id: "p1", name: "Ankara tote", price: 12500, quantity: 2 }, { id: "p2", price: 3000 }], currency: "NGN", orderId: "ord_1" };
  assert.deepEqual(tags.ga4Event("purchase", data), ["purchase", { currency: "NGN", value: 28000, transaction_id: "ord_1", items: [{ item_id: "p1", item_name: "Ankara tote", price: 12500, quantity: 2 }, { item_id: "p2", price: 3000, quantity: 1 }] }]);
  const [metaName, metaParams, metaOptions] = tags.metaEvent("purchase", data);
  assert.equal(metaName, "Purchase");
  assert.deepEqual(metaParams.content_ids, ["p1", "p2"]);
  assert.equal(metaParams.value, 28000);
  assert.equal(metaParams.num_items, 3);
  assert.deepEqual(metaOptions, { eventID: "order-ord_1" });
  const [ttName, ttParams, ttOptions] = tags.tiktokEvent("purchase", data);
  assert.equal(ttName, "CompletePayment");
  assert.deepEqual(ttParams.contents[0], { content_id: "p1", content_type: "product", quantity: 2, price: 12500, content_name: "Ankara tote" });
  assert.deepEqual(ttOptions, { event_id: "order-ord_1" });
  assert.deepEqual(["view_item", "add_to_cart", "begin_checkout"].map((name) => [tags.metaEvent(name, data)[0], tags.tiktokEvent(name, data)[0]]), [["ViewContent", "ViewContent"], ["AddToCart", "AddToCart"], ["InitiateCheckout", "InitiateCheckout"]]);
  assert.equal(tags.ga4Event("add_to_cart", { items: [{ id: "p1", price: 10 }], currency: "bad" }, "GHS")[1].currency, "GHS");

  // Dispatch: nothing before consent, Google with Analytics, pixels with Marketing.
  const calls = [];
  globalThis.window = { gtag: (...a) => calls.push(["gtag", ...a]), fbq: (...a) => calls.push(["fbq", ...a]), ttq: { page: () => calls.push(["ttq.page"]), track: (...a) => calls.push(["ttq", a[0]]) }, dataLayer: [], addEventListener() {}, removeEventListener() {} };
  try {
    const base = { ga: true, gtm: true, meta: true, tiktok: true, currency: "NGN" };
    assert.equal(tags.tagEvent("view_item", data), false, "no state: not a live store");
    tags.setTagState({ ...base, analytics: false, marketing: false });
    assert.equal(tags.tagEvent("view_item", data), false);
    tags.tagPageView();
    assert.deepEqual(calls, []);
    tags.setTagState({ ...base, analytics: true, marketing: false });
    assert.equal(tags.tagEvent("add_to_cart", data), true);
    assert.deepEqual(calls.map((c) => c[0]), ["gtag"]);
    assert.equal(globalThis.window.dataLayer.at(-1).event, "add_to_cart");
    tags.tagPageView();
    assert.equal(calls.length, 1, "pixels wait for Marketing");
    tags.setTagState({ ...base, analytics: false, marketing: true });
    tags.tagEvent("begin_checkout", data);
    tags.tagPageView();
    assert.deepEqual(calls.slice(1).map((c) => c.slice(0, 2).join(":")), ["fbq:track", "ttq:InitiateCheckout", "fbq:track", "ttq.page"]);
  } finally {
    delete globalThis.window;
  }
  // The funnel hooks feed the tags; the order page sends Purchase once per order.
  const events = read("src/lib/analytics/storefront-events.ts");
  assert.match(events, /const key = `sib-tag-purchase:\$\{storeSlug\}:\$\{orderId\}`;/);
  assert.match(events, /if \(localStorage\.getItem\(key\) \|\| sessionStorage\.getItem\(key\)\) return;/);
  assert.match(read("src/app/s/[slug]/order/[orderId]/OrderConfirmation.tsx"), /useStorePurchase\(store\.slug,/);
  assert.match(read("src/hooks/useCart.ts"), /trackStoreEvent\(storeSlug, "add_to_cart", item\.productId, \{ items:/);
  assert.match(read("src/lib/storefront/tag-events.ts"), /we never send page_view ourselves/, "GA4 counts history changes itself");
});

test("the CSP lets the sellers' tags load on store pages", () => {
  const config = read("next.config.ts");
  assert.match(config, /"script-src [^"]*https:\/\/www\.googletagmanager\.com https:\/\/analytics\.tiktok\.com/);
  assert.match(config, /img-src [^`]*https:\/\/\*\.google-analytics\.com[^`]*https:\/\/www\.facebook\.com/);
  assert.match(config, /"connect-src 'self' https:\/\/\*\.google-analytics\.com https:\/\/\*\.analytics\.google\.com/);
});
