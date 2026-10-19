// Ads, automations and email templates on the phone (apps/mobile/src/app/ads, app/marketing/automations,
// automation/[id], template/[id]): the pure modules checked against the web's own rules (shared/ad-campaigns.ts,
// src/lib/marketing/flows.ts) so the two never drift, the new mobile API routes, and the screens' wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pure = await import("../apps/mobile/src/lib/ads-pure.ts");
const web = await import("../shared/ad-campaigns.ts");
const marketing = await import("../apps/mobile/src/lib/marketing-pure.ts");
const flows = await import("../src/lib/marketing/flows.ts");
const { CATALOGS, NAMESPACES } = await import("../shared/i18n/catalog.ts");

const money = (n) => `₦${n.toLocaleString("en-NG")}`;
const audience = { countries: ["NG"], states: [], ageMin: 18, ageMax: 55, gender: "all", interests: [] };

test("the phone's ad lists and fees are the web's", () => {
  assert.deepEqual([...pure.AD_OBJECTIVES], [...web.AD_OBJECTIVES]);
  assert.deepEqual([...pure.AD_CTAS], [...web.AD_CTAS]);
  assert.deepEqual({ ...pure.AD_SETUP_FEES }, web.AD_SETUP_FEES);
  assert.deepEqual(pure.MIN_DAILY_BUDGET, web.MIN_DAILY_BUDGET);
  assert.deepEqual(pure.AD_COUNTRIES.map((c) => c.code), web.AD_COUNTRIES.map((c) => c.code));
  assert.deepEqual([...pure.NG_STATES], [...web.NG_STATES]);
  assert.equal(pure.campaignTotal(5000, 7), web.campaignTotal(5000, 7));
  assert.equal(pure.campaignTotal(2.5, 0), web.campaignTotal(2.5, 0));
});

test("campaign buttons follow the web: Meta launches, pauses, resumes and refreshes; running ones can't be deleted", () => {
  assert.deepEqual(pure.campaignActions({ mode: "meta", status: "draft" }), ["launch", "delete"]);
  assert.deepEqual(pure.campaignActions({ mode: "meta", status: "running" }), ["pause", "sync", "end"]);
  assert.deepEqual(pure.campaignActions({ mode: "meta", status: "paused" }), ["resume", "sync", "end", "delete"]);
  assert.deepEqual(pure.campaignActions({ mode: "managed", status: "draft" }), ["delete"]);
  assert.deepEqual(pure.campaignActions({ mode: "managed", status: "running" }), ["end"]);
  assert.deepEqual(pure.campaignActions({ mode: "meta", status: "ended" }), ["sync", "delete"]);
  assert.equal(pure.costPerOrder({ spend: 9000, orders: 3 }), 3000);
  assert.equal(pure.costPerOrder({ spend: 9000, orders: 0 }), null);
  assert.equal(pure.groupDigits(1234567), "1,234,567");
  assert.equal(pure.groupDigits(12.6), "13");
});

test("a new campaign starts on Meta only when it's connected; otherwise the team, with its setup fee", () => {
  assert.equal(pure.defaultMode({ configured: true, status: "connected" }), "meta");
  assert.equal(pure.defaultMode({ configured: true, status: "off" }), "managed_meta");
  assert.equal(pure.defaultMode({ configured: false, status: "connected" }), "managed_meta");
  assert.equal(pure.modeFee("meta"), 0);
  assert.equal(pure.modeFee("managed_meta"), web.AD_SETUP_FEES.meta);
  assert.equal(pure.modeFee("managed_tiktok"), web.AD_SETUP_FEES.tiktok);
});

test("each step's Next needs what the web wizard needs", () => {
  const base = { mode: "managed_meta", meta: { status: "off" }, productIds: ["p1"], audience, dailyBudget: 5000, currency: "NGN", days: 7, creatives: [{ headline: "Hi", primaryText: "Buy" }] };
  assert.equal(pure.canGoOn("how", base), true);
  assert.equal(pure.canGoOn("how", { ...base, mode: "meta" }), false, "Meta must be connected");
  assert.equal(pure.canGoOn("products", { ...base, productIds: [] }), false);
  assert.equal(pure.canGoOn("audience", { ...base, audience: { ...audience, ageMin: 40, ageMax: 30 } }), false);
  assert.equal(pure.canGoOn("budget", { ...base, dailyBudget: 999 }), false, "₦1,000 a day at least");
  assert.equal(pure.canGoOn("ads", { ...base, creatives: [{ headline: "Hi", primaryText: " " }] }), false);
  assert.equal(pure.canGoOn("review", base), true);
});

