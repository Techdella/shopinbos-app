// Pilot numbers (shared/pilot-numbers.ts): who sees them, link vs QR visits (the QR code carries ?src=qr), 7/30-day
// windows in Lagos time, followers, repeat buyers, resell totals, top videos with "orders for this product since the
// video went up", Plug joins at 0 until Plug, the CSV; plus the wiring (counter in the short-link redirect, seller
// page and phone screen, admin overview, sidebar, words in five languages).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pn = await import("../shared/pilot-numbers.ts");
const h = await import("../shared/shop-handle.ts");
const team = await import("../src/lib/admin-team/pure.ts");
const nav = await import("../src/lib/nav.ts");
const access = await import("../src/lib/auth/route-access.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shown only when a pilot feature is on", () => {
  assert.deepEqual([...pn.PILOT_NUMBER_FEATURES], ["post_to_plug", "resell", "notify_followers", "plug_follow_card"]);
  assert.equal(pn.pilotNumbersOn([]), false);
  assert.equal(pn.pilotNumbersOn(["group_buy", "ajo"]), false);
  assert.equal(pn.pilotNumbersOn(["ajo", "resell"]), true);
  assert.equal(pn.pilotNumbersOn(new Set(["plug_follow_card"])), true);
});

test("the QR code carries ?src=qr; the printed link stays plain", () => {
  assert.equal(h.shopQrUrl("https://app.shopinbos.com/@kemibags"), "https://app.shopinbos.com/@kemibags?src=qr");
  assert.equal(h.shopQrUrl("https://kemibags.mybos.store/?a=1"), "https://kemibags.mybos.store/?a=1&src=qr");
  assert.equal(h.shopQrUrl("https://app.shopinbos.com/@kemibags?src=qr"), "https://app.shopinbos.com/@kemibags?src=qr", "once");
  assert.equal(h.shopQrUrl("https://x.mybos.store/#top"), "https://x.mybos.store/?src=qr#top");
  assert.equal(h.shopShortLink("kemibags"), "https://app.shopinbos.com/@kemibags");
  assert.equal(pn.shopLinkSource("qr"), "qr");
  assert.equal(pn.shopLinkSource("QR "), "qr");
  assert.equal(pn.shopLinkSource(null), "link");
  assert.equal(pn.shopLinkSource("whatsapp"), "link");
  // Every place the code is drawn uses it.
  assert.match(read("src/components/shop-link/ShopShareCard.tsx"), /useQrDataUrl\(qrSrc \? "" : shopQrUrl\(shortUrl\)\)/);
  assert.match(read("src/app/home/store/share/print/page.tsx"), /QRCode\.toDataURL\(shopQrUrl\(link\.shortUrl\)/);
  assert.match(read("apps/mobile/src/app/shop-link.tsx"), /<QRCode value=\{shopQrUrl\(shortUrl\)\}/);
});

test("link previews and crawlers aren't visits", () => {
  assert.equal(pn.isLinkPreview("WhatsApp/2.23.20.0"), true);
  assert.equal(pn.isLinkPreview("facebookexternalhit/1.1"), true);
  assert.equal(pn.isLinkPreview("Googlebot/2.1"), true);
  assert.equal(pn.isLinkPreview(""), true);
  assert.equal(pn.isLinkPreview(null), true);
  assert.equal(pn.isLinkPreview("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"), false);
});

test("visits: 7 and 30 days in Lagos time, today included, link and QR apart", () => {
  const now = new Date("2026-11-10T23:30:00Z"); // 11 Nov, 00:30 in Lagos
  assert.equal(pn.lagosHitDay(now), "2026-11-11");
  assert.equal(pn.windowStartDay(now, 7), "2026-11-05");
  assert.equal(pn.windowStartDay(now, 30), "2026-10-13");
  const rows = [
    { day: "2026-11-11", source: "link", count: 3 },
    { day: new Date("2026-11-05T00:00:00Z"), source: "qr", count: 2 },
    { day: "2026-11-04", source: "link", count: 10 },
    { day: "2026-10-13", source: "qr", count: 1 },
    { day: "2026-10-12", source: "link", count: 100 },
  ];
  assert.deepEqual(pn.visitTotals(rows, now), { link7: 3, qr7: 2, link30: 13, qr30: 3, total7: 5, total30: 16 });
});

test("followers, repeat buyers and resell", () => {
  assert.deepEqual(
    pn.followerTotals([
      { source: "order", unfollowedAt: null },
      { source: "link", unfollowedAt: null },
      { source: "qr", unfollowedAt: null, count: 4 },
      { source: "plug", unfollowedAt: null },
      { source: "link", unfollowedAt: "2026-11-01T00:00:00Z" },
    ]),
    { total: 7, fromLink: 1, fromQr: 4, fromPlug: 1, fromOrders: 1 },
  );
  assert.deepEqual(pn.repeatBuyers([{ orderCount: 1 }, { orderCount: 2 }, { orderCount: 5 }, { orderCount: 0 }]), { buyers: 3, repeat: 2 });
  assert.equal(pn.REPEAT_BUYER_ORDERS, 2);
  assert.deepEqual(
    pn.resellSaleTotals([
      { status: "pending", lineTotal: 10_000, commissionAmount: 1000 },
      { status: "approved", lineTotal: 5_000, commissionAmount: 500 },
      { status: "paid", lineTotal: 2_000, commissionAmount: 200 },
      { status: "void", lineTotal: 9_000, commissionAmount: 900 },
      { status: "awaiting_payment", lineTotal: 9_000, commissionAmount: 900 },
    ]),
    { sales: 3, value: 17_000, commission: 1_700 },
  );
});

test("Plug joins are 0 until Plug launches", () => {
  assert.equal(pn.plugJoins({ fromPlug: 12 }, false), 0);
  assert.equal(pn.plugJoins({ fromPlug: 12 }, true), 12);
  assert.equal(h.PLUG_LIVE, false);
});

test("top videos: most viewed first, orders for the product only after the video went up", () => {
  const videos = [
    { id: "v1", productId: "p1", caption: "Bag", views: 40, createdAt: "2026-11-01T00:00:00Z" },
    { id: "v2", productId: "p2", caption: "Shoe", views: 90, createdAt: "2026-11-03T00:00:00Z" },
    { id: "v3", productId: "p3", caption: "Hat", views: 5, createdAt: "2026-11-02T00:00:00Z" },
  ];
  const orders = [
    { createdAt: "2026-10-31T00:00:00Z", productIds: ["p1"] }, // before v1 went up
    { createdAt: "2026-11-02T00:00:00Z", productIds: ["p1", "p2"] }, // p2 before v2
    { createdAt: "2026-11-04T00:00:00Z", productIds: ["p2"] },
    { createdAt: "2026-11-05T00:00:00Z", productIds: ["p1"] },
  ];
  const top = pn.topVideos(videos, orders, 2);
  assert.deepEqual(top.map((video) => [video.id, video.views, video.ordersSince]), [["v2", 90, 1], ["v1", 40, 2]]);
  assert.deepEqual(pn.orderProductIds([{ productId: "a" }, { productId: "a" }, { name: "x" }, null, { productId: "b" }]), ["a", "b"]);
  assert.deepEqual(pn.orderProductIds("nope"), []);
});

test("CSV: one row per shop, no personal data, Plug joins say when they start", () => {
  const numbers = {
    plugLive: false,
    plugJoins: 0,
    visits: { link7: 1, qr7: 2, link30: 3, qr30: 4, total7: 3, total30: 7 },
    followers: { total: 9, fromLink: 1, fromQr: 2, fromPlug: 0, fromOrders: 6 },
    buyers: { buyers: 5, repeat: 2 },
    resell: { sales: 3, value: 30_000, commission: 3_000 },
    videos: [{ id: "v", productId: "p", productName: "=Bag", caption: "", views: 50, ordersSince: 4, createdAt: "2026-11-01T00:00:00Z" }],
    videoViews: 80,
  };
  const [head, row] = pn.pilotCsv([{ shopName: "Kemi Bags", handle: "kemibags", numbers, videoCount: 2 }]).split("\r\n");
  assert.match(head, /^"Shop","Handle","Link visits \(7 days\)"/);
  assert.equal(row, '"Kemi Bags","kemibags","1","2","3","4","Starts when Plug launches","9","3","5","2","3","30000","3000","2","80","\'=Bag","50","4"');
});

test("wiring: the short link counts visits once a day per source, never for previews", () => {
  const route = read("src/app/h/[handle]/route.ts");
  assert.match(route, /if \(!isLinkPreview\(req\.headers\.get\("user-agent"\)\)\) await recordShopLinkHit\(store\.id, shopLinkSource\(req\.nextUrl\.searchParams\.get\(SHOP_QR_PARAM\)\)\)/);
  assert.ok(route.indexOf("recordShopLinkHit(") < route.indexOf("NextResponse.redirect(shopLinkTarget(store,"), "counted before redirecting");
  const server = read("src/lib/pilot-numbers.server.ts");
  assert.match(server, /ON CONFLICT \("storeId", "day", "source"\) DO UPDATE SET "count" = "ShopLinkHit"\."count" \+ 1/);
  assert.match(server, /export async function recordShopLinkHit[\s\S]*?catch \(error\)/, "never throws");
  assert.match(server, /plugJoins: plugJoins\(followers, PLUG_LIVE\)/);
  assert.match(read("docs/migrations/2026-12-16-payout-ledger.sql"), /CREATE UNIQUE INDEX IF NOT EXISTS "ShopLinkHit_storeId_day_source_key" ON "ShopLinkHit" \("storeId", "day", "source"\)/);
});

test("wiring: seller page and phone screen, only for pilot shops, in five languages", () => {
  const page = read("src/app/home/pilot-numbers/page.tsx");
  assert.match(page, /requireRole\(\["seller"\]/);
  assert.match(page, /if \(!\(await pilotNumbersOnForOwner\(user\.id\)\)\) notFound\(\)/);
  assert.ok(access.rolesForPath("/home/pilot-numbers")?.includes("seller"));
  const api = read("src/app/api/app/pilot-numbers/route.ts");
  assert.match(api, /export const GET = withSeller/);
  assert.match(api, /pilotNumbersOnFor\(user\.id, appFromHeaders\(req\.headers\), version\)/);
  assert.match(api, /where: \{ userId: user\.id \}/, "the caller's own shop");
  assert.ok(existsSync(new URL("../apps/mobile/src/app/pilot-numbers.tsx", import.meta.url)));
  assert.match(read("apps/mobile/src/lib/pilot-numbers.ts"), /useFeature\(PILOT_NUMBER_FEATURES\[0\]\)/);
  assert.match(read("apps/mobile/src/app/(tabs)/shop.tsx"), /pilotNumbersOn \? <Row testID="shop-pilot-numbers"[\s\S]*?router\.push\("\/pilot-numbers"\)/);
  assert.match(read("src/app/home/analytics/page.tsx"), /pilotOn \? <PillLink href="\/home\/pilot-numbers"/);
  for (const key of Object.keys(CATALOGS.pilotNumbers.en)) {
    for (const locale of ["pcm", "yo", "ha", "ig"]) assert.ok(CATALOGS.pilotNumbers[locale][key], `${locale}/${key}`);
  }
  assert.match(CATALOGS.pilotNumbers.en["plug.soon"], /Starts when Plug launches/);
  assert.match(CATALOGS.pilotNumbers.en["videos.orders"], /since the video went up/);
});

test("wiring: admin overview + CSV in the analytics section, with a sidebar item and nav keys", () => {
  assert.match(read("src/app/admin/pilot-numbers/page.tsx"), /requireAdminSection\("analytics"\)/);
  assert.match(read("src/app/api/admin/pilot-numbers/export/route.ts"), /withAdmin\(/);
  assert.equal(team.sectionForPath("/admin/pilot-numbers"), "analytics");
  assert.equal(team.adminCanOpen("finance", "/admin/pilot-numbers"), true);
  assert.equal(team.adminCanOpen("support", "/api/admin/pilot-numbers/export"), false);
  // /admin/pilot stays the pilot testing programme.
  assert.equal(team.sectionForPath("/admin/pilot"), "leads");
  const item = nav.NAV_BY_ROLE.admin.flatMap((group) => group.items).find((entry) => entry.id === "pilot-numbers");
  assert.equal(item?.href, "/admin/pilot-numbers");
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) assert.ok(CATALOGS.nav[locale]["admin.pilot-numbers"], locale);
});
