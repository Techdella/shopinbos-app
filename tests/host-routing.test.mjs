// Store subdomains and custom domains (src/lib/storefront/host-routing.ts, used by src/proxy.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const routing = await import("../src/lib/storefront/host-routing.ts");

const prod = { rootDomain: "shopinbos.com", appHosts: ["https://app.shopinbos.com", "https://shopinbos.com,https://www.shopinbos.com"] };
const local = { rootDomain: "localhost", appHosts: ["http://localhost:3100"] };
const kind = (host, config = prod) => routing.classifyHost(host, config);

test("app hosts stay the app", () => {
  for (const host of ["shopinbos.com", "www.shopinbos.com", "app.shopinbos.com", "shopinbos-app-git-main.vercel.app", "my-preview.vercel.app:443", "localhost", "localhost:3100", "127.0.0.1:3100", "[::1]:3000", "", null]) {
    assert.deepEqual(kind(host), { kind: "app" }, String(host));
  }
  assert.deepEqual(kind("staging.example.org", { rootDomain: "shopinbos.com", appHosts: ["https://staging.example.org"] }), { kind: "app" }, "the configured app URL's host");
});

test("reserved and multi-level subdomains are never stores", () => {
  for (const sub of ["app", "www", "api", "admin", "supplier", "logistics", "mail", "support", "docs", "status", "cdn"]) {
    assert.deepEqual(kind(`${sub}.shopinbos.com`), { kind: "app" }, sub);
    assert.deepEqual(kind(`${sub}.localhost:3100`, local), { kind: "app" }, `${sub}.localhost`);
  }
  assert.deepEqual(kind("a.b.shopinbos.com"), { kind: "app" });
  assert.deepEqual(kind("-bad-.shopinbos.com"), { kind: "app" });
  assert.deepEqual(kind("under_score.shopinbos.com"), { kind: "app" });
});

test("a store subdomain maps to its slug (ports, case and trailing dots don't matter)", () => {
  assert.deepEqual(kind("adas-closet.shopinbos.com"), { kind: "store", slug: "adas-closet" });
  assert.deepEqual(kind("ADAS-Closet.ShopInBos.COM"), { kind: "store", slug: "adas-closet" });
  assert.deepEqual(kind("adas-closet.shopinbos.com.:443"), { kind: "store", slug: "adas-closet" });
  assert.deepEqual(kind("adas-closet.shopinbos.com."), { kind: "store", slug: "adas-closet" });
  assert.deepEqual(kind("adas-closet.localhost:3100", local), { kind: "store", slug: "adas-closet" });
  assert.deepEqual(kind("adas-closet.localhost", prod), { kind: "store", slug: "adas-closet" }, "*.localhost works in dev whatever the root");
  assert.deepEqual(kind("shop1.shopinbos.dev", { rootDomain: "www.shopinbos.dev" }), { kind: "store", slug: "shop1" }, "root from env, www stripped");
  assert.deepEqual(kind("shopinbos.dev", { rootDomain: "shopinbos.dev" }), { kind: "app" });
});

test("anything else with a real domain name is a custom domain; junk is unknown", () => {
  assert.deepEqual(kind("Shop.AdasCloset.ng."), { kind: "custom", domain: "shop.adascloset.ng" });
  assert.deepEqual(kind("adascloset.com:8080"), { kind: "custom", domain: "adascloset.com" });
  assert.deepEqual(kind("evilshopinbos.com"), { kind: "custom", domain: "evilshopinbos.com" }, "not a subdomain of ours");
  assert.deepEqual(kind("10.0.0.7"), { kind: "unknown" });
  assert.deepEqual(kind("[2001:db8::1]:443"), { kind: "unknown" });
  assert.deepEqual(kind("intranet"), { kind: "unknown" });
  assert.deepEqual(kind("bad_host.com"), { kind: "unknown" });
  assert.deepEqual(kind("example.123"), { kind: "unknown" });
});

