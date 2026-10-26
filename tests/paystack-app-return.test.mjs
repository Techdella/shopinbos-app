// Paystack now live: payments the phone app starts come back to the app by themselves (shared/paystack-return.ts,
// src/app/api/mobile/paid, apps/mobile/src/lib/pay.ts), with three outcomes (paid, pending, cancelled); banks saved
// while Paystack was off are finished; the Money and Wallet screens follow the live state; and the Paystack key
// checks. No Paystack call is made here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ret = await import("../shared/paystack-return.ts");
const rules = await import("../src/lib/wallet/rules.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Paystack's status in three words: paid, pending (a transfer on its way) or cancelled", () => {
  assert.equal(ret.paystackOutcome("success"), "paid");
  assert.equal(ret.paystackOutcome("SUCCESS"), "paid");
  for (const status of ["ongoing", "pending", "processing", "queued"]) assert.equal(ret.paystackOutcome(status), "pending", status);
  for (const status of ["abandoned", "failed", "reversed", "", null, undefined]) assert.equal(ret.paystackOutcome(status), "cancelled", String(status));
});

test("the phone's Paystack callback is the web return route, carrying the app's own address", () => {
  assert.equal(ret.appPaidCallbackUrl("https://app.shopinbos.com", "shopinbos://paid"), "https://app.shopinbos.com/api/mobile/paid?app=shopinbos%3A%2F%2Fpaid");
  assert.equal(ret.appPaidCallbackUrl("https://app.shopinbos.com/", null), "https://app.shopinbos.com/api/mobile/paid");
});

test("the return route sends the browser to shopinbos://paid with the reference and outcome, and the app reads it back", () => {
  const link = ret.appPaidDeepLink("shopinbos://paid", "codpay-abc123", "paid");
  assert.equal(link, "shopinbos://paid?ref=codpay-abc123&status=paid");
  assert.deepEqual(ret.readAppPaidLink(link), { reference: "codpay-abc123", outcome: "paid" });
  // Expo Go's address keeps its own query; an old ref/status is replaced, never doubled.
  const expo = ret.appPaidDeepLink("exp://192.168.1.4:8081/--/paid?x=1&status=paid", "whpay-1", "pending");
  assert.equal(expo, "exp://192.168.1.4:8081/--/paid?x=1&ref=whpay-1&status=pending");
  assert.equal(ret.appPaidDeepLink("shopinbos://paid", "", null), "shopinbos://paid");
  assert.deepEqual(ret.readAppPaidLink("shopinbos://paid?status=weird"), { reference: null, outcome: null });
  assert.equal(ret.readAppPaidLink(null), null);
});

test("Paystack's reference is read from ?reference= or ?trxref=, and nothing odd is accepted", () => {
  assert.equal(ret.referenceFromPaystackReturn(new URLSearchParams("trxref=delpay-1a2b3c&reference=delpay-1a2b3c")), "delpay-1a2b3c");
  assert.equal(ret.referenceFromPaystackReturn(new URLSearchParams("trxref=owepay-9f9f9f")), "owepay-9f9f9f");
  assert.equal(ret.referenceFromPaystackReturn(new URLSearchParams("reference=<script>")), null);
  assert.equal(ret.referenceFromPaystackReturn(new URLSearchParams("")), null);
});

test("what the person is told: the signed-in confirm decides, then the return page, then how the browser closed", () => {
  assert.equal(ret.appPayOutcome({ browser: "success", link: "paid", confirm: null }), "paid");
  assert.equal(ret.appPayOutcome({ browser: "dismiss", link: null, confirm: "paid" }), "paid");
  assert.equal(ret.appPayOutcome({ browser: "dismiss", link: null, confirm: "pending" }), "pending");
  assert.equal(ret.appPayOutcome({ browser: "success", link: "pending", confirm: "cancelled" }), "cancelled");
  // An older server without the confirm route: the browser coming back means they got to the end.
  assert.equal(ret.appPayOutcome({ browser: "success", link: null, confirm: null }), "pending");
  assert.equal(ret.appPayOutcome({ browser: "cancel", link: null, confirm: null }), "cancelled");
  assert.equal(ret.appPayOutcome({ browser: null, link: null, confirm: null }), "cancelled");
});

