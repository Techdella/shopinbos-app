// Behavioural tests for pure TypeScript helpers (Node strips the types natively).
import test from "node:test";
import assert from "node:assert/strict";

const render = await import("../src/lib/campaigns/render.ts");
const { redemptionError } = await import("../src/lib/discounts.ts");
const { computeSellerInsights } = await import("../src/lib/insights.ts");
const phone = await import("../shared/phone.ts");
const onboarding = await import("../shared/onboarding.ts");

test("campaign emails escape personal data, track links and add an unsubscribe footer", () => {
  const html = '<p>Hi {{name}} from {{store}}</p><a href="https://shop.example/p?a=1&amp;b=2">Shop</a><a href="mailto:x@y.z">Mail</a><a href="{{unsubscribe_url}}">Stop</a>';
  const out = render.renderCampaignEmail({ html, recipientName: '<script>alert(1)</script>', storeName: "Ada & Co", token: "tok123", appUrl: "https://app.example/" });

  assert.match(out.html, /Hi &lt;script&gt;alert\(1\)&lt;\/script&gt; from Ada &amp; Co/);
  assert.doesNotMatch(out.html, /<script>/);
  assert.match(out.html, /href="https:\/\/app\.example\/api\/public\/email\/click\/tok123\?u=https%3A%2F%2Fshop\.example%2Fp%3Fa%3D1%26b%3D2"/);
  assert.match(out.html, /href="mailto:x@y\.z"/, "non-http links are left alone");
  assert.match(out.html, /href="https:\/\/app\.example\/email\/unsubscribe\/tok123">Stop/);
  assert.match(out.html, /<img src="https:\/\/app\.example\/api\/public\/email\/open\/tok123"/);
  assert.equal(out.oneClickUnsubscribeUrl, "https://app.example/api/public/email/unsubscribe/tok123");
  // Click validation uses the same link set the renderer tracks.
  assert.deepEqual(render.extractCampaignLinks(html), ["https://shop.example/p?a=1&b=2"]);
});

test("discount codes are only redeemable while active, started, unexpired, under limit and above minimum", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const base = { status: "active", startsAt: null, expiresAt: null, maxUses: 0, usedCount: 5, minOrder: 0 };
  assert.equal(redemptionError(base, 1000, now), null);
  assert.match(redemptionError({ ...base, status: "draft" }, 1000, now), /not active/);
  assert.match(redemptionError({ ...base, startsAt: new Date("2026-10-11T00:00:00Z") }, 1000, now), /not active yet/);
  assert.match(redemptionError({ ...base, expiresAt: new Date("2026-10-09T00:00:00Z") }, 1000, now), /expired/);
  assert.match(redemptionError({ ...base, maxUses: 5 }, 1000, now), /usage limit/);
  assert.match(redemptionError({ ...base, minOrder: 5000 }, 1000, now), /Minimum order/);
});

test("seller insights come from paid orders only, in Lagos time", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const order = (createdAt, email, total, city, status = "paid") => ({
    total, status, createdAt: new Date(createdAt), buyerEmail: email, deliveryAddress: { city }, items: [{ name: "Bag", quantity: 1, price: total }],
  });
  const insights = computeSellerInsights([
    order("2026-10-09T14:30:00Z", "a@x.com", 10000, "lagos"),
    order("2026-08-02T09:00:00Z", "A@x.com", 5000, "Lagos"),
    order("2026-09-15T14:10:00Z", "b@x.com", 8000, "Abuja"),
    order("2026-10-01T14:10:00Z", "c@x.com", 3000, "Abuja", "pending"),
  ], now);

  assert.equal(insights.revenue, 23000);
  assert.equal(insights.paidOrders, 3);
  assert.equal(insights.totalOrders, 4);
  assert.equal(insights.repeatRate, 0.5);
  assert.deepEqual(insights.cities.map((c) => [c.city, c.revenue]), [["Lagos", 15000], ["Abuja", 8000]]);
  assert.equal(insights.peakHour, 15, "14:xx UTC is 15:xx in Lagos");
  assert.deepEqual(insights.cohorts[0], { month: "Aug", retention: [100, 0, 100] });
});

