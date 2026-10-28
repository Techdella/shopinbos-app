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

test("web and phone ask the same questions with the same calls, and never ask for ID, bank or CAC", () => {
  const web = read("src/components/onboarding/seller/SellerOnboarding.tsx");
  const phone = read("apps/mobile/src/app/onboarding/index.tsx");
  for (const [label, source] of [["web", web], ["phone", phone]]) {
    assert.match(source, /useT\("sellerStart", "common"\)/, label);
    assert.match(source, /nextSellerQuestion\(question, path\)/, label);
    assert.match(source, /saveMemory\(\{ screen: next, \.\.\.patch \}\)/, `${label} saves the screen after every answer`);
    assert.match(source, /drawLogos\(/, label);
    assert.match(source, /addSupplierPick\(/, label);
    assert.match(source, /createFirstProduct\(/, label);
    assert.match(source, /buildStore\(/, label);
    assert.match(source, /saveAddress\(/, label);
    assert.doesNotMatch(source, /payout-bank|linkPayoutBank|\bnin\b|cacNumber|bvn/i, `${label} has no ID, bank or CAC`);
  }
  assert.match(web, /capture="environment"/, "the first product opens the camera");
  assert.match(web, /publishStore\(\)/);
  assert.match(phone, /publishShop\(\)/);
  assert.match(web, /"\/home\/start"/);
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

test("Pick a look: the real theme library with full previews, applied before Rex builds on it", () => {
  const { look, palette } = onboarding.lookFromTheme({ id: "noir", name: "Dúdú", preview: { bg: "#141414", ink: "#F5F2EA", accent: "#C8A96A", nameFont: "serif", dark: true } });
  assert.equal(look.templateId, "noir");
  assert.equal(look.fontStyle, "fraunces");
  assert.deepEqual(palette.swatches, ["#141414", "#C8A96A", "#F5F2EA"], "a dark theme's background is its dark colour");
  assert.deepEqual(onboarding.lookFromTheme({ id: "plain", name: "Jẹ́jẹ́", preview: { bg: "#F2F2F2", ink: "#111111", accent: "#111111", nameFont: "grotesk", dark: false } }).palette.swatches, ["#111111", "#111111", "#F2F2F2"]);

  const web = read("src/components/onboarding/seller/SellerOnboarding.tsx");
  assert.doesNotMatch(web, /BRAND_LOOKS|BRAND_PALETTES/, "no more hand-drawn mock looks");
  for (const piece of ["<ThemeThumbnail", "<ThemePreviewDialog", "themeCategoryChips()", "pickThemeByRules(", "brand={brand}"]) assert.ok(web.includes(piece), piece);
  // The theme's pages first, then Rex's words and colours on them; the server checks the plan.
  assert.match(web, /await applyTheme\(picked\.id\);[\s\S]*await buildStore\(/);
  assert.match(read("src/components/onboarding/seller/api.ts"), /"\/api\/store\/templates\/apply"/);
  // A selected chip keeps its check and label on one line.
  assert.match(web, /<Icon name="check" size=\{14\} className="shrink-0" \/>\}\s*<span>\{category\}<\/span>/);

  const phone = read("apps/mobile/src/app/onboarding/index.tsx");
  assert.doesNotMatch(phone, /BRAND_LOOKS|BRAND_PALETTES/);
  for (const piece of ["fetchLookLibrary()", "<MiniShop", "lookDemoUrl(look)", "await applyLook(picked.id);"]) assert.ok(phone.includes(piece), piece);
});
