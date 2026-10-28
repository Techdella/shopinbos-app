// Supplier & dropship rules (shared/dropship-rules.ts): prices per channel, dropship options, the supplier's zone rate
// card, who pays delivery, seller branding, supplier levels (pre-orders at Established) and delivery partner levels
// (pay on delivery at Cash trusted).
import test from "node:test";
import assert from "node:assert/strict";

const r = await import("../shared/dropship-rules.ts");

const ankara = { priceMode: "per_channel", wholesalePrice: 8200, dropshipPrice: 9500, preorderPrice: 7000, pricingTiers: [{ minQty: 6, price: 8200 }, { minQty: 24, price: 7500 }], suggestedRetailPrice: 14000, minRetailPrice: 12000 };

test("prices per channel: dropship, wholesale breaks and pre-order; same price for all uses one price", () => {
  assert.equal(r.dropshipUnitPrice(ankara), 9500);
  assert.equal(r.wholesaleUnitPrice(ankara, 6), 8200);
  assert.equal(r.wholesaleUnitPrice(ankara, 30), 7500);
  assert.equal(r.wholesaleUnitPrice(ankara, 2), 8200, "below the first break: the base price");
  assert.equal(r.preorderUnitPrice(ankara), 7000);
  const same = { ...ankara, priceMode: "same", wholesalePrice: 9000 };
  assert.equal(r.dropshipUnitPrice(same), 9000);
  assert.equal(r.wholesaleUnitPrice(same, 30), 9000);
  assert.equal(r.preorderUnitPrice(same), 9000);
  assert.equal(r.retailFloor(ankara), 12000);
  assert.equal(r.retailFloor({ ...ankara, minRetailPrice: null }), 9500, "never below what the seller pays");
});