test("phone numbers typed the Nigerian way become E.164, and junk is rejected", () => {
  const ng = phone.DIAL_COUNTRIES[0];
  for (const typed of ["0803 412 7790", "803-412-7790", "+234 803 412 7790", "2348034127790", "(0803) 4127790"]) {
    assert.equal(phone.toE164(typed, ng), "+2348034127790", typed);
  }
  assert.equal(phone.toE164("0803 412 779", ng), null);
  assert.equal(phone.toE164("", ng), null);
  assert.equal(phone.toE164("+233 24 412 7790", ng), "+233244127790");
  assert.equal(phone.toE164("024 412 7790", phone.dialCountry("GH")), "+233244127790");
  assert.equal(phone.formatE164("+2348034127790"), "+234 803 412 7790");
  assert.equal(phone.isValidEmail("ada@shop.ng"), true);
  assert.equal(phone.isValidEmail("ada@shop"), false);
});

test("onboarding helpers make clean slugs, name ideas and delivery fees", () => {
  assert.equal(onboarding.shopSlug("  Àdùnní's Linen & Co. "), "adunni-s-linen-co");
  const ideas = onboarding.suggestShopNames("Adaeze Okafor", "I sell linen shirts to working women");
  assert.deepEqual(ideas, ["Adaeze Studio", "Adaeze and Co.", "Adaeze's Linen"]);
  // Checkout picks the first zone whose region is in the address, so the catch-all must sort last.
  const catchAll = onboarding.DEFAULT_DELIVERY_ZONES.filter((zone) => zone.regions.length === 0);
  assert.equal(catchAll.length, 1);
  assert.equal(Math.max(...onboarding.DEFAULT_DELIVERY_ZONES.map((zone) => zone.priority)), catchAll[0].priority);
  const island = onboarding.DEFAULT_DELIVERY_ZONES.find((zone) => zone.regions.includes("Lekki"));
  const mainland = onboarding.DEFAULT_DELIVERY_ZONES.find((zone) => zone.regions.includes("Lagos"));
  assert.ok(island.priority < mainland.priority, "Lekki must match before the general Lagos zone");
  assert.equal(onboarding.naira(13000), "₦13,000");
  assert.equal(onboarding.ONBOARDING_LANGUAGES.every((lang) => typeof onboarding.REX_GREETING[lang]("Ada") === "string"), true);
});

const dashboard = await import("../src/lib/dashboard/compute.ts");
const channels = await import("../shared/channels.ts");

test("seller dashboard: today and week sales in Lagos time, order stages, sources and stock labels", () => {
  const now = new Date("2026-10-10T09:00:00Z"); // 10:00 in Lagos
  const order = (id, iso, status, total, extra = {}) => ({
    id, orderNumber: `SIB-${id}`, buyerName: `Buyer ${id}`, buyerEmail: `${id}@x.ng`, total, status, createdAt: new Date(iso),
    channel: null, deliveryAddress: { city: "Lagos" }, logisticsDetails: null,
    items: [{ name: "Linen shirt", quantity: 1, price: total }], ...extra,
  });
  const orders = [
    order("a", "2026-10-09T23:30:00Z", "paid", 15500, { channel: "whatsapp" }), // 00:30 Lagos today
    order("b", "2026-10-09T22:30:00Z", "paid", 21000, { channel: "instagram" }), // 23:30 Lagos yesterday
    order("c", "2026-10-10T08:00:00Z", "awaiting_payment", 34100, { channel: "whatsapp" }),
    order("d", "2026-10-02T12:00:00Z", "delivered", 10000), // last week
    order("e", "2026-10-10T08:30:00Z", "shipped", 9000, { logisticsDetails: { type: "network" }, items: [{ name: "Knit jumper", quantity: 2 }, { name: "Cap" }] }),
  ];
  const products = [
    { id: "p1", name: "Linen shirt", images: ["a.jpg"], retailPrice: 18500, currentStock: 3, lowStockThreshold: 5, soldStock: 14 },
    { id: "p2", name: "Knit jumper", images: [], retailPrice: 15800, currentStock: 12, lowStockThreshold: 5, soldStock: 9 },
    { id: "p3", name: "New thing", images: [], retailPrice: 1000, currentStock: 20, lowStockThreshold: 5, soldStock: 0 },
  ];
  const result = dashboard.computeDashboard({ orders, products, now });

  assert.equal(result.todaySales, 15500 + 9000);
  assert.equal(result.weekSales, 15500 + 21000 + 9000);
  assert.equal(result.weekChange, Math.round(((45500 - 10000) / 10000) * 100));
  assert.equal(result.ordersToday, 3);
  assert.equal(result.ordersToSend, 2);
  assert.equal(result.ordersAwaitingPayment, 1);
  assert.equal(result.daily.data.length, 14);
  assert.equal(result.daily.data.at(-1), 15500 + 9000);

  const rows = Object.fromEntries(result.latestOrders.map((row) => [row.id, row]));
  assert.equal(rows.a.stage.label, "Needs a rider");
  assert.equal(rows.c.stage.label, "Waiting for payment");
  assert.equal(rows.c.payment.label, "Not paid yet");
  assert.equal(rows.e.stage.label, "On the way");
  assert.equal(rows.e.summary, "Knit jumper × 2 + 1 more");

  assert.deepEqual(result.sources.map((s) => [s.label, s.count]), [["WhatsApp", 2], ["Instagram", 1]]);
  assert.deepEqual(result.sellingFast.map((p) => [p.name, p.stock.label]), [["Linen shirt", "3 left"], ["Knit jumper", "12 in stock"]]);
  assert.deepEqual(result.lowStock.map((p) => p.name), ["Linen shirt"]);
});

