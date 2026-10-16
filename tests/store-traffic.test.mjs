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
    { type: "page_view", path, search: "ankara", entry: { referrerHost: "l.instagram.com", medium: "social", campaign: "Sallah Sale" }, firstToday: true, newVisitor: true },
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
    "visitor|||1",
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
    row("2026-10-14", "visitor", "", "", 9),
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
  assert.equal(report.kpis.visitors, 9);
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
  assert.match(layout, /\{integrations && \(\s*<>\s*<StoreTrackingTags integrations=\{integrations\} \/>/);
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
  // Signing in with Google is optional and gated on its env vars plus token encryption.
  const server = read("src/lib/search-console/google.server.ts");
  assert.match(server, /process\.env\.GOOGLE_OAUTH_CLIENT_ID && process\.env\.GOOGLE_OAUTH_CLIENT_SECRET && encryptionConfigured\(\)/);
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
