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
  assert.equal(onboarding.zoneFee({ name: "Abuja", fee: 3500, maxFee: 6000 }), "₦3,500 to ₦6,000");
  assert.equal(onboarding.ONBOARDING_LANGUAGES.every((lang) => typeof onboarding.REX_GREETING[lang]("Ada") === "string"), true);
});
