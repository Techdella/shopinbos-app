// Dropship at checkout (shared/dropship-checkout.ts, shared/delivery-market.ts selfDeliveryPart): a supplier's own
// zone rates price its parcel, who pays each parcel's delivery (the carrier is always paid in full, the seller covers
// the rest), the parcels the customer sees, the seller's add check (lowest price allowed, no loss-making price), and
// the pay-on-delivery gate for delivery partners below Cash trusted.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dm = await import("../shared/delivery-market.ts");
const dc = await import("../shared/dropship-checkout.ts");
const rules = await import("../shared/dropship-rules.ts");
const split = await import("../src/lib/wallet/rules.ts");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const PH = { state: "Rivers", area: "Port Harcourt" };
const LAGOS = { state: "Lagos", area: "Yaba" };
const card = { same_city: { small: 1500 }, same_state: { small: 2500, medium: 3500 }, nearby: { small: 3500 }, rest: { small: 4500, medium: 6500 } };
const supplierShipment = (selfDelivery, sizeBand = "small") => ({ key: "supplier:s1", origin: PH, sizeBand, connections: [], selfDelivery });

test("a supplier's own zone rates price its parcel, with its packing days in the arrival window", () => {
  const part = dm.selfDeliveryPart(supplierShipment({ fee: 0, states: [], zoneRates: card, handlingDays: 2 }), LAGOS);
  assert.equal(part.service, "supplier_self");
  assert.equal(part.price, 4500, "Rivers → Lagos is rest of Nigeria");
  assert.deepEqual([part.minDays, part.maxDays], [4, 8], "rest is 3–6 days, plus 2 days to pack");
  assert.equal(dm.selfDeliveryPart(supplierShipment({ fee: 0, states: [], zoneRates: card }), { state: "Rivers", area: "Obio-Akpor" }).price, 2500, "same state");
  assert.equal(dm.selfDeliveryPart(supplierShipment({ fee: 0, states: [], zoneRates: card }, "medium"), PH), null, "same city has no medium (or bigger) price");
});

test("an empty cell means the supplier doesn't deliver that size there; no card keeps the old flat fee", () => {
  assert.equal(dm.selfDeliveryPart(supplierShipment({ fee: 0, states: [], zoneRates: card }, "bulky"), LAGOS), null);
  assert.equal(dm.selfDeliveryPart(supplierShipment({ fee: 0, states: [], zoneRates: {} }), LAGOS), null, "no card and no flat fee");
  const flat = dm.selfDeliveryPart(supplierShipment({ fee: 2000, states: ["Lagos"] }), LAGOS);
  assert.equal(flat.price, 2000);
  assert.deepEqual([flat.minDays, flat.maxDays], [2, 5]);
  assert.equal(dm.selfDeliveryPart(supplierShipment({ fee: 2000, states: [] }), LAGOS), null, "flat fee only to its own state");
});

test("own zone rates at checkout with delivery partners: the supplier's parcel is the supplier's own delivery", () => {
  const settings = { sellArea: "nationwide", sellStates: [], selfPickup: false, pickupAddress: null, pickupHours: null, pickupInstructions: null, fallback: "pickup_only", fallbackFee: 0 };
  const choice = dm.buildMarketChoice({ settings, shipments: [supplierShipment({ fee: 0, states: [], zoneRates: card, handlingDays: 1 })], destination: LAGOS });
  assert.equal(choice.options.length, 1);
  assert.equal(choice.options[0].parts[0].service, "supplier_self");
  assert.equal(choice.options[0].price, 4500);
  assert.deepEqual(dm.supplierSelfShipments(dm.planFromOption(choice.options[0])).map((part) => part.price), [4500]);
});

test("who pays: free delivery and a flat fee lower what the customer pays, never what the carrier gets", () => {
  const part = { shipmentKey: "supplier:s1", connectionId: null, partnerId: null, service: "supplier_self", price: 4500, rateCardId: null, pointId: null, sizeBand: "small", minDays: 3, maxDays: 6 };
  const own = { ...part, shipmentKey: "own", service: "doorstep", price: 1500, connectionId: "c1", partnerId: "p1" };
  const choice = { covered: true, reason: null, shipmentCount: 2, options: [{ id: "multi:doorstep", name: "Doorstep delivery (2 parcels)", price: 6000, estimatedDays: null, pickup: false, kind: "multi", detail: null, pod: false, parts: [own, part] }] };
  const free = dc.applyDeliveryPayers(choice, { "supplier:s1": { payer: "seller" } });
  assert.equal(free.options[0].price, 1500, "only the shop's own parcel is charged");
  assert.equal(free.options[0].parts[1].charge, 0);
  assert.equal(free.options[0].parts[1].price, 4500, "the supplier still gets its full fee");
  assert.equal(dc.sellerDeliveryCost(free.options[0].parts), 4500);
  const flat = dc.applyDeliveryPayers(choice, { "supplier:s1": { payer: "flat", flatFee: 2000 } });
  assert.equal(flat.options[0].price, 3500);
  assert.equal(dc.sellerDeliveryCost(flat.options[0].parts), 2500);
  const cheap = dc.applyDeliveryPayers(choice, { "supplier:s1": { payer: "flat", flatFee: 9000 } });
  assert.equal(cheap.options[0].price, 6000, "a flat fee never charges more than the delivery costs");
  assert.equal(dc.applyDeliveryPayers(choice, { "supplier:s1": { payer: "customer" } }).options[0].price, 6000);
  assert.equal(dc.applyDeliveryPayers(choice, {}), choice);
});

