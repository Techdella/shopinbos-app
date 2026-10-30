// Suppliers don't offer branding for sellers (the owner's decision, Oct 2026): like the big dropship marketplaces,
// every dropship parcel is packed plain (blind), and the seller's brand shows only on their own tracking page and
// invoice. No "Seller branding" / "Branding you offer" settings, no packing slips or stickers from the supplier, no
// branding fee, and no supplier level that unlocks branding. (The seller's own Packaging & labels studio stays.)
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const rules = await import("../shared/dropship-rules.ts");
const checkout = await import("../shared/dropship-checkout.ts");

test("the supplier branding page, API and phone screen are gone", () => {
  for (const path of [
    "src/app/supplier/branding/page.tsx",
    "src/app/api/supplier/branding/route.ts",
    "src/components/supplier/BrandingOfferForm.tsx",
    "apps/mobile/src/app/supplier/branding.tsx",
  ]) assert.equal(existsSync(join(root, path)), false, path);
  for (const path of ["src/app/supplier/dashboard/page.tsx", "src/app/supplier/delivery/page.tsx", "apps/mobile/src/app/supplier/account.tsx", "apps/mobile/src/lib/supplier.ts"]) {
    assert.doesNotMatch(read(path), /supplier\/branding/, path);
  }
});

test("no supplier or seller dropship screen offers packing slips, stickers or a branding fee", () => {
  for (const path of [
    "src/app/supplier/orders/[id]/page.tsx",
    "src/components/supplier/PackChecklist.tsx",
    "src/components/supplier/SupplierLevel.tsx",
    "src/app/marketplace/_components/DropshipTermsPanel.tsx",
    "src/app/marketplace/_components/ProductDetail.tsx",
    "apps/mobile/src/app/supplier/order/pack.tsx",
    "apps/mobile/src/app/supplier/level.tsx",
    "apps/mobile/src/app/supplier/(tabs)/home.tsx",
    "apps/mobile/src/components/seller/AddFromSupplier.tsx",
    "apps/mobile/src/app/find/[slug].tsx",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /packing slips? (for|to) sellers|sticker|slip fee|brandingFee|brandingChoice/i, path);
    assert.doesNotMatch(source, /"Your branding"|Branding you offer|"Seller branding"|Your branding</, path);
  }
});

test("the pack checklist is plain: no slip or sticker step", () => {
  const steps = rules.packChecklist({ orderCode: "SB-4821" });
  assert.deepEqual(steps.map((step) => step.id), ["contents", "plain", "code", "photo"]);
  for (const step of steps) assert.doesNotMatch(`${step.text} ${step.detail}`, /slip|sticker/i);
  assert.equal(rules.BLIND_PACKING, "blind");
  // The order snapshot is always blind with no fee.
  assert.match(read("src/lib/supplier-orders/service.server.ts"), /choice: BLIND_PACKING,\s*fee: 0,/);
});

test("dropship margins carry no branding fee and no level unlocks branding", () => {
  assert.equal(rules.dropshipMargin({ retailPrice: 14000, unitCost: 9500, payer: "customer", deliveryFee: 4500, brandingFee: 500 }), 4500);
  const terms = checkout.dropshipTerms({
    product: { priceMode: "per_channel", wholesalePrice: 9000, dropshipPrice: 9500, suggestedRetailPrice: 14000, stockQuantity: 10, sizeBand: "small" },
    supplier: { city: "Lagos", level: "established", brandingOffer: { stickers: true, stickerFee: 200, packingSlip: true, packingSlipFee: 150 } },
    delivery: { rateSource: "partners" },
  });
  assert.equal("branding" in terms, false);
  assert.equal(checkout.listingEarn(terms, { retailPrice: 14000, payer: "customer", brandingChoice: "stickers" }), 4500);
  for (const level of ["new", "trusted", "established"]) assert.equal("branding" in rules.supplierPerks(level), false, level);
});
