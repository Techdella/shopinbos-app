// Refer & earn: offers, when an invite counts, rewards, limits, and the WhatsApp templates.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const r = await import("../shared/referrals.ts");
const t = await import("../src/lib/member-messaging/whatsapp-templates.ts");

test("referrals: the agreed offers", () => {
  assert.deepEqual([r.REFERRAL_OFFERS.supplier.referrerMonths, r.REFERRAL_OFFERS.supplier.referrerCredits], [3, 500]);
  assert.deepEqual([r.REFERRAL_OFFERS.seller.referrerMonths, r.REFERRAL_OFFERS.seller.referrerCredits], [1, 200]);
  assert.deepEqual([r.REFERRAL_OFFERS.logistics_partner.referrerMonths, r.REFERRAL_OFFERS.logistics_partner.referrerCredits], [2, 300]);
  assert.equal(r.welcomeText("supplier"), "1 month of Supplier Plus free + 1 featured week in the marketplace");
  assert.equal(r.welcomeText("seller"), "1 month of Starter free + 100 AI credits");
  assert.equal(r.signupPath("logistics_partner"), "/logistics/signup");
});

test("referrals: an invite counts only when the new account has really started", () => {
  const none = { verified: false, suspended: false, approvedProducts: 0, liveShop: false, paidOrders: 0, completedDeliveries: 0 };
  assert.equal(r.qualifies("supplier", { ...none, verified: true, approvedProducts: 4 }), false);
  assert.equal(r.qualifies("supplier", { ...none, verified: true, approvedProducts: 5 }), true);
  assert.equal(r.qualifies("supplier", { ...none, verified: false, approvedProducts: 9 }), false);
  assert.equal(r.qualifies("seller", { ...none, liveShop: true }), false);
  assert.equal(r.qualifies("seller", { ...none, liveShop: true, paidOrders: 1 }), true);
  assert.equal(r.qualifies("logistics_partner", { ...none, verified: true, completedDeliveries: 1 }), true);
  assert.equal(r.qualifies("logistics_partner", { ...none, verified: true, completedDeliveries: 1, suspended: true }), false);
  assert.equal(r.progressText("supplier", { ...none, verified: true, approvedProducts: 3 }), "3 of 5 approved products");
});

test("referrals: rewards, card payers, milestones and the yearly limit", () => {
  const offer = r.REFERRAL_OFFERS.supplier;
  assert.deepEqual(r.referrerReward(offer, "months", false), { months: 3, credits: 0 });
  assert.deepEqual(r.referrerReward(offer, "credits", false), { months: 0, credits: 500 });
  assert.deepEqual(r.referrerReward(offer, "months", true), { months: 0, credits: 500 }, "card payers get credits");
  assert.equal(r.milestoneAt(5)?.bonusMonths, 1);
  assert.equal(r.milestoneAt(4), null);
  assert.equal(r.underYearlyCap(9), true);
  assert.equal(r.underYearlyCap(10), false);
  assert.equal(r.rewardText({ months: 3, credits: 0 }), "3 months free");
  assert.equal(r.rewardText({ months: 0, credits: 1500 }), "1,500 AI credits");
});

test("referrals: free months stack after time already running, never more than 12 months ahead", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const first = r.extendGrant(null, 3, now);
  assert.equal(first.startsAt.toISOString(), now.toISOString());
  assert.equal(first.endsAt.toISOString(), "2027-02-01T00:00:00.000Z");
  const second = r.extendGrant(first.endsAt, 3, now);
  assert.equal(second.startsAt.toISOString(), first.endsAt.toISOString());
  assert.equal(second.endsAt.toISOString(), "2027-05-01T00:00:00.000Z");
  const capped = r.extendGrant(new Date("2027-10-15T00:00:00Z"), 3, now);
  assert.equal(capped.endsAt.toISOString(), "2027-11-01T00:00:00.000Z");
  assert.equal(r.extendGrant(new Date("2027-11-01T00:00:00Z"), 1, now), null, "full: nothing more fits");
});

test("referrals: codes, and the same person on both sides", () => {
  const code = r.makeReferralCode("Ada Fashion", () => 0);
  assert.match(code, /^ADAF[A-Z2-9]{3}$/);
  assert.match(r.makeReferralCode("", () => 0.5), /^SIB[A-Z2-9]{3}$/);
  assert.equal(r.cleanReferralCode(" adaf-k7q "), "ADAFK7Q");
  assert.equal(r.cleanReferralCode("ab"), null);
  const a = { id: "1", email: "Ada@x.com", phone: "+2348012345678" };
  assert.deepEqual(r.selfReferralReasons(a, { id: "2", email: "ada@x.com", phone: null }), ["Same email"]);
  assert.deepEqual(r.selfReferralReasons(a, { id: "2", email: null, phone: "08012345678" }), ["Same phone number"]);
  assert.deepEqual(r.selfReferralReasons(a, { id: "2", email: "kemi@x.com", phone: "08099999999" }), []);
});