test("normalizeHost and hostsFromList", () => {
  assert.equal(routing.normalizeHost(" HTTPS://Shop.Example.com.:443/path "), "shop.example.com");
  assert.equal(routing.normalizeHost("[::1]:3000"), "::1");
  assert.equal(routing.normalizeHost("localhost:"), "localhost");
  assert.deepEqual(routing.hostsFromList(["https://a.com, https://b.com:8443", undefined, ""]), ["a.com", "b.com"]);
});

test("store hosts: storefront pages are rewritten, portals never served, storefront APIs and assets pass", () => {
  const act = (path) => routing.storePathAction(path, "adas-closet");
  assert.deepEqual(act("/"), { action: "rewrite", pathname: "/s/adas-closet" });
  assert.deepEqual(act("/product/abc123"), { action: "rewrite", pathname: "/s/adas-closet/product/abc123" });
  assert.deepEqual(act("/checkout"), { action: "rewrite", pathname: "/s/adas-closet/checkout" });
  for (const portal of ["/home", "/home/orders", "/admin", "/admin/users", "/supplier", "/logistics", "/login", "/onboarding/rex", "/s/other-store"]) {
    assert.deepEqual(act(portal), { action: "rewrite", pathname: `/s/adas-closet${portal}` }, portal);
  }
  assert.deepEqual(act("/admin/report.json"), { action: "rewrite", pathname: "/s/adas-closet/admin/report.json" }, "a dot doesn't open a portal path");
  for (const api of ["/api/app/store", "/api/admin/users", "/api/supplier/orders", "/api/logistics/x", "/api/auth/sync-user", "/api/webhooks/paystack", "/api", "/api/publicity"]) {
    assert.deepEqual(act(api), { action: "not-found" }, api);
  }
  for (const pass of ["/api/public/store/adas-closet/checkout", "/api/store/coupons/validate", "/_next/data/x.json", "/favicon.ico", "/robots.txt", "/sitemap.xml", "/brand/logo.svg", "/icon.png", "/store-templates/a/b.webp"]) {
    assert.deepEqual(act(pass), { action: "pass" }, pass);
  }
});

test("custom domains: www/apex twins match, exact wins, two claimants serve nobody", () => {
  assert.deepEqual(routing.customDomainCandidates("www.adas.ng"), ["www.adas.ng", "adas.ng"]);
  assert.deepEqual(routing.customDomainCandidates("adas.ng"), ["adas.ng", "www.adas.ng"]);
  assert.equal(routing.pickCustomDomainStore("www.adas.ng", [{ slug: "adas", customDomain: "adas.ng" }]), "adas");
  assert.equal(routing.pickCustomDomainStore("adas.ng", [{ slug: "adas", customDomain: "ADAS.ng" }, { slug: "other", customDomain: "www.adas.ng" }]), "adas");
  assert.equal(routing.pickCustomDomainStore("adas.ng", [{ slug: "a", customDomain: "adas.ng" }, { slug: "b", customDomain: "adas.ng" }]), null);
  assert.equal(routing.pickCustomDomainStore("adas.ng", []), null);
  assert.equal(routing.pickCustomDomainStore("adas.ng", [{ slug: "x", customDomain: "notadas.ng" }]), null);
});

test("the proxy routes store hosts before auth, keeps app-host auth, and the dead root middleware is gone", () => {
  const proxy = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  assert.ok(proxy.indexOf('if (route.kind !== "app") return routeStoreHost') < proxy.indexOf("csrfRejection("), "store hosts are routed before the app's checks");
  assert.match(proxy, /skippedOnAppHost\(request\.nextUrl\.pathname\)\) return NextResponse\.next\(\)/, "/s/ and /api/public stay untouched on app hosts");
  assert.doesNotMatch(proxy, /api\/public\|s\//, "the matcher no longer skips the storefront paths");
  assert.match(proxy, /resolveCustomDomainSlug\(/);
  const lookup = readFileSync(new URL("../src/lib/domains/lookup.ts", import.meta.url), "utf8");
  assert.match(lookup, /status: "active"/, "only active stores are served on custom domains");
  assert.match(lookup, /CACHE_TTL_MS = 60_000/);
  assert.equal(existsSync(new URL("../middleware.ts", import.meta.url)), false);
});
