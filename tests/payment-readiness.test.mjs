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
  const korapay = onboarding.PAYMENT_METHODS.find((method) => method.key === "korapay");
  assert.doesNotMatch(`${korapay.label} ${korapay.hint}`, /korapay/i);
  assert.doesNotMatch(read("shared/i18n/messages/home/en.ts"), /"pm\.[a-z]+\.(label|hint)": "[^"]*(Korapay|Paystack)/);
  assert.doesNotMatch(pay.paymentChoiceText("korapay"), /korapay/i);
});

test("Finish on WhatsApp writes out the bag and the total", () => {
  const message = money.whatsappOrderMessage("Rexi", [{ name: "Ankara tote", quantity: 2, variant: "Blue" }, { name: "Scarf", quantity: 1 }], "₦45,000");
  assert.equal(message, "Hi Rexi, I'd like to order:\n• 2 × Ankara tote (Blue)\n• 1 × Scarf\nTotal: ₦45,000\nHow can I pay?");
  assert.match(read("src/app/s/[slug]/checkout/CheckoutClient.tsx"), /commerce\.payments\.methods\?\.wa && info\.whatsappNumber/);
});

test("checkout falls back to a way to pay that works, not to a card checkout that can't open", () => {
  const settings = { methods: { card: true, transfer: false }, paystackReady: false, korapayReady: false, transferReady: true, codLimit: null, zones: [] };
  assert.deepEqual(pay.checkoutPaymentOptions(settings).map((option) => option.key), ["transfer"]);
  assert.deepEqual(pay.checkoutPaymentOptions({ ...settings, transferReady: false }).map((option) => option.key), ["paystack"]);
  assert.deepEqual(pay.checkoutPaymentOptions({ ...settings, paystackReady: true }).map((option) => option.key), ["paystack"]);
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
