import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Seller sign-up to a live store, one question per screen (2026 "Onboarding — Simplified").
const onboarding = await import("../shared/onboarding.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("nine questions in order; the dropship path skips name-and-price but keeps the numbering", () => {
  assert.deepEqual([...onboarding.SELLER_QUESTIONS], ["name", "logo", "sell", "ready", "product", "details", "look", "address", "live"]);
  assert.equal(onboarding.sellerQuestionNumber("look"), 7);
  assert.equal(onboarding.nextSellerQuestion("product", "own"), "details");
  assert.equal(onboarding.nextSellerQuestion("product", "dropship"), "look");
  assert.equal(onboarding.previousSellerQuestion("look", "dropship"), "product");
  assert.equal(onboarding.previousSellerQuestion("look", "own"), "details");
  assert.equal(onboarding.previousSellerQuestion("name", null), null);
  assert.equal(onboarding.nextSellerQuestion("live", null), null);
});

test("a returning seller resumes on the saved question; the older flow's screens start over", () => {
  assert.equal(onboarding.resumeSellerQuestion("address"), "address");
  assert.equal(onboarding.resumeSellerQuestion("chat"), "name");
  assert.equal(onboarding.resumeSellerQuestion(undefined), "name");
});

test("helpers: greeting name, initials, suggested dropship price, address from the name", () => {
  assert.equal(onboarding.firstNameOf("  Ada Okafor "), "Ada");
  assert.equal(onboarding.lettermark("Ada's Kloset"), "AK");
  assert.equal(onboarding.lettermark("Glow"), "GL");
  assert.equal(onboarding.suggestedRetailPrice(10_000), 12_500);
  assert.equal(onboarding.suggestedRetailPrice(9_990), 12_500);
  assert.equal(onboarding.suggestedRetailPrice(0), 0);
  assert.equal(onboarding.addressFromName("Ada's Kloset & Co."), "ada-s-kloset-co");
});

test("web and phone run the same guided build with the same calls, and never ask for ID, bank or CAC", () => {
  // Both now run Rex's guided build (tests/seller-onboarding-flow.test.mjs, tests/web-seller-onboarding.test.mjs).
  const web = ["SellerRexBuild.tsx", "basics.tsx", "products.tsx", "design.tsx", "pages.tsx", "finish.tsx", "api.ts"].map((file) => read(`src/components/onboarding/seller/${file}`)).join("\n");
  const phone = ["app/onboarding/index.tsx", "components/rex-build/basics.tsx", "components/rex-build/products.tsx", "components/rex-build/design.tsx", "components/rex-build/pages.tsx"].map((file) => read(`apps/mobile/src/${file}`)).join("\n");
  for (const [label, source] of [["web", web], ["phone", phone]]) {
    assert.doesNotMatch(source, /payout-bank|linkPayoutBank|\bnin\b|cacNumber|bvn/i, `${label} has no ID, bank or CAC`);
    assert.match(source, /nextScreen\(screen, mode\)/, `${label} uses the shared step machine`);
    assert.match(source, /addSupplierPick\(/, label);
    assert.match(source, /saveAddress\(/, label);
  }
  assert.match(web, /useT\("rexBuild"\)/);
  assert.match(web, /capture="environment"/, "the products step opens the phone's camera");
  assert.match(web, /await goLive\(\)|const result = await goLive\(\)/);
  assert.match(read("apps/mobile/src/app/onboarding/review.tsx"), /await goLive\(\)/);
  // Buying a domain is a paid checkout: the phone only points to the website.
  assert.doesNotMatch(phone, /searchDomains|\/api\/domains/);
});

test("Rex draws four logo ideas at sign-up; the address route checks and moves the free address", () => {
  const route = read("src/app/api/ai/generate-logo/route.ts");
  assert.match(route, /body\.count === 4 \? 4 : LOGO_STYLES\.length/);
  assert.match(route, /drawLogoOptions\(input, draw, wanted\)/);
  assert.match(read("src/lib/ai/rex/logo.ts"), /export function logoStylesFor\(count: number\)/);
  const address = read("src/app/api/app/onboarding/address/route.ts");
  assert.match(address, /withSeller/);
  assert.match(address, /changeStoreSlug\(store\.id, body\.slug\)/);
  assert.match(address, /isStoreSlugTaken\(slug, store\.id\)/);
});

test("category chips start with everyday categories, then the marketplace's, never twice", () => {
  const chips = onboarding.businessCategories(["Phones & Tablets", "Fashion", "Home & Kitchen", "Other"]);
  assert.equal(chips[0], "Fashion");
  assert.ok(chips.includes("Food and drinks"));
  assert.ok(chips.includes("Phones & Tablets"));
  assert.equal(chips.filter((name) => /^fashion$/i.test(name)).length, 1);
  assert.ok(!chips.includes("Home & Kitchen"), "same as Home and kitchen");
  assert.equal(chips.at(-1), "Other");
  assert.equal(chips.filter((name) => name === "Other").length, 1);
  assert.match(read("src/lib/kyc/supplier-onboarding.server.ts"), /businessCategories\(/);
});

test("verification screens have no page head or banner above the question", () => {
  assert.match(read("src/app/logistics/verification/page.tsx"), /\bbare bleed>/);
  assert.match(read("src/components/verification/AnnouncementBanner.tsx"), /VERIFYING_PATHS/);
});

test("looks: the real theme library, applied before Rex builds on it", () => {
  const { look, palette } = onboarding.lookFromTheme({ id: "noir", name: "Dúdú", preview: { bg: "#141414", ink: "#F5F2EA", accent: "#C8A96A", nameFont: "serif", dark: true } });
  assert.equal(look.templateId, "noir");
  assert.equal(look.fontStyle, "fraunces");
  assert.deepEqual(palette.swatches, ["#141414", "#C8A96A", "#F5F2EA"], "a dark theme's background is its dark colour");
  assert.deepEqual(onboarding.lookFromTheme({ id: "plain", name: "Jẹ́jẹ́", preview: { bg: "#F2F2F2", ink: "#111111", accent: "#111111", nameFont: "grotesk", dark: false } }).palette.swatches, ["#111111", "#111111", "#F2F2F2"]);

  // The web and the phone put the draft on the theme for what the shop sells before Rex builds on it; the server
  // checks the plan.
  const web = read("src/components/onboarding/seller/design.tsx");
  assert.doesNotMatch(web, /BRAND_LOOKS|BRAND_PALETTES/, "no more hand-drawn mock looks");
  assert.match(web, /await applyTheme\(themeId\)/);
  assert.match(read("src/components/onboarding/seller/api.ts"), /"\/api\/store\/templates\/apply"/);

  // The phone puts the draft on the theme for what the shop sells before Rex builds on it.
  const phone = read("apps/mobile/src/components/rex-build/design.tsx");
  assert.doesNotMatch(phone, /BRAND_LOOKS|BRAND_PALETTES/);
  assert.match(phone, /await applyLook\(themeId\)/);
});
