// Supplier & Dropship Rules on the phone (apps/mobile): the supplier's Prices (P-Pricing) and Dropship settings
// (P-Dropship), Delivery prices (P-Delivery), Seller branding (P-Branding), Your level (P-Tier) and "Pack it the
// seller's way" (P-Order); the seller's "Add to your store" (A-Seller-AddSupplier); the delivery partner's locked pay
// on delivery (A-Rider-POD); Pre-order locked at sign-up; and the mobile quick-edit route gated like the web.
// The pure parts (apps/mobile/src/lib/dropship-pure.ts) must agree with shared/dropship-rules.ts and
// shared/dropship-checkout.ts, which the server uses.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const app = (path) => read(`apps/mobile/src/${path}`);
const pure = await import("../apps/mobile/src/lib/dropship-pure.ts");
const rules = await import("../shared/dropship-rules.ts");
const checkout = await import("../shared/dropship-checkout.ts");
const webFind = await import("../src/lib/marketplace/find.ts");
const findPure = await import("../apps/mobile/src/lib/find-pure.ts");

const form = (patch = {}) => ({ ...pure.pricesFormFrom(null), base: "9000", suggested: "14000", ...patch });

test("Prices: the form reads to the API body and refuses with the server's own words", () => {
  const per = pure.readPricesForm(form({ dropship: "9500", breaks: [{ min: "24", max: "", price: "7,500" }, { min: "6", max: "23", price: "8200" }], lowest: "12000" }));
  assert.equal(per.ok, true);
  assert.deepEqual(per.body, {
    priceMode: "per_channel",
    wholesalePrice: 9000,
    dropshipPrice: 9500,
    preorderPrice: null,
    pricingTiers: [{ minQty: 6, maxQty: 23, price: 8200 }, { minQty: 24, price: 7500 }],
    suggestedRetailPrice: 14000,
    minRetailPrice: 12000,
  });
  assert.equal(rules.channelPriceProblem(per.body), null, "what the phone sends, the server accepts");

  // "Same price for all": one price, no breaks and no channel prices.
  const same = pure.readPricesForm(form({ mode: "same", dropship: "9500", breaks: [{ min: "6", max: "", price: "8000" }] }));
  assert.deepEqual([same.body.priceMode, same.body.dropshipPrice, same.body.pricingTiers], ["same", null, []]);

  // The pre-order price goes only when the supplier is Established.
  assert.equal(pure.readPricesForm(form({ preorder: "7000" })).body.preorderPrice, null);
  assert.equal(pure.readPricesForm(form({ preorder: "7000" }), true).body.preorderPrice, 7000);

  // Refusals: the shared rule's words, so the phone and the server say the same thing.
  const low = form({ dropship: "9500", lowest: "9000" });
  const lowBody = { priceMode: "per_channel", wholesalePrice: 9000, dropshipPrice: 9500, suggestedRetailPrice: 14000, minRetailPrice: 9000 };
  assert.equal(pure.readPricesForm(low).message, rules.channelPriceProblem(lowBody));
  assert.match(pure.readPricesForm(form({ breaks: [{ min: "6", max: "", price: "7000" }, { min: "24", max: "", price: "8000" }] })).message, /Bigger quantities/);
  assert.match(pure.readPricesForm(form({ suggested: "9000" })).message, /suggested price should be above/);
  assert.match(pure.readPricesForm(form({ base: "" })).message, /wholesale price/);
  assert.match(pure.readPricesForm(form({ mode: "same", base: "" })).message, /price per piece/);
  assert.match(pure.readPricesForm(form({ breaks: [{ min: "10", max: "5", price: "8000" }] })).message, /quantity break/);

  // Round trip from a saved product.
  const saved = { priceMode: "per_channel", wholesalePrice: 9000, dropshipPrice: 9500, preorderPrice: null, suggestedRetailPrice: 14000, minRetailPrice: 12000, pricingTiers: [{ minQty: 6, maxQty: 23, price: 8200 }] };
  const back = pure.pricesFormFrom(saved);
  assert.deepEqual(back.breaks, [{ min: "6", max: "23", price: "8200" }]);
  assert.equal(pure.readPricesForm(back).ok, true);
  assert.equal(pure.formDropshipCost(back), rules.dropshipUnitPrice(saved));
  assert.equal(pure.priceSummary(saved), "Dropship ₦9,500 · Wholesale ₦9,000 · 6–23 ₦8,200");
  assert.equal(pure.priceSummary({ priceMode: "same", wholesalePrice: 9000 }), "₦9,000 for all");
  assert.deepEqual(pure.nextBreak([]), { min: "6", max: "", price: "" });
  assert.deepEqual(pure.nextBreak([{ min: "6", max: "23", price: "8200" }]).min, "24");
  assert.equal(pure.breakRange({ min: "6", max: "23" }), "6–23");
  assert.equal(pure.breakRange({ min: "24", max: "" }), "24+");
});

