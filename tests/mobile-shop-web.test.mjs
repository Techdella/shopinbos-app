// The seller's My shop tab and the tools that used to open the web app (round 2): the 2×2 tiles, Web address
// (apps/mobile/src/app/domain.tsx), Packaging and labels (app/packaging.tsx), web paths that open the app's own
// screens (lib/web.ts openPath) and the seller screens that no longer send people to the website.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = (path) => read(`apps/mobile/src/${path}`);
const domain = await import("../apps/mobile/src/lib/domain-pure.ts");
const pack = await import("../apps/mobile/src/lib/packaging-pure.ts");
const prints = await import("../shared/print-orders.ts");
const packaging = await import("../shared/packaging.ts");
const { NAMESPACES, CATALOGS } = await import("../shared/i18n/catalog.ts");

test("Menu (was My shop): the Grow and Store grids are rows of three equal tiles, never a percentage width that wraps at 360px", () => {
  const shop = app("app/(tabs)/shop.tsx");
  const grid = shop.slice(shop.indexOf("function ToolGrid("), shop.indexOf("export default function Menu"));
  assert.match(grid, /tools\.slice\(index, index \+ 3\)/);
  assert.match(grid, /flexDirection: "row", gap: 12/);
  assert.match(grid, /flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0/, "equal tiles: no width from the words, so the last row lines up");
  assert.doesNotMatch(grid, /width: "\d+(\.\d+)?%"|flexWrap/);
  // Web address and Packaging moved off the screen's top into the Look group; both are still app screens.
  assert.match(shop, /id: "domain", label: "Web address", icon: "globe", path: "app:\/domain"/);
  assert.match(shop, /id: "packaging", label: "Packaging and labels", icon: "box", path: "app:\/packaging"/);
});

test("My shop: no Sell everywhere and nothing that opens the web app", () => {
  const shop = app("app/(tabs)/shop.tsx");
  assert.doesNotMatch(shop, /id: "channels"|app:\/channels|openWeb|web:\//);
  for (const [, path] of shop.matchAll(/path: "app:(\/[^"]+)"/g)) {
    const base = new URL(`../apps/mobile/src/app${path}`, import.meta.url).pathname;
    const tab = new URL(`../apps/mobile/src/app/(tabs)${path}`, import.meta.url).pathname;
    assert.ok(existsSync(`${base}.tsx`) || existsSync(`${base}/index.tsx`) || existsSync(`${tab}.tsx`), `${path} has a screen`);
  }
  // No seller screen in this round's list links to Sell everywhere. (Web links to the connect pages open the app's
  // own Connect accounts screen, app/channels.tsx: tests/mobile-connect-bio.test.mjs.)
  for (const file of ["app/customers/[key].tsx", "app/start.tsx"]) assert.doesNotMatch(app(file), /router\.push\("\/channels"\)|: "\/channels"/, file);
});

test("web paths open the app's own screens; customer chats always open Chats or the chat", () => {
  const web = app("lib/web.ts");
  for (const [from, to] of [["/home/messages", "/chats"], ["/home/inbox", "/chats"], ["/home/domain", "/domain"], ["/home/labels/packaging", "/packaging"], ["/home/labels", "/packaging"], ["/channels", "/channels"], ["/home/messages/partners", "/partners"], ["/home/notifications", "/notifications"], ["/home/store", "/settings"]]) {
    if (to) assert.ok(web.includes(`"${from}": "${to}"`), `${from} → ${to}`);
  }
  // ?c= (and ?p= for partner chats) on /home/messages or /home/inbox open that conversation.
  assert.match(web, /\^\\\/home\\\/\(messages\|inbox\)\$\/\.test\(pathname\) && conversation\) return \{ pathname: "\/inbox\/\[id\]"/);
  assert.match(web, /partnerChat\) return \{ pathname: "\/partners\/\[id\]"/);
  // Details open their screen, then the shared notification table, and only then the website.
  for (const screen of ["/order/[id]", "/product/[id]", "/customers/[key]", "/reviews/[key]", "/payment-links/[id]", "/invoices/[id]", "/ads/[id]", "/find/[slug]"]) assert.ok(web.includes(`"${screen}"`), screen);
  assert.match(web, /const own = appScreenFor\(path\) \?\? appRouteFor\(path\);/);
  // Home's feed and notifications go through openPath.
  assert.match(app("app/(tabs)/home.tsx"), /openPath\(item\.href\)/);
  assert.match(app("lib/notifications.ts"), /openPath\(path\)/);
});

