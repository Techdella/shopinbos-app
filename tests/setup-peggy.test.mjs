// Peggy's setup help (dashboards, chat and voice) and the prepaid wallet rules.
import test from "node:test";
import assert from "node:assert/strict";

const setup = await import("../src/lib/onboarding/setup-peggy-pure.ts");
const wallet = await import("../src/lib/wallet/balance-rules.ts");

test("setup peggy: a question for every step, greeting them by name", () => {
  for (const id of ["profile", "pickup", "coverage", "rates", "documents", "products", "bank", "verified", "store", "delivery", "live"]) {
    assert.ok(setup.stepQuestion(id, "supplier", "Ada").startsWith("Ada, "), id);
  }
  assert.match(setup.stepQuestion("pickup", "logistics_partner", "there"), /^where are your pickup points\?/);
  assert.match(setup.stepQuestion("nonsense", "seller", "Ada"), /how can I help/);
});

test("setup peggy: only well-formed actions this role may take are kept", () => {
  const raw = [
    { type: "add_pickup_point", name: "Ikeja office", address: "12 Allen Avenue, Ikeja", state: "Lagos", hours: "Mon-Sat 8-6" },
    { type: "add_coverage", areas: ["Lekki", " Ikeja ", "", 5] },
    { type: "set_base_price", naira: "2500" },
    { type: "set_base_price", naira: 5 },
    { type: "save_pickup_address", address: "12 Allen Avenue, Ikeja" },
    { type: "delete_everything" },
    "junk",
  ];
  const partner = setup.cleanActions(raw, "logistics_partner");
  assert.deepEqual(partner.map((a) => a.type), ["add_pickup_point", "add_coverage", "set_base_price"]);
  // Places become coverage tokens through the gazetteer (shared/ng-places.ts).
  assert.deepEqual(partner[1].areas, ["Lagos: Lekki", "Lagos: Ikeja"]);
  assert.equal(partner[2].naira, 2500);
  const supplier = setup.cleanActions(raw, "supplier");
  assert.deepEqual(supplier.map((a) => a.type), ["add_coverage", "save_pickup_address"]);
  // Sellers can have their pickup address and where they sell saved too (on a call), never pickup points or prices.
  assert.deepEqual(setup.cleanActions(raw, "seller").map((a) => a.type), ["add_coverage", "save_pickup_address"]);
  assert.deepEqual(setup.cleanActions([{ type: "save_pickup_address", address: "short" }], "supplier"), []);
  assert.deepEqual(setup.cleanActions("nope", "supplier"), []);
  assert.equal(setup.actionLabel({ type: "set_base_price", naira: 2500 }), "Set your starting price to ₦2,500");
});

test("wallet: amounts are whole naira within the limits", () => {
  const { topUpMin, topUpMax, withdrawMin } = wallet.BALANCE_LIMITS;
  assert.equal(wallet.validAmountNaira(topUpMin, topUpMin, topUpMax), null);
  assert.match(wallet.validAmountNaira(topUpMin - 1, topUpMin, topUpMax), /smallest/);
  assert.match(wallet.validAmountNaira(topUpMax + 1, topUpMin, topUpMax), /largest/);
  assert.match(wallet.validAmountNaira(1500.5, withdrawMin, 10_000), /whole naira/);
  assert.match(wallet.validAmountNaira(Number.NaN, 1, 2), /Enter an amount/);
  assert.match(wallet.validAmountNaira(0, 1, 2), /Enter an amount/);
  const prefixes = Object.values(wallet.WALLET_REFERENCE);
  assert.equal(new Set(prefixes).size, prefixes.length);
});

test("wallet account numbers get the phone in the +234 form Paystack takes, or none", () => {
  assert.equal(wallet.paystackPhone("0803 123 4567"), "+2348031234567");
  assert.equal(wallet.paystackPhone("+234 803 123 4567"), "+2348031234567");
  assert.equal(wallet.paystackPhone("8031234567"), "+2348031234567");
  assert.equal(wallet.paystackPhone("12345"), null);
  assert.equal(wallet.paystackPhone(null), null);
});

test("wallet account numbers: a business name reads back whole, a person's NIN name stays as it is", () => {
  assert.deepEqual(wallet.paystackNames({ kind: "business", name: "ADA FABRICS VENTURES" }), { first_name: "ADA", last_name: "FABRICS VENTURES" });
  assert.deepEqual(wallet.paystackNames({ kind: "person", firstName: "Tiwalade", lastName: "Okedara" }), { first_name: "Tiwalade", last_name: "Okedara" });
});
