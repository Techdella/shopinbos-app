// Phone app: connecting WhatsApp, Facebook & Instagram in the app (never the website's Sell everywhere page), and the
// link in bio as an onboarding step and on Home. Pure helpers (shared/app-connect.ts, apps/mobile/src/lib/channels-pure.ts,
// apps/mobile/src/lib/paylinks-pure.ts) plus source checks of the routes and screens.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(`${root}${path}`, "utf8");
const connect = await import("../shared/app-connect.ts");
const channels = await import("../apps/mobile/src/lib/channels-pure.ts");
const bio = await import("../apps/mobile/src/lib/paylinks-pure.ts");
const sc = await import("../src/lib/sales-channels/pure.ts");
const screens = await import("../shared/peggy-screens.ts");

// ─── Connecting accounts from the app ───────────────────────────────────────

test("the app's return address: shopinbos://connected?channel=…&status=…, older apps keep ?connected=", () => {
  for (const ok of ["shopinbos://connected", "shopinbos:///connected", "exp://192.168.1.20:8081/--/connected", "shopinbos://connected?x=1"]) assert.equal(connect.isConnectedReturn(ok), true, ok);
  for (const old of ["shopinbos://channels", "exp://127.0.0.1:8081/--/channels", "", null, "https://evil.example/connected"]) assert.equal(connect.isConnectedReturn(old), false, String(old));
  assert.equal(connect.appConnectedDeepLink("shopinbos://connected", "meta", "connected"), "shopinbos://connected?channel=meta&status=connected");
  assert.equal(connect.appConnectedDeepLink("exp://10.0.2.2:8081/--/connected?status=closed", "whatsapp", "problem"), "exp://10.0.2.2:8081/--/connected?status=problem&channel=whatsapp");
  assert.deepEqual(connect.readAppConnectedLink("shopinbos://connected?channel=whatsapp&status=connected"), { channel: "whatsapp", status: "connected" });
  assert.equal(connect.readAppConnectedLink("shopinbos://connected?channel=whatsapp&status=hacked"), null);
  assert.equal(connect.readAppConnectedLink(null), null);
  assert.equal(connect.appConnectedPagePath("shopinbos://connected?channel=meta&status=closed"), "/api/mobile/connected?to=shopinbos%3A%2F%2Fconnected%3Fchannel%3Dmeta%26status%3Dclosed");
  assert.equal(connect.appWhatsAppConnectPath("shopinbos://connected"), "/channels/whatsapp?app=shopinbos%3A%2F%2Fconnected");
  // The old format still works for apps already installed.
  assert.equal(sc.appResultUrl("shopinbos://channels", "meta", "connected"), "shopinbos://channels?connected=meta");
});

test("the phone reads both result formats, and builds the WhatsApp page's signed-in address", () => {
  for (const status of ["connected", "problem", "closed"]) {
    assert.equal(channels.connectOutcome(connect.appConnectedDeepLink("shopinbos://connected", "whatsapp", status), "whatsapp"), status);
  }
  assert.equal(channels.connectOutcome("shopinbos://connected?channel=meta&status=connected", "google"), "closed", "another platform's result doesn't count");
  assert.equal(channels.connectOutcome("shopinbos://channels?connected=meta", "meta"), "connected");
  const url = new URL(channels.whatsappConnectUrl("https://app.shopinbos.com", "shopinbos://connected", "a.b.c"));
  assert.equal(url.pathname, "/auth/handoff");
  assert.equal(url.searchParams.get("next"), "/channels/whatsapp?app=shopinbos%3A%2F%2Fconnected");
  assert.equal(url.hash, "#t=a.b.c");
  assert.equal(channels.whatsappConnectUrl("https://x.ng", "shopinbos://connected", null), "https://x.ng/channels/whatsapp?app=shopinbos%3A%2F%2Fconnected");
  assert.equal(channels.whatsappConnectUrl("https://x.ng", "shopinbos://connected", null), `https://x.ng${connect.appWhatsAppConnectPath("shopinbos://connected")}`);
});

