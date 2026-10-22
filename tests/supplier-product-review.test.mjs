// A live supplier product stays on sale when only stock, MOQ, availability or delivery details change; new words,
// photos, category or prices go back to the team first. And uploads are sized for the server's request limit.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const review = await import("../shared/supplier-product-review.ts");
const media = await import("../shared/media.ts");
const docs = await import("../shared/verification-docs.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const live = { name: "Shea butter 500g", description: "Raw, unrefined", categoryId: "beauty", images: ["a.jpg", "b.jpg"], wholesalePrice: 4500, wholesalePriceTo: null, suggestedRetailPrice: 7000, pricingTiers: [{ min: 10, price: 4200 }], currency: "NGN", stockQuantity: 40, moq: 5, dropshipAvailable: true };

test("stock, MOQ and availability edits don't need review", () => {
  const edit = { ...live, stockQuantity: 0, moq: 10, dropshipAvailable: false, deliveryRegions: ["Lagos"], processingTime: "2 days" };
  assert.equal(review.editNeedsReview(live, edit), false);
  // The same values written differently (spaces, key order, 4500 vs 4500.0) aren't a change either.
  assert.equal(review.editNeedsReview(live, { ...live, name: " Shea butter 500g ", pricingTiers: [{ price: 4200, min: 10 }], wholesalePrice: 4500.0 }), false);
  assert.equal(review.statusAfterEdit({ current: "published", verified: true, submit: false, needsReview: false }), "published");
});

test("new words, photos, category or prices go back for review", () => {
  for (const change of [{ name: "Shea butter 1kg" }, { description: "Whipped" }, { categoryId: "food" }, { images: ["a.jpg"] }, { wholesalePrice: 4000 }, { suggestedRetailPrice: 8000 }, { pricingTiers: [{ min: 10, price: 4000 }] }]) {
    assert.equal(review.editNeedsReview(live, { ...live, ...change }), true, JSON.stringify(change));
  }
  assert.equal(review.statusAfterEdit({ current: "published", verified: true, submit: false, needsReview: true }), "pending_review");
  // Fields the edit leaves out aren't changing (the phone app's quick edit sends only what it shows).
  assert.equal(review.editNeedsReview(live, { stockQuantity: 3 }), false);
});

test("drafts, submissions and unverified suppliers", () => {
  assert.equal(review.statusAfterEdit({ current: "draft", verified: true, submit: false, needsReview: true }), "draft");
  assert.equal(review.statusAfterEdit({ current: "draft", verified: true, submit: true, needsReview: false }), "pending_review");
  assert.equal(review.statusAfterEdit({ current: "pending_review", verified: true, submit: false, needsReview: false }), "pending_review");
  assert.equal(review.statusAfterEdit({ current: "rejected", verified: true, submit: false, needsReview: true }), "draft");
  assert.equal(review.statusAfterEdit({ current: "published", verified: false, submit: true, needsReview: false }), "draft");
});

test("every edit path uses the same rule", () => {
  assert.match(read("src/app/actions/supplier.ts"), /statusAfterEdit\(\{ current: product\.status, verified, submit: wantsReview, needsReview: editNeedsReview\(product, parsed\.data\) \}\)/);
  assert.match(read("src/app/api/supplier/products/[id]/route.ts"), /editNeedsReview\(product, parsed\.data\)/);
  assert.match(read("src/app/api/mobile/supplier/products/[id]/route.ts"), /editNeedsReview\(product, \{ wholesalePrice/);
});

test("uploads fit under the server's 4.5 MB request limit, with pictures shrunk first", () => {
  assert.ok(media.UPLOAD_MAX_BYTES <= 4.5 * 1024 * 1024);
  assert.ok(docs.MAX_DOC_BYTES <= media.UPLOAD_MAX_BYTES);
  assert.match(docs.validateDocFile({ name: "cac.pdf", type: "application/pdf", size: 5 * 1024 * 1024 }) ?? "", /The limit is 4 MB\./);
  assert.equal(docs.validateDocFile({ name: "cac.pdf", type: "application/pdf", size: 3 * 1024 * 1024 }), null);
  assert.match(read("src/components/verification/VerificationDocUploader.tsx"), /const file = await readyToSend\(picked\);/);
  assert.match(read("src/components/media/media-client.ts"), /const file = await readyToSend\(picked\);/);
  assert.match(read("src/components/verification/doc-words.ts"), /The limit is 4 MB\./);
});

test("delivery partners top up on their own credits page: the email from the phone app and the top bar", async () => {
  const credits = await import("../shared/ai-credits.ts");
  assert.equal(credits.creditsUrlFor("logistics_partner"), "/logistics/credits");
  assert.equal(credits.creditsUrlFor("supplier"), "/supplier/credits");
  assert.equal(credits.creditsUrlFor("seller"), "/home/credits");
  assert.match(read("src/app/api/mobile/credits/topup-email/route.ts"), /creditsUrlFor\(user\.role\)/);
  assert.match(read("src/components/shell/GlobalTopBar.tsx"), /role === "logistics_partner"\) && <CreditsBadge manageHref=\{creditsUrlFor\(role\)\} \/>/);
  assert.match(read("src/app/logistics/credits/page.tsx"), /returnTo="\/logistics\/credits"/);
});
