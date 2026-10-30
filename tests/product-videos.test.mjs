// Product videos, "Post to Plug" (shared/product-videos.ts; pilot feature post_to_plug): a seller or supplier posts a
// short vertical video (≤ 60 s, ≤ 50 MB) on one of their own products, uploaded straight to Storage with a signed URL
// or taken from a finished Rex reel; it plays on the shop's product page (a supplier's only on shops that imported
// that product, never with the supplier's name) and, with "Show on Plug Discover", in GET /api/public/discover.
// Everything stays behind the post_to_plug switch for the pilot.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const v = await import("../shared/product-videos.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const LANGS = ["en", "pcm", "yo", "ha", "ig"];
const catalogs = Object.fromEntries(await Promise.all(LANGS.map(async (lang) => [lang, (await import(`../shared/i18n/messages/productVideos/${lang}.ts`)).default])));

const opts = { supabaseUrl: "https://abc.supabase.co", bucket: "shopinbos-media", ownerKind: "store", ownerId: "store1" };
const base = "https://abc.supabase.co/storage/v1/object/public/shopinbos-media/product-videos/store/store1/";

test("limits: 60 seconds, 50 MB, MP4 or MOV; a poster up to 2 MB", () => {
  assert.equal(v.PRODUCT_VIDEO_MAX_MS, 60_000);
  assert.equal(v.PRODUCT_VIDEO_MAX_BYTES, 50 * 1024 * 1024);
  assert.equal(v.productVideoProblem({ type: "video/mp4", size: 20_000_000, durationMs: 45_000 }), null);
  assert.equal(v.productVideoProblem({ type: "video/quicktime", size: 1_000, durationMs: 60_800 }), null, "a picker's rounding is fine");
  assert.equal(v.productVideoProblem({ type: "video/mp4", size: 1_000, durationMs: 75_000 }), "too_long");
  assert.equal(v.productVideoProblem({ type: "video/mp4", size: 51 * 1024 * 1024 }), "too_big");
  assert.equal(v.productVideoProblem({ type: "video/mp4", size: 0 }), "empty");
  assert.equal(v.productVideoProblem({ type: "video/webm", size: 10 }), "type");
  assert.equal(v.productVideoProblem({ type: "text/html", size: 10 }), "type");
  assert.equal(v.productVideoProblem({ type: "video/mp4; codecs=avc1", size: null, durationMs: null }), null, "unknown size and length are checked later");
  assert.equal(v.productPosterProblem({ type: "image/jpeg", size: 90_000 }), null);
  assert.equal(v.productPosterProblem({ type: "image/jpeg", size: 3 * 1024 * 1024 }), "too_big");
  assert.equal(v.productPosterProblem({ type: "image/svg+xml", size: 10 }), "type");
  assert.equal(v.cleanVideoDurationMs(12_345.6), 12_346);
  assert.equal(v.cleanVideoDurationMs(500_000), 61_000, "capped");
  assert.equal(v.cleanVideoDurationMs(-1), null);
  assert.equal(v.cleanVideoDurationMs(null), null);
  assert.equal(v.cleanDimension(1080), 1080);
  assert.equal(v.cleanDimension(0), null);
  assert.equal(v.cleanDimension(99_999), null);
});

test("vertical is preferred: other shapes are allowed with a warning", () => {
  assert.equal(v.orientationOf(1080, 1920), "vertical");
  assert.equal(v.orientationOf(1080, 1080), "square");
  assert.equal(v.orientationOf(1920, 1080), "horizontal");
  assert.equal(v.orientationOf(null, 1920), null);
  assert.equal(v.shouldWarnNotVertical(1080, 1920), false);
  assert.equal(v.shouldWarnNotVertical(1920, 1080), true);
  assert.equal(v.shouldWarnNotVertical(1000, 1000), true);
  assert.equal(v.shouldWarnNotVertical(null, null), false, "unknown: no warning");
  // The server never refuses a horizontal video.
  assert.equal(v.productVideoProblem({ type: "video/mp4", size: 1000, durationMs: 10_000 }), null);
});

