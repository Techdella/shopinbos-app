// Tiered delivery partner verification (shared/partner-tiers.ts): the Tier 1 and Tier 2 checklists, the one-question
// sign-up flow and where it reopens, the overall statuses, never lowering a verified partner's tier, badges, name
// matching, the admin-editable limits and graduation, and the wiring (limits checked where jobs are offered, the migration).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const t = await import("../shared/partner-tiers.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// What the sign-up flow collects: the sign-up phone, an ID (a NIN slip checked by Korapay) and where they're based.
// No email, no bank, no BVN.
const approvedIdentity = {
  fullName: "Ada Obi",
  phone: { value: "+2348030000000", status: "approved" },
  nin: { last4: "1234", hash: "h", status: "approved", checkedAt: "2026-12-01" },
  idDocument: { type: "nin_slip" },
  base: { address: "12 Allen Avenue, Ikeja", state: "Lagos", lat: 6.6, lng: 3.35 },
};

function snapshot(overrides = {}) {
  return {
    verificationStatus: "pending",
    verificationTier: "none",
    termsVersion: t.PARTNER_TERMS_VERSION,
    identity: approvedIdentity,
    deliveryAreas: ["Lagos: Ikeja"],
    deliveryMethods: ["bike"],
    docs: { selfie: "approved" },
    cacRegistryVerified: false,
    vehicles: [],
    registeredName: null,
    cacType: null,
    cacNumber: null,
    payoutAccount: null,
    ...overrides,
  };
}

test("Tier 1 needs every check approved, and no CAC, bank, email or vehicle papers", () => {
  assert.deepEqual([...t.TIER1_ITEMS], ["terms", "phone", "idDocument", "selfie", "coverage", "methods", "base"]);
  assert.equal(t.earnedTier(snapshot()), "tier1");
  for (const gone of ["guarantor", "email", "payout", "vehicles", "nin", "fullName", "address"]) assert.equal(t.TIER1_ITEMS.includes(gone), false, gone);
  assert.equal(t.earnedTier(snapshot({ docs: { selfie: "pending" } })), "none");
  assert.equal(t.earnedTier(snapshot({ termsVersion: "old" })), "none", "terms must be the current version");
  assert.equal(t.earnedTier(snapshot({ deliveryMethods: [] })), "none");
  assert.equal(t.earnedTier(snapshot({ identity: { ...approvedIdentity, phone: undefined } })), "none");
  assert.equal(t.earnedTier(snapshot({ identity: { ...approvedIdentity, base: undefined } })), "none");
});

test("the ID: a checked NIN, else the team's decision on the photo; the older home address counts as the base", () => {
  const noNin = { ...approvedIdentity, nin: undefined, idDocument: { type: "drivers_licence" } };
  assert.equal(t.idDocumentState(snapshot({ identity: noNin })), "missing");
  assert.equal(t.idDocumentState(snapshot({ identity: noNin, docs: { selfie: "approved", identity: "pending" } })), "pending");
  assert.equal(t.earnedTier(snapshot({ identity: noNin, docs: { selfie: "approved", identity: "approved" } })), "tier1");
  assert.equal(t.idDocumentState(snapshot({ identity: { ...approvedIdentity, nin: { ...approvedIdentity.nin, status: "pending" } } })), "pending");
  assert.equal(t.idDocumentState(snapshot({ docs: { selfie: "approved", identity: "rejected" } })), "approved", "a checked NIN stands");
  const older = { ...approvedIdentity, base: undefined, address: { value: "12 Allen Avenue" } };
  assert.equal(t.tier1Checklist(snapshot({ identity: older })).base, "approved");
});

test("one approved vehicle is enough; all rejected is rejected", () => {
  assert.equal(t.vehiclesState([{ status: "rejected" }, { status: "approved" }]), "approved");
  assert.equal(t.vehiclesState([{ status: "rejected" }, { status: "pending" }]), "pending");
  assert.equal(t.vehiclesState([{ status: "rejected" }]), "rejected");
  assert.equal(t.vehiclesState([]), "missing");
});

test("Tier 2 adds business name, BN/RC type, number and certificate (or a CAC registry match)", () => {
  const business = { registeredName: "Ada Dispatch Ventures", cacType: "BN", cacNumber: "BN 1234567" };
  assert.equal(t.earnedTier(snapshot({ ...business, docs: { selfie: "approved", cac: "approved" } })), "tier2");
  assert.equal(t.earnedTier(snapshot({ ...business, docs: { selfie: "approved", cac: "pending" } })), "tier1");
  assert.equal(t.earnedTier(snapshot({ ...business, cacRegistryVerified: true })), "tier2");
  assert.equal(t.earnedTier(snapshot({ ...business, cacType: "XX", cacRegistryVerified: true })), "tier1");
});