test("order channels: share refs normalise, unknown refs are ignored", () => {
  assert.equal(channels.channelFromRef("wa"), "whatsapp");
  assert.equal(channels.channelFromRef("Instagram"), "instagram");
  assert.equal(channels.channelFromRef("utm-tiktok"), null);
  assert.equal(channels.channelFromRef(""), null);
  assert.equal(channels.withChannelRef("https://ada.shopinbos.com/", "whatsapp"), "https://ada.shopinbos.com/?ref=wa");
  assert.equal(channels.withChannelRef("https://x.com/?a=1", "instagram"), "https://x.com/?a=1&ref=ig");
});

test("record a sale: totals, and the status a sale starts in", async () => {
  const sales = await import("../shared/sales.ts");
  assert.deepEqual(sales.saleTotals([{ name: "Shirt", price: 18500, quantity: 2 }, { name: "Cap", price: 4000, quantity: 1 }], 1500), { subtotal: 41000, shippingFee: 1500, total: 42500 });
  assert.deepEqual(sales.saleTotals([{ name: "Bad", price: -5, quantity: 2.7 }], -100), { subtotal: 0, shippingFee: 0, total: 0 });
  assert.deepEqual(sales.saleStatus("cash", "collected"), { status: "delivered", paymentMethod: "cash", delivered: true });
  assert.deepEqual(sales.saleStatus("transfer", "deliver"), { status: "paid", paymentMethod: "transfer", delivered: false });
  assert.deepEqual(sales.saleStatus("unpaid", "deliver"), { status: "pending", paymentMethod: "pay_on_delivery", delivered: false });
  assert.equal(sales.saleStatus("unpaid", "collected").status, "pending");
  // Marking an unpaid sale paid: collected ones are done, others wait for a rider.
  assert.equal(sales.statusWhenMarkedPaid({ type: "collected" }), "delivered");
  assert.equal(sales.statusWhenMarkedPaid(null), "paid");
});

test("affiliates: codes, commission after discounts, and what's pending, owed and paid", async () => {
  const aff = await import("../shared/affiliates.ts");
  assert.equal(aff.affiliateCode("Tolu Adéyẹmí"), "tolu" + "adeyemi".slice(0, 8));
  assert.equal(aff.affiliateCode("Tolu", ["tolu", "tolu2"]), "tolu3");
  assert.equal(aff.affiliateCode("!!!"), "creator");
  assert.equal(aff.cleanAffiliateCode(" ToLu "), "tolu");
  assert.equal(aff.cleanAffiliateCode("a b"), null);
  assert.equal(aff.cleanAffiliateCode("<script>"), null);
  assert.equal(aff.commissionFor(20000, 2000, 10), 1800);
  assert.equal(aff.commissionFor(1000, 5000, 10), 0);
  assert.equal(aff.commissionFor(1000, 0, 500), 1000, "rate is capped at 100%");
  const totals = aff.affiliateTotals([
    { status: "delivered", affiliateCommission: 1000, affiliatePaidAt: null, total: 10000 },
    { status: "delivered", affiliateCommission: 500, affiliatePaidAt: "2026-10-09", total: 5000 },
    { status: "shipped", affiliateCommission: 700, affiliatePaidAt: null, total: 7000 },
    { status: "cancelled", affiliateCommission: 900, affiliatePaidAt: null, total: 9000 },
  ]);
  assert.deepEqual(totals, { pending: 700, owed: 1000, paid: 500, sales: 15000, deliveredOrders: 2, orders: 3 });
  // Saturday 10 Oct 2026 → Friday 16 Oct; a Friday stays that Friday.
  assert.equal(aff.nextPayday(new Date("2026-10-10T09:00:00Z")).toISOString().slice(0, 10), "2026-10-16");
  assert.equal(aff.nextPayday(new Date("2026-10-16T09:00:00Z")).toISOString().slice(0, 10), "2026-10-16");
});

