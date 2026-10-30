// Shop @handle, short link and QR (shared/shop-handle.ts): the rules, suggestions and numbered fallbacks, the short
// link's shape, the migration (additive, idempotent, reserved words in step with the code), the public redirect
// route and the proxy's /@handle rewrite, the owner-only change route, the web page and print sheet, the phone
// screen and its Menu entry, the Plug wording kept off, and the words in all five languages.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const h = await import("../shared/shop-handle.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const access = await import("../src/lib/auth/route-access.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const LANGS = ["en", "pcm", "yo", "ha", "ig"];

test("normaliseHandle: no @, no spaces around, lowercase, no accents", () => {
  assert.equal(h.normaliseHandle("  @KemiBags "), "kemibags");
  assert.equal(h.normaliseHandle("@@Adé_Wears"), "ade_wears");
  assert.equal(h.normaliseHandle(""), "");
});

test("handleProblem: 3-24 characters, a-z 0-9 _, starts with a letter, tidy underscores, not reserved", () => {
  for (const ok of ["kemibags", "ade_wears", "abc", "a12", "shop_of_kemi_2", "x".repeat(24)]) assert.equal(h.handleProblem(ok), null, ok);
  assert.equal(h.handleProblem("ab"), "short");
  assert.equal(h.handleProblem("x".repeat(25)), "long");
  assert.equal(h.handleProblem("1kemi"), "start");
  assert.equal(h.handleProblem("_kemi"), "start");
  assert.equal(h.handleProblem("kemi bags"), "chars");
  assert.equal(h.handleProblem("kemi.bags"), "chars");
  assert.equal(h.handleProblem("kemi-bags"), "chars");
  assert.equal(h.handleProblem("KemiBags"), "chars", "stored lowercase only");
  assert.equal(h.handleProblem("kemi__bags"), "underscore");
  assert.equal(h.handleProblem("kemibags_"), "underscore");
  for (const word of ["admin", "shopinbos", "plug", "support", "help", "api", "app", "login"]) assert.equal(h.handleProblem(word), "reserved", word);
});

test("suggestFromName: letters and digits from a name or address, padded or trimmed to fit", () => {
  assert.equal(h.suggestFromName("Kemi's Bags & Co."), "kemisbagsco");
  assert.equal(h.suggestFromName("kemi-bags"), "kemibags");
  assert.equal(h.suggestFromName("Àdùnní Fabrics"), "adunnifabrics");
  assert.equal(h.suggestFromName("Jo"), "joshop");
  assert.equal(h.suggestFromName("Admin"), "adminshop");
  assert.equal(h.suggestFromName("123 Stores Limited"), "storeslimited");
  assert.equal(h.suggestFromName("🙂🙂"), "");
  assert.equal(h.suggestFromName("The Very Long Name Of A Lagos Boutique").length, h.HANDLE_MAX);
  for (const name of ["Kemi's Bags", "Jo", "Admin", "The Very Long Name Of A Lagos Boutique"]) assert.equal(h.handleProblem(h.suggestFromName(name)), null, name);
});

test("handleCandidates: the address first, then the name, then numbered, all valid and unique", () => {
  const list = h.handleCandidates(["kemi-bags-a1b2c3", "Kemi Bags"], 5);
  assert.deepEqual(list.slice(0, 2), ["kemibagsa1b2c3", "kemibags"]);
  assert.ok(list.includes("kemibags2") && list.includes("kemibagsa1b2c32"));
  assert.equal(new Set(list).size, list.length);
  for (const item of list) assert.equal(h.handleProblem(item), null, item);
  assert.equal(h.withNumber("x".repeat(24), 12), `${"x".repeat(22)}12`);
  assert.equal(h.withNumber("kemi_", 3), "kemi3", "no _ left before the number");
  assert.deepEqual(h.handleCandidates(["", "🙂"]), []);
});

test("short link: app.shopinbos.com/@handle, and the proxy reads it back", () => {
  assert.equal(h.shopShortLink("kemibags"), "https://app.shopinbos.com/@kemibags");
  assert.equal(h.shopShortLink("kemibags", "http://localhost:3000/"), "http://localhost:3000/@kemibags");
  assert.equal(h.atHandle("kemibags"), "@kemibags");
  assert.equal(h.handleFromShortPath("/@KemiBags"), "kemibags");
  assert.equal(h.handleFromShortPath("/@kemibags/"), "kemibags");
  assert.equal(h.handleFromShortPath("/%40kemibags"), "kemibags");
  for (const path of ["/kemibags", "/@kemi/bags", "/@", "/@kemi.bags", "/home/@x", "/s/kemibags"]) assert.equal(h.handleFromShortPath(path), null, path);
  assert.equal(h.PLUG_LIVE, false, "Plug isn't out yet: the card says Shop with us on Shopinbos");
});

