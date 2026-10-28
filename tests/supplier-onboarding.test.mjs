import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// Supplier onboarding, one question per screen (the owner's "Shopinbos Onboarding — Simplified", "Supplier: question
// by question"), and the supplier verification tiers.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rules = await import("../shared/supplier-onboarding.ts");
const kyc = await import("../src/lib/kyc/identity.ts");

test("eleven screens in order; the minimum order only with Wholesale", () => {
  assert.deepEqual([...rules.SUPPLIER_ONBOARDING_STEPS], ["name", "cac", "categories", "source", "buyModes", "moq", "location", "id", "selfie", "product", "review"]);
  assert.deepEqual(rules.stepPosition("review", ["wholesale"]), { index: 10, total: 11 });
  assert.deepEqual(rules.stepPosition("review", ["dropship"]), { index: 9, total: 10 });
  assert.equal(rules.nextStep("buyModes", ["dropship"]), "location");
  assert.equal(rules.nextStep("buyModes", ["dropship", "wholesale"]), "moq");
  assert.equal(rules.previousStep("location", ["preorder"]), "buyModes");
  assert.equal(rules.previousStep("name", []), null);
  assert.equal(rules.isSupplierStep("selfie"), true);
  assert.equal(rules.isSupplierStep("docs"), false);
});

test("answers are cleaned: make/import/resell map to the business type, buy modes and minimum order", () => {
  assert.equal(rules.SOURCE_BUSINESS_TYPE.make, "manufacturer");
  assert.equal(rules.SOURCE_BUSINESS_TYPE.import, "importer");
  assert.equal(rules.SOURCE_BUSINESS_TYPE.resell, "wholesaler");
  assert.equal(rules.sourceForBusinessType("dropshipper"), null);
  // Pre-order opens at Established (shared/dropship-rules.ts): a new supplier can't save it.
  assert.deepEqual(rules.cleanBuyModes(["preorder", "x", "dropship"]), ["dropship"]);
  assert.deepEqual(rules.cleanBuyModes(["preorder", "dropship"], "trusted"), ["dropship"]);
  assert.deepEqual(rules.cleanBuyModes(["preorder", "x", "dropship"], "established"), ["dropship", "preorder"]);
  assert.equal(rules.preorderLocked("new"), true);
  assert.equal(rules.preorderLocked("established"), false);
  assert.equal(rules.cleanMinimumOrder("12"), 12);
  assert.equal(rules.cleanMinimumOrder(0), null);
  assert.deepEqual(rules.cleanCoords("6.45", 3.39), { lat: 6.45, lng: 3.39 });
  assert.equal(rules.cleanCoords(0, 0), null);
  assert.equal(rules.cleanCoords(95, 3), null);
});

test("tiers: Verified Individual is ID + selfie approved; a match approves, a mismatch rejects, the rest waits", () => {
  const doc = (type, status, extra = {}) => ({ type, status, ...extra });
  const base = { verificationStatus: "pending", identity: {}, payoutVerified: false };
  assert.equal(rules.supplierTiers({ ...base, docs: [doc("identity", "approved"), doc("selfie", "submitted")] }).verifiedIndividual, false);
  const both = rules.supplierTiers({ ...base, docs: [doc("identity", "approved"), doc("selfie", "approved"), doc("cac", "approved", { registry: { verified: true } })], payoutVerified: true });
  assert.deepEqual(both, { verifiedIndividual: true, registeredBusiness: true, payoutReady: true });
  assert.deepEqual(rules.supplierTierBadges(both), ["verified_individual", "registered_business", "payout_ready"]);
  assert.equal(rules.nextSupplierStatus("unverified", true, both), "verified");
  assert.equal(rules.nextSupplierStatus("rejected", true, { ...both, verifiedIndividual: false }), "pending", "a rejected supplier sending again goes back to the team");
  assert.equal(rules.nextSupplierStatus("unverified", false, both), "unverified", "nothing changes until onboarding is sent");
  assert.equal(rules.nextSupplierStatus("suspended", true, both), "suspended");
  assert.equal(rules.identitySent([doc("identity", "submitted"), doc("selfie", "rejected")]), false);
  assert.equal(rules.identitySent([doc("identity", "submitted"), doc("selfie", "submitted")]), true);
  assert.deepEqual(rules.supplierSelfieDecision({ match: true, confidence: 92 }), { status: "approved" });
  assert.equal(rules.supplierSelfieDecision({ match: true, confidence: 60 }).status, "pending");
  assert.equal(rules.supplierSelfieDecision({ match: false, confidence: 10 }).status, "rejected");
  assert.equal(rules.supplierSelfieDecision(null).status, "pending");
});