test("Dropship settings, delivery rate card, level meter and the pack button", () => {
  assert.deepEqual(pure.dropshipBody(pure.dropshipFormFrom(null)), { dropshipMinQty: 1, handlingDays: 1, sizeBand: "small", sampleAvailable: false });
  const min = pure.dropshipFormFrom({ dropshipMinQty: 3, handlingDays: 2, sizeBand: "bulky", sampleAvailable: true });
  assert.deepEqual(pure.dropshipBody(min), { dropshipMinQty: 3, handlingDays: 2, sizeBand: "bulky", sampleAvailable: true });
  assert.equal(pure.dropshipBody({ ...min, single: true }).dropshipMinQty, 1);
  assert.equal(pure.dropshipBody({ ...min, minQty: 5000 }).dropshipMinQty, rules.DROPSHIP_MIN_MAX);

  // An empty card starts from the example prices; the check is the server's cleanZoneRates.
  const draft = pure.rateDraftFrom(null, rules.DEFAULT_ZONE_RATES);
  assert.equal(draft.rest.bulky, "10000");
  assert.deepEqual(pure.readRateDraft(draft), rules.cleanZoneRates(rules.DEFAULT_ZONE_RATES));
  const cheaperFar = { ...draft, rest: { ...draft.rest, small: "1000" } };
  assert.equal(pure.readRateDraft(cheaperFar).ok, false);
  assert.match(pure.readRateDraft(cheaperFar).message, /Farther should cost the same or more/);
  assert.deepEqual(pure.zoneExamples("Rivers", "Port Harcourt").same_city, "Port Harcourt");
  assert.equal(pure.zoneDaysWords("rest"), "3–6 days");

  // "62 of 100 orders · 18 of 30 reviews" toward Established.
  const meter = pure.preorderMeter([{ key: "delivered", have: 62 }, { key: "reviews", have: 18 }]);
  assert.deepEqual(meter, { share: 0.62, line: "62 of 100 orders · 18 of 30 reviews" });
  assert.equal(pure.preorderMeter([{ key: "delivered", have: 5 }]).line, "5 of 100 orders", "New suppliers' goals have no review count yet");
  const record = { verified: true, delivered: 62, reviews: 18, rating: 4.7, disputes: 1, addressVerified: true, createdAt: "2026-09-01", now: new Date("2026-10-19") };
  const goals = rules.supplierLevelGoals(record).goals;
  assert.equal(pure.goalValue(goals.find((goal) => goal.key === "delivered")), "62 / 100");
  assert.equal(pure.goalShare(goals.find((goal) => goal.key === "delivered")), 0.62);
  assert.equal(pure.goalValue(goals.find((goal) => goal.key === "rating")), "4.7");
  assert.equal(pure.goalShare({ kind: "check", have: 0, need: 1, done: true }), 1);

  // Ready for pickup only with every step ticked and both photos taken: the item in the open box and the sealed
  // parcel (packReadyProblem on the server; shared/fault-matrix.ts: they decide most disputes).
  const steps = rules.packChecklist({ sellerName: "Ada's Kloset", choice: "stickers", orderCode: "SB-4821", stickersLeft: 14 });
  const asView = (done, photo) => steps.map((step) => ({ id: step.id, done: step.id === "photo" || step.id === "contents" ? Boolean(photo) : done.includes(step.id) }));
  assert.deepEqual(pure.packButton(asView(["plain"], null), null), { left: 4, ready: false, label: "4 steps left" });
  assert.equal(pure.packButton(asView(["plain", "sticker", "code"], null), null).label, "2 steps left", "both photos still to take");
  const done = ["plain", "sticker", "code"];
  assert.equal(pure.packButton(asView(done, "https://x/p.jpg"), "https://x/p.jpg").ready, true);
  assert.equal(rules.packReadyProblem(steps, done, "https://x/p.jpg", "https://x/c.jpg"), null, "ready on the phone = ready on the server");
  assert.match(rules.packReadyProblem(steps, done, "https://x/p.jpg", null), /open box/, "the contents photo is needed too");
  assert.deepEqual(pure.toggleStep(["plain"], "code"), ["plain", "code"]);
  assert.deepEqual(pure.toggleStep(["plain", "code"], "plain"), ["code"]);
  assert.deepEqual(pure.toggleStep(["plain"], "photo"), ["plain"], "the photo is never a ticked step");
  assert.equal(pure.sellerInitials("Ada's Kloset"), "ak.");
});

