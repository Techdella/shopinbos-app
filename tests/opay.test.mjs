// OPay Checkout: request and callback signatures, OPay as a checkout option, its payment window and its refunds.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sign = await import("../src/lib/opay-signature.ts");
const pay = await import("../shared/checkout-payments.ts");
const stock = await import("../src/lib/commerce/stock-holds.ts");
const refunds = await import("../src/lib/commerce/refunds.ts");
const money = await import("../shared/seller-payments.ts");
const badges = await import("../shared/payment-badges.ts");

const SECRET = "OPAYPRV-test-secret";

test("API calls sign the body with its keys sorted at every level (HMAC-SHA512, hex) and send that same string", () => {
  const { body, signature } = sign.signedBody({ reference: "ord_1", country: "NG", amount: { total: 400, currency: "NGN" }, skipped: undefined }, SECRET);
  assert.equal(body, '{"amount":{"currency":"NGN","total":400},"country":"NG","reference":"ord_1"}');
  assert.equal(signature, createHmac("sha512", SECRET).update(body).digest("hex"));
  assert.match(signature, /^[0-9a-f]{128}$/);
});

const callback = {
  amount: "49160",
  channel: "Web",
  country: "NG",
  currency: "NGN",
  displayedFailure: "",
  fee: "737",
  feeCurrency: "NGN",
  instrumentType: "BankCard",
  reference: "10023",
  refunded: false,
  status: "SUCCESS",
  timestamp: "2022-05-07T06:20:46Z",
  token: "220507145660712931829",
  transactionId: "220507145660712931829",
  updated_at: "2022-05-07T07:20:46Z",
};

test("callbacks: the documented template, Refunded as t/f, HMAC-SHA3-512 with the secret key", () => {
  assert.equal(
    sign.callbackSignedString(callback),
    '{Amount:"49160",Currency:"NGN",Reference:"10023",Refunded:f,Status:"SUCCESS",Timestamp:"2022-05-07T06:20:46Z",Token:"220507145660712931829",TransactionID:"220507145660712931829"}',
  );
  assert.match(sign.callbackSignedString({ ...callback, refunded: true }), /Refunded:t,/);
  assert.match(sign.callbackSignedString({ ...callback, token: null }), /Token:"",/);

  const good = createHmac("sha3-512", SECRET).update(sign.callbackSignedString(callback)).digest("hex");
  assert.equal(sign.callbackSignature(callback, SECRET), good);
  assert.equal(sign.verifyCallbackSignature(callback, good, SECRET), true);
  assert.equal(sign.verifyCallbackSignature(callback, good.toUpperCase(), SECRET), true, "hex compared case-insensitively");
  // Tampered amount, status or reference, another key, or junk: rejected.
  assert.equal(sign.verifyCallbackSignature({ ...callback, amount: "1" }, good, SECRET), false);
  assert.equal(sign.verifyCallbackSignature({ ...callback, status: "FAIL" }, good, SECRET), false);
  assert.equal(sign.verifyCallbackSignature({ ...callback, reference: "other" }, good, SECRET), false);
  assert.equal(sign.verifyCallbackSignature(callback, good, "another-key"), false);
  assert.equal(sign.verifyCallbackSignature(callback, "zz", SECRET), false);
  assert.equal(sign.verifyCallbackSignature(callback, undefined, SECRET), false);
  assert.equal(sign.verifyCallbackSignature(callback, good.slice(0, 64), SECRET), false);
});

test("OPay statuses and success codes", () => {
  assert.equal(sign.readOpayStatus("SUCCESS"), "SUCCESS");
  assert.equal(sign.readOpayStatus("success"), null);
  assert.equal(sign.opayOk("00000"), true);
  assert.equal(sign.opayOk("02000"), false);
});

