// The seller's "grow" screens from the canvas row "Seller app · sell, grow (ads, Rex, email, automations, popups),
// store" (apps/mobile/screens-v21/design-review-grow.md): the Menu tab (was My shop), the + sheet's new rows, Home's
// "All orders" and "From Peggy", Chats' Riders and Suppliers, the Ads totals, Boost from a Rex video, and the new
// phone screens Insights, Email (+ a new email Rex writes) and Popups (+ the editor) with their server routes.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = (path) => read(`apps/mobile/src/${path}`);
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));
const grow = await import("../apps/mobile/src/lib/grow-pure.ts");
const insights = await import("../src/lib/analytics/mobile-insights.ts");
const popups = await import("../src/lib/marketing/mobile-popups.ts");
const screens = await import("../shared/peggy-screens.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const LANGS = ["en", "pcm", "yo", "ha", "ig"];

test("Menu: Grow and Store grids, live counts, search, and every tile opens an app screen", () => {
  const shop = app("app/(tabs)/shop.tsx");
  const ids = (name) => {
    const block = shop.slice(shop.indexOf(`export const ${name}`), shop.indexOf("];", shop.indexOf(`export const ${name}`)));
    return [...block.matchAll(/id: "(\w+)"/g)].map((match) => match[1]);
  };
  assert.deepEqual(ids("GROW_TOOLS"), ["ads", "video", "email", "automations", "popups", "insights"]);
  assert.deepEqual(ids("STORE_TOOLS"), ["orders", "products", "editStore", "find", "delivery", "customers", "payouts", "settings"]);
  for (const [, path] of shop.matchAll(/path: "app:(\/[^"]+)"/g)) {
    const base = `apps/mobile/src/app${path}`;
    assert.ok(exists(`${base}.tsx`) || exists(`${base}/index.tsx`) || exists(`apps/mobile/src/app/(tabs)${path}.tsx`), `${path} has a screen`);
  }
  assert.match(shop, /count: "live"/);
  assert.match(shop, /count: "on"/);
  assert.match(shop, /liveAds\(ads\)/);
  assert.match(shop, /automationsOn\(flows\)/);
  assert.match(shop, /matchTools\(allTools, query\)/);
  assert.match(shop, /t\("menu\.seeStore"\)/);
  // Nothing on the Menu opens the website (Import from China, not open yet, isn't a tile: see the ids above).
  assert.doesNotMatch(shop, /openWeb|web:\//);
  // The tab: "Menu", with the shop's logo or initials.
  assert.equal(CATALOGS.nav.en["tab.shop"], "Menu");
  assert.match(app("app/(tabs)/_layout.tsx"), /avatar: tab\.name === "shop" && shop/);
  assert.match(app("components/TabBar.tsx"), /item\.avatar \?/);
});

test("Menu counts and search (pure)", () => {
  assert.equal(grow.liveAds({ campaigns: [{ status: "running" }, { status: "paused" }], boosts: [{ status: "running" }, { status: "ended" }] }), 2);
  assert.equal(grow.liveAds(null), 0);
  assert.equal(grow.automationsOn({ flows: [{ active: true }, { active: false }, { active: true }] }), 2);
  const tools = [{ words: ["Popups", "Offers on your shop"] }, { words: ["Àkíyèsí", "Insights"] }];
  assert.equal(grow.matchTools(tools, "offer").length, 1);
  assert.equal(grow.matchTools(tools, "akiyesi").length, 1, "accents don't matter");
  assert.equal(grow.matchTools(tools, " ").length, 2);
  assert.deepEqual(grow.adsTotals({ campaigns: [{ currency: "NGN", stats: { spend: 7500, reach: 18000, orders: 9 } }, { currency: "USD", stats: { spend: 10, reach: 400, orders: 1 } }], boosts: [{ stats: { spend: 4500, orders: 2 } }] }), { spend: 12000, reach: 18400, orders: 12 });
});

test("+ sheet (board A-Seller-Create): Post to Status, Boost, Send an email, Automation, Popup, Run a sale, Pre-orders", () => {
  const sheet = app("components/CreateSheet.tsx");
  const order = ["/status/new", "/ads/new", "/marketing/email/new", "/marketing/automations", "/marketing/popup/new", "/campaigns/new", "/preorders"].map((path) => sheet.indexOf(`go("${path}")`));
  assert.ok(order.every((index) => index > 0), "every row is there");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "in the board's order");
  assert.equal(CATALOGS.m_home.en["create.web"], "Everything works here on your phone. It's all on shopinbos.com too.");
});

test("Home: All orders beside Needs you, and From Peggy", () => {
  const home = app("app/(tabs)/home.tsx");
  assert.match(home, /testID="home-all-orders"[\s\S]{0,120}router\.push\("\/orders"\)/);
  assert.match(home, /peggyLine\(data\.counts, t\)/);
  for (const lang of LANGS) for (const key of ["needs.allOrders", "fromPeggy"]) assert.ok(CATALOGS.m_home[lang][key], `${lang} ${key}`);
});

