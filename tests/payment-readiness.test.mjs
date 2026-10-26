// Money page: whether each way to pay reaches checkout (shared/seller-payments.ts), "Finish on WhatsApp", the checkout
// fallback when nothing chosen can be offered, and every "add your bank" form looking the account up.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const money = await import("../shared/seller-payments.ts");
const pay = await import("../shared/checkout-payments.ts");
const onboarding = await import("../shared/onboarding.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const base = { cardKeys: true, secondCheckout: false, wallet: null, transferAccount: false, whatsapp: false };
const wallet = (over = {}) => ({ hasBank: true, settlement: "active", frozen: false, secondCheckoutAccount: false, ...over });

test("before a bank is added, card and transfer say so; pay on delivery works; the second checkout is hidden when off", () => {
  assert.deepEqual(money.paymentMethodStates(base), { card: "needs_bank", korapay: "hidden", transfer: "needs_bank", cod: "live", wa: "needs_whatsapp" });
});

test("once the wallet is active card goes live; the second checkout waits for the team's split account", () => {
  const states = money.paymentMethodStates({ ...base, secondCheckout: true, wallet: wallet(), transferAccount: true, whatsapp: true });
  assert.deepEqual(states, { card: "live", korapay: "needs_team", transfer: "live", cod: "live", wa: "live" });
  assert.equal(money.paymentMethodStates({ ...base, secondCheckout: true, wallet: wallet({ secondCheckoutAccount: true }) }).korapay, "live");
});

test("a bank under review, refused or paused says why, and missing card keys never read as live", () => {
  assert.equal(money.paymentMethodStates({ ...base, wallet: wallet({ settlement: "review" }) }).card, "bank_review");
  assert.equal(money.paymentMethodStates({ ...base, wallet: wallet({ settlement: "failed" }) }).card, "bank_failed");
  assert.equal(money.paymentMethodStates({ ...base, wallet: wallet({ frozen: true }) }).card, "paused");
  assert.equal(money.paymentMethodStates({ ...base, cardKeys: false, wallet: wallet() }).card, "unavailable");
  assert.equal(money.paymentMethodStates({ ...base, wallet: wallet({ hasBank: false }) }).card, "needs_bank");
});

test("sellers never see the payment processor's name for the second checkout", () => {
  // Korapay isn't offered for now, so sellers don't get a switch for it at all.
  assert.equal(onboarding.PAYMENT_METHODS.find((method) => method.key === "korapay"), undefined);
  assert.doesNotMatch(JSON.stringify(onboarding.PAYMENT_METHODS), /korapay/i);
  assert.doesNotMatch(read("shared/i18n/messages/home/en.ts"), /"pm\.[a-z]+\.(label|hint)": "[^"]*(Korapay|Paystack)/);
  assert.doesNotMatch(pay.paymentChoiceText("korapay"), /korapay/i);
});

test("Finish on WhatsApp writes out the bag and the total", () => {
  const message = money.whatsappOrderMessage("Rexi", [{ name: "Ankara tote", quantity: 2, variant: "Blue" }, { name: "Scarf", quantity: 1 }], "₦45,000");
  assert.equal(message, "Hi Rexi, I'd like to order:\n• 2 × Ankara tote (Blue)\n• 1 × Scarf\nTotal: ₦45,000\nHow can I pay?");
  assert.match(read("src/app/s/[slug]/checkout/CheckoutClient.tsx"), /commerce\.payments\.methods\?\.wa && info\.whatsappNumber/);
});

test("checkout never offers a way to pay that can't work, nor one the seller switched off", () => {
  const settings = { methods: { card: true, transfer: false }, paystackReady: false, korapayReady: false, transferReady: true, codLimit: null, zones: [] };
  assert.deepEqual(pay.checkoutPaymentOptions(settings).map((option) => option.key), [], "transfer is off and card can't work: checkout explains instead");
  assert.deepEqual(pay.checkoutPaymentOptions({ ...settings, paystackReady: true }).map((option) => option.key), ["paystack"]);
  // A store that never chose gets card only when its wallet takes cards.
  assert.deepEqual(pay.checkoutPaymentOptions({ ...settings, methods: null }).map((option) => option.key), []);
  assert.deepEqual(pay.checkoutPaymentOptions({ ...settings, methods: null, paystackReady: true }).map((option) => option.key), ["paystack"]);
});