test("checkout offers OPay only when the seller switched it on and the server has OPay keys", () => {
  const base = { methods: { transfer: false, card: true, opay: true, cod: false, wa: false }, paystackReady: true, opayReady: true, transferReady: true, codLimit: null, zones: [] };
  const keys = (settings) => pay.checkoutPaymentOptions(settings, {}).map((option) => option.key);
  assert.deepEqual(keys(base), ["paystack", "opay"]);
  assert.deepEqual(keys({ ...base, opayReady: false }), ["paystack"]);
  assert.deepEqual(keys({ ...base, methods: { ...base.methods, opay: false } }), ["paystack"]);
  assert.deepEqual(keys({ ...base, methods: { ...base.methods, card: false } }), ["opay"]);
  // Older callers that don't pass OPay readiness never offer it.
  assert.equal(pay.checkoutPaymentSettings({ paymentConfig: { methods: { opay: true } } }, [], true).opayReady, false);
  assert.equal(pay.checkoutPaymentSettings({ paymentConfig: { methods: { opay: true } } }, [], true, true).opayReady, true);
  assert.equal(pay.normalizeCheckoutMethod("opay"), "opay");
  assert.match(pay.paymentChoiceText("opay"), /OPay/);
  // A store that never saved its choices still offers card only; OPay starts off.
  assert.equal(money.readShopPaymentMethods({}).opay, false);
  assert.deepEqual(badges.defaultPaymentBadges({ card: false, opay: true }), ["opay"]);
});

test("OPay orders hold stock for the short (card) window, count as online money, and refund through OPay", () => {
  const windows = { cardMinutes: 30, transferMinutes: 24 * 60 };
  assert.equal(stock.paymentWindowMinutes("opay", windows), 30);
  assert.equal(money.isOnlinePayment("opay"), true);

  assert.equal(refunds.refundRoute({ id: "o1", paymentMethod: "opay", paystackRef: null, paystackStatus: "success" }), "opay");
  assert.equal(refunds.refundRoute({ id: "o1", paymentMethod: "opay", paystackRef: null, paystackStatus: "pending" }), "manual", "never paid: nothing to send back");
  assert.equal(refunds.refundRoute({ id: "o1", paymentMethod: null, paystackRef: "o1" }), "paystack");
  assert.equal(refunds.refundGatewayName("opay"), "OPay");
  assert.equal(refunds.opayRefundReference("ord_9"), "refund-ord_9");
  assert.equal(refunds.orderIdFromOpayRefund("refund-ord_9"), "ord_9");
  assert.equal(refunds.orderIdFromOpayRefund("ord_9"), null);
  assert.equal(refunds.orderIdFromOpayRefund("refund-"), null);
  assert.equal(refunds.refundStatusFromOpay("SUCCESS"), "processed");
  assert.equal(refunds.refundStatusFromOpay("FAIL"), "failed");
  assert.equal(refunds.refundStatusFromOpay("PENDING"), "processing");
});

test("an OPay order is marked paid only from OPay's status reply, checked against the order", () => {
  const orders = read("src/lib/commerce/opay-orders.server.ts");
  assert.match(orders, /queryOpayPayment\(order\.id\)/);
  assert.match(orders, /retailChargeProblem\(/);
  assert.match(orders, /status: \{ in: \[\.\.\.PAYABLE_ORDER_STATUSES\] \}/, "only an unpaid order moves");
  const webhook = read("src/app/api/webhooks/opay/route.ts");
  assert.match(webhook, /verifyCallbackSignature\(payload, event\?\.sha512, secret\)/);
  assert.match(webhook, /confirmOpayOrderPayment\(reference\)/);
  assert.doesNotMatch(webhook, /status: "paid"/, "the callback body never marks an order paid by itself");
  // The live site never takes a test stub or silently uses the sandbox.
  const client = read("src/lib/opay.ts");
  assert.match(client, /VERCEL_ENV !== "production" \? process\.env\.OPAY_API_BASE_URL/);
  assert.match(client, /return process\.env\.VERCEL_ENV === "production" \? LIVE_BASE : SANDBOX_BASE;/);
});