test("several products in one supplier parcel: the kindest rule to the customer wins", () => {
  assert.equal(dc.parcelPayer([{ payer: "customer" }, { payer: "seller" }]).payer, "seller");
  assert.equal(dc.parcelPayer([{ payer: "customer" }, { payer: "flat", flatFee: 1000 }]).payer, "flat");
  assert.equal(dc.parcelPayer([]).payer, "customer");
});

test("the split pays the carrier and supplier in full and takes the seller's part of delivery from the seller", () => {
  // ₦14,000 dropship item, supplier delivers for ₦4,500 at its own rates, the seller offers free delivery: the
  // customer pays ₦14,000; the supplier gets ₦9,500 + ₦4,500; the seller keeps ₦0 of delivery and ₦4,500 − ₦4,500.
  const plan = split.buildSplitPlan({ totalKobo: 14_000_00, sellerSubaccount: "SELLER", suppliers: [{ supplierId: "s1", subaccount: "SUP", costKobo: (9500 + 4500) * 100 }] });
  assert.equal(plan.suppliers[0].kobo, 14_000_00);
  assert.equal(plan.sellerKobo, 0);
  const paid = split.buildSplitPlan({ totalKobo: 18_500_00, sellerSubaccount: "SELLER", suppliers: [{ supplierId: "s1", subaccount: "SUP", costKobo: (9500 + 4500) * 100 }] });
  assert.equal(paid.sellerKobo, 4500_00, "customer pays delivery: the seller keeps the ₦4,500 margin");
});

test("parcels as the customer sees them, and the zones plan saved on the order", () => {
  const part = { shipmentKey: "supplier:s1", connectionId: null, partnerId: null, service: "supplier_self", price: 4500, charge: 0, rateCardId: null, pointId: null, sizeBand: "small", minDays: 3, maxDays: 6 };
  const [line] = dc.parcelLines([part], { "supplier:s1": "Port Harcourt" }, new Date("2026-10-28T09:00:00Z"));
  assert.equal(line.from, "Port Harcourt");
  assert.equal(line.fee, 0);
  assert.equal(line.carrierFee, 4500);
  assert.ok(line.bySupplier);
  assert.match(line.arrival, /^Arrives /);
  assert.match(dc.parcelWords(line), /^Ships from Port Harcourt · Free delivery · Arrives /);
  const plan = dc.zoneParcelsPlan("r0", [part], true);
  assert.equal(plan.kind, "multi");
  assert.equal(dm.readDeliveryPlan({ delivery: plan }).shipments[0].bookingId, null);
  assert.deepEqual(dm.supplierSelfShipments(plan).map((entry) => entry.price), [4500], "the supplier order gets the full fee");
  assert.equal(dm.partnerShipments(plan).length, 0, "no partner job is booked for it");
});

test("the dearest delivery a seller could cover: the size's price in the farthest zone", () => {
  assert.equal(dc.dearestZoneFee(card, "small"), 4500);
  assert.equal(dc.dearestZoneFee(card, "medium"), 6500);
  assert.equal(dc.dearestZoneFee(card, "bulky"), 0, "never delivered that size");
  assert.equal(dc.dearestZoneFee(rules.DEFAULT_ZONE_RATES, "small"), 4500);
});

