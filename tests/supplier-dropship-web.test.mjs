// Supplier & Dropship Rules, the supplier's side on the web and its JSON API: channel prices are checked together
// on every way a product is saved, pre-orders only switch on at Established, the delivery rate card is checked,
// suppliers offer no seller branding (every dropship parcel is packed plain), and a dropship order is packed plain
// (checklist + sealed-parcel photo) before a rider can have it.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("product create and edit check channel prices and gate pre-orders on the level", () => {
  const create = read("src/app/api/supplier/products/route.ts");
  assert.match(create, /channelPriceProblem\(fields\)/);
  assert.match(create, /apiError\("invalid_prices", priceProblem, 400\)/);
  assert.match(create, /preorderLevelProblem\(supplier\.id\)/);
  assert.match(create, /apiError\("preorder_locked", locked, 403\)/);
  assert.match(create, /cleanDropshipMinQty\(fields\.dropshipMinQty\)/);
  assert.match(create, /cleanHandlingDays\(fields\.handlingDays\)/);

  const edit = read("src/app/api/supplier/products/[id]/route.ts");
  assert.match(edit, /channelPriceProblem\(\{ \.\.\.product, \.\.\.fields/, "checked on the product as it will be");
  assert.match(edit, /preorderParsed\.value\.preorderEnabled && !product\.preorderEnabled/, "only turning them on is gated");
  assert.match(edit, /preorderLevelProblem\(product\.supplierId\)/);
  assert.match(edit, /apiError\("preorder_locked", locked, 403\)/);
  assert.match(edit, /filter\(\(\[key\]\) => key in sent\)/, "a PATCH changes only what it sends");

  const actions = read("src/app/actions/supplier.ts");
  assert.equal((actions.match(/channelPriceProblem\(/g) ?? []).length, 3, "create, edit and CSV import");
  assert.equal((actions.match(/preorderLevelProblem\(supplier\.id\)/g) ?? []).length, 2);
  assert.match(actions, /preorder\.value\.preorderEnabled && !product\.preorderEnabled/);
  assert.match(actions, /formData\.getAll\("tierMin"\)/, "quantity breaks come as rows");
});

test("the product form switches prices per channel and locks pre-orders before Established", () => {
  const form = read("src/components/supplier/SupplierProductForm.tsx");
  assert.match(form, /canTakePreorders\(level\?\.level\) \|\| Boolean\(product\?\.preorderEnabled\)/);
  assert.match(form, /href="\/supplier\/level"/);
  assert.match(form, /Do you ship single pieces\?/);
  assert.match(form, /How fast do you pack an order\?/);
  assert.match(form, /SIZE_CLASS_LABELS\[band\]/);
  const prices = read("src/components/supplier/ChannelPricesFields.tsx");
  assert.match(prices, /Same price for all/);
  assert.match(prices, /Different per channel/);
  assert.match(prices, /name="tierMin"/);
  assert.match(prices, /\+ Add quantity break/);
  assert.match(prices, /name="minRetailPrice"/);
  for (const page of ["src/app/supplier/products/new/page.tsx", "src/app/supplier/products/[id]/edit/page.tsx"]) {
    assert.match(read(page), /supplierLevelView\(supplier\.id\)/, page);
  }
});

test("delivery rate card: partner rates or the supplier's own zone prices, checked with cleanZoneRates", () => {
  const server = read("src/lib/supplier-dropship.server.ts");
  assert.match(server, /cleanZoneRates\(input\.zoneRates\)/);
  assert.match(server, /selfDelivery: true/, "own rates: the supplier's courier delivers");
  const route = read("src/app/api/supplier/delivery-rates/route.ts");
  assert.match(route, /export const GET = withSupplier/);
  assert.match(route, /export const PUT = withSupplier/);
  assert.match(route, /saveSupplierDeliveryRates/);
  const card = read("src/components/supplier/DeliveryRateCard.tsx");
  assert.match(card, /You never pay for delivery\. The customer or the seller pays it at checkout\./);
  assert.match(card, /Use Shopinbos partner rates/);
  assert.match(card, /Set my own rates/);
  assert.match(read("src/app/supplier/delivery/page.tsx"), /<DeliveryRateCard initial=\{rates\} \/>/);
});

test("your level has a page, an API and a link; there is no branding-you-offer page", () => {
  const server = read("src/lib/supplier-dropship.server.ts");
  assert.doesNotMatch(server, /saveSupplierBranding|supplierBrandingView|brandingOffer/, "suppliers don't offer seller branding");
  assert.match(read("src/app/api/supplier/level/route.ts"), /supplierLevelView\(supplier\.id\)/);
  assert.ok(existsSync(new URL("../src/app/supplier/level/page.tsx", import.meta.url)));
  assert.equal(existsSync(new URL("../src/app/supplier/branding/page.tsx", import.meta.url)), false);
  // Linked from the dashboard (a sidebar item needs an intro and nav words in every language).
  const dashboard = read("src/app/supplier/dashboard/page.tsx");
  assert.match(dashboard, /href="\/supplier\/level"/);
  assert.doesNotMatch(dashboard, /\/supplier\/branding/);
  assert.doesNotMatch(read("src/app/supplier/delivery/page.tsx"), /\/supplier\/branding/);
});

test("dropship orders are packed plain before a rider has them", () => {
  const service = read("src/lib/supplier-orders/service.server.ts");
  assert.match(service, /branding: brandingFor\(group\.supplierId, group\.items\)/, "the snapshot is saved on the order");
  assert.match(service, /choice: BLIND_PACKING,\s*fee: 0,/, "always blind, no fee");
  assert.doesNotMatch(service, /effectiveBranding|brandingChoice|useSellerSticker/);
  assert.match(service, /unitCost: dropshipUnitPrice\(product\.supplierProduct\)/);
  assert.match(service, /dropshipPackProblem\(order\.id\)/, "sending without packing needs the checklist too");

  const pickup = read("src/lib/supplier-orders/pickup.server.ts");
  assert.match(pickup, /dropshipPackProblem\(order\.id\)/);
  assert.doesNotMatch(pickup, /useSellerSticker/, "no sticker packs to count");

  const server = read("src/lib/supplier-dropship.server.ts");
  assert.match(server, /packReadyProblem\(steps, done, row\.packPhotoUrl, row\.contentsPhotoUrl\)/);
  assert.doesNotMatch(server, /stickersAfterUse|stickerPackLeft|useSellerSticker/);

  const route = read("src/app/api/supplier/orders/[id]/pack/route.ts");
  assert.match(route, /export const POST = withSupplier/);
  assert.match(route, /savePackProgress\(supplierId, id/);
  assert.match(route, /markPacked\(supplierId, kind, id\)/, "dropship, or a bulk order's two packing photos (?kind=wholesale)");

  const page = read("src/app/supplier/orders/[id]/page.tsx");
  assert.match(page, /<PackChecklist/);
  assert.match(read("src/components/supplier/PackChecklist.tsx"), /uploadToMyMedia\(file, "image"\)/);
});

test("delivered orders refresh the supplier's level", () => {
  assert.match(read("src/lib/supplier-orders/service.server.ts"), /next === "delivered"\) void import\("@\/lib\/supplier-levels\.server"\)\.then\(\(levels\) => levels\.refreshSupplierLevel\(input\.supplierId\)\)\.catch/);
  assert.match(read("src/lib/supplier-orders/wholesale.server.ts"), /next === "delivered"\) void import\("@\/lib\/supplier-levels\.server"\)\.then\(\(levels\) => levels\.refreshSupplierLevel\(input\.supplierId\)\)\.catch/);
});

test("pure rules the pages rely on", async () => {
  const rules = await import("../shared/dropship-rules.ts");
  assert.equal(rules.channelPriceProblem({ priceMode: "per_channel", wholesalePrice: 8000, dropshipPrice: 9500, suggestedRetailPrice: 9000 }) !== null, true);
  assert.equal(rules.channelPriceProblem({ priceMode: "per_channel", wholesalePrice: 8000, dropshipPrice: 9500, suggestedRetailPrice: 14000, minRetailPrice: 12000 }), null);
  const steps = rules.packChecklist({ orderCode: "SB-4821" });
  assert.match(rules.packReadyProblem(steps, ["plain", "code"], null), /photo/);
  assert.equal(rules.packReadyProblem(steps, ["plain", "code"], "https://x.test/p.jpg", "https://x.test/c.jpg"), null);
  assert.equal(rules.cleanZoneRates({ same_city: { small: 2000 }, rest: { small: 1000 } }).ok, false, "farther can't cost less");
});