test("ads: tracking codes, cost per order and Peggy's stop rule", async () => {
  const ads = await import("../shared/ads.ts");
  let n = 0;
  const code = ads.adCode(() => (n++ % 10) / 10);
  assert.match(code, /^[a-z2-9]{7}$/);
  assert.equal(ads.costPerOrder({ spend: 9000, orders: 7 }), 1286);
  assert.equal(ads.costPerOrder({ spend: 9000, orders: 0 }), null);
  const now = new Date("2026-10-11T12:00:00Z");
  const base = { status: "running", startedAt: "2026-10-08T12:00:00Z", days: 5, dailyBudget: 2000, spend: 6000, clicks: 40, orders: 0, revenue: 0 };
  assert.equal(ads.adAdvice(base, now)?.action, "pause");
  assert.equal(ads.adAdvice({ ...base, startedAt: "2026-10-10T12:00:00Z" }, now), null, "too early to judge");
  assert.equal(ads.adAdvice({ ...base, orders: 7, revenue: 60000 }, now)?.action, "boost");
  assert.equal(ads.adAdvice({ ...base, startedAt: "2026-10-01T12:00:00Z", orders: 2, revenue: 1000 }, now)?.action, "end");
  assert.equal(ads.adAdvice({ ...base, status: "draft" }, now), null);
  assert.equal(ads.plannedBudget(5000, 5), 25000);
  assert.match(ads.fallbackAdCopy("Camel coat", "₦38,500", "whatsapp").primaryText, /WhatsApp/);
});

test("video studio: scripts always fit the photos, and the reel follows the voiceover", async () => {
  const video = await import("../shared/video.ts");
  const fallback = video.fallbackScript("Linen set", "₦29,500", "pidgin", 3);
  assert.equal(fallback.captions.length, 3);
  assert.match(fallback.voiceover, /₦29,500/);
  const script = video.normaliseScript({ captions: ["One", "  Two  ", 3], voiceover: "x".repeat(400) }, fallback, 4);
  assert.deepEqual(script.captions.slice(0, 2), ["One", "Two"]);
  assert.equal(script.captions.length, 4);
  assert.equal(script.voiceover.length, 320);
  assert.equal(script.cta, fallback.cta);
  assert.equal(video.normaliseScript(null, fallback, 2).voiceover, fallback.voiceover);
  assert.deepEqual(video.reelTimeline(3, null), { perPhoto: 2.6, endCard: 2.2, total: 3 * 2.6 + 2.2 });
  const voiced = video.reelTimeline(3, 12);
  assert.ok(voiced.total >= 12, "the reel lasts at least as long as the voice");
  assert.equal(video.reelTimeline(1, 60).perPhoto, 5, "photos stay up at most 5 seconds");
});

test("labels: order ids, address lines and cash to collect", async () => {
  const labels = await import("../src/lib/labels.ts");
  assert.deepEqual(labels.parseOrderIds("abc123def,abc123def, bad id ,x,cl0123456"), ["abc123def", "cl0123456"]);
  assert.equal(labels.parseLabelFormat("a4"), "a4");
  assert.equal(labels.parseLabelFormat("zzz"), "label");
  assert.deepEqual(labels.addressLines({ street: "12 Admiralty Way", city: "Lekki", state: "Lagos", country: "NG" }), ["12 Admiralty Way", "Lekki, Lagos"]);
  assert.deepEqual(labels.addressLines({}), []);
  assert.deepEqual(labels.addressLines({ street: "1 Ring Rd", city: "Accra", country: "Ghana" }), ["1 Ring Rd", "Accra", "Ghana"]);
  assert.equal(labels.amountToCollect({ status: "pending", total: 21000 }), 21000);
  assert.equal(labels.amountToCollect({ status: "paid", total: 21000 }), 0);
  assert.equal(labels.itemCount([{ quantity: 2 }, { name: "x" }]), 3);
});

test("app → web handoff only follows same-site paths and well-formed tokens", async () => {
  const handoff = await import("../src/lib/auth/handoff.ts");
  assert.equal(handoff.handoffNextPath("/home/orders/abc?x=1"), "/home/orders/abc?x=1");
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "", null, "/home\r\nSet-Cookie: x"]) {
    assert.equal(handoff.handoffNextPath(bad), "/home", String(bad));
  }
  assert.equal(handoff.readHandoffToken("#t=aaa.bbb.ccc"), "aaa.bbb.ccc");
  assert.equal(handoff.readHandoffToken("#t=not-a-jwt"), null);
  assert.equal(handoff.readHandoffToken(""), null);
});