test("files live under product-videos/<kind>/<ownerId>/ and only the owner's own uploads are accepted", () => {
  const path = v.productVideoPath("store", "store1", "video", "video/mp4", "abcdef1234567890", 1_700_000_000_000);
  assert.equal(path, "product-videos/store/store1/1700000000000-abcdef1234567890.mp4");
  assert.equal(v.productVideoPath("supplier", "sup1", "poster", "image/jpeg", "abcdef1234567890", 1).endsWith("-poster.jpg"), true);
  assert.throws(() => v.productVideoPath("store", "../x", "video", "video/mp4", "abcdef1234567890"));
  assert.throws(() => v.productVideoPath("admin", "x", "video", "video/mp4", "abcdef1234567890"));
  assert.throws(() => v.productVideoPath("store", "x", "video", "text/html", "abcdef1234567890"));

  assert.equal(v.isProductVideoUrl(`${base}1-abc.mp4`, opts), true);
  assert.equal(v.isProductVideoUrl(`${base}1-abc.mov`, opts), true);
  assert.equal(v.isProductVideoUrl(`${base}1-abc-poster.jpg`, { ...opts, kind: "poster" }), true);
  assert.equal(v.isProductVideoUrl(`${base}1-abc-poster.jpg`, opts), false, "a poster isn't a video");
  assert.equal(v.isProductVideoUrl(`${base}1-abc.mp4`, { ...opts, kind: "poster" }), false);
  assert.equal(v.isProductVideoUrl(`${base}1-abc.mp4`, { ...opts, ownerId: "store2" }), false, "another shop's folder");
  assert.equal(v.isProductVideoUrl(`${base}1-abc.mp4`, { ...opts, ownerKind: "supplier" }), false);
  assert.equal(v.isProductVideoUrl(`${base}x/1-abc.mp4`, opts), false);
  assert.equal(v.isProductVideoUrl(`${base}1-abc.mp4?x=1`, opts), false);
  assert.equal(v.isProductVideoUrl(base.replace("https:", "http:") + "1-abc.mp4", opts), false);
  assert.equal(v.isProductVideoUrl("https://evil.example/storage/v1/object/public/shopinbos-media/product-videos/store/store1/1.mp4", opts), false);
  assert.equal(v.isProductVideoUrl("https://abc.supabase.co/storage/v1/object/public/shopinbos-media/status/store1/1.mp4", opts), false, "a status video folder");
  assert.equal(v.isProductVideoUrl(`${base}1-abc.html`, opts), false);
  assert.equal(v.isProductVideoUrl(null, opts), false);
});

test("Show on Plug Discover: on by default in the pilot, off outside it; Discover needs the shop in the pilot", () => {
  assert.equal(v.POST_TO_PLUG, "post_to_plug");
  assert.equal(v.defaultShowOnDiscover(true), true);
  assert.equal(v.defaultShowOnDiscover(false), false);
  assert.equal(v.onDiscover({ status: "active", showOnDiscover: true }, true), true);
  assert.equal(v.onDiscover({ status: "active", showOnDiscover: true }, false), false);
  assert.equal(v.onDiscover({ status: "hidden", showOnDiscover: true }, true), false);
  assert.equal(v.onDiscover({ status: "active", showOnDiscover: false }, true), false);
  assert.equal(v.nextStatus("active", "hidden"), "hidden");
  assert.equal(v.nextStatus("hidden", "active"), "active");
  assert.equal(v.nextStatus("removed", "active"), null, "a removed video stays removed");
  assert.equal(v.nextStatus("active", "removed"), null, "removing is DELETE");
  assert.equal(v.cleanCaption("  Fresh   ankara\nprints \u0007 "), "Fresh ankara prints");
  assert.equal(v.cleanCaption("x".repeat(500)).length, v.CAPTION_MAX);
});

test("Rex reels: finished and no longer than 60 seconds", () => {
  assert.equal(v.rexReelUsable({ videoUrl: "https://cdn.example/reel.mp4", seconds: 30 }), true);
  assert.equal(v.rexReelUsable({ videoUrl: "https://cdn.example/reel.mp4", seconds: null }), true);
  assert.equal(v.rexReelUsable({ videoUrl: "https://cdn.example/reel.mp4", seconds: 90 }), false);
  assert.equal(v.rexReelUsable({ videoUrl: null, seconds: 10 }), false);
  assert.equal(v.rexReelUsable({ videoUrl: "javascript:alert(1)", seconds: 10 }), false);
});