test("adding a supplier's product: lowest price allowed, and no price that loses money", () => {
  const terms = dc.dropshipTerms({
    product: { priceMode: "per_channel", wholesalePrice: 8200, dropshipPrice: 9500, suggestedRetailPrice: 14000, minRetailPrice: 12000, dropshipMinQty: 1, handlingDays: 2, sizeBand: "small", stockQuantity: 40 },
    supplier: { city: "Port Harcourt", level: "trusted", brandingOffer: { packingSlip: true, stickers: true, stickerFee: 200 } },
    delivery: { rateSource: "own", zoneRates: card },
    origin: PH,
    sellerPlace: LAGOS,
  });
  assert.equal(terms.cost, 9500);
  assert.equal(terms.floor, 12000);
  assert.equal(terms.deliveryToYou.price, 4500);
  assert.equal(terms.dearestDelivery, 4500);
  assert.deepEqual(terms.branding.map((entry) => entry.choice), ["blind", "packing_slip", "stickers"]);
  assert.match(dc.listingProblem(terms, { retailPrice: 11000 }), /lowest price for this is ₦12,000/);
  assert.equal(dc.listingProblem(terms, { retailPrice: 14000 }), null, "customer pays delivery");
  assert.match(dc.listingProblem(terms, { retailPrice: 13000, payer: "seller" }), /lose ₦1,000/);
  assert.equal(dc.listingProblem(terms, { retailPrice: 14000, payer: "seller" }), null, "₦14,000 − ₦9,500 − ₦4,500 = 0");
  assert.match(dc.listingProblem(terms, { retailPrice: 14000, payer: "seller", brandingChoice: "stickers" }), /lose ₦200/);
  assert.match(dc.listingProblem(terms, { retailPrice: 14000, payer: "flat" }), /flat delivery fee/);
  assert.equal(dc.listingEarn(terms, { retailPrice: 15000, payer: "flat", flatFee: 2000 }), 15000 - 9500 - 2500);
  // A New supplier offers blind packing only; partner rates use Shopinbos's starting card for the margin check.
  const fresh = dc.dropshipTerms({ product: { wholesalePrice: 5000, suggestedRetailPrice: 9000 }, supplier: { level: "new", brandingOffer: { stickers: true, stickerFee: 200 } }, delivery: { rateSource: "partners" } });
  assert.deepEqual(fresh.branding.map((entry) => entry.choice), ["blind"]);
  assert.ok(fresh.dearestIsEstimate);
  assert.equal(dc.cleanListingChoice(fresh, { retailPrice: 9000, brandingChoice: "stickers" }).brandingChoice, "blind");
});

test("checkout enforces the supplier's dropship minimum and adds supplier parcels on a store's own zones", () => {
  const pricing = read("src/lib/commerce/pricing.server.ts");
  assert.match(pricing, /dropshipQuantityProblem\(product\.supplierProduct\?\.dropshipMinQty/);
  assert.match(pricing, /supplierParcelsForZones\(/);
  const route = read("src/app/api/public/store/[slug]/checkout/route.ts");
  assert.match(route, /zoneParcelsPlan\(deliveryOption\?\.id, zoneParcels\.parts, zoneParcels\.ownItems\)/);
  const market = read("src/lib/delivery-market/market.server.ts");
  assert.match(market, /applyDeliveryPayers\(built, payerRules\(groups\)\)/);
  assert.match(market, /offersPayOnDelivery: partner\.offersPayOnDelivery && canOfferPayOnDelivery\(partner\)/);
  assert.match(read("src/lib/wallet/wallet.server.ts"), /unitCost: dropshipUnitPrice\(product\.supplierProduct\)/);
});

test("pay on delivery opens only at Cash trusted: the server refuses it, the API says pod_locked", () => {
  const manage = read("src/lib/delivery-market/manage.server.ts");
  assert.equal((manage.match(/await partnerPodProblem\(partnerId\)/g) ?? []).length, 2, "coverage switch and per-shop switch");
  assert.match(manage, /code: POD_LOCKED_CODE/);
  const api = read("src/app/api/mobile/logistics/market/route.ts");
  assert.match(api, /apiError\(POD_LOCKED_CODE, result\.error, 403\)/);
  assert.match(api, /podOpen: canOfferPayOnDelivery\(partner\)/);
  assert.match(read("src/app/api/mobile/logistics/market/connections/[id]/route.ts"), /apiError\(POD_LOCKED_CODE, result\.error, 403\)/);
  assert.match(read("src/app/api/mobile/logistics/level/route.ts"), /partnerLevelView\(partner\.id\)/);
  assert.match(read("src/lib/logistics/jobs.ts"), /input\.to === "delivered"\) void import\("\.\/partner-levels\.server"\)\.then\(\(levels\) => levels\.refreshPartnerLevel\(input\.partnerId\)\)/);
  const coverage = read("src/app/logistics/coverage/page.tsx");
  assert.match(coverage, /level && !level\.podOpen \? \(\s*<PodLocked view=\{level\} \/>/);
  assert.match(read("src/components/logistics/PartnerLevel.tsx"), /Unlocks at Top partner/);
});