test("migration: additive, idempotent, lowercase unique, backfill only where it fits; reserved words match the code", () => {
  const sql = read("docs/migrations/2026-12-13-store-handle.sql");
  assert.match(sql, /ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "handle" TEXT;/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "Store_handle_key" ON "Store" \("handle"\);/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "Store_handle_lower_key" ON "Store" \(lower\("handle"\)\) WHERE "handle" IS NOT NULL;/);
  assert.match(sql, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'Store_handle_lowercase_check'\)/);
  assert.match(sql, /WHERE s\."handle" IS NULL/, "only shops without a handle");
  assert.match(sql, /row_number\(\) OVER \(PARTITION BY c\.h ORDER BY c\."createdAt", c\."id"\)/, "the older shop wins a clash");
  assert.match(sql, /f\.rn = 1/);
  assert.match(sql, /\^\[a-z\]\[a-z0-9_\]\{2,23\}\$/);
  assert.doesNotMatch(sql, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  const block = sql.split("-- reserved:start")[1].split("-- reserved:end")[0];
  const words = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...words].sort(), [...h.RESERVED_HANDLES].sort());
  const schema = read("prisma/schema.prisma");
  assert.match(schema.split("model Store {")[1].split("\n}")[0], /\n  handle\s+String\?\s+@unique/);
});

test("the short link is public and only ever redirects through shopLinkTarget", () => {
  const route = read("src/app/h/[handle]/route.ts");
  assert.match(route, /findStoreByHandle/);
  assert.match(route, /NextResponse\.redirect\(shopLinkTarget\(store,/);
  assert.match(route, /302/);
  assert.equal(access.rolesForPath("/h/kemibags"), null, "no sign-in for the short link");
  assert.equal(access.rolesForPath("/@kemibags"), null);
  const server = read("src/lib/shop-handle.server.ts");
  assert.match(server, /export function shopLinkTarget\([\s\S]*?return buildStorefrontUrl\(/, "today it opens the shop's website");
  assert.match(server, /updateMany\(\{ where: \{ id: store\.id, handle: null \}/, "lazy assignment never overwrites");
  assert.match(server, /"P2002"/);
  const proxy = read("src/proxy.ts");
  assert.match(proxy, /handleFromShortPath\(request\.nextUrl\.pathname\)[\s\S]*?url\.pathname = `\/h\/\$\{shortHandle\}`[\s\S]*?NextResponse\.rewrite\(url\)/);
  assert.ok(proxy.indexOf("handleFromShortPath(") < proxy.indexOf("skippedOnAppHost(request.nextUrl.pathname)"), "before any sign-in check");
});

test("changing the handle: seller only, owner only, validated before the rate limit", () => {
  const route = read("src/app/api/app/store/handle/route.ts");
  assert.match(route, /export const GET = withSeller/);
  assert.match(route, /export const PATCH = withSeller/);
  assert.match(route, /if \(user\.staff\) return apiError\("FORBIDDEN"/);
  assert.match(route, /where: \{ userId: user\.id \}/, "the caller's own store");
  assert.match(route, /checkRateLimitShared\(rateLimitKey\("shop-handle", user\.id\)/);
  assert.ok(route.indexOf("handleProblem(wanted)") < route.indexOf("checkRateLimitShared("), "typos don't use up the limit");
});

test("web: Shop link & QR page, print sheet, and the Share menu links to it", () => {
  for (const file of ["src/app/home/store/share/page.tsx", "src/app/home/store/share/print/page.tsx"]) {
    assert.match(read(file), /requireRole\(\["seller"\]/, file);
  }
  assert.ok(access.rolesForPath("/home/store/share")?.includes("seller"));
  const panel = read("src/app/home/store/share/ShopLinkPanel.tsx");
  assert.match(panel, /fetch\("\/api\/app\/store\/handle", \{ method: "PATCH"/);
  assert.match(panel, /toPng\(/, "Download for print");
  assert.match(panel, /\/home\/store\/share\/print\?size=sticker/);
  const card = read("src/components/shop-link/ShopShareCard.tsx");
  assert.match(card, /plug = PLUG_LIVE/);
  assert.match(card, /plug \? t\("card\.follow"\) : t\("card\.shopWith"\)/);
  assert.match(read("src/app/home/store/ShareStoreButton.tsx"), /href="\/home\/store\/share"/);
});

test("phone: Your shop link & QR screen, from the Menu", () => {
  assert.ok(existsSync(new URL("../apps/mobile/src/app/shop-link.tsx", import.meta.url)));
  const screen = read("apps/mobile/src/app/shop-link.tsx");
  assert.match(screen, /react-native-qrcode-svg/);
  assert.match(screen, /LinkShareButtons/);
  assert.match(screen, /changeShopHandle\(wanted\)/);
  assert.match(screen, /plug = PLUG_LIVE/);
  assert.match(read("apps/mobile/src/lib/shop-link.ts"), /"\/api\/app\/store\/handle"/);
  const menu = read("apps/mobile/src/app/(tabs)/shop.tsx");
  assert.match(menu, /id: "shopLink"[^\n]*path: "app:\/shop-link"/);
  assert.match(read("apps/mobile/src/components/store-editor/ShopEntry.tsx"), /router\.push\("\/shop-link"\)/);
});

test("every word is in all five languages", () => {
  const en = CATALOGS.shopLink.en;
  for (const key of ["title", "menu", "handle.label", "card.shopWith", "card.follow", "print.png", "shareText", "problem.taken", "problem.rate_limited"]) assert.ok(en[key], key);
  for (const lang of LANGS) {
    for (const key of Object.keys(en)) assert.ok(CATALOGS.shopLink[lang][key], `shopLink ${lang} ${key}`);
    for (const key of ["link.shopLink.label", "link.shopLink.hint"]) assert.ok(CATALOGS.m_shop[lang][key], `m_shop ${lang} ${key}`);
  }
  // Every error code the route sends has words.
  for (const code of ["short", "long", "start", "chars", "underscore", "reserved", "taken", "rate_limited"]) assert.ok(en[`problem.${code}`], code);
});
