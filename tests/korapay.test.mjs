// Korapay checkout: split to the businesses' own Korapay split accounts (nothing left with Shopinbos), webhook
// signatures, and an order marked paid only from Korapay's own charge reply.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sign = await import("../src/lib/korapay-signature.ts");
const rules = await import("../src/lib/wallet/rules.ts");
const pay = await import("../shared/checkout-payments.ts");
const stock = await import("../src/lib/commerce/stock-holds.ts");
const money = await import("../shared/seller-payments.ts");

test("Korapay split: flat naira amounts to each business's split account, adding up to the whole charge", () => {
  const plan = rules.buildSplitPlan({
    gateway: "korapay",
    totalKobo: 3_000_050,
    sellerSubaccount: "KPY-SPA-seller",
    suppliers: [{ supplierId: "s1", subaccount: "KPY-SPA-s1", costKobo: 1_200_000 }, { supplierId: "s2", subaccount: null, costKobo: 300_000 }],
  });
  assert.equal(plan.gateway, "korapay");
  const params = rules.korapaySplitParams(plan);
  assert.equal(params.split_configuration.split_type, "flat");
  assert.deepEqual(params.split_configuration.split_accounts, [
    { value: "18000.50", split_account_reference: "KPY-SPA-seller" },
    { value: "12000.00", split_account_reference: "KPY-SPA-s1" },
  ]);
  const sum = params.split_configuration.split_accounts.reduce((total, row) => total + Math.round(Number(row.value) * 100), 0);
  assert.equal(sum, plan.totalKobo, "nothing is left in the Shopinbos balance");
});

test("webhooks: HMAC-SHA256 (secret key, hex) of JSON.stringify(data) only", () => {
  const data = { reference: "KPY-C-1", currency: "NGN", amount: "22000", status: "success", payment_reference: "ord_1" };
  const good = createHmac("sha256", "sk_test_x").update(JSON.stringify(data)).digest("hex");
  assert.equal(sign.verifyKorapaySignature(data, good, "sk_test_x"), true);
  assert.equal(sign.verifyKorapaySignature({ ...data, amount: "1" }, good, "sk_test_x"), false);
  assert.equal(sign.verifyKorapaySignature(data, good, "sk_test_y"), false);
  assert.equal(sign.verifyKorapaySignature(data, null, "sk_test_x"), false);
  assert.equal(sign.korapayChargeState("success"), "success");
  assert.equal(sign.korapayChargeState("expired"), "failed");
  assert.equal(sign.korapayChargeState("processing"), "waiting");
  assert.equal(sign.korapayPaidKobo({ amount: "2000.00", amount_paid: 1500 }), 150000, "underpaid transfers count what was paid");
});

test("checkout offers Korapay only when the seller switched it on and their wallet can take it", () => {
  const base = { methods: { transfer: false, card: true, korapay: true, cod: false, wa: false }, paystackReady: true, korapayReady: true, transferReady: false, codLimit: null, zones: [] };
  const keys = (settings) => pay.checkoutPaymentOptions(settings, {}).map((option) => option.key);
  assert.deepEqual(keys(base), ["paystack", "korapay"]);
  assert.deepEqual(keys({ ...base, korapayReady: false }), ["paystack"]);
  assert.deepEqual(keys({ ...base, methods: { ...base.methods, korapay: false } }), ["paystack"]);
  assert.equal(pay.normalizeCheckoutMethod("korapay"), "korapay");
  assert.equal(stock.paymentWindowMinutes("korapay", { cardMinutes: 30, transferMinutes: 1440 }), 30);
  assert.equal(money.isOnlinePayment("korapay"), true);
});

test("the server starts the split charge, the frame only shows it, and only Korapay's reply marks an order paid", () => {
  const client = read("src/lib/korapay.ts");
  assert.match(client, /process\.env\.KORAPAY_SPLIT_ENABLED\?\.trim\(\) === "true"/, "off until Split Payments is confirmed");
  assert.match(client, /merchant_bears_cost: false/, "Korapay's fee is never charged to the Shopinbos balance");
  const wallet = read("src/lib/wallet/wallet.server.ts");
  assert.match(wallet, /korapaySplitAccount: \{ not: null \}/);
  const checkout = read("src/app/api/public/store/[slug]/checkout/route.ts");
  assert.match(checkout, /splitPlanForOrder\(store\.id, orderItems, total, "korapay", shippingFee\)/);
  const orders = read("src/lib/commerce/korapay-orders.server.ts");
  assert.match(orders, /queryKorapayCharge\(order\.id\)/);
  assert.match(orders, /if \(order\.paymentMethod !== "korapay"\) return "rejected";/);
  const webhook = read("src/app/api/webhooks/korapay/route.ts");
  assert.match(webhook, /verifyKorapaySignature\(data, req\.headers\.get\("x-korapay-signature"\), secret\)/);
  assert.doesNotMatch(webhook, /status: "paid"/);
  assert.match(read("src/components/payments/KorapayFrame.tsx"), /checkKorapayPayment\(orderId\)/);
  for (const page of ["src/app/s/[slug]/order/[orderId]/page.tsx", "src/app/_domain/[domain]/order/[orderId]/page.tsx"]) {
    assert.match(read(page), /if \(reference && !gateway\) \{/, `${page}: Korapay's ?reference= never goes to Paystack`);
  }
  assert.match(read("next.config.ts"), /https:\/\/checkout\.korapay\.com/);
});