test("ID helpers keep no whole number and read only real photos", () => {
  const hash = kyc.idNumberHash("secret", "supplier-nin", "12345678901");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, kyc.idNumberHash("secret", "nin", "12345678901"), "scoped by purpose");
  assert.equal(kyc.digitsOf("123 4567 8901", 11), "12345678901");
  assert.equal(kyc.readPhotoDataUri("", "selfie").ok, false);
  assert.equal(kyc.readPhotoDataUri("data:text/html;base64,AAAA").ok, false);
  const jpeg = `data:image/jpeg;base64,${Buffer.alloc(2048, 1).toString("base64")}`;
  assert.equal(kyc.readPhotoDataUri(jpeg).ok, true);
  assert.deepEqual(kyc.readLivenessReport({ reference: "KPY-LV-1", passed: true }), { reference: "KPY-LV-1", passed: true });
  assert.equal(kyc.readLivenessReport({ reference: "<x>" }), null);
});

test("the API: one answer per save, ID and selfie routes, completion needs the ID and selfie, no documents", () => {
  const route = read("src/app/api/supplier/onboarding/route.ts");
  assert.match(route, /if \(input\.completed && !identitySent\(docs\)\)/);
  assert.match(route, /saveDeliverySettings\(user\.id, \{ originState: input\.pickup\.state/);
  assert.match(route, /businessType: SOURCE_BUSINESS_TYPE\[input\.source\]/);
  assert.doesNotMatch(route, /missingRequiredDocs/);
  assert.match(route, /cleanBuyModes\(input\.buyModes, supplier\.level\)/, "Pre-order is dropped below Established");
  assert.match(route, /\.\.\.\(buyModes \? \{ buyModes \} : \{\}\)/);
  assert.doesNotMatch(route, /buyModes: input\.buyModes/, "the raw answer is never saved");
  const selfie = read("src/app/api/supplier/kyc/selfie/route.ts");
  assert.match(selfie, /verifyKorapayIdentity\(\{ \.\.\.typed, selfie: selfie\.dataUri \}\)/);
  assert.match(selfie, /retrying without it/, "a refused face match still checks the NIN");
  assert.match(selfie, /if \(decision\.status === "approved"\) await setSupplierDocStatus\(supplier\.id, "identity", "approved"\)/);
  assert.match(selfie, /korapayLivenessReady\(\) && !liveness\) decision = \{ status: "pending" \}/);
  assert.match(read("src/app/api/supplier/kyc/id-document/route.ts"), /saveSupplierPhoto\(supplier\.id, "identity", photo/);
  assert.match(read("src/app/api/supplier/verification/submit/route.ts"), /identitySent\(docs\)/);
  assert.match(read("src/app/api/admin/suppliers/[id]/documents/route.ts"), /refreshSupplierVerification\(params\.id\)/);
  // Onboarding never touches logistics code.
  for (const file of ["src/lib/kyc/supplier.server.ts", "src/app/api/supplier/kyc/selfie/route.ts"]) assert.doesNotMatch(read(file), /@\/lib\/logistics\//, file);
  // New products take the onboarding answers as defaults.
  assert.match(read("src/app/api/supplier/products/route.ts"), /raw\.moq === undefined && supplier\.minimumOrder/);
  assert.ok(existsSync(new URL("../docs/migrations/2026-12-04-supplier-onboarding.sql", import.meta.url)));
  assert.match(read("prisma/schema.prisma"), /identityChecks\s+Json\s+@default\("\{\}"\)\n\s+\/\/\/ How shops can buy/);
});

test("the screens: web and phone, one question each, camera and location, no bank account", () => {
  const web = read("src/components/onboarding/SupplierOnboarding.tsx");
  const phone = read("apps/mobile/src/components/supplier/SupplierJoinFlow.tsx");
  for (const [name, source] of [["web", web], ["phone", phone]]) {
    assert.match(source, /stepPosition\(step, modes\)/, name);
    assert.match(source, /docsLater: true/, name);
    assert.doesNotMatch(source, /bankName|accountNumber|linkWalletBank|payout-bank/, `${name}: the bank account waits for the first payout`);
  }
  assert.match(web, /navigator\.geolocation\.getCurrentPosition/);
  // Web layout: the step list with "No BVN needed", Pre-order locked, the selfie on the phone or this camera.
  assert.match(web, /<StepRail/);
  assert.match(web, /preorderLocked/);
  assert.match(web, /t\("buy\.preorderLocked"\)/);
  assert.match(web, /<SelfieWays/);
  assert.match(read("src/components/onboarding/StepRail.tsx"), /t\("rail\.noBvn"\)/);
  assert.match(web, /capture="environment"/);
  assert.match(phone, /Location\.getCurrentPositionAsync/);
  assert.match(phone, /useKoraLiveness\(\)/);
  assert.match(read("next.config.ts"), /source: "\/supplier\/onboarding",\s*headers: baseHeaders\(true\)/);
  assert.match(read("apps/mobile/src/app/supplier/setup.tsx"), /<SupplierJoinFlow \/>/);
});