test("referrals: WhatsApp templates follow Meta's rules and have their banners", () => {
  const names = new Set();
  for (const template of t.MEMBER_TEMPLATES) {
    assert.match(template.name, /^[a-z0-9_]+$/, template.name);
    assert.ok(!names.has(template.name), `${template.name} is unique`);
    names.add(template.name);
    const count = t.templateVariableCount(template.body);
    assert.equal(template.examples.length, count, `${template.name}: a sample for every variable`);
    assert.equal(template.variables.length, count, `${template.name}: a name for every variable`);
    assert.doesNotMatch(template.body.trim(), /^\{\{|\}\}$/, `${template.name}: no variable at the start or end`);
    assert.doesNotMatch(template.body, /\}\}\s*\{\{/, `${template.name}: no two variables side by side`);
    assert.ok(template.body.length <= 1024, `${template.name}: body within 1024 characters`);
    assert.ok(template.button.text.length <= 25, `${template.name}: button text within 25 characters`);
    assert.ok(fs.existsSync(`public/brand/members/${template.image}.jpg`), `${template.name}: banner exists`);
  }
  const payload = t.memberTemplatePayload(t.memberTemplate("shopinbos_referral_reward"), "h");
  assert.deepEqual(payload.components[1].example.body_text, [["Ada", "Kemi's Fabrics", "3 months free"]]);
});

test("referrals: shared supplier and delivery partner profiles carry the owner's code", () => {
  assert.equal(r.profileReferralCode("/suppliers/ada-textiles", "adaf-k7q"), "ADAFK7Q");
  assert.equal(r.profileReferralCode("/logistics/partners/swift-riders", "SWIF2KQ"), "SWIF2KQ");
  assert.equal(r.profileReferralCode("/suppliers/ada-textiles", null), null, "no ?ref, nothing to remember");
  assert.equal(r.profileReferralCode("/suppliers/ada-textiles", "ab"), null, "not a code");
  assert.equal(r.profileReferralCode("/s/ada-shop", "ADAFK7Q"), null, "only supplier and partner profiles");
  assert.equal(r.profileReferralCode("/logistics/partners", "ADAFK7Q"), null);
  assert.equal(r.profileReferralCode("/suppliers/ada/products", "ADAFK7Q"), null);
  assert.equal(r.profileShareLink("https://app.shopinbos.com/", "/suppliers/ada-textiles", "ADAFK7Q"), "https://app.shopinbos.com/suppliers/ada-textiles?ref=ADAFK7Q");
  assert.equal(r.profileInvitePath("ADAFK7Q", "logistics_partner"), "/r/ADAFK7Q?for=logistics_partner&src=profile");
  assert.equal(r.asReferralSource("profile"), "profile");
  assert.equal(r.asReferralSource(undefined), "link");
  assert.equal(r.asReferralSource("anything"), "link");

  const read = (path) => fs.readFileSync(path, "utf8");
  assert.match(read("docs/migrations/2026-11-30-referral-source.sql"), /ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'link'/);
  assert.match(read("src/proxy.ts"), /profileReferralCode\(pathname, request\.nextUrl\.searchParams\.get\("ref"\)\)/, "opening a shared profile remembers the code");
  assert.match(read("src/app/r/[code]/route.ts"), /REFERRAL_SOURCE_COOKIE/, "the profile's join buttons mark the source");
  const service = read("src/lib/referrals/service.server.ts");
  assert.match(service, /asReferralSource\(jar\.get\(REFERRAL_SOURCE_COOKIE\)\?\.value\)/);
  assert.match(service, /kind: "profile_referral", ref: referee\.id/, "a profile sign-up gives the owner points");
  for (const page of ["src/app/suppliers/[slug]/page.tsx", "src/app/logistics/partners/[slug]/page.tsx"]) assert.match(read(page), /<PoweredByShopinbos /, `${page} shows the badge`);
  // next/link would prefetch /r/CODE (which sets the cookies) as soon as the buttons scroll into view.
  assert.doesNotMatch(read("src/components/referrals/PoweredByShopinbos.tsx"), /from "next\/link"|<\/Link>/, "join buttons are plain links");
});