test("Web address: free address with copy and share, own domain status, connect with the DNS records, check", () => {
  const screen = app("app/domain.tsx");
  for (const call of ["fetchDomain", "claimDomain(", "verifyDomain(", "removeDomain(", "Clipboard.setStringAsync", "shareText(", "recordsToAdd(", "SetupHelpRequest"]) assert.ok(screen.includes(call), call);
  // Buying a domain isn't in the app, not even a link to the website (app store payment rules,
  // docs/store-payments-audit.md, tests/store-payments.test.mjs). Connecting one they own stays.
  assert.doesNotMatch(screen, /openWeb\(|canBuy/);
  const route = read("src/app/api/mobile/domain/route.ts");
  assert.match(route, /export const GET = withSeller/);
  assert.match(route, /getDomainSettings\(user\.id\)/);
  for (const path of ["src/app/api/domains/connect/route.ts", "src/app/api/domains/verify/route.ts"]) assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), path);
  const lib = app("lib/domain.ts");
  for (const path of ["/api/mobile/domain", "/api/domains/connect", "/api/domains/verify"]) assert.ok(lib.includes(path), path);
});

test("Web address: records required first, plain words for each check and claim refusal", () => {
  const records = [
    { purpose: "route", type: "A", name: "x.ng", label: "@", value: "1.2.3.4", required: false, note: "" },
    { purpose: "verify", type: "TXT", name: "_shopinbos-verify.x.ng", label: "_shopinbos-verify", value: "shopinbos-verify=abc", required: true, note: "" },
    { purpose: "route", type: "CNAME", name: "www.x.ng", label: "www", value: "cname.vercel-dns.com", required: true, note: "" },
  ];
  assert.deepEqual(domain.recordsToAdd(records).map((record) => record.type), ["TXT", "CNAME", "A"]);
  assert.equal(domain.checkKey(null), null);
  assert.equal(domain.checkKey({ ok: true }), "check.ok");
  assert.equal(domain.checkKey({ ok: false, code: "mismatch", message: "" }), "check.mismatch");
  assert.equal(domain.checkKey({ ok: false, code: "timeout", message: "" }), "check.later");
  assert.equal(domain.checkKey({ ok: false, code: "no_record", message: "" }), "check.notYet");
  assert.equal(domain.claimErrorKey("invalid_domain", "That address belongs to Shopinbos or its hosting."), "err.platform");
  assert.equal(domain.claimErrorKey("invalid_domain", "That doesn't look like a domain."), "err.invalid");
  assert.equal(domain.claimErrorKey("domain_taken", ""), "err.taken");
  assert.equal(domain.claimErrorKey("PLAN_LIMIT", "Upgrade to Starter"), null);
});