test("Paystack keys: live, test or missing; mixed modes, test keys live and the test DVA bank are flagged", () => {
  assert.equal(ret.paystackKeyMode("sk_live_abc"), "live");
  assert.equal(ret.paystackKeyMode("pk_test_abc"), "test");
  assert.equal(ret.paystackKeyMode("sk_your_key_here"), "missing");
  assert.equal(ret.paystackKeyMode(""), "missing");
  assert.deepEqual(ret.paystackKeyProblems({ PAYSTACK_SECRET_KEY: "sk_live_a", NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: "pk_live_b" }, true), []);
  const mixed = ret.paystackKeyProblems({ PAYSTACK_SECRET_KEY: "sk_live_a", NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: "pk_test_b" }, true);
  assert.equal(mixed.length, 2);
  assert.match(mixed[0], /live key but the public key is a test key/);
  assert.equal(ret.paystackKeyProblems({ PAYSTACK_SECRET_KEY: "sk_test_a", NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: "pk_test_b" }, false).length, 0, "test keys are fine on previews");
  assert.match(ret.paystackKeyProblems({ PAYSTACK_SECRET_KEY: "sk_live_a", PAYSTACK_DVA_BANK: "test-bank" }, true)[0], /PAYSTACK_DVA_BANK/);
});

test("top-up account numbers never ask for Paystack's test bank with live keys", () => {
  assert.equal(ret.paystackDvaBank("sk_live_x", "test-bank"), "wema-bank");
  assert.equal(ret.paystackDvaBank("sk_live_x", "titan-paystack"), "titan-paystack");
  assert.equal(ret.paystackDvaBank("sk_live_x", ""), "wema-bank");
  assert.equal(ret.paystackDvaBank("sk_test_x", undefined), "test-bank");
  assert.equal(ret.paystackDvaBank("sk_test_x", "wema-bank"), "wema-bank");
  assert.match(read("src/lib/logistics/paystack-dva.ts"), /paystackDvaBank\(secret\(\), process\.env\.PAYSTACK_DVA_BANK\)/);
});

