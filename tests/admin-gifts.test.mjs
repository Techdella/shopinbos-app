// Admin › Pricing › Gifts and free plans (shared/admin-gifts.ts, src/lib/admin/gifts.server.ts): free AI credits and
// free time on any paid plan for one person, the join offer for every new account, and the grant rules that move an
// account to the best running plan and back to what it pays for.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const gifts = await import("../shared/admin-gifts.ts");
const pricing = await import("../shared/platform-pricing.ts");

test("each role can be given its own paid plans, cheapest first", () => {
  assert.deepEqual(gifts.giftPlanChoices("seller").map((choice) => choice.tier), ["seller_starter", "seller_growth", "seller_pro"]);
  assert.deepEqual(gifts.giftPlanChoices("supplier").map((choice) => choice.tier), ["supplier_plus", "supplier_pro"]);
  assert.deepEqual(gifts.giftPlanChoices("logistics_partner").map((choice) => choice.tier), ["logistics_plus", "logistics_pro"]);
});

test("free time is whole months from now, 1 to 12", () => {
  const now = new Date("2026-10-30T10:00:00Z");
  assert.deepEqual(gifts.giftWindow(3, now), { startsAt: now, endsAt: new Date("2027-01-30T10:00:00Z") });
  for (const bad of [0, 13, 1.5, Number.NaN]) assert.equal(gifts.giftWindow(bad, now), null, String(bad));
  assert.equal(gifts.cleanGiftNote("  pilot   shop "), "pilot shop");
  assert.equal(gifts.cleanGiftNote("ok"), "", "a reason is needed for the log");
});

test("the join offer is in the price book, off by default, and reads in months", () => {
  for (const key of ["join.seller_months", "join.supplier_months", "join.logistics_months"]) {
    assert.equal(pricing.PRICE_SETTINGS[key].group, "join");
    assert.equal(pricing.PRICE_SETTINGS[key].default, 0);
    assert.equal(pricing.cleanPriceValue(key, "13"), null);
  }
  assert.equal(pricing.formatPriceValue("join.seller_months", 0), "Off");
  assert.equal(pricing.formatPriceValue("join.seller_months", 2), "2 months");
  assert.match(read("src/lib/auth/app-user.ts"), /if \(!existingUser\) \{[\s\S]{0,800}giveJoinOffer\(user\.id, user\.role\)/, "only brand-new accounts");
});

test("wiring: every gift is logged first, needs the money section, and plan time moves to the best running plan", () => {
  const service = read("src/lib/admin/gifts.server.ts");
  for (const action of ["gift_credits", "gift_plan", "end_gift"]) assert.match(service, new RegExp(`action: "${action}"`));
  assert.match(service, /addCredits\(user\.id, credits, "grant", reference\)/);
  assert.match(service, /source: "admin"/);
  assert.match(service, /They pay for their plan by card/, "a card subscription is Paystack's to change");
  const actions = read("src/app/admin/pricing/gifts/actions.ts");
  assert.equal((actions.match(/requireAdminSection\("money"\)/g) ?? []).length, 3);
  const grants = read("src/lib/referrals/service.server.ts");
  assert.match(grants, /if \(best\.marker > currentMarker\)/, "never a step down");
  assert.match(grants, /marker = PLAN_TIERS\[receipt\.purpose as PlanTier\]\.marker/, "back to the plan they still pay for");
  assert.match(read("src/lib/nav.ts"), /href: "\/admin\/pricing\/gifts"/);
});