test("channel prices that make no sense can't be saved", () => {
  assert.equal(r.channelPriceProblem(ankara), null);
  assert.match(r.channelPriceProblem({ ...ankara, minRetailPrice: 9000 }), /lowest allowed price can't be below/);
  assert.match(r.channelPriceProblem({ ...ankara, minRetailPrice: 15000 }), /can't be above the suggested/);
  assert.match(r.channelPriceProblem({ ...ankara, suggestedRetailPrice: 9000 }), /suggested price should be above/);
  assert.match(r.channelPriceProblem({ ...ankara, pricingTiers: [{ minQty: 6, price: 7000 }, { minQty: 24, price: 7500 }] }), /cost the same or less/);
  assert.match(r.channelPriceProblem({ ...ankara, wholesalePrice: 0 }), /price per piece/);
});

test("dropship options: single pieces or a minimum, packing days, stock warnings", () => {
  assert.equal(r.cleanDropshipMinQty("3"), 3);
  assert.equal(r.cleanDropshipMinQty(0), 1);
  assert.equal(r.cleanHandlingDays(5), 1);
  assert.equal(r.dropshipQuantityProblem(1, 1), null);
  assert.match(r.dropshipQuantityProblem(3, 1, "Ankara"), /Ankara ships in 3 pieces or more. Add 2 more/);
  assert.deepEqual(r.dropshipOptionWords({ dropshipMinQty: 1, handlingDays: 2, sampleAvailable: true }), ["Ships 1 piece", "Packs in 2 days", "1 sample at the dropship price"]);
  assert.equal(r.supplierStockState(0), "out");
  assert.equal(r.supplierStockState(4), "low");
  assert.equal(r.supplierStockState(86), "ok");
});

test("zones from the supplier: same city, same state, nearby states (same geopolitical zone), rest of Nigeria", () => {
  const ph = { state: "Rivers", area: "Port Harcourt" };
  assert.equal(r.deliveryZone(ph, { state: "Rivers", area: "port harcourt " }), "same_city");
  assert.equal(r.deliveryZone(ph, { state: "Rivers", area: "Bonny" }), "same_state");
  assert.equal(r.deliveryZone(ph, { state: "Bayelsa", area: null }), "nearby");
  assert.equal(r.deliveryZone(ph, { state: "Lagos", area: "Yaba" }), "rest");
  assert.equal(r.deliveryZone(ph, { state: null, area: "Yaba" }), null);
});

test("a zone quote adds the packing days and falls back to a bigger size's price", () => {
  const rates = r.readZoneRates(r.DEFAULT_ZONE_RATES);
  const q = r.zoneQuote(rates, { state: "Rivers", area: "Port Harcourt" }, { state: "Lagos", area: "Yaba" }, "small", 1);
  assert.deepEqual(q, { zone: "rest", price: 4500, minDays: 3, maxDays: 7 });
  const onlyBulky = r.readZoneRates({ rest: { bulky: 9000 } });
  assert.equal(r.zoneQuote(onlyBulky, { state: "Rivers", area: null }, { state: "Lagos", area: null }, "small").price, 9000);
  assert.equal(r.zoneQuote(onlyBulky, { state: "Rivers", area: null }, { state: "Rivers", area: null }, "small"), null, "not delivered there");
});

test("a rate card must have a price, sane numbers, and farther never cheaper", () => {
  assert.equal(r.cleanZoneRates(r.DEFAULT_ZONE_RATES).ok, true);
  assert.equal(r.cleanZoneRates({}).ok, false);
  assert.match(r.cleanZoneRates({ same_city: { small: -5 } }).message, /enter a price/);
  assert.match(r.cleanZoneRates({ same_city: { small: 3000 }, rest: { small: 2000 } }).message, /Farther should cost/);
});

test("who pays delivery: never the supplier; free and flat fee come out of the seller's margin", () => {
  assert.equal(r.customerDeliveryCharge("customer", 4500), 4500);
  assert.equal(r.customerDeliveryCharge("seller", 4500), 0);
  assert.equal(r.customerDeliveryCharge("flat", 4500, 2000), 2000);
  assert.equal(r.customerDeliveryCharge("flat", 1500, 2000), 1500, "a flat fee never charges more than delivery costs");
  assert.equal(r.sellerDeliveryShare("flat", 4500, 2000), 2500);
  // The doc's example: ₦14,000 retail, ₦9,500 dropship price, customer pays ₦4,500 delivery → ₦4,500 margin.
  assert.equal(r.dropshipMargin({ retailPrice: 14000, unitCost: 9500, payer: "customer", deliveryFee: 4500 }), 4500);
  assert.equal(r.dropshipMargin({ retailPrice: 14000, unitCost: 9500, payer: "seller", deliveryFee: 4500, brandingFee: 200 }), -200);
  assert.match(r.sellerPriceProblem({ retailPrice: 14000, unitCost: 9500, payer: "seller", deliveryFee: 4500, brandingFee: 200, floor: 12000 }), /you'd lose ₦200/);
  assert.match(r.sellerPriceProblem({ retailPrice: 11000, unitCost: 9500, payer: "customer", deliveryFee: 4500, floor: 12000 }), /lowest price for this is ₦12,000/);
  assert.equal(r.sellerPriceProblem({ retailPrice: 14000, unitCost: 9500, payer: "flat", flatFee: 2000, deliveryFee: 4500, floor: 12000 }), null);
});

test("branding: blind always, extras only when offered, and the pack checklist ends with the photo", () => {
  const offer = r.readBrandingOffer({ stickers: true, stickerFee: "200", packingSlip: false, packingSlipFee: 300 });
  assert.deepEqual(offer, { packingSlip: false, packingSlipFee: 0, stickers: true, stickerFee: 200, custom: false });
  assert.deepEqual(r.brandingChoicesFor(offer).map((o) => o.choice), ["blind", "stickers"]);
  assert.deepEqual(r.effectiveBranding("packing_slip", offer), { choice: "blind", fee: 0 }, "not offered: blind");
  assert.deepEqual(r.effectiveBranding("stickers", offer), { choice: "stickers", fee: 200 });
  const steps = r.packChecklist({ sellerName: "Ada's Kloset", choice: "stickers", orderCode: "SB-4821", stickersLeft: 14 });
  assert.deepEqual(steps.map((s) => s.id), ["plain", "sticker", "code", "photo"]);
  assert.match(steps[1].detail, /14 left/);
  assert.match(r.packReadyProblem(steps, ["plain", "sticker", "code"], null), /Snap a photo/);
  assert.match(r.packReadyProblem(steps, ["plain"], "photo.jpg"), /2 steps left/);
  assert.equal(r.packReadyProblem(steps, ["plain", "sticker", "code"], "photo.jpg"), null);
  assert.deepEqual(r.stickersAfterUse(11), { left: 10, low: true });
  assert.deepEqual(r.brandingOfferFor("new", offer).stickers, false, "New suppliers offer blind packing only");
});

const now = new Date("2026-10-28T12:00:00Z");
const supplier = (over = {}) => ({ verified: true, delivered: 62, reviews: 18, rating: 4.7, disputes: 1, addressVerified: true, createdAt: "2026-09-10T00:00:00Z", now, ...over });

test("supplier levels: New, Trusted at 25 delivered, Established at 100 delivered + 30 reviews + 60 days", () => {
  assert.equal(r.supplierLevel(supplier({ verified: false })), "new");
  assert.equal(r.supplierLevel(supplier({ delivered: 24 })), "new");
  assert.equal(r.supplierLevel(supplier()), "trusted");
  assert.equal(r.supplierLevel(supplier({ delivered: 100, reviews: 30, createdAt: "2026-08-01T00:00:00Z" })), "established");
  assert.equal(r.supplierLevel(supplier({ delivered: 100, reviews: 30, createdAt: "2026-08-01T00:00:00Z", missedReadyDates: 2 })), "trusted", "two missed ready dates drop them back");
  assert.equal(r.supplierLevel(supplier({ delivered: 100, reviews: 30, createdAt: "2026-08-01T00:00:00Z", disputes: 5 })), "trusted", "too many problems");
});

test("pre-orders only at Established; the locked card shows progress to it", () => {
  assert.equal(r.canTakePreorders("new"), false);
  assert.equal(r.canTakePreorders("trusted"), false);
  assert.equal(r.canTakePreorders("established"), true);
  const { level, next, goals } = r.supplierLevelGoals(supplier());
  assert.equal(level, "trusted");
  assert.equal(next, "established");
  const delivered = goals.find((g) => g.key === "delivered");
  assert.deepEqual([delivered.have, delivered.need, delivered.done], [62, 100, false]);
  assert.deepEqual(goals.find((g) => g.key === "reviews").have, 18);
  assert.equal(r.supplierPerks("new").openOrderLimit, 20);
  assert.match(r.openOrderProblem("new", 20), /20 open orders/);
  assert.equal(r.openOrderProblem("trusted", 500), null);
});

const partner = (over = {}) => ({ verified: true, delivered: 64, failed: 0, rating: 4.6, baseVerified: true, createdAt: "2026-09-17T00:00:00Z", lateRemittances: 0, cacOrGuarantor: false, now, ...over });

test("partner levels: pay on delivery only at Cash trusted, and paused after late cash", () => {
  assert.equal(r.partnerLevel(partner({ delivered: 10 })), "verified");
  assert.equal(r.partnerLevel(partner()), "trusted");
  const cash = partner({ delivered: 150, createdAt: "2026-08-01T00:00:00Z", cacOrGuarantor: true });
  assert.equal(r.partnerLevel(cash), "cash_trusted");
  assert.equal(r.partnerLevel({ ...cash, lateRemittances: 1 }), "trusted");
  assert.equal(r.canOfferPayOnDelivery({ level: "trusted" }), false);
  assert.equal(r.canOfferPayOnDelivery({ level: "cash_trusted", codPaused: true }), false);
  assert.equal(r.canOfferPayOnDelivery({ level: "cash_trusted", codPaused: false }), true);
  assert.equal(r.podCashCap({ delivered: 150 }), 100000);
  assert.equal(r.podCashCap({ delivered: 260, deposit: 50000 }), 170000);
  assert.equal(r.podJobFits({ cashHeld: 90000, jobCash: 15000, cap: 100000 }), false);
  const goals = r.partnerLevelGoals(partner()).goals;
  assert.deepEqual(goals.find((g) => g.key === "delivered").need, 150);
});