const rows = [
  { id: "own1", ownerKind: "store", storeId: "s1", productId: "p1", videoUrl: "https://x/own1.mp4", posterUrl: "https://x/own1.jpg", caption: "Mine", status: "active", createdAt: "2026-12-01T10:00:00Z" },
  { id: "own2", ownerKind: "store", storeId: "s1", productId: "p1", videoUrl: "https://x/own2.mp4", status: "active", createdAt: "2026-12-02T10:00:00Z" },
  { id: "hid", ownerKind: "store", storeId: "s1", productId: "p1", videoUrl: "https://x/hid.mp4", status: "hidden", createdAt: "2026-12-03T10:00:00Z" },
  { id: "other", ownerKind: "store", storeId: "s2", productId: "p1", videoUrl: "https://x/other.mp4", status: "active", createdAt: "2026-12-03T10:00:00Z" },
  { id: "sup1", ownerKind: "supplier", supplierId: "sup", productId: "sp1", videoUrl: "https://x/sup1.mp4", caption: "From the factory", status: "active", createdAt: "2026-12-04T10:00:00Z" },
  { id: "sup2", ownerKind: "supplier", supplierId: "sup", productId: "sp9", videoUrl: "https://x/sup2.mp4", status: "active", createdAt: "2026-12-04T10:00:00Z" },
];

test("a shop's product page: its own active videos, then the supplier's for the product it imported", () => {
  const input = { storeId: "s1", productId: "p1", supplierProductId: "sp1", supplierId: "sup", storeInPilot: true, supplierInPilot: true };
  assert.deepEqual(v.storefrontVideos(rows, input).map((video) => video.id), ["own2", "own1", "sup1"]);
  assert.deepEqual(v.storefrontVideos(rows, { ...input, supplierProductId: null, supplierId: null }).map((video) => video.id), ["own2", "own1"], "not imported: no supplier videos");
  assert.deepEqual(v.storefrontVideos(rows, { ...input, supplierInPilot: false }).map((video) => video.id), ["own2", "own1"]);
  assert.deepEqual(v.storefrontVideos(rows, { ...input, storeInPilot: false }), [], "the shop isn't in the pilot: nothing");
  // Nothing about who posted it reaches the shopper (no supplier branding).
  for (const video of v.storefrontVideos(rows, input)) {
    assert.deepEqual(Object.keys(video).sort(), ["caption", "durationMs", "height", "id", "posterUrl", "videoUrl", "width"]);
  }
  const many = Array.from({ length: 10 }, (_, i) => ({ ...rows[0], id: `m${i}` }));
  assert.equal(v.storefrontVideos(many, input).length, v.STOREFRONT_VIDEO_LIMIT);
});

test("Discover: cursor, area and an entry with no one's personal details", () => {
  const at = new Date("2026-12-05T08:00:00.000Z");
  const cursor = v.discoverCursor({ createdAt: at, id: "ckv123abc" });
  assert.deepEqual(v.readDiscoverCursor(cursor), { createdAt: at, id: "ckv123abc" });
  assert.equal(v.readDiscoverCursor("nope"), null);
  assert.equal(v.readDiscoverCursor("123_x;drop"), null);
  assert.equal(v.areaMatches("", null), true, "no area: every shop");
  assert.equal(v.areaMatches("Yaba", { state: "Lagos", city: "Lagos", area: "Yaba" }), true);
  assert.equal(v.areaMatches(" lagos ", { state: "Lagos", city: "Lagos", area: "Yaba" }), true);
  assert.equal(v.areaMatches("Abuja", { state: "Lagos", city: "Lagos", area: "Yaba" }), false);
  assert.equal(v.areaMatches("Yaba", null), false);

  const entry = v.discoverEntry(
    { ...rows[0], views: 7, createdAt: at },
    { id: "p1", name: "Ankara bag", retailPrice: 14000, currency: "NGN", shortCode: "BAG2" },
    { handle: "kemibags", name: "Kemi Bags", url: "https://kemibags.mybos.store" },
  );
  assert.equal(entry.product.url, "https://kemibags.mybos.store/product/p1");
  assert.equal(entry.product.shortCode, "BAG2");
  assert.equal(entry.product.price, 14000);
  assert.equal(entry.shop.handle, "kemibags");
  assert.equal(entry.views, 7);
  const json = JSON.stringify(entry);
  for (const field of ["createdBy", "userId", "email", "phone", "supplierId", "storeId", "ownerKind"]) assert.equal(json.includes(field), false, field);
  assert.equal(v.videoId("ckv123abc456"), "ckv123abc456");
  assert.equal(v.videoId("../../x"), null);
});