test("ads follow the chosen products, Peggy's words land on the right ad, and the bodies pass the web's checks", () => {
  const products = [{ id: "p1", name: "Ankara dress", price: 15000, image: "https://img/1.jpg" }, { id: "p2", name: "Bag", price: 8000, image: "https://img/2.jpg" }, { id: "p3", name: "No photo", price: 1, image: null }];
  let creatives = pure.syncCreatives([], products, ["p1", "p2", "p3"], "whatsapp", money);
  assert.deepEqual(creatives.map((c) => c.productId), ["p1", "p2"], "products without a photo get no ad");
  assert.equal(creatives[0].headline, "Ankara dress · ₦15,000");
  assert.equal(creatives[0].cta, "CONTACT_US");
  creatives = pure.applyCopy(creatives, [{ productId: "p2", headline: "Carry it all", primaryText: "Roomy bag." }]);
  assert.equal(creatives[1].primaryText, "Roomy bag.");
  creatives = pure.syncCreatives(creatives, products, ["p2"], "traffic", money);
  assert.deepEqual(creatives.map((c) => c.productId), ["p2"]);
  assert.equal(creatives[0].headline, "Carry it all", "words already written stay");

  const body = pure.campaignBody({ name: " Bag campaign ", mode: "managed_tiktok", objective: "traffic", productIds: ["p2"], audience, creatives, dailyBudget: 5000, currency: "USD", startAt: pure.lagosDayFrom(1), days: 7 });
  assert.equal(body.mode, "managed");
  assert.equal(body.platform, "tiktok");
  assert.equal(body.currency, "NGN", "the team's campaigns are in naira");
  assert.ok(web.CampaignInputSchema.safeParse(body).success, JSON.stringify(web.CampaignInputSchema.safeParse(body).error?.issues));
  const meta = pure.campaignBody({ name: "x", mode: "meta", objective: "awareness", productIds: ["p2"], audience, creatives, dailyBudget: 5, currency: "USD", startAt: pure.lagosToday(), days: 3 });
  assert.equal(meta.mode, "meta");
  assert.ok(web.CampaignInputSchema.safeParse(meta).success);

  const details = { name: "Ada Obi", phone: "08031234567", email: "", businessName: "Adire", handle: "", pageUrl: "", website: "", goals: "More orders" };
  assert.equal(pure.detailsReady("managed_tiktok", details), false, "TikTok needs the handle");
  assert.equal(pure.detailsReady("managed_meta", details), true);
  const request = pure.requestBody("c1", "managed_meta", "traffic", { ...audience, states: ["Lagos"], gender: "women" }, 5000, 7, details);
  assert.ok(web.AdRequestSchema.safeParse(request).success, JSON.stringify(web.AdRequestSchema.safeParse(request).error?.issues));
  assert.equal(request.goals, "Visits to my store. More orders");
  assert.equal(request.audience, "Lagos · women 18-55");
  assert.equal(request.contactEmail, null);
});

test("automation steps: only the words and waits change, the rest is kept for the save", () => {
  const preset = flows.FLOW_PRESETS.find((p) => p.key === "abandoned_cart");
  const steps = preset.steps;
  const emailAt = steps.findIndex((s) => s.type === "send_email");
  const changed = marketing.changeStep(steps, emailAt, { subject: "Your cart is waiting" });
  assert.equal(changed[emailAt].subject, "Your cart is waiting");
  assert.equal(changed[emailAt].bodyHtml, steps[emailAt].bodyHtml);
  assert.deepEqual(changed.filter((_, i) => i !== emailAt), steps.filter((_, i) => i !== emailAt));
  const waited = marketing.changeStep(steps, 0, { minutes: marketing.waitMinutes(2, "hours") });
  assert.equal(waited[0].minutes, 120);
  assert.deepEqual(marketing.waitParts(2880), { amount: 2, unit: "days" });
  assert.deepEqual(marketing.waitParts(90), { amount: 90, unit: "minutes" });
  // Every saved step still reads back the same through the web's parser.
  for (const step of changed) assert.deepEqual(flows.parseStep(step), flows.parseStep(step));
  assert.equal(marketing.editableField({ type: "send_whatsapp", message: "", template: "preset:abandoned_cart" }), null, "approved templates keep their words");
  assert.equal(marketing.editableField({ type: "send_sms", message: "Hi" }), "message");
  assert.deepEqual(marketing.stepGaps([{ type: "send_sms", message: " " }]).map((g) => g.reason), ["empty"]);
  assert.deepEqual(marketing.stepGaps([{ type: "send_sms", message: "x".repeat(481) }]).map((g) => g.reason), ["smsLong"]);
  // The web refuses the same SMS problems when the flow is switched on.
  assert.ok(flows.stepProblems({ type: "send_sms", message: "x".repeat(481) }).length > 0);
  const patch = marketing.flowPatch({ name: "Win-back", trigger: "win_back", steps, settings: { days: 90 } }, { name: "  ", days: 60 });
  assert.equal(patch.name, "Win-back");
  assert.deepEqual(patch.settings, { days: 60 });
  assert.equal("active" in patch, false);
});

