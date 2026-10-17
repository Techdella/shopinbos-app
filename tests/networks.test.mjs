// Delivery networks (src/lib/logistics/networks.server.ts): the Shopinbos fee on top of the network's own price,
// and the guards that keep networks apart from logistics partners and never booked on Shopinbos's account unpaid.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fee = await import("../src/lib/logistics/carriers/fee.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the fee is 3% of the network's price, between ₦100 and ₦500", () => {
  assert.deepEqual(fee.DEFAULT_NETWORK_FEE, { percent: 3, min: 100, max: 500 });
  const rule = fee.DEFAULT_NETWORK_FEE;
  assert.equal(fee.networkFee(0, rule), 0);
  assert.equal(fee.networkFee(1500, rule), 100);
  assert.equal(fee.networkFee(4000, rule), 120);
  assert.equal(fee.networkFee(10000, rule), 300);
  assert.equal(fee.networkFee(60000, rule), 500);
  assert.deepEqual(fee.networkTotal(2021.5, rule), { price: 2021.5, fee: 100, total: 2121.5 });
});

test("the fee rule can be changed from the environment, ignoring nonsense", () => {
  assert.deepEqual(fee.networkFeeRule({ DELIVERY_NETWORK_FEE_PERCENT: "2", DELIVERY_NETWORK_FEE_MIN: "50", DELIVERY_NETWORK_FEE_MAX: "300" }), { percent: 2, min: 50, max: 300 });
  assert.deepEqual(fee.networkFeeRule({ DELIVERY_NETWORK_FEE_PERCENT: "-1", DELIVERY_NETWORK_FEE_MIN: "abc", DELIVERY_NETWORK_FEE_MAX: "" }), fee.DEFAULT_NETWORK_FEE);
  assert.deepEqual(fee.networkFeeRule({ DELIVERY_NETWORK_FEE_MIN: "800", DELIVERY_NETWORK_FEE_MAX: "500" }), { percent: 3, min: 800, max: 800 });
  assert.equal(fee.networkFee(1000, { percent: 0, min: 0, max: 0 }), 0);
});

test("partner listings leave delivery networks out", () => {
  for (const path of [
    "src/app/marketplace/logistics/page.tsx",
    "src/app/supplier/dashboard/page.tsx",
    "src/app/api/public/logistics/partners/route.ts",
    "src/app/api/public/logistics/partners/[slug]/route.ts",
    "src/app/api/app/logistics/preferred-partner/route.ts",
    "src/app/api/app/logistics/quotes/route.ts",
    "src/app/home/logistics/page.tsx",
    "src/app/home/shipping/page.tsx",
    "src/app/home/messages/page.tsx",
    "src/lib/workspace.ts",
    "src/app/admin/logistics-partners/page.tsx",
    "src/lib/supplier-orders/pickup.server.ts",
  ]) {
    assert.match(read(path), /carrier: null/, path);
  }
});

test("networks on Shopinbos's account are only booked after a verified payment, never above the price paid", () => {
  const networks = read("src/lib/logistics/networks.server.ts");
  // Direct bookings refuse network partners; quotes are for partners only.
  assert.match(read("src/app/api/app/logistics/bookings/route.ts"), /if \(partner\.carrier\) return apiError/);
  // Paid first: Paystack checkout, then verification of status and amount before booking.
  assert.match(networks, /initializePaystackTransaction\(/);
  assert.match(networks, /verified\.status !== "success"/);
  assert.match(networks, /Number\(verified\.amount\) < Math\.round\(row\.total \* 100\)/);
  // One booking per payment, at no more than the network price paid, refunded once if it fails.
  assert.match(networks, /where: \{ id: row\.id, status: "pending" \}, data: \{ status: "booking"/);
  assert.match(networks, /maxPrice: row\.networkPrice/);
  assert.match(networks, /refundStatus: null \}, data: \{ refundStatus: "pending" \}/);
  // The seller's own account: no fee, no Shopinbos payment.
  assert.match(networks, /account\.via === "own" \? \{ price: quote\.value\.price, fee: 0, total: quote\.value\.price \}/);
  // Callback and webhook both complete it.
  assert.match(read("src/app/api/webhooks/paystack/route.ts"), /ref\.startsWith\(NETWORK_REFERENCE_PREFIX\)/);
  assert.match(read("src/app/api/app/logistics/networks/callback/route.ts"), /completeNetworkCheckout\(reference\)/);
});

test("sellers' own network credentials are encrypted and checked with the network first", () => {
  const accounts = read("src/lib/logistics/carriers/accounts.server.ts");
  assert.match(accounts, /encryptJson\(credentials\)/);
  const networks = read("src/lib/logistics/networks.server.ts");
  assert.match(networks, /const verified = await carrier\.verify\(clean\)/);
  assert.match(networks, /const sealed = sealCredentials\(clean\)/);
});

test("every price shows who set it, and the page explains Shopinbos doesn't set network prices", async () => {
  const en = (await import("../shared/i18n/messages/shipping/en.ts")).default;
  assert.equal(en["net.priceSetBy"], "Price set by {network}");
  assert.match(en["net.disclaimer"], /set their own prices; Shopinbos doesn't set or change them/);
  const ui = read("src/app/home/logistics/NetworkDelivery.tsx");
  assert.match(ui, /t\("net\.priceSetBy", \{ network: offer\.name \}\)/);
  assert.match(ui, /t\("net\.fee"\)/);
});