test("migration and Prisma model: additive, indexed, RLS on", () => {
  const sql = read("docs/migrations/2026-12-14-product-videos.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ProductVideo"/);
  for (const column of ["ownerKind", "storeId", "supplierId", "productId", "videoUrl", "posterUrl", "durationMs", "width", "height", "caption", "showOnDiscover", "status", "views", "createdBy", "createdAt", "updatedAt"]) {
    assert.match(sql, new RegExp(`"${column}"`), column);
  }
  for (const index of ["ProductVideo_storeId_createdAt_idx", "ProductVideo_supplierId_createdAt_idx", "ProductVideo_productId_idx", "ProductVideo_showOnDiscover_status_createdAt_idx"]) {
    assert.match(sql, new RegExp(`CREATE INDEX IF NOT EXISTS "${index}"`), index);
  }
  assert.match(sql, /ALTER TABLE "ProductVideo" ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model ProductVideo {"));
  assert.ok(schema.includes("model ProductVideo {"));
  assert.match(model, /showOnDiscover\s+Boolean\s+@default\(false\)/);
  assert.match(model, /@@index\(\[showOnDiscover, status, createdAt\]\)/);
});

test("everything is behind post_to_plug: the API, the web pages, the phone and the shop page", () => {
  const shared = read("src/app/api/app/product-videos/_shared.ts");
  assert.match(shared, /postToPlugOnFor\(req, user\)/);
  assert.match(shared, /FEATURE_OFF/);
  assert.match(shared, /\["seller", "supplier"\]/);
  for (const path of ["src/app/api/app/product-videos/route.ts", "src/app/api/app/product-videos/upload-url/route.ts", "src/app/api/app/product-videos/[id]/route.ts"]) {
    assert.match(read(path), /withVideoOwner\(/, path);
    assert.doesNotMatch(read(path), /withAuth\(|withSeller\(/, path);
  }
  for (const path of ["src/app/products/[id]/page.tsx", "src/app/supplier/products/[id]/edit/page.tsx"]) {
    const page = read(path);
    assert.match(page, /featureOn\(user\.id, POST_TO_PLUG\)/, path);
    assert.match(page, /\{videosOn \? <ProductVideosPanel/, path);
  }
  const phone = read("apps/mobile/src/components/ProductVideos.tsx");
  assert.match(phone, /useFeature\(POST_TO_PLUG\)/);
  assert.match(phone, /if \(!on\) return null;/);
  assert.match(read("apps/mobile/src/app/product/[id].tsx"), /<ProductVideosCard ownerKind="store"/);
  assert.match(read("apps/mobile/src/app/supplier/product/[id].tsx"), /<ProductVideosCard ownerKind="supplier"/);
  // The phone says which app is asking, so the server checks the switch for that app.
  assert.match(read("apps/mobile/src/lib/product-videos.ts"), /appHeaders\(\)/);
  // The shop page and Discover ask whether the shop itself is in the pilot.
  const service = read("src/lib/product-videos/service.server.ts");
  assert.match(service, /pilotOwners\("store", \[storeId\]\)/);
  assert.match(read("src/lib/product-videos/discover.server.ts"), /shop\?\.on/);
  assert.match(read("src/lib/storefront/product-page.server.ts"), /productPageVideos\(store\.id, product\.id\)/);
});

test("uploads go straight to Storage with signed URLs and the stored file is checked", () => {
  const route = read("src/app/api/app/product-videos/upload-url/route.ts");
  assert.match(route, /signedProductVideoUpload/);
  assert.match(route, /checkRateLimitShared/);
  assert.doesNotMatch(route, /formData\(\)|arrayBuffer\(\)/, "no file bodies through a Vercel function");
  const storage = read("src/lib/product-videos/storage.server.ts");
  assert.match(storage, /createSignedUploadUrl/);
  assert.match(storage, /uploadContentProblem/);
  assert.match(storage, /PRODUCT_VIDEO_MAX_BYTES/);
  const service = read("src/lib/product-videos/service.server.ts");
  assert.match(service, /isProductVideoUrl\(input\.videoUrl/);
  assert.match(service, /storedProductVideoProblem\(videoUrl, "video"\)/);
  // The owner check: only the seller's own store product or the supplier's own product.
  assert.match(service, /storeProduct\.findFirst\(\{ where: \{ id: productId, storeId: owner\.id \}/);
  assert.match(service, /supplierProduct\.findFirst\(\{ where: \{ id: productId, supplierId: owner\.id \}/);
  // A Rex reel must be this store's own.
  assert.match(service, /videoProject\.findFirst\(\{ where: \{ id: String\(input\.rexProjectId\), storeId: owner\.id \}/);
  const web = read("src/components/product-videos/ProductVideosPanel.tsx");
  assert.match(web, /\/api\/app\/product-videos\/upload-url/);
  assert.match(web, /xhr\.open\("PUT", signedUrl\)/);
});

test("the shop's player: poster first, no autoplay until tapped, nothing loads early, no supplier branding", () => {
  const player = read("src/components/storefront/boutique/pdp/PdpVideos.tsx");
  assert.match(player, /preload="none"/);
  assert.match(player, /loading="lazy"/);
  assert.match(player, /\{playing \? \(/, "the video element only exists after a tap");
  assert.doesNotMatch(player, /<video[^>]*\bmuted\b/s, "no muted autoplay");
  const code = player.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /supplier|logo|businessName/i);
  assert.match(read("src/components/storefront/boutique/pdp/BoutiquePdp.tsx"), /<PdpVideos videos=\{product\.videos\}/);
});

test("Discover feed: public, cached briefly, views counted cheaply", () => {
  const feed = read("src/app/api/public/discover/route.ts");
  assert.match(feed, /cachedPublic\(/);
  assert.match(feed, /max-age=60/);
  assert.match(feed, /withCors/);
  assert.doesNotMatch(feed, /withAuth/);
  const discover = read("src/lib/product-videos/discover.server.ts");
  assert.match(discover, /showOnDiscover: true/);
  assert.match(discover, /status: "active"/);
  assert.match(discover, /status: "published"/);
  assert.doesNotMatch(discover, /email|phone|createdBy/);
  const view = read("src/app/api/public/discover/view/route.ts");
  assert.match(view, /checkRateLimit\(/);
  assert.match(view, /status: 204/);
  assert.match(discover, /views: \{ increment: 1 \}/);
});

test("words: every key in all five languages, same placeholders", () => {
  const en = catalogs.en;
  assert.ok(existsSync(new URL("../shared/i18n/messages/productVideos/index.ts", import.meta.url)));
  assert.match(read("shared/i18n/catalog.ts"), /import productVideos from "\.\/messages\/productVideos\/index\.ts";/);
  const holes = (text) => [...String(text).matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]).sort();
  for (const lang of LANGS.slice(1)) {
    for (const key of Object.keys(en)) {
      assert.ok(typeof catalogs[lang][key] === "string" && catalogs[lang][key].length > 0, `${lang} ${key}`);
      assert.deepEqual([...new Set(holes(catalogs[lang][key]))], [...new Set(holes(en[key]))], `${lang} ${key}`);
    }
    assert.match(read(`shared/i18n/messages/productVideos/${lang}.ts`), /^\/\/ Draft: needs native-speaker review/);
  }
});