test("Add to your store: You earn is the web's, and the refusal is the server's listingProblem", () => {
  const terms = checkout.dropshipTerms({
    product: { priceMode: "per_channel", wholesalePrice: 9000, dropshipPrice: 9500, suggestedRetailPrice: 14000, minRetailPrice: 12000, stockQuantity: 86, sizeBand: "small" },
    supplier: { city: "Port Harcourt", level: "trusted", brandingOffer: { stickers: true, stickerFee: 200 } },
    delivery: { rateSource: "own", zoneRates: rules.DEFAULT_ZONE_RATES },
    origin: { state: "Rivers", area: "Port Harcourt" },
    sellerPlace: { state: "Lagos", area: "Yaba" },
  });
  for (const choice of [
    { retailPrice: 14000, payer: "customer", brandingChoice: "blind" },
    { retailPrice: 14000, payer: "customer", brandingChoice: "stickers" },
    { retailPrice: 14000, payer: "seller", brandingChoice: "blind" },
    { retailPrice: 14000, payer: "flat", flatFee: 2000, brandingChoice: "stickers" },
    { retailPrice: 11000, payer: "customer" },
  ]) {
    const view = pure.listingView(terms, choice);
    // The server's margin (no card fee) less the card payment fee on the sale is what the web shows.
    assert.equal(view.earn, checkout.listingEarn(terms, choice) - webFind.paymentFee(choice.retailPrice));
    assert.equal(view.problem, checkout.listingProblem(terms, choice));
  }
  assert.equal(pure.listingView(terms, { retailPrice: 14000, payer: "customer", brandingChoice: "stickers" }).earn, 3990);
  assert.match(pure.listingView(terms, { retailPrice: 11000, payer: "customer" }).problem, /lowest price for this is ₦12,000/);
  assert.equal(pure.listingView(terms, { retailPrice: 14000 }).floorLine, "Lowest price allowed: ₦12,000.");
  assert.equal(pure.deliveryLine(terms, "Lagos"), "Lagos: ₦4,500 · 3–7 days", "3–6 days on the road plus a day to pack");
  assert.equal(pure.payerLabel("flat", 2000), "Flat ₦2,000");
  assert.equal(pure.payerLabel("seller", null), "I pay (free delivery)");
  assert.equal(pure.brandingLabel({ label: "My stickers or bags", fee: 200 }), "My stickers or bags +₦200");
  assert.equal(pure.supplierBadgeLine({ level: "trusted", rating: 4.7, ratingCount: 18 }), "Trusted supplier · ★ 4.7 from 18 shops");
  assert.equal(pure.supplierBadgeLine({ level: "new", rating: null, ratingCount: 0 }), null);
});

// The web's "On each order" (src/app/marketplace/_components/DropshipTermsPanel.tsx), line for line: ProductDetail
// passes paymentFee={saleBreakdown(price, cost).fee} (src/lib/marketplace/find.ts).
function webOnEachOrder(terms, choice) {
  const clean = checkout.cleanListingChoice(terms, { retailPrice: choice.retailPrice, payer: choice.payer, flatFee: choice.flatFee ?? null, brandingChoice: choice.brandingChoice });
  const deliveryShare = clean.payer === "seller" ? terms.dearestDelivery : clean.payer === "flat" ? Math.max(0, terms.dearestDelivery - (clean.flatFee ?? 0)) : 0;
  const paymentFee = webFind.saleBreakdown(choice.retailPrice, terms.cost).fee;
  return { deliveryShare, brandingFee: clean.brandingFee, paymentFee, earn: choice.retailPrice - terms.cost - deliveryShare - clean.brandingFee - paymentFee };
}