test("ready to submit: nothing missing or rejected (pending checks are fine)", () => {
  assert.equal(t.readyToSubmit(t.tier1Checklist(snapshot({ docs: { selfie: "pending" } }))), true);
  assert.equal(t.readyToSubmit(t.tier1Checklist(snapshot({ docs: { selfie: "rejected" } }))), false);
  assert.equal(t.readyToSubmit(t.tier1Checklist(snapshot({ deliveryAreas: [] }))), false);
  assert.deepEqual(t.itemsWhere(t.tier1Checklist(snapshot({ deliveryMethods: [], identity: { ...approvedIdentity, base: undefined } })), ["missing"]), ["methods", "base"]);
});

test("the one-question flow: answers saved, where it reopens, and sent partners land on their status", () => {
  assert.deepEqual([...t.PARTNER_FLOW], ["name", "cac", "state", "areas", "vehicles", "interstate", "charge", "base", "id", "selfie", "review"]);
  const blank = snapshot({ identity: {}, deliveryAreas: [], deliveryMethods: [], docs: {} });
  assert.equal(t.flowProgress(blank, {}, false).first, "name");
  assert.equal(t.flowProgress(blank, { name: true }, false).first, "cac");
  assert.equal(t.flowProgress(blank, { name: true, cac: "no", homeState: "Lagos" }, false).first, "areas");
  const answered = { name: true, cac: "registering", homeState: "Lagos", interstate: false, charge: "quote" };
  assert.equal(t.flowProgress(snapshot({ docs: {} }), answered, false).first, "selfie");
  assert.equal(t.flowProgress(snapshot(), answered, false).first, "review");
  assert.equal(t.flowProgress(snapshot(), {}, true).first, "review", "sent through an older flow: no new questions");
  assert.equal(t.flowProgress(snapshot({ docs: { selfie: "rejected" } }), {}, true).first, "selfie");
  assert.equal(t.ITEM_SCREEN.idDocument, "id");
  assert.equal(t.ITEM_SCREEN.phone, "review");
  assert.deepEqual(t.readFlowAnswers({ completed: true, partnerFlow: { name: true, cac: "maybe", interstate: false, charge: "flat", homeState: "Lagos" } }), { name: true, interstate: false, charge: "flat", homeState: "Lagos" });
  assert.deepEqual(t.readFlowAnswers(null), {});
  assert.deepEqual([...t.ID_TYPES], ["nin_slip", "drivers_licence", "voters_card", "passport"]);
});

test("overall statuses", () => {
  assert.equal(t.partnerVerificationState({ verificationStatus: "pending" }), "unverified");
  assert.equal(t.partnerVerificationState({ verificationStatus: "pending", kycSubmittedAt: new Date() }), "pending_review");
  assert.equal(t.partnerVerificationState({ verificationStatus: "verified", verificationTier: "tier1" }), "tier1_verified");
  assert.equal(t.partnerVerificationState({ verificationStatus: "verified", verificationTier: "tier2" }), "tier2_verified");
  assert.equal(t.partnerVerificationState({ verificationStatus: "rejected", verificationTier: "tier2" }), "rejected");
  assert.equal(t.partnerVerificationState({ verificationStatus: "suspended", verificationTier: "tier2" }), "suspended");
});

test("a submitted partner with Tier 1 approved becomes verified; suspended and rejected never move", () => {
  assert.equal(t.nextVerificationStatus(snapshot(), true), "verified");
  assert.equal(t.nextVerificationStatus(snapshot(), false), "pending", "not until they submit");
  assert.equal(t.nextVerificationStatus(snapshot({ docs: { selfie: "pending" } }), true), "pending");
  assert.equal(t.nextVerificationStatus(snapshot({ verificationStatus: "suspended" }), true), "suspended");
  assert.equal(t.nextVerificationStatus(snapshot({ verificationStatus: "rejected" }), true), "rejected");
});

test("a verified partner's tier is never lowered (partners verified before tiers stay Tier 2)", () => {
  assert.equal(t.nextTier(snapshot({ verificationStatus: "verified", verificationTier: "tier2", identity: {}, vehicles: [] })), "tier2");
  assert.equal(t.nextTier(snapshot({ verificationStatus: "pending", verificationTier: "tier2", docs: {} })), "none");
});

