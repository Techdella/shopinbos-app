// Seller view of delivery partner badges (shared/partner-tiers.ts): the "Find partners" badge filter, badges and
// delivery methods on partner cards and pages, the trust note, a small ranking boost for Registered Businesses,
// and badges on the public and phone APIs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const market = await import("../shared/delivery-market.ts");
const tiers = await import("../shared/partner-tiers.ts");
const en = (await import("../shared/i18n/messages/delivery/en.ts")).default;
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the badge filter takes known badges only", () => {
  // find-filters.ts imports through "@shared", so it's checked by its source; the guard it uses is tested here.
  assert.match(read("src/components/delivery-market/find-filters.ts"), /badge: isPartnerBadge\(params\.badge\) \? params\.badge : null/);
  assert.equal(tiers.isPartnerBadge("registered_business"), true);
  assert.equal(tiers.isPartnerBadge("licensed_courier"), true);
  assert.equal(tiers.isPartnerBadge("gold"), false);
  assert.equal(tiers.isPartnerBadge(undefined), false);
});

test("every badge and delivery method has words, and the trust note is the spec's", () => {
  for (const badge of tiers.PARTNER_BADGES) {
    assert.equal(en[`badge.${badge}`], tiers.BADGE_LABELS[badge]);
    assert.ok(en[`badgeTip.${badge}`], `badgeTip.${badge}`);
  }
  for (const method of [...tiers.DELIVERY_METHODS, "truck"]) assert.ok(en[`method.${method}`], `method.${method}`);
  assert.equal(en["find.trustNote"], "Shopinbos verifies partner identity and documents. Partners are independent operators.");
});

test("a Registered Business ranks a little above an otherwise equal partner, never above an unverified gap", () => {
  const base = { stats: { completed: 10, onTimeRate: 90, failedRate: 2 }, rating: 4.5, ratingCount: 10, match: 2, verified: true };
  assert.ok(market.rankScore({ ...base, registered: true }) > market.rankScore(base));
  assert.equal(market.rankScore({ ...base, registered: true }) - market.rankScore(base), 5);
  assert.equal(market.rankScore(base), market.rankScore({ ...base, registered: false }), "optional, old callers unchanged");
});

test("wiring: findPartners filters and selects badges; cards, detail and my partners show them", () => {
  const manage = read("src/lib/delivery-market/manage.server.ts");
  assert.match(manage, /filters\.badge \? \{ badges: \{ has: filters\.badge \} \}/);
  assert.match(manage, /badges: true, vehicleTypes: true/);
  assert.match(manage, /registered: partner\.badges\.includes\("registered_business"\)/);
  const find = read("src/components/delivery-market/FindPartners.tsx");
  assert.match(find, /name="badge"/);
  assert.match(find, /<PartnerBadges status=\{partner\.verificationStatus\} badges=\{partner\.badges\} \/>/);
  assert.match(find, /methodsText\(partner\.vehicleTypes, t\)/);
  assert.match(find, /t\("find\.trustNote"\)/);
  assert.match(read("src/components/delivery-market/PartnerDetail.tsx"), /<PartnerBadges /);
  assert.match(read("src/components/delivery-market/PartnerDetail.tsx"), /t\("find\.trustNote"\)/);
  assert.match(read("src/components/delivery-market/MyPartners.tsx"), /<PartnerBadges /);
});

test("wiring: badges on the public partner API (with a ?badge= filter) and the phone's delivery APIs", () => {
  assert.match(read("src/lib/api/public-logistics.ts"), /badges: true,/);
  assert.match(read("src/lib/schemas/index.ts"), /badge: z\.enum\(PARTNER_BADGES\)\.optional\(\)/);
  assert.match(read("src/app/api/public/logistics/partners/route.ts"), /badge \? \{ badges: \{ has: badge \} \}/);
  assert.match(read("src/app/api/mobile/delivery/partners/route.ts"), /badges: row\.partner\.badges/);
  assert.match(read("src/app/api/mobile/delivery/partners/[slug]/route.ts"), /badges: partner\.badges/);
  assert.match(read("src/app/api/mobile/delivery/route.ts"), /badges: connection\.logisticsPartner\.badges/);
  assert.match(read("docs/openapi.yaml"), /enum: \[verified_individual, registered_business, licensed_courier, verified_payout\]/);
});