test("You earn on the phone is exactly the web's: card payment fee and branding fee taken off", () => {
  const panel = read("src/app/marketplace/_components/DropshipTermsPanel.tsx");
  assert.match(panel, /const deliveryShare = clean\.payer === "seller" \? terms\.dearestDelivery : clean\.payer === "flat" \? Math\.max\(0, terms\.dearestDelivery - \(clean\.flatFee \?\? 0\)\) : 0;/, "the web's formula is the one mirrored here");
  assert.match(panel, /const earn = price - terms\.cost - deliveryShare - clean\.brandingFee - paymentFee;/);
  assert.match(read("src/app/marketplace/_components/ProductDetail.tsx"), /paymentFee=\{sale\.fee\}/);
  for (const amount of [0, 900, 2499, 2500, 14000, 13000, 120000, 500000]) assert.equal(findPure.paymentFee(amount), webFind.paymentFee(amount), `card fee on ${amount}`);

  const terms = checkout.dropshipTerms({
    product: { priceMode: "per_channel", wholesalePrice: 9000, dropshipPrice: 9500, suggestedRetailPrice: 14000, stockQuantity: 86, sizeBand: "small" },
    supplier: { city: "Port Harcourt", level: "trusted", brandingOffer: { stickers: true, stickerFee: 200, packingSlip: true, packingSlipFee: 150 } },
    delivery: { rateSource: "own", zoneRates: rules.DEFAULT_ZONE_RATES },
    origin: { state: "Rivers", area: "Port Harcourt" },
    sellerPlace: { state: "Lagos", area: "Yaba" },
  });
  assert.equal(terms.dearestDelivery, 4500);
  const cases = [
    [{ retailPrice: 14000, payer: "customer", brandingChoice: "blind" }, 4190],
    [{ retailPrice: 14000, payer: "customer", brandingChoice: "stickers" }, 3990],
    [{ retailPrice: 14000, payer: "seller", brandingChoice: "blind" }, -310],
    [{ retailPrice: 18000, payer: "seller", brandingChoice: "stickers" }, 18000 - 9500 - 4500 - 200 - 370],
    [{ retailPrice: 14000, payer: "flat", flatFee: 2000, brandingChoice: "packing_slip" }, 14000 - 9500 - 2500 - 150 - 310],
    [{ retailPrice: 2000, payer: "customer", brandingChoice: "blind" }, 2000 - 9500 - 30],
  ];
  for (const [choice, earn] of cases) {
    const web = webOnEachOrder(terms, choice);
    const phone = pure.listingView(terms, choice);
    assert.equal(phone.earn, web.earn, JSON.stringify(choice));
    assert.equal(phone.earn, earn, JSON.stringify(choice));
    assert.deepEqual([phone.money.deliveryShare, phone.money.brandingFee, phone.money.cardFee], [web.deliveryShare, web.brandingFee, web.paymentFee]);
  }
  const blind = pure.listingView(terms, { retailPrice: 14000, payer: "customer", brandingChoice: "blind" }).money;
  assert.deepEqual(blind, { price: 14000, cost: 9500, customerPays: true, deliveryShare: 0, brandingFee: 0, cardFee: 310, earn: 4190 });

  // The phone shows the web's lines under the three tiles.
  const add = app("components/seller/AddFromSupplier.tsx");
  for (const words of ['"Your price"', '"You pay {name}"', '"Delivery"', '"Delivery you cover (up to)"', '"Branding per parcel"', '"Card payment fee"', '"You earn"']) assert.ok(add.includes(words), words);
});

test("pay on delivery: locked below Cash trusted, never locked off for a partner already offering it", () => {
  assert.deepEqual(pure.podSwitch({ level: "trusted", podOpen: false }, false), { locked: true });
  assert.deepEqual(pure.podSwitch({ level: "trusted", podOpen: false }, true), { locked: false }, "they can still switch it off");
  assert.deepEqual(pure.podSwitch({ level: "cash_trusted", podOpen: true }, false), { locked: false });
  assert.deepEqual(pure.podSwitch({}, false), { locked: false }, "older servers: as before");
  assert.equal(pure.POD_LOCKED_CODE, "pod_locked");
  assert.equal(pure.wordsOf({ dynamic: (key, fallback) => `${key}|${fallback}` })("pack.ready", "Ready for pickup"), "dropship.pack.ready|Ready for pickup");
});

