// Dropshipper friction (the owner's table, "Other dropshipper friction, and the fix"): the gaps closed after the
// audit. Supplier items are paid only in the app, a dropship price can't be edited below the supplier's floor or to a
// loss, a supplier without a wallet can't be dropshipped (the seller would pay them), late parcels count against the
// supplier's level, and each party sees its one number (seller: earned per order, supplier: next payout day).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pay = await import("../shared/checkout-payments.ts");
const rules = await import("../shared/dropship-rules.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const manualOnly = { methods: { transfer: true }, paystackReady: false, transferReady: true, codLimit: null, zones: [] };

test("fake transfer alerts: supplier items are paid only in the app, never a transfer marked paid by hand", () => {
  assert.deepEqual(pay.checkoutPaymentOptions(manualOnly, {}).map((o) => o.key), ["transfer"], "own stock: the store's own account is fine");
  assert.deepEqual(pay.checkoutPaymentOptions(manualOnly, { fromSuppliers: true }), []);
  assert.match(pay.noWayToPayText(manualOnly, { fromSuppliers: true }), /ship from a supplier and can only be paid online/);
  const online = { ...manualOnly, methods: { transfer: true, card: true }, paystackReady: true };
  assert.deepEqual(pay.checkoutPaymentOptions(online, { fromSuppliers: true }).map((o) => o.key), ["paystack"], "Paystack's bank transfer still works");

  const route = read("src/app/api/public/store/[slug]/checkout/route.ts");
  assert.match(route, /fromSuppliers: priced\.stockHolds\.some\(\(hold\) => hold\.source === "supplier"\)/, "the API decides from the stock it takes");
  assert.match(read("src/app/api/public/store/[slug]/checkout/quote/route.ts"), /fromSuppliers: priced\.stockHolds\.some/);
  assert.match(read("src/app/s/[slug]/checkout/CheckoutClient.tsx"), /fromSuppliers = liveQuote\?\.fromSuppliers === true/);
  assert.match(read("src/app/s/[slug]/pay/[code]/PayLinkClient.tsx"), /fromSuppliers: json\.data\.fromSuppliers === true/);
});

test("a dropship price edited later still respects the supplier's floor and never sells at a loss", () => {
  assert.match(read("src/app/api/store/products/[id]/route.ts"), /product\.supplierProductId && dropship\)[\s\S]{0,200}dropshipPriceProblem\(user\.id, product\.id, retailPrice\)/);
  assert.match(read("src/lib/ai/peggy/tools.ts"), /dropshipPriceProblem\(ctx\.userId, product\.id, input\.price\)/, "Peggy too");
  assert.match(read("src/lib/marketplace/dropship.server.ts"), /export async function dropshipPriceProblem[\s\S]{0,1200}listingProblem\(terms,/);
});

test("₦0 capital: a supplier who can't be paid from the split can't be dropshipped, and is asked to set up their wallet", () => {
  const gate = read("src/lib/marketplace/agreements.server.ts");
  assert.match(gate, /db\.wallet\.findFirst\(\{ where: \{ userId: supplier\.userId, status: "active", subaccountStatus: "active" \}/);
  assert.match(gate, /code: "NOT_PAYABLE"/);
  assert.match(gate, /link: "\/supplier\/wallet"/);
  assert.match(read("src/lib/marketplace/quick-add-core.ts"), /\| "NOT_PAYABLE"/);
  assert.match(read("apps/mobile/src/lib/quick-add.ts"), /\| "NOT_PAYABLE"/);
});

test("late parcels count against the supplier's level", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const established = { verified: true, delivered: 120, reviews: 30, rating: 4.8, disputes: 1, addressVerified: true, createdAt: "2026-07-01T00:00:00Z", now };
  assert.equal(rules.supplierLevel(established), "established");
  assert.equal(rules.supplierLevel({ ...established, lateStrikes: 2 }), "established");
  assert.equal(rules.supplierLevel({ ...established, lateStrikes: 3 }), "trusted", "3 late parcels in 90 days keep them off Established");
  const trusted = { verified: true, delivered: 30, reviews: 2, rating: 4.5, disputes: 0, addressVerified: true, createdAt: "2026-10-01T00:00:00Z", now };
  assert.equal(rules.supplierLevel(trusted), "trusted");
  assert.equal(rules.supplierLevel({ ...trusted, lateStrikes: 3 }), "new", "late parcels are problems: too many and they drop a level");
  const goals = rules.supplierLevelGoals({ ...established, lateStrikes: 3 }).goals;
  assert.equal(goals.find((goal) => goal.key === "late")?.done, false);
  assert.match(read("src/lib/supplier-levels.server.ts"), /supplierStrike\.count\(\{ where: \{ supplierId, kind: "late", expiresAt: \{ gt: now \} \} \}\)/);
  assert.match(read("src/lib/faults/strikes.server.ts"), /input\.kind === "late"\) await import\("@\/lib\/supplier-levels\.server"\)/);
});

test("one simple number: the seller's earnings per order in the list, the supplier's next payout day", () => {
  const orders = read("src/app/home/orders/page.tsx");
  assert.match(orders, /orderEarnings\(\{/);
  assert.match(orders, /t\("list\.youEarn"/);
  assert.match(read("src/app/supplier/payouts/page.tsx"), /nextPayout\(user\.id\)/);
  assert.match(read("src/lib/wallet/settlements.server.ts"), /export async function nextPayout/);
});

test("pay on delivery wording says no cash, even while it's switched off", () => {
  assert.doesNotMatch(pay.buyerPaymentText("pay_on_delivery"), /cash or by transfer/);
  assert.doesNotMatch(pay.paymentChoiceText("pay_on_delivery"), /cash or by transfer/);
});

test("own stock gets an arrival date: the store's handling time plus the zone's days", async () => {
  const cart = await import("../shared/cart-checkout.ts");
  assert.deepEqual(cart.estimatedDayRange("2-3 days"), { min: 2, max: 3 });
  assert.deepEqual(cart.estimatedDayRange("2 – 4 working days"), { min: 2, max: 4 });
  assert.deepEqual(cart.estimatedDayRange("next day"), { min: 1, max: 1 });
  assert.deepEqual(cart.estimatedDayRange("same day"), { min: 0, max: 0 });
  assert.deepEqual(cart.estimatedDayRange("1 week"), { min: 7, max: 7 });
  assert.equal(cart.estimatedDayRange("Within Lagos"), null, "free text stays as the seller wrote it");
  const now = new Date("2026-10-29T09:00:00Z"); // Thursday
  assert.equal(cart.ownArrival("2-3 days", 1, now), "Arrives Sun 1 – Mon 2 Nov");
  assert.equal(cart.ownArrival("same day", 0, now), "Arrives today");
  assert.equal(cart.ownArrival("Within Lagos", 1, now), null);
  assert.equal(cart.cleanHandlingDays(9), 5);
  const zones = [{ name: "Lagos", regions: ["Lagos"], rates: [{ id: "r1", name: "Standard", price: 1500, estimatedDays: "2-3 days" }, { id: "r2", name: "Pickup at our shop", price: 0, estimatedDays: "same day" }] }];
  const choice = cart.deliveryOptionsFor(zones, 0, { state: "Lagos" }, 10000, 1, now);
  assert.equal(choice.options[0].arrival, "Arrives Sun 1 – Mon 2 Nov");
  assert.equal(choice.options[1].arrival, null, "pickup isn't an arrival");
  assert.equal(cart.deliveryOptionsFor(zones, 0, { state: "Lagos" }, 10000).options[0].arrival, null, "older callers: as before");

  assert.match(read("src/components/storefront/checkout/CheckoutParts.tsx"), /option\.arrival \?\? option\.estimatedDays/);
  assert.match(read("src/lib/commerce/storefront.server.ts"), /handlingDays: store\?\.handlingDays \?\? 1/);
  assert.match(read("src/app/api/app/handling-days/route.ts"), /HANDLING_DAY_CHOICES/);
  assert.match(read("src/app/home/shipping/page.tsx"), /<HandlingDaysCard initial=/);
});

test("wallet-less suppliers: a warning period, then the block", () => {
  const gate = read("src/lib/marketplace/agreements.server.ts");
  assert.match(gate, /export const WALLET_GRACE_DAYS = 14/);
  assert.match(gate, /where: \{ id: supplierId, walletAskedAt: null \}, data: \{ walletAskedAt: now \}/, "the clock starts once, at the first shop");
  assert.match(gate, /if \(blocked\) return \{ ok: false, code: "NOT_PAYABLE"/);
  assert.match(gate, /dedupeKey: `seller\.supplier-wallet:\$\{sellerId\}:\$\{supplierId\}`/, "the shop is warned while it can still list");
  assert.match(read("docs/migrations/2026-12-09-wallet-grace-handling-days.sql"), /"walletAskedAt"[\s\S]*"handlingDays"/);
});

test("the pay-on-delivery terms are published: the seller's arrangement with their customer and delivery partner", async () => {
  const market = await import("../shared/delivery-market.ts");
  assert.match(market.POD_DISCLAIMER, /with the link we send to their phone and email, or the rider's QR code/);
  assert.match(market.POD_DISCLAIMER, /never collect your money/);
  assert.doesNotMatch(read("shared/i18n/messages/delivery/en.ts"), /LEGAL REVIEW|needs legal review/);
  for (const loc of ["pcm", "yo", "ha", "ig"]) assert.doesNotMatch(read(`shared/i18n/messages/delivery/${loc}.ts`), /legal review/, loc);
});

test("riders see cash held against their limit", () => {
  assert.match(read("src/app/logistics/cash/page.tsx"), /t\("cash\.holdingTitle"\)[\s\S]{0,200}partner\.codCashCap/);
});