test("a bank saved while Paystack was off is set up once the keys are on; a real refusal is left alone", () => {
  const wallet = { status: "active", subaccountStatus: "failed", subaccountError: "Paystack is not configured.", bankCode: "058", accountNumber: "0123456789", nameCheck: "auto" };
  assert.equal(rules.walletWaitingForPaystack(wallet, true), true);
  assert.equal(rules.walletWaitingForPaystack({ ...wallet, subaccountError: "Paystack is not configured (setting up now)." }, true), true);
  assert.equal(rules.walletWaitingForPaystack(wallet, false), false, "still off");
  assert.equal(rules.walletWaitingForPaystack({ ...wallet, subaccountError: "Account number is invalid" }, true), false);
  assert.equal(rules.walletWaitingForPaystack({ ...wallet, status: "frozen" }, true), false);
  assert.equal(rules.walletWaitingForPaystack({ ...wallet, nameCheck: "review" }, true), false, "an account the team must check waits for them");
  assert.equal(rules.walletWaitingForPaystack({ ...wallet, subaccountStatus: "active" }, true), false);
  const server = read("src/lib/wallet/wallet.server.ts");
  assert.match(server, /finishWalletSavedWhilePaystackOff\(await ensureWallet\(user\)\)/);
  assert.match(server, /updateMany\(\{ where: \{ id: wallet\.id, subaccountStatus: "failed", subaccountError: wallet\.subaccountError \}/, "one load at a time");
  assert.match(read("src/app/api/app/payments/route.ts"), /finishWalletSetUpIfPaystackWasOff\(user\.id\)/);
});

test("the phone opens every card payment in an auth session that returns to shopinbos://paid, then confirms it", () => {
  const pay = read("apps/mobile/src/lib/pay.ts");
  assert.match(pay, /openAuthSessionAsync\(started\.authorizationUrl, app\)/);
  assert.match(pay, /makeRedirectUri\(\{ scheme: "shopinbos", path: "paid" \}\)/);
  assert.match(pay, /\/api\/mobile\/payments\/confirm/);
  assert.doesNotMatch(pay, /openBrowserAsync/);
  const wallet = read("apps/mobile/src/lib/wallet.ts");
  assert.doesNotMatch(wallet, /openBrowserAsync|expo-web-browser/);
  for (const call of ["sellers-cash/pay\", { method: \"POST\", json: { sellerId, app }", "pay-fee`, { method: \"POST\", json: { app }", "json: { action: \"pay\", app }", "action: \"pay\", debtId, app"]) assert.ok(wallet.includes(call), call);
  for (const screen of ["apps/mobile/src/app/wholesale.tsx", "apps/mobile/src/app/packaging.tsx", "apps/mobile/src/app/ads/new.tsx"]) {
    assert.doesNotMatch(read(screen), /openBrowserAsync\([a-z]+\.authorizationUrl\)/, screen);
  }
  assert.match(read("apps/mobile/src/lib/packaging.ts"), /payInApp\(\(app\) =>/);
  assert.match(read("apps/mobile/src/lib/ads.ts"), /payInApp\(\(app\) =>/);
  assert.match(read("apps/mobile/src/app/paid.tsx"), /router\.canGoBack\(\)/);
});

test("every pay screen says paid, pending or cancelled in words from the catalog", () => {
  for (const [path, keys] of [
    ["apps/mobile/src/components/PaySellersCard.tsx", ["pay.pending", "pay.cancelled"]],
    ["apps/mobile/src/components/MoneyOwedCard.tsx", ["pay.pending", "pay.cancelled"]],
    ["apps/mobile/src/app/delivery/zones.tsx", ["pay.pending", "pay.cancelled"]],
    ["apps/mobile/src/app/wholesale.tsx", ["pay.pending", "pay.cancelled"]],
    ["apps/mobile/src/app/packaging.tsx", ["order.paid", "order.unpaid"]],
  ]) {
    const source = read(path);
    for (const key of keys) assert.ok(source.includes(`("${key}")`), `${path} ${key}`);
  }
  const ads = read("apps/mobile/src/app/ads/index.tsx");
  assert.match(ads, /t\("requestPaid"\)/);
  assert.match(ads, /t\("requestUnpaid"\)/);
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    const money = read(`shared/i18n/messages/m_money/${lang}.ts`);
    for (const key of ["pay.paid", "pay.pending", "pay.cancelled", "w.cards.needsBank", "w.cards.off", "w.steps.bank", "w.steps.check", "w.steps.cards"]) assert.ok(money.includes(`"${key}"`), `${lang} ${key}`);
    const settings = read(`shared/i18n/messages/m_settings/${lang}.ts`);
    for (const key of ["money.state.card.needs_bank", "money.state.bank_review", "money.state.unavailable", "money.bankRecheck"]) assert.ok(settings.includes(`"${key}"`), `${lang} ${key}`);
  }
});

test("the server starts phone payments with the app's return address and confirms them however they come back", () => {
  for (const path of [
    "src/app/api/mobile/logistics/sellers-cash/pay/route.ts",
    "src/app/api/mobile/deliveries/[id]/pay-fee/route.ts",
    "src/app/api/mobile/wallet/owed/route.ts",
    "src/app/api/app/wholesale/[id]/route.ts",
    "src/app/api/app/print-orders/route.ts",
    "src/app/api/app/ads/requests/route.ts",
  ]) {
    assert.match(read(path), /appCallbackUrl\(/, path);
  }
  const helper = read("src/lib/payments/app-return.server.ts");
  assert.match(helper, /appReturnUrl\(app\)/, "only the app's own scheme (or Expo Go on a local network)");
  for (const fn of ["confirmSellerPayIn", "confirmDeliveryFeePayment", "confirmWholesalePayment", "confirmDebtPayment", "completePrintOrderPayment", "completeAdSetupPayment"]) assert.ok(helper.includes(`${fn}(reference`), fn);
  const paid = read("src/app/api/mobile/paid/route.ts");
  assert.match(paid, /confirmAppPayment\(reference\)/, "verified on return as well as by the webhook");
  assert.match(paid, /checkRateLimitShared/);
  assert.match(paid, /NextResponse\.redirect\(appPaidDeepLink\(/);
  const confirm = read("src/app/api/mobile/payments/confirm/route.ts");
  assert.match(confirm, /confirmAppPayment\(parsed\.data\.reference, user\.id\)/, "the payment must be theirs");
  // Web flows keep their own pages when no app address is sent.
  assert.match(read("src/lib/logistics/seller-payins.server.ts"), /options\.callbackUrl \?\? `\$\{appBase\(\)\}\/logistics\/cash`/);
  assert.match(read("src/lib/supplier-orders/wholesale-payments.server.ts"), /options\.callbackUrl \?\? `\$\{appBase\(\)\}\/marketplace\/wholesale`/);
});

test("confirms tell a payment still on its way from one that failed, and only take naira", () => {
  for (const path of ["src/lib/logistics/seller-payins.server.ts", "src/lib/logistics/delivery-fee-payments.server.ts", "src/lib/supplier-orders/wholesale-payments.server.ts", "src/lib/money-owed/money-owed.server.ts"]) {
    const source = read(path);
    assert.match(source, /pending: paystackOutcome\(payment\.status\) === "pending"/, path);
    assert.match(source, /payment\.currency !== "NGN"/, path);
    assert.match(source, /amountKobo|Math\.round\(Number\(payment\.amount\)\)/, `${path} works in kobo`);
  }
  const webhook = read("src/app/api/webhooks/paystack/route.ts");
  assert.match(webhook, /completePrintOrderPayment\(ref\)[\s\S]{0,200}"retry" as const/, "a print order Paystack couldn't confirm is retried");
  assert.match(webhook, /completeAdSetupPayment\(ref\)[\s\S]{0,200}"retry" as const/);
});

test("the phone never sells credits, plans or wallet top-ups: pay.ts only pays other businesses", () => {
  const pay = read("apps/mobile/src/lib/pay.ts");
  assert.doesNotMatch(pay, /credits\/checkout|wallet\/topup|\/api\/app\/plan|\/extras/);
  const helper = read("src/lib/payments/app-return.server.ts");
  assert.doesNotMatch(helper, /CREDIT_REFERENCE_PREFIX|WALLET_REFERENCE|EXTRA_REFERENCE_PREFIX|PLAN_REFERENCE_PREFIX/);
});

test("Money and Wallet follow the live state: card hints only while true, the wallet's steps lead to card payments", () => {
  const route = read("src/app/api/app/payments/route.ts");
  assert.match(route, /sellerPaymentStates\(userId, store\)/);
  const screen = read("apps/mobile/src/app/payments.tsx");
  assert.match(screen, /methodStateKey\(method\.key, data\.states\?\.\[method\.key\]\)/);
  assert.match(screen, /data\.states\?\.\[method\.key\] !== "hidden"/);
  const settings = read("apps/mobile/src/lib/seller-settings.ts");
  assert.match(settings, /method === "transfer" \? "money\.state\.transfer\.needs_bank" : "money\.state\.card\.needs_bank"/);
  const wallet = read("apps/mobile/src/app/wallet.tsx");
  assert.match(wallet, /view\.cardsReady === false/);
  assert.match(wallet, /function SetupSteps/);
  assert.match(read("src/lib/wallet/wallet.server.ts"), /cardsReady: paystackSecretReady\(process\.env\.PAYSTACK_SECRET_KEY\)/);
});