test("an email shows on the phone as headings, words, pictures and buttons with sample details", () => {
  const parts = marketing.emailPreviewParts(
    `<!--sib-blocks:abc--><h1 style="x">Hi {{name}}</h1><p>Thanks for shopping at {{store}} &amp; more.</p><p><img src="https://img/x.jpg" alt=""></p><p style="text-align:center"><a href="{{store_url}}" style="display:inline-block;background:#000">Shop now</a></p>`,
    { name: "Ada", store: "Adire" },
  );
  assert.deepEqual(parts, [
    { kind: "heading", text: "Hi Ada" },
    { kind: "text", text: "Thanks for shopping at Adire & more." },
    { kind: "image", url: "https://img/x.jpg" },
    { kind: "button", text: "Shop now", url: "" },
  ]);
  assert.deepEqual(marketing.emailPreviewParts("Plain words", {}), [{ kind: "text", text: "Plain words" }]);
  for (const preset of flows.FLOW_PRESETS) {
    for (const step of preset.steps) if (step.type === "send_email") assert.ok(marketing.emailPreviewParts(step.bodyHtml, marketing.SAMPLE_DETAILS).length > 0, preset.key);
  }
});

test("mobile API routes: signed-in sellers only, the same data the web pages read", () => {
  const ads = read("src/app/api/mobile/ads/route.ts");
  assert.match(ads, /export const GET = withSeller/);
  assert.match(ads, /getSellerAds\(store\.id\)/);
  assert.match(ads, /metaAdsStatus\(store\.id\)/);
  const automations = read("src/app/api/mobile/marketing/automations/route.ts");
  assert.match(automations, /export const GET = marketingRoute/);
  assert.match(automations, /listAutomations\(store\.id, since\)/);
});

test("the marketing tools open as phone screens, with the web kept for rare advanced bits", () => {
  const mobile = (path) => read(`apps/mobile/src/app/${path}`);
  for (const screen of ["ads/index.tsx", "ads/new.tsx", "ads/[id].tsx", "marketing/automations.tsx", "marketing/automation/[id].tsx", "marketing/template/[id].tsx"]) {
    assert.ok(existsSync(new URL(`../apps/mobile/src/app/${screen}`, import.meta.url)), screen);
    assert.match(mobile(screen), /useT\("m_/, `${screen} uses the app's words`);
    assert.doesNotMatch(mobile(screen), /window\.(confirm|alert|prompt)|Alert\.alert/, `${screen} asks in the app's own sheet`);
  }
  const hub = mobile("marketing/index.tsx");
  assert.match(hub, /router\.push\("\/ads"\)/);
  assert.match(hub, /router\.push\("\/marketing\/automations"\)/);
  assert.doesNotMatch(hub, /openWeb\(/);
  const templates = mobile("marketing/templates.tsx");
  assert.match(templates, /pathname: "\/marketing\/template\/\[id\]"/);
  assert.doesNotMatch(templates, /openWeb\(/);
  // Launching, ending and deleting a campaign ask first; switching an automation on asks first.
  assert.match(mobile("ads/[id].tsx"), /setAsking\("launch"\)/);
  assert.match(read("apps/mobile/src/components/FlowSwitch.tsx"), /next \? setAsking\(flow\)/);
  const webTs = read("apps/mobile/src/lib/web.ts");
  for (const path of ['"/home/ads": "/ads"', '"/home/automations": "/marketing/automations"']) assert.ok(webTs.includes(path), path);
  const shop = read("apps/mobile/src/app/(tabs)/shop.tsx");
  assert.match(shop, /path: "app:\/ads"/);
  assert.match(shop, /path: "app:\/marketing\/automations"/);
});

test("m_ads is a registered namespace in all five languages", () => {
  assert.ok(NAMESPACES.includes("m_ads"));
  for (const locale of ["pcm", "yo", "ha", "ig"]) for (const key of Object.keys(CATALOGS.m_ads.en)) assert.ok(CATALOGS.m_ads[locale][key], `${locale}: ${key}`);
});