test("badges", () => {
  assert.deepEqual(t.partnerBadges(snapshot()), ["verified_individual"]);
  assert.deepEqual(t.partnerBadges(snapshot({ docs: {} })), [], "no badges before Tier 1");
  assert.deepEqual(t.partnerBadges(snapshot({ docs: { selfie: "approved", "courier-licence": "approved" } })), ["verified_individual", "licensed_courier"]);
  // Payout ready: a bank account checked by name (at the first withdrawal, or the older sign-up).
  assert.deepEqual(t.partnerBadges(snapshot({ payoutAccount: { verified: true, accountName: "ADA OBI" } })), ["verified_individual", "payout_ready"]);
  assert.deepEqual(t.partnerBadges(snapshot({ identity: { ...approvedIdentity, payout: { method: "bank", last4: "1", status: "approved", nameMatched: true, checkedAt: "x" } } })), ["verified_individual", "payout_ready"]);
  // Address Verified: the base and its photo, approved by the team.
  assert.deepEqual(t.partnerBadges(snapshot({ docs: { selfie: "approved", "base-photo": "approved" } })), ["verified_individual", "address_verified"]);
  assert.deepEqual(t.partnerBadges(snapshot({ docs: { selfie: "approved", "base-photo": "pending" } })), ["verified_individual"]);
  const business = { registeredName: "Ada Dispatch Ventures", cacType: "RC", cacNumber: "RC 99", cacRegistryVerified: true };
  assert.deepEqual(t.partnerBadges(snapshot({ ...business, payoutAccount: { verified: true, accountName: "ADA DISPATCH VENTURES" } })), ["registered_business", "payout_ready", "verified_payout"]);
  assert.deepEqual(t.partnerBadges(snapshot({ ...business, payoutAccount: { verified: true, accountName: "ADA OBI" } })), ["registered_business", "payout_ready"], "a personal account isn't a verified payout");
  assert.deepEqual(t.partnerBadges(snapshot({ ...business, payoutAccount: { verified: false, accountName: "ADA DISPATCH VENTURES" } })), ["registered_business"]);
});

test("name matching: first and last name in any order, middle names optional", () => {
  assert.equal(t.namesMatch("John Adebayo", "ADEBAYO OLUWASEUN JOHN"), true);
  assert.equal(t.namesMatch("Ada Obi", "OBI ADAEZE"), false);
  assert.equal(t.namesMatch("", "ADA OBI"), false);
  assert.equal(t.businessNamesMatch("Swift Riders Ltd", "SWIFT RIDERS LIMITED"), true);
  assert.equal(t.businessNamesMatch("Swift Riders Ltd", "SWIFT LOGISTICS"), false);
});

test("delivery methods keep truck from the old company setup", () => {
  assert.deepEqual([...t.DELIVERY_METHODS], ["bike", "car", "van", "truck", "tricycle", "other"]);
  assert.equal(t.isDeliveryMethod("truck"), true);
});

test("selfie: a confident match passes, a mismatch is rejected, anything else goes to the team", () => {
  assert.deepEqual(t.selfieDecision({ match: true, confidence: 94 }), { status: "approved" });
  assert.deepEqual(t.selfieDecision({ match: true, confidence: null }), { status: "approved" });
  assert.deepEqual(t.selfieDecision({ match: true, confidence: t.FACE_MATCH_MIN_CONFIDENCE - 1 }), { status: "pending" });
  assert.equal(t.selfieDecision({ match: false, confidence: 99 }).status, "rejected");
  assert.equal(t.selfieDecision({ match: false, confidence: 99 }).reason, t.SELFIE_MISMATCH);
  assert.deepEqual(t.selfieDecision({ match: null, confidence: null }), { status: "pending" });
  assert.deepEqual(t.selfieDecision(null), { status: "pending" });
});

test("tier rules: defaults, saved values and out-of-range input", () => {
  assert.deepEqual(t.readTierRules(null), t.DEFAULT_TIER_RULES);
  assert.equal(t.DEFAULT_TIER_RULES.maxOrderValue, 50000);
  assert.equal(t.DEFAULT_TIER_RULES.maxActiveOrders, 5);
  assert.deepEqual(t.DEFAULT_TIER_RULES.graduation, { minDeliveries: 20, minRating: 4, maxDisputeRate: 5 });
  const rules = t.readTierRules({ maxOrderValue: "₦80,000", maxActiveOrders: 8, graduation: { minDeliveries: 30, minRating: 9, maxDisputeRate: "3%" } });
  assert.equal(rules.maxOrderValue, 80000);
  assert.equal(rules.maxActiveOrders, 8);
  assert.deepEqual(rules.graduation, { minDeliveries: 30, minRating: 5, maxDisputeRate: 3 });
  assert.equal(t.readTierRules({ maxActiveOrders: "" }).maxActiveOrders, 5);
});