test("Packaging: pick a template, preview with the shop's name and logo, save, order prints or ask the team", () => {
  const screen = app("app/packaging.tsx");
  for (const call of ["templatesFor(", "startDesign(", "<PackFront", "saveDesign(", "orderPrints(", "askTeam(", "writeWords(", "quotePrint("]) assert.ok(screen.includes(call), call);
  // Peggy's words spend AI credits: out of credits shows the balance and that it refills monthly, nothing to buy.
  assert.match(screen, /error\.code === "AI_CREDITS_NEEDED"/);
  assert.match(screen, /<CreditsLine balance=\{credits\}/);
  // Paystack's own checkout page is the only page it opens (an in-app auth session that comes back by itself,
  // lib/pay.ts); nothing opens the web app.
  assert.match(app("lib/packaging.ts"), /payInApp\(\(app\) => api<[^>]+>\("\/api\/app\/print-orders"/);
  assert.match(screen, /result\.outcome === "cancelled"/);
  assert.doesNotMatch(screen, /openWeb\(/);
  // Template tiles: rows of two equal tiles.
  assert.match(screen, /flex: 1, \.\.\.surfaceCard\(\)/, "equal soft tiles");
  const lib = app("lib/packaging.ts");
  for (const path of ["/api/app/print-designs", "/api/app/packaging/copy", "/api/app/print-orders", "/api/app/packaging/requests"]) assert.ok(lib.includes(path), path);
  assert.match(read("src/app/api/app/print-designs/[id]/route.ts"), /export const GET = withSeller/);
  // The shipping labels screen stays as it was.
  assert.ok(existsSync(new URL("../apps/mobile/src/app/order/label.tsx", import.meta.url)));
});

test("Packaging: the phone's print price is the server's for every pack, run and zone", () => {
  for (const format of packaging.PACK_FORMATS) {
    for (const size of packaging.PACK_FORMAT_INFO[format].sizes) {
      for (const quantity of [...prints.QUANTITY_TIERS, 37, 777]) {
        for (const zone of prints.DELIVERY_ZONES.map((item) => item.id)) {
          const server = prints.quotePrint({ format, size, quantity, zone });
          const phone = pack.quotePrint({ format, size, quantity, zone });
          assert.deepEqual(
            [phone.quantity, phone.unitPrice, phone.setupFee, phone.deliveryFee, phone.total, phone.days],
            [server.quantity, server.unitPrice, server.setupFee, server.deliveryFee, server.total, server.days],
            `${format} ${quantity} ${zone}`,
          );
        }
      }
    }
    assert.equal(pack.minQuantity(format), prints.minQuantity(format));
  }
  assert.deepEqual([...pack.QUANTITY_TIERS], [...prints.QUANTITY_TIERS]);
  assert.deepEqual(pack.DELIVERY_ZONES.map((zone) => [zone.id, zone.fee]), prints.DELIVERY_ZONES.map((zone) => [zone.id, zone.fee]));
  assert.deepEqual(pack.quantityChoices("sachet"), [1000, 2500, 5000, 10000]);
  assert.deepEqual(pack.quantityChoices("pouch"), [100, 250, 500, 1000, 2500]);
});

test("Packaging: a new design carries the shop's name and logo, and the product when one is picked", () => {
  const sample = pack.startDesign({ shopName: "Ada's Kitchen", logoUrl: "https://cdn.x/logo.png", website: "https://ada.mybos.store", style: "kraft" });
  assert.equal(sample.content.brand, "Ada's Kitchen");
  assert.equal(sample.logoUrl, "https://cdn.x/logo.png");
  assert.equal(sample.productType, "food");
  assert.equal(sample.style, "kraft");
  const onProduct = pack.startDesign({ shopName: "Ada", logoUrl: "http://not-https/logo.png", website: "", style: "minimal", product: { id: "p1", name: "Shea body butter, 250g", images: ["https://cdn.x/p.jpg"] } });
  assert.equal(onProduct.productType, "beauty");
  assert.equal(onProduct.content.name, "Shea body butter");
  assert.equal(onProduct.productId, "p1");
  assert.equal(onProduct.image?.url, "https://cdn.x/p.jpg");
  assert.equal(onProduct.logoUrl, null, "only https logos");
  assert.ok(pack.formatsFor("beauty").includes(onProduct.format));
  assert.equal(pack.withWords(onProduct, { tagline: "Soft skin, all day" }).content.tagline, "Soft skin, all day");
  assert.equal(pack.shortName("Ofada rice (5kg) stone-free"), "Ofada rice");
});

test("seller screens no longer open the web app", () => {
  const files = [
    "app/settings.tsx", "app/payments.tsx", "app/order/[id].tsx", "app/product/[id].tsx", "app/customers/[key].tsx", "app/reviews/[key].tsx",
    "app/start.tsx", "app/delivery/zones.tsx", "app/ads/index.tsx", "app/marketing/automations.tsx", "app/marketing/subscribers.tsx",
    "app/marketing/automation/[id].tsx", "app/marketing/template/[id].tsx", "app/inbox/auto-replies.tsx", "app/inbox/chatbot.tsx",
    "app/video/[id].tsx", "app/legal.tsx", "app/legal/[key].tsx", "app/rex.tsx", "app/link-in-bio.tsx", "app/campaigns/new.tsx", "app/campaigns/[id].tsx",
  ];
  for (const file of files) assert.doesNotMatch(app(file), /openWeb\(|web-only/, file);
  // Ads: Meta's sign-in runs in an in-app browser and comes back to the app (shopinbos://ads).
  // The Meta connection card (connect, pick the account and Page) moved to components/MetaAdsCard.tsx (Ads and the ad wizard).
  assert.match(app("components/MetaAdsCard.tsx"), /connectMetaAds\(\)/);
  assert.match(app("lib/ads.ts"), /openAuthSessionAsync\(url, returnUrl\)/);
  assert.match(read("src/app/api/app/ads/meta/connect/route.ts"), /appReturnUrl\(req\.nextUrl\.searchParams\.get\("app"\)\)/);
  assert.match(read("src/app/api/app/ads/meta/callback/route.ts"), /appReturnUrl\(req\.cookies\.get\(META_ADS_APP_COOKIE\)\?\.value\)/);
  // Start here: every step opens a screen in the app.
  const start = app("app/start.tsx");
  assert.match(start, /domain: "\/domain"/);
  assert.match(start, /look: "\/templates"/);
  assert.match(start, /publishing\.publish\(\)/, "Go live publishes here (components/seller/PublishShop.tsx)");
  // The chatbot's questions and answers are edited here; legal pages are added here.
  assert.match(app("app/inbox/chatbot.tsx"), /<PairsEditor/);
  assert.match(app("app/legal.tsx"), /api<\{ key: string \}>\("\/api\/app\/legal", \{ method: "POST"/);
  // web-only is the admin screen only.
  const webOnly = app("app/web-only.tsx");
  assert.doesNotMatch(webOnly, /what|TOOLS|useLocalSearchParams/);
  assert.deepEqual([...webOnly.matchAll(/openWeb\("([^"]+)"\)/g)].map((match) => match[1]), ["/admin/dashboard"]);
});

test("m_domain and m_packaging are registered and complete in all five languages", () => {
  for (const ns of ["m_domain", "m_packaging"]) {
    assert.ok(NAMESPACES.includes(ns), ns);
    const keys = Object.keys(CATALOGS[ns].en);
    assert.ok(keys.length > 20, ns);
    for (const lang of ["pcm", "yo", "ha", "ig"]) for (const key of keys) assert.ok(CATALOGS[ns][lang][key], `${ns} ${lang} ${key}`);
  }
  for (const [ns, file] of [["m_domain", "app/domain.tsx"], ["m_packaging", "app/packaging.tsx"]]) {
    for (const [, key] of app(file).matchAll(/\bt\("([\w.]+)"/g)) assert.ok(CATALOGS[ns].en[key] || CATALOGS.common.en[key], `${file}: ${key}`);
  }
  for (const key of ["legal.addPage", "legal.pageName"]) assert.ok(CATALOGS.m_shop.en[key], key);
  for (const key of ["card.seeShop", "card.publish", "card.useLogoAsk"]) assert.ok(CATALOGS.m_rex.en[key], key);
  for (const key of ["bot.faqQ", "bot.faqA", "bot.faqAdd"]) assert.ok(CATALOGS.m_chats.en[key], key);
});
