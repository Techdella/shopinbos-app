// Korapay Checkout: webhook signatures, charge statuses and amounts, Korapay as a checkout option, and its refunds.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sign = await import("../src/lib/korapay-signature.ts");
const pay = await import("../shared/checkout-payments.ts");
const stock = await import("../src/lib/commerce/stock-holds.ts");
const refunds = await import("../src/lib/commerce/refunds.ts");
const money = await import("../shared/seller-payments.ts");
const badges = await import("../shared/payment-badges.ts");

const SECRET = "sk_test_korapay";
const data = { reference: "KPY-C-abc", currency: "NGN", amount: "22000", fee: "25", status: "success", payment_reference: "ord_1", payment_method: "card" };

test("webhooks: HMAC-SHA256 (secret key, hex) of JSON.stringify(data) only", () => {
  const good = createHmac("sha256", SECRET).update(JSON.stringify(data)).digest("hex");
  assert.equal(sign.korapaySignature(data, SECRET), good);
  assert.equal(sign.verifyKorapaySignature(data, good, SECRET), true);
  assert.equal(sign.verifyKorapaySignature(data, good.toUpperCase(), SECRET), true);
  // The event name sits outside data and isn't signed; anything inside data is.
  assert.equal(sign.verifyKorapaySignature({ ...data, amount: "1" }, good, SECRET), false);
  assert.equal(sign.verifyKorapaySignature({ ...data, status: "failed" }, good, SECRET), false);
  assert.equal(sign.verifyKorapaySignature(data, good, "sk_test_other"), false);
  assert.equal(sign.verifyKorapaySignature(data, null, SECRET), false);
  assert.equal(sign.verifyKorapaySignature(data, "not-hex", SECRET), false);
  assert.equal(sign.verifyKorapaySignature(undefined, good, SECRET), false);
});

test("charges: only success is paid; amounts are naira (amount_paid first), as kobo", () => {
  assert.equal(sign.korapayChargeState("success"), "success");
  assert.equal(sign.korapayChargeState("failed"), "failed");
  assert.equal(sign.korapayChargeState("expired"), "failed");
  assert.equal(sign.korapayChargeState("processing"), "waiting");
  assert.equal(sign.korapayChargeState(undefined), "waiting");
  assert.equal(sign.korapayPaidKobo({ amount: "2000.00", amount_paid: "2000.00" }), 200000);
  assert.equal(sign.korapayPaidKobo({ amount: "2000.00", amount_paid: 1500 }), 150000, "an underpaid transfer counts what was paid");
  assert.equal(sign.korapayPaidKobo({ amount: 1000 }), 100000);
  assert.equal(sign.korapayPaidKobo({ amount_paid: 0 }), 0);
  assert.equal(sign.korapayPaidKobo({}), null);
  assert.equal(sign.korapayPaidKobo({ amount: "" }), null);
});

test("checkout offers Korapay only when the seller switched it on and the server has the key", () => {
  const base = { methods: { transfer: false, card: true, opay: true, korapay: true, cod: false, wa: false }, paystackReady: true, hostedReady: { opay: true, korapay: true }, transferReady: true, codLimit: null, zones: [] };
  const keys = (settings) => pay.checkoutPaymentOptions(settings, {}).map((option) => option.key);
  assert.deepEqual(keys(base), ["paystack", "opay", "korapay"]);
  assert.deepEqual(keys({ ...base, hostedReady: { opay: true } }), ["paystack", "opay"]);
  assert.deepEqual(keys({ ...base, methods: { ...base.methods, card: false, opay: false } }), ["korapay"]);
  assert.equal(pay.normalizeCheckoutMethod("korapay"), "korapay");
  assert.equal(pay.isHostedCheckoutMethod("korapay"), true);
  assert.equal(pay.isHostedCheckoutMethod("paystack"), false);
  assert.equal(pay.HOSTED_CHECKOUT_NAMES.korapay, "Korapay");
  assert.equal(money.readShopPaymentMethods({}).korapay, false, "starts off");
  assert.deepEqual(badges.defaultPaymentBadges({ korapay: true }), ["visa", "mastercard", "verve"]);
});

test("Korapay orders hold stock for the card window, count as online money, and refund through Korapay", () => {
  assert.equal(stock.paymentWindowMinutes("korapay", { cardMinutes: 30, transferMinutes: 1440 }), 30);
  assert.equal(money.isOnlinePayment("korapay"), true);
  assert.equal(refunds.refundRoute({ id: "o1", paymentMethod: "korapay", paystackRef: null, paystackStatus: "success" }), "korapay");
  assert.equal(refunds.refundRoute({ id: "o1", paymentMethod: "korapay", paystackRef: null, paystackStatus: "pending" }), "manual");
  assert.equal(refunds.refundGatewayName("korapay"), "Korapay");
  assert.ok(refunds.opayRefundReference("c".repeat(25)).length <= 50, "Korapay refund references are at most 50 characters");
  assert.equal(refunds.refundStatusFromKorapay("refund.success"), "processed");
  assert.equal(refunds.refundStatusFromKorapay("refund.failed"), "failed");
  assert.equal(refunds.refundStatusFromKorapay("processing"), "processing");
});

test("a Korapay order is marked paid only from Korapay's charge reply; its reference never feeds Paystack", () => {
  const webhook = read("src/app/api/webhooks/korapay/route.ts");
  assert.match(webhook, /verifyKorapaySignature\(data, req\.headers\.get\("x-korapay-signature"\), secret\)/);
  assert.match(webhook, /confirmHostedOrderPayment\(orderId, "korapay"\)/);
  assert.doesNotMatch(webhook, /status: "paid"/);
  const orders = read("src/lib/commerce/hosted-checkout.server.ts");
  assert.match(orders, /queryKorapayCharge\(orderId\)/);
  assert.match(orders, /charge\.references\.includes\(orderId\)/);
  // Korapay sends the shopper back with ?reference=…; with ?gateway= set that is not treated as a Paystack payment.
  for (const page of ["src/app/s/[slug]/order/[orderId]/page.tsx", "src/app/_domain/[domain]/order/[orderId]/page.tsx"]) {
    assert.match(read(page), /if \(reference && !gateway\) \{/, page);
    assert.match(read(page), /refreshHostedOrderPayment\(orderId\)/, page);
  }
  assert.match(read("src/lib/korapay.ts"), /VERCEL_ENV !== "production" \? process\.env\.KORAPAY_API_BASE_URL/);
});
