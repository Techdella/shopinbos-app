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