test("the mobile quick edit is gated like the portal: prices checked together, pre-orders at Established", () => {
  const route = read("src/app/api/mobile/supplier/products/[id]/route.ts");
  assert.match(route, /import \{ channelPriceProblem \} from "@shared\/dropship-rules"/);
  assert.match(route, /import \{ preorderLevelProblem \} from "@\/lib\/supplier-levels\.server"/);
  assert.match(route, /preorderParsed\.value\.preorderEnabled && !product\.preorderEnabled\) \{\s*const locked = await preorderLevelProblem\(product\.supplierId\);\s*if \(locked\) return apiError\("preorder_locked", locked, 403\);/);
  assert.match(route, /if \(priceProblem\) return apiError\("invalid_prices", priceProblem, 400\);/);
  assert.ok(route.indexOf("invalid_prices") < route.indexOf("db.supplierProduct.update"), "checked before saving");
  assert.match(read("src/app/api/mobile/marketplace/products/_shared.ts"), /returnPolicy: true, level: true \}/, "Find rows carry the supplier's level");
});

test("supplier screens: Prices, Dropship settings, Delivery prices, Branding, Your level and Pack it", () => {
  for (const screen of ["app/supplier/level.tsx", "app/supplier/delivery-prices.tsx", "app/supplier/branding.tsx", "app/supplier/order/pack.tsx", "app/logistics/pay-on-delivery.tsx", "components/supplier/DropshipKit.tsx", "components/seller/AddFromSupplier.tsx"]) {
    assert.ok(existsSync(join(root, "apps/mobile/src", screen)), screen);
  }
  const client = app("lib/supplier.ts");
  for (const path of ['"/api/supplier/level"', '"/api/supplier/delivery-rates"', '"/api/supplier/branding"', '"/api/app/media"', "/pack${"]) assert.ok(client.includes(path), path);

  const kit = app("components/supplier/DropshipKit.tsx");
  assert.match(kit, /"Same price for all"/);
  assert.match(kit, /"Different per channel"/);
  assert.match(kit, /"\+ Add quantity break"/);
  assert.match(kit, /preorderOpen \? \([\s\S]*?\) : \(\s*<LockedPreorderCard level=\{level\} \/>/);
  assert.match(kit, /preorderMeter\(level\?\.goals \?\? \[\], words\)/);
  assert.match(kit, /"Do you ship single pieces\?"/);
  assert.match(kit, /HANDLING_DAYS\.map/);
  assert.match(kit, /"Sellers can order 1 sample"/);

  const create = app("app/supplier/product/new.tsx");
  assert.match(create, /<ChannelPrices value=\{prices\} onChange=\{setPrices\} level=\{level\.data \?\? null\} \/>/);
  assert.match(create, /<DropshipSettings value=\{shipping\} onChange=\{setShipping\} \/>/);
  assert.match(create, /\.\.\.priced\.body,/);
  assert.match(create, /preorderOpen \? <PreorderEditor/, "pre-orders only at Established");
  const edit = app("app/supplier/product/edit.tsx");
  assert.match(edit, /focus === "tiers" \|\| focus === "prices" \? "prices" : focus === "dropship" \? "dropship"/);
  assert.match(edit, /words\("prices\.save", "Save prices"\)/);
  assert.match(edit, /readPricesForm\(prices, preorderOpen, words\)/);
  assert.match(edit, /<LockedPreorderCard level=\{level\.data\} \/>/);
  assert.match(app("app/supplier/product/[id].tsx"), /focus: "dropship"/);
  assert.match(app("app/supplier/tiers.tsx"), /priceSummary\(product, words\)/);

  const rates = app("app/supplier/delivery-prices.tsx");
  assert.match(rates, /"You never pay for delivery\."/);
  assert.match(rates, /"Use Shopinbos partner rates"/);
  assert.match(rates, /"Set my own rates"/);
  assert.match(rates, /readRateDraft\(draft\)/);
  assert.match(rates, /saveDeliveryRates\(body\)/);
  const brand = app("app/supplier/branding.tsx");
  assert.match(brand, /"ALWAYS ON"/);
  assert.match(brand, /const locked = !view\.allowed;/);
  assert.match(brand, /router\.push\("\/supplier\/level"\)/);
  const level = app("app/supplier/level.tsx");
  assert.match(level, /fetchSupplierLevel/);
  assert.match(level, /<GoalList/);
  assert.match(level, /"Keep delivering well to reach Established and unlock pre-orders\."/);

  const pack = app("app/supplier/order/pack.tsx");
  assert.match(pack, /ImagePicker\.launchCameraAsync/);
  assert.match(pack, /uploadMediaPhoto\(/);
  assert.match(pack, /savePack\(view\.orderId, which === "contents" \? \{ contentsPhotoUrl: url \} : \{ photoUrl: url \}, kind\)/);
  assert.match(pack, /savePack\(view\.orderId, \{ packed: true \}, kind\)/);
  assert.match(pack, /disabled=\{!button\.ready \|\| Boolean\(busy\)\}/);
  assert.match(pack, /"Pack it \{seller\}'s way"/);
  assert.match(pack, /"Snap"/);
  const order = app("app/supplier/order/[id].tsx");
  assert.match(order, /dropship && stage === "label"/);
  assert.match(order, /pathname: "\/supplier\/order\/pack", params: \{ id: data\.id \}/);

  const account = app("app/supplier/account.tsx");
  for (const path of ["/supplier/delivery-prices", "/supplier/branding", "/supplier/level"]) assert.ok(account.includes(`router.push("${path}")`), path);
  assert.match(app("app/supplier/(tabs)/home.tsx"), /router\.push\("\/supplier\/level"\)/);
});

test("sign-up shows Pre-order locked; sellers add with the new choices; partners see pay on delivery locked", () => {
  const join = app("components/supplier/SupplierJoinFlow.tsx");
  assert.match(join, /mode === "preorder" && preorderIsLocked\) return <LockedChoice key=\{mode\} title=\{t\("buy\.preorder"\)\} sub=\{t\("buy\.preorderLocked"\)\} badge=\{t\("buy\.locked"\)\} \/>/);
  assert.match(join, /const preorderIsLocked = current\.preorderLocked !== false;/);
  assert.match(join, /!\(mode === "preorder" && data\.preorderLocked !== false\)/, "a saved Pre-order isn't kept selected");

  const market = app("lib/marketplace.ts");
  assert.match(market, /`\/api\/mobile\/marketplace\?productId=\$\{encodeURIComponent\(productId\)\}`/);
  assert.match(market, /deliveryPayer\?: "customer" \| "seller" \| "flat";/);
  const find = app("app/find/[slug].tsx");
  assert.match(find, /fetchDropshipTerms\(found\.product\.id\)/);
  assert.match(find, /<AddFromSupplier product=\{product\} terms=\{terms\} draft=\{draft\} onChange=\{setDraft\}/);
  assert.match(find, /deliveryPayer: draft\.payer/);
  assert.match(find, /brandingChoice: draft\.branding/);
  assert.match(find, /sku: draft\.sku\.trim\(\)/);
  assert.match(find, /disabled=\{Boolean\(priceProblem\)\}/);
  const add = app("components/seller/AddFromSupplier.tsx");
  for (const words of ['"YOU PAY"', '"YOUR PRICE"', '"YOU EARN"', '"Delivery to your customers"', '"Your branding"', '"Your SKU or barcode"']) assert.ok(add.includes(words), words);
  assert.match(add, /listingView\(terms, choice, words\)/);
  assert.match(add, /supplierBadgeLine\(product\.supplier, words\)/);

  const services = app("app/logistics/services.tsx");
  assert.match(services, /podSwitch\(partner, partner\.offersPayOnDelivery\)/);
  assert.match(services, /saveError\.code === POD_LOCKED_CODE/);
  assert.match(services, /router\.push\("\/logistics\/pay-on-delivery"\)/);
  assert.match(app("app/logistics/connections.tsx"), /podError\.code === POD_LOCKED_CODE\) router\.push\("\/logistics\/pay-on-delivery"\)/);
  const pod = app("app/logistics/pay-on-delivery.tsx");
  assert.match(pod, /fetchPartnerLevel/);
  assert.match(pod, /"Opens once you're verified"/);
  assert.match(pod, /"Keep taking prepaid jobs"/);
  // No cash rules any more: how paying at the door works (shared/dropship-rules.ts PAY_AT_DOOR_STEPS).
  assert.match(pod, /PAY_AT_DOOR_STEPS\.map/);
  assert.match(app("lib/logistics.ts"), /"\/api\/mobile\/logistics\/level"/);
});