test("the cards say which accounts are connected: the number, the Page and the Instagram", () => {
  const accounts = { whatsapp: "+234 803 000 0000", facebook: "Ada Fabrics", instagram: "@adafabrics" };
  assert.deepEqual(channels.accountLines("whatsapp", { kind: "connected", count: 3 }, accounts), [{ key: "whatsapp", name: "+234 803 000 0000" }]);
  assert.deepEqual(channels.accountLines("meta", { kind: "needs_account" }, accounts), [{ key: "facebook", name: "Ada Fabrics" }, { key: "instagram", name: "@adafabrics" }]);
  assert.deepEqual(channels.accountLines("meta", { kind: "connected", count: null }, { ...accounts, instagram: null }), [{ key: "facebook", name: "Ada Fabrics" }, { key: "noInstagram", name: "" }]);
  assert.deepEqual(channels.accountLines("meta", { kind: "connect" }, { whatsapp: null, facebook: null, instagram: null }), []);
  assert.deepEqual(channels.accountLines("google", { kind: "connected", count: 1 }, accounts), []);
  assert.deepEqual(channels.accountLines("meta", { kind: "connected", count: 1 }, undefined), []);
});

test("the \"Back to the app\" page: only the app's address, escaped, with a button", () => {
  const html = connect.appConnectedPageHtml("shopinbos://connected?channel=meta&status=connected", { lang: "en", title: "Back <to> Shopinbos", body: "Taking you back", button: "Back to the app" });
  assert.match(html, /<a href="shopinbos:\/\/connected\?channel=meta&amp;status=connected" id="back">Back to the app<\/a>/);
  assert.match(html, /<meta http-equiv="refresh" content="0;url=shopinbos:\/\/connected\?channel=meta&amp;status=connected">/);
  assert.match(html, /Back &lt;to&gt; Shopinbos/);
  assert.doesNotMatch(connect.appConnectedPageHtml('shopinbos://x"><script>', { lang: "en", title: "", body: "", button: "" }), /"><script>/);
  const route = read("src/app/api/mobile/connected/route.ts");
  assert.match(route, /const to = appReturnUrl\(req\.nextUrl\.searchParams\.get\("to"\)\);/, "only shopinbos:// (and Expo Go on this network)");
  assert.match(route, /if \(!to\) return NextResponse\.redirect\(new URL\("\/channels", req\.url\)\)/);
  assert.match(route, /"Cache-Control": "no-store"/);
});

test("the sign-in callback sends the app through the \"Back to the app\" page, after the state check", () => {
  const callback = read("src/app/api/app/sales-channels/[platform]/callback/route.ts");
  assert.match(callback, /isConnectedReturn\(app\) \? appConnectedDeepLink\(app, platform, result\) : appResultUrl\(app, platform, result\)/);
  assert.match(callback, /NextResponse\.redirect\(new URL\(appConnectedPagePath\(link\), req\.url\)\)/);
  assert.ok(callback.indexOf("checkCallbackState(") < callback.indexOf("appConnectedPagePath("));
  const start = read("src/app/api/app/sales-channels/[platform]/connect/route.ts");
  assert.match(start, /appConnectedPagePath\(isConnectedReturn\(app\)/);
});

test("WhatsApp's sign-up for the app: seller only, Meta's Embedded Signup and the web's save, then back to the app", () => {
  const page = read("src/app/channels/whatsapp/page.tsx");
  assert.match(page, /await requireRole\(\["seller"\], "\/login"\)/);
  assert.match(page, /appReturnUrl\(query\.app\) \?\? APP_CONNECTED_DEEP_LINK/, "only the app's own address");
  assert.match(page, /embeddedSignupConfig\(\)/);
  assert.match(page, /if \(!store \|\| !signup\) redirect\(back\("problem"\)\)/);
  const client = read("src/app/channels/whatsapp/WhatsAppAppConnect.tsx");
  assert.match(client, /await runEmbeddedSignup\(signup\)/);
  assert.match(client, /fetch\("\/api\/app\/inbox\/whatsapp", \{ method: "POST"[^\n]*action: "embedded_signup", \.\.\.info/);
  assert.match(client, /window\.location\.replace\(links\.connected\)/);
  assert.match(client, /<a href=\{links\.closed\}/);
  assert.doesNotMatch(client, /href="\/(channels|home)/, "no way into the rest of the website");
  // The page's words are loaded for it (src/lib/i18n/route-namespaces.generated.ts).
  assert.match(read("src/lib/i18n/route-namespaces.generated.ts"), /"\/channels\/whatsapp"/);
});

// ─── Link in bio ────────────────────────────────────────────────────────────

test("the starter link in bio: Shop now on top, WhatsApp kept, the seller's socials above Track my order", () => {
  let n = 0;
  const random = () => (++n % 97) / 97;
  const defaults = [
    { id: "auto-whatsapp", type: "whatsapp", phone: "+2348030000000", label: "Chat with us on WhatsApp" },
  ];
  const fresh = bio.starterBioBlocks(defaults, {}, random);
  assert.deepEqual(fresh.map((block) => block.type), ["shop", "whatsapp"], "a shop with no products still links to the shop");
  const selling = [
    { id: "auto-shop", type: "shop" },
    { id: "auto-arrivals", type: "arrivals" },
    { id: "auto-product-1", type: "product", productId: "p1", action: "page", featured: true },
    { id: "auto-whatsapp", type: "whatsapp", phone: "+2348030000000" },
    { id: "auto-track", type: "track" },
  ];
  const withSocials = bio.starterBioBlocks(selling, { instagram: " @Ada.Fabrics ", tiktok: "", facebook: "https://facebook.com/adafabrics" }, random);
  assert.deepEqual(withSocials.map((block) => block.type), ["shop", "arrivals", "product", "whatsapp", "socials", "track"]);
  assert.deepEqual(withSocials[4].links, { instagram: "@Ada.Fabrics", facebook: "https://facebook.com/adafabrics" });
  assert.match(withSocials[4].id, /^[A-Za-z0-9_-]+$/);
  // An existing socials block keeps what the seller set; only new ones are added.
  const merged = bio.starterBioBlocks([{ id: "s", type: "socials", links: { instagram: "@old" } }], { instagram: "@new", tiktok: "ada" }, random);
  assert.deepEqual(merged[1].links, { instagram: "@old", tiktok: "@ada" });
  assert.equal(bio.cleanHandle("  @@ada fabrics!"), "@adafabrics");
  assert.equal(bio.cleanHandle(""), "");
  assert.equal(bio.cleanHandle("javascript:alert(1)"), "@javascriptalert1");
  assert.equal(bio.cleanHandle("https://instagram.com/ada"), "https://instagram.com/ada");
  assert.ok(bio.starterBioBlocks(Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, type: "link", label: "x", url: "https://x.ng" })), { instagram: "ada" }).length <= bio.MAX_BIO_BLOCKS);
});

test("Home's link in bio card: the link once saved, Set it up before", () => {
  assert.deepEqual(bio.bioCardState(null), { kind: "loading" });
  assert.deepEqual(bio.bioCardState({ exists: false, published: true, url: "https://ada.shopinbos.com/links" }), { kind: "setup" });
  assert.deepEqual(bio.bioCardState({ exists: true, published: true, url: "https://ada.shopinbos.com/links" }), { kind: "live", url: "https://ada.shopinbos.com/links" });
  assert.deepEqual(bio.bioCardState({ exists: true, published: false, url: "u" }), { kind: "off", url: "u" });
  const home = read("apps/mobile/src/app/(tabs)/home.tsx");
  assert.match(home, /fetchBio\(\)\.then\(setBio\)\.catch\(\(\) => null\)/, "loaded with Home's extras, never a wall");
  assert.match(home, /<LinkInBioCard page=\{bio\}/);
  const card = read("apps/mobile/src/components/LinkInBioCard.tsx");
  assert.match(card, /Clipboard\.setStringAsync\(url\)/);
  assert.match(card, /shareText\(/);
  assert.match(card, /pathname: "\/onboarding\/bio", params: \{ from: "home" \}/);
  assert.match(card, /router\.push\("\/link-in-bio"\)/);
});

test("onboarding: after \"Your store is live!\" comes the link in bio step (skippable), then Home", () => {
  assert.match(read("apps/mobile/src/app/onboarding/index.tsx"), /onPress=\{\(\) => router\.push\("\/onboarding\/bio"\)\}/);
  assert.match(read("apps/mobile/src/app/onboarding/live.tsx"), /router\.push\("\/onboarding\/bio"\)/);
  const step = read("apps/mobile/src/app/onboarding/bio.tsx");
  assert.match(step, /saveBio\(\{ published: true[^\n]*blocks: starterBioBlocks\(page\.blocks, socials\)/);
  assert.match(step, /onSkip=\{saved \? null : \(\) => void leave\(\)\}/);
  assert.match(step, /await finishOnboarding\(Boolean\(status\?\.store\.live\)\)/);
  assert.match(step, /if \(fromHome\) return/, "from Home it goes back instead of finishing onboarding again");
  assert.match(step, /<LinkShareButtons url=\{saved\.url\}/);
});

test("Peggy can open Link in bio and Connect accounts", () => {
  const seller = screens.PEGGY_SCREENS.seller;
  assert.deepEqual(seller.find((s) => s.id === "link_in_bio")?.app, "/link-in-bio");
  assert.deepEqual(seller.find((s) => s.id === "connect_accounts")?.app, "/channels");
});