test("limits apply to Tier 1 only, until graduation", () => {
  assert.equal(t.limitsApply({ verificationTier: "tier1", limitsLiftedAt: null }), true);
  assert.equal(t.limitsApply({ verificationTier: "tier1", limitsLiftedAt: new Date() }), false);
  assert.equal(t.limitsApply({ verificationTier: "tier2", limitsLiftedAt: null }), false);
  const rules = t.DEFAULT_TIER_RULES;
  assert.equal(t.jobLimitProblem({ orderValue: 50000, activeJobs: 4 }, rules), null);
  assert.deepEqual(t.jobLimitProblem({ orderValue: 50001, activeJobs: 0 }, rules), { kind: "order_value", max: 50000 });
  assert.deepEqual(t.jobLimitProblem({ orderValue: 100, activeJobs: 5 }, rules), { kind: "active_orders", max: 5 });
  assert.match(t.limitProblemMessage({ kind: "order_value", max: 50000 }), /₦50,000/);
});

test("graduation: 20 deliveries, 4.0 rating, at most 5% disputes", () => {
  const rules = t.DEFAULT_TIER_RULES;
  assert.equal(t.graduationProgress({ completed: 20, disputes: 1, rating: 4.2, ratingCount: 10 }, rules).met, true);
  assert.equal(t.graduationProgress({ completed: 19, disputes: 0, rating: 5, ratingCount: 10 }, rules).met, false);
  assert.equal(t.graduationProgress({ completed: 20, disputes: 0, rating: 3.9, ratingCount: 10 }, rules).met, false);
  assert.equal(t.graduationProgress({ completed: 20, disputes: 0, rating: 0, ratingCount: 0 }, rules).met, false, "no ratings yet");
  const heavy = t.graduationProgress({ completed: 20, disputes: 2, rating: 4.5, ratingCount: 10 }, rules);
  assert.equal(heavy.disputeRate.have, 9.1);
  assert.equal(heavy.met, false);
  assert.equal(t.disputeRate({ completed: 0, disputes: 0, rating: 0, ratingCount: 0 }), 0);
});

test("identity checks never keep more than the last 4 digits", () => {
  const checks = t.readIdentityChecks({ nin: { last4: "12345678901", hash: "h", status: "approved", checkedAt: "x" }, payout: { method: "bvn", last4: "22222222222", status: "pending", checkedAt: "x" }, junk: 1 });
  assert.equal(checks.nin.last4, "8901");
  assert.equal(checks.payout.last4, "2222");
  assert.equal("junk" in checks, false);
  assert.deepEqual(t.readIdentityChecks({ nin: { last4: "1234", status: "weird" } }), {});
  const flow = t.readIdentityChecks({ base: { address: "Shop 4, Ikeja", lat: 6.6, lng: 300 }, idDocument: { type: "passport" } });
  assert.deepEqual(flow.base, { address: "Shop 4, Ikeja" }, "a location off the map isn't kept");
  assert.deepEqual(flow.idDocument, { type: "passport" });
  assert.equal(t.readIdentityChecks({ idDocument: { type: "bvn" } }).idDocument, undefined);
});

test("wiring: limits are checked where jobs are offered, and the migration is additive", () => {
  assert.match(read("src/app/api/app/logistics/bookings/route.ts"), /partnerJobLimitProblem\(partner\.id/);
  assert.match(read("src/app/api/app/logistics/quotes/[id]/accept/route.ts"), /partnerJobLimitProblem\(quote\.logisticsPartnerId/);
  assert.match(read("src/lib/delivery-market/market.server.ts"), /partnersOverLimit\(/);
  assert.match(read("src/lib/commerce/pricing.server.ts"), /input\.address, subtotal\)/);
  const sql = read("docs/migrations/2026-12-02-logistics-partner-tiers.sql");
  assert.doesNotMatch(sql, /\bDROP\b/i);
  assert.match(sql, /"verificationTier" TEXT NOT NULL DEFAULT 'none'/);
  assert.match(sql, /SET "verificationTier" = 'tier2'/);
});