test("Rex video: Boost with an ad opens the app's ads flow for the video's product (no payment here)", () => {
  const video = app("app/video/[id].tsx");
  assert.match(video, /router\.push\(\{ pathname: "\/ads\/new", params: \{ product: row\.productId! \} \}\)/);
  assert.doesNotMatch(video, /payInApp|openWeb/);
});

test("Insights: the web's analytics loader, cut down for the phone", () => {
  const route = read("src/app/api/mobile/insights/route.ts");
  assert.match(route, /withSeller\(/);
  assert.match(route, /loadAnalytics\(store\.id, range\)/);
  assert.match(route, /const RANGES = new Set\(\["today", "7d", "30d"\]\)/);
  const kpis = (sales, orders, visits, conversionRate) => ({ sales, orders, visits, conversionRate, aov: 0, customers: 0, returningCustomers: 0, returningRate: null, refundsCount: 0, refundsValue: 0, placedOrders: orders });
  const report = {
    kpis: kpis(412500, 27, 1840, 0.015),
    previous: kpis(318000, 21, 1520, 0.015),
    change: { sales: 30, orders: 29, visits: 21 },
    sources: [
      { key: "whatsapp", label: "WhatsApp", visits: 520 },
      { key: "instagram", label: "Instagram", visits: 210 },
      { key: "tiktok", label: "TikTok", visits: 180 },
      { key: "ads", label: "Ads", visits: 60 },
      { key: "x", label: "X", visits: 20 },
      { key: "", label: "Direct or untagged", visits: 10 },
    ],
    topProducts: [1, 2, 3, 4].map((n) => ({ key: `p${n}`, productId: `p${n}`, name: `P${n}`, image: null, quantity: 10 - n, sales: 1000, views: null })),
  };
  const summary = insights.insightsSummary(report, "7d", true);
  assert.deepEqual(summary.sales, { value: 412500, change: 30, diff: 94500 });
  assert.equal(summary.sources.length, 5, "four sources and Other");
  assert.deepEqual(summary.sources.at(-1), { key: "other", label: "Other", visits: 30, share: 30 / 1000 });
  assert.equal(summary.bestSellers.length, 3);
  assert.deepEqual(insights.insightsSummary({ ...report, sources: [] }, "today", false).sources, []);
  assert.equal(grow.percent(0.015), "1.5%");
  assert.equal(grow.percent(0.52), "52%");
  assert.equal(grow.percent(null), "–");
  assert.equal(grow.trend(5), "up");
  assert.equal(grow.trend(0), "same");
  assert.equal(grow.conversionTrend({ value: 0.015, previous: 0.015 }), "same");
  assert.equal(grow.conversionTrend({ value: 0.02, previous: null }), "none");
  const screen = app("app/insights.tsx");
  assert.match(screen, /fetchInsights\(range\)/);
  assert.ok(exists("src/app/home/analytics/page.tsx"));
});

test("Email: the list, and a new email Rex writes, sent as an email campaign", () => {
  assert.equal(grow.emailTab("sent"), "sent");
  assert.equal(grow.emailTab("sending"), "sent");
  assert.equal(grow.emailTab("scheduled"), "scheduled");
  assert.equal(grow.emailTab("cancelled"), "drafts");
  assert.equal(grow.openedShare([{ channel: "email", status: "sent", sentCount: 100, openCount: 41 }, { channel: "email", status: "sent", sentCount: 100, openCount: 35 }, { channel: "sms", status: "sent", sentCount: 50, openCount: 0 }]), 0.38);
  assert.equal(grow.openedShare([]), null);
  assert.equal(grow.lagosSlot(1, 9, Date.parse("2026-11-26T22:30:00Z")), "2026-11-27T09:00");
  assert.equal(grow.lagosSlot(1, 9, Date.parse("2026-11-26T23:30:00Z")), "2026-11-28T09:00", "it's already the 27th in Lagos at 23:30 UTC");
  assert.equal(grow.campaignName("  Fresh   prints  ", "New email"), "Fresh prints");
  assert.deepEqual(grow.EMAIL_AUDIENCES.repeat, { mode: "min_orders", value: 2 });
  const draft = read("src/app/api/mobile/marketing/email-draft/route.ts");
  assert.match(draft, /marketingRoute\(/);
  assert.match(draft, /meterAi\(user\.id, "text"\)/);
  assert.match(draft, /draftEmail\(store\.id, input\.instruction, current\)/);
  assert.match(draft, /htmlFromBlocks\(draft\.blocks\)/);
  const lib = app("lib/grow.ts");
  assert.match(lib, /"\/api\/app\/marketing\/campaigns", \{\s*method: "POST"/);
  assert.match(lib, /action: "send"/);
  assert.match(lib, /action: "schedule", scheduledAt: input\.when\.at/);
  const create = app("app/marketing/email/new.tsx");
  // Sending to the list asks first.
  assert.match(create, /onPress=\{\(\) => setConfirm\(true\)\}/);
  assert.match(create, /testID="email-send-yes"[\s\S]{0,80}finish\("now"\)/);
  assert.doesNotMatch(create + app("app/marketing/email/index.tsx"), /openWeb|payInApp/);
});

test("Popups: list with switches and numbers, and an editor that sends the whole form back", () => {
  const route = read("src/app/api/mobile/marketing/popups/route.ts");
  assert.match(route, /marketingRoute\(/);
  assert.match(route, /isPopup: true/);
  assert.match(route, /marketingFormStat\.groupBy/);
  const stored = popups.mobilePopup({ id: "f1", name: "Welcome", type: "newsletter", isPopup: true, active: true, fields: [{ key: "email", type: "email", label: "Email" }], design: { headline: "Hi" }, popupConfig: { trigger: "delay", delaySeconds: 5, reward: { source: "new", type: "percentage", value: 10 } } }, { views: 2140, signups: 186 });
  assert.equal(stored.signup, true);
  assert.equal(stored.rewardText, "10% off");
  assert.equal(stored.fields[0].required, true, "email is always required");
  assert.equal(grow.signupRate(stored), "8.7%");
  const blank = popups.blankPopup("Ada's Kloset");
  assert.equal(blank.config.trigger, "delay");
  assert.equal(blank.config.delaySeconds, 5);
  assert.equal(blank.config.reward.value, 10);
  assert.ok(grow.asksWhatsapp(blank.fields));
  // The phone's changes.
  const later = grow.withWhen(blank.config, "exit_intent");
  assert.equal(later.trigger, "exit_intent");
  assert.equal(grow.withWhen(blank.config, "scroll").scrollPercent, 50);
  assert.equal(grow.asksWhatsapp(grow.withWhatsapp(blank.fields, false)), false);
  assert.deepEqual(grow.withWhatsapp([{ key: "email", type: "email", label: "Email", required: true }, { key: "name", type: "text", label: "Name", required: false }], true).map((field) => field.key), ["email", "phone", "name"]);
  assert.equal(grow.popupOffer(grow.withOffer(blank.config, 0)), 0);
  assert.equal(grow.popupOffer(grow.withOffer(blank.config, 15)), 15);
  assert.equal(grow.headlineForOffer("Get 10% off your first order", 10, 15), "Get 15% off your first order");
  assert.equal(grow.headlineForOffer("Get 110% happy", 10, 15), "Get 110% happy", "only the old offer's number changes");
  assert.equal(grow.headlineForOffer("Join our list", 10, 15), "Join our list");
  assert.equal(grow.popupOffer({ reward: { source: "existing", type: "percentage", value: 10 } }), null, "an existing code stays the web's");
  const body = grow.popupBody({ ...blank, config: { ...blank.config, kind: "game", redirectUrl: "" } });
  assert.equal(body.popupConfig.reward, null, "only sign-up pop-ups hand out a code");
  assert.equal(body.popupConfig.redirectUrl, undefined);
  assert.equal(grow.popupBody({ ...blank, type: "contact" }).type, "newsletter");
  const lib = app("lib/grow.ts");
  assert.match(lib, /\/api\/app\/marketing\/forms\/\$\{encodeURIComponent\(popup\.id\)\}`, \{ method: "PATCH", json: body \}/);
  assert.match(lib, /"\/api\/app\/marketing\/forms", \{ method: "POST", json: body \}/);
  assert.doesNotMatch(app("app/marketing/popups.tsx") + app("app/marketing/popup/[id].tsx"), /openWeb|payInApp/);
});

test("Peggy can open the new screens, and their words are in all five languages", () => {
  assert.equal(screens.findScreen("seller", "analytics").app, "/insights");
  assert.equal(screens.findScreen("seller", "newsletter").app, "/marketing/email");
  assert.equal(screens.findScreen("seller", "pop-up").app, "/marketing/popups");
  for (const lang of LANGS) for (const id of ["insights", "email", "popups"]) assert.ok(CATALOGS.m_help[lang][`call.screen.${id}`], `${lang} ${id}`);
  for (const lang of LANGS) {
    for (const key of Object.keys(CATALOGS.m_grow.en)) assert.ok(CATALOGS.m_grow[lang][key], `m_grow ${lang} ${key}`);
    for (const key of ["create.status", "create.email", "create.automation", "create.popup"]) assert.ok(CATALOGS.m_home[lang][key], `m_home ${lang} ${key}`);
    for (const key of ["chats.riders", "chats.suppliers"]) assert.ok(CATALOGS.m_chats[lang][key], `m_chats ${lang} ${key}`);
    assert.ok(CATALOGS.m_video[lang]["watch.boost"], `m_video ${lang}`);
  }
  // Placeholders survive translation.
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(CATALOGS.m_grow.en)) {
      for (const [, name] of value.matchAll(/\{(\w+)[,}]/g)) assert.ok(CATALOGS.m_grow[lang][key].includes(`{${name}`), `${lang} ${key} keeps {${name}}`);
    }
  }
});