test("pay on delivery with a delivery partner needs the seller's own switch and cap, as well as the partner's", () => {
  const settings = { methods: { card: true, cod: true }, paystackReady: true, korapayReady: false, transferReady: false, codLimit: 50_000, zones: [{ name: "Lagos", regions: ["Lagos"], pickupOnly: false }] };
  const within = { city: "Kano", state: "Kano", total: 30_000 };
  // The store's zones don't price partner deliveries, so an address outside them still gets pay on delivery.
  assert.equal(pay.partnerPayOnDeliveryBlock(settings, within, true), null);
  assert.match(pay.partnerPayOnDeliveryBlock(settings, within, false), /isn't available with this delivery option/, "the partner and shop must both opt in");
  assert.match(pay.partnerPayOnDeliveryBlock({ ...settings, methods: { card: true, cod: false } }, within, true), /isn't available/, "the seller switched it off");
  assert.match(pay.partnerPayOnDeliveryBlock({ ...settings, methods: null }, within, true), /isn't available/, "never chosen means off");
  assert.match(pay.partnerPayOnDeliveryBlock(settings, { ...within, total: 80_000 }, true), /up to ₦50,000/, "the seller's cap still applies");
  assert.equal(pay.partnerPayOnDeliveryBlock({ ...settings, codLimit: null }, { ...within, total: 80_000 }, true), null);
  assert.deepEqual(pay.payOnDeliveryOption(), pay.checkoutPaymentOptions({ ...settings, methods: { cod: true }, zones: [] })[0]);
  // The checkout page (partnerPaymentOptions) and the checkout API both decide with it.
  assert.match(read("src/components/storefront/checkout/PartnerDelivery.tsx"), /partnerPayOnDeliveryBlock\(settings, context, option\.pod === true\)/);
  assert.doesNotMatch(read("src/components/storefront/checkout/PartnerDelivery.tsx"), /methods: \{ cod: true \}/);
  assert.match(read("src/app/api/public/store/[slug]/checkout/route.ts"), /partnerPayOnDeliveryBlock\(paymentSettings, paymentContext, deliveryPlan\?\.pod === true\)/);
});

test("the onboarding payments step keeps the choices it doesn't send, such as Korapay", () => {
  const sent = { transfer: true, card: false, cod: true, wa: false };
  assert.deepEqual(onboarding.mergePaymentMethods({ korapay: true, card: true, junk: true }, sent), { transfer: true, card: false, korapay: true, cod: true, wa: false });
  assert.deepEqual(onboarding.mergePaymentMethods(undefined, sent), sent);
  assert.equal(onboarding.mergePaymentMethods({ korapay: true }, { ...sent, korapay: false }).korapay, false, "a sent choice wins");
  const route = read("src/app/api/app/onboarding/payments/route.ts");
  assert.match(route, /korapay: z\.boolean\(\)\.optional\(\)/);
  assert.match(route, /mergePaymentMethods\(paymentConfig\.methods, methods\)/);
  assert.match(route, /methods: saved \}/);
});

test("every add-your-bank form looks the account up and saves the bank's own name for it", () => {
  const modal = read("src/components/payments/BankLinkingModal.tsx");
  assert.match(modal, /checkWalletAccountAction/);
  assert.doesNotMatch(modal, /setAccountName/, "no typed account name");
  assert.match(read("src/components/builder/LaunchSetup.tsx"), /<BankLinkingModal/);
  const wallet = read("src/lib/wallet/wallet.server.ts");
  assert.match(wallet, /const resolved = await resolveBankAccount\(/);
  // One bank everywhere, and only once the account is live (never while it waits for the team's review).
  const live = wallet.indexOf('subaccountStatus: "active", subaccountError: null');
  assert.ok(live > 0 && wallet.indexOf("syncPayoutBank(", live) > live, "the payout bank follows the wallet once it's live");
  assert.doesNotMatch(read("src/app/actions/payments.ts"), /createPaystackTransferRecipient|supplierPayoutAccount\.upsert/, "no second, unchecked writer");
  const bank = read("src/lib/payout-bank.ts");
  assert.match(bank, /export async function resolveBankAccount/);
  assert.match(bank, /resolveKorapayBankAccount\(bankCode, digits\)/, "Korapay's lookup when Paystack can't answer");
  assert.match(read("src/app/api/app/payout-bank/resolve/route.ts"), /resolveBankAccount\(/);
});
