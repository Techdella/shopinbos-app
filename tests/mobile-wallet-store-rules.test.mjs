// The phone's Wallet card follows the app-store payment rules (Apple 3.1.1, Google Play payments): the balance pays
// for Shopinbos services, so the app never takes a top-up or points anywhere to make one (no button, no email with
// the website steps). It's spend-only, so there's no Withdraw either. tests/store-payments.test.mjs has more.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the phone's wallet card never starts a payment, shows the account number only when the build allows it, and uses translated copy", () => {
  const card = read("apps/mobile/src/components/WalletBalanceCard.tsx");
  const lib = read("apps/mobile/src/lib/wallet.ts");
  assert.doesNotMatch(lib, /wallet\/topup"/);
  assert.doesNotMatch(card, /topUpWallet|topUpAccount|openBrowserAsync|Clipboard/);
  assert.doesNotMatch(card, /emailWalletTopUp|bal\.topUp/);
  assert.doesNotMatch(lib, /emailWalletTopUp|topup-email/);
  assert.match(card, /\{WALLET_ACCOUNT_IN_APP \? <WalletAccountNumber view=\{view\} \/> : null\}/);
  assert.match(lib, /WALLET_ACCOUNT_IN_APP = !STORE_BUILD && process\.env\.EXPO_PUBLIC_WALLET_ACCOUNT_NUMBER === "true"/);
  assert.doesNotMatch(read("apps/mobile/eas.json"), /EXPO_PUBLIC_WALLET_ACCOUNT_NUMBER/);
  assert.doesNotMatch(read("apps/mobile/src/components/WalletAccountNumber.tsx"), /openBrowserAsync|topUpWallet|>[A-Z][a-z]+ [a-z]+[^<{]*</);
  assert.doesNotMatch(card + lib, /withdrawFromWallet|wallet\/withdraw/, "the balance is spend-only");
  assert.doesNotMatch(card, />[A-Z][a-z]+ [a-z]+[^<{]*</, "no hard-coded English text");
});

test("the old app's wallet top-up email route (kept for installed builds) points each role at its own web wallet and is rate-limited", () => {
  const route = read("src/app/api/mobile/wallet/topup-email/route.ts");
  for (const path of ["/home/wallet", "/supplier/wallet", "/logistics/wallet"]) assert.ok(route.includes(path), path);
  assert.match(route, /checkRateLimitShared/);
  assert.match(route, /\["seller", "supplier", "logistics_partner"\]/);
});

test("Call Peggy reads every word from the m_help catalog", () => {
  const button = read("apps/mobile/src/components/CallPeggyButton.tsx");
  for (const key of ["call.title", "call.label", "call.note", "call.failed"]) assert.ok(button.includes(`t("${key}")`), key);
});

test("Call Peggy is hidden when calls aren't set up, never a coming-soon message", () => {
  const button = read("apps/mobile/src/components/CallPeggyButton.tsx");
  assert.match(button, /if \(!ready\) return null;/);
  assert.doesNotMatch(button, /soon/i);
  assert.doesNotMatch(read("shared/i18n/messages/m_help/en.ts"), /"call\.soon"/);
});

test("the prepaid balance is never in App Store or Play builds, iPhone and Android alike (digital wallets need an organization account)", () => {
  const lib = read("apps/mobile/src/lib/wallet.ts");
  const screen = read("apps/mobile/src/app/wallet.tsx");
  // Store builds are the EAS "production" profile; app.config.js marks them and the app checks the mark, so no
  // EXPO_PUBLIC_* setting on expo.dev can turn the balance on in a store build.
  const config = read("apps/mobile/app.config.js");
  assert.match(config, /const storeBuild = process\.env\.EAS_BUILD_PROFILE === "production";/);
  assert.match(config, /extra: \{ \.\.\.config\.extra, storeBuild \}/);
  assert.match(JSON.parse(read("apps/mobile/eas.json")).build.production ? "production" : "", /production/);
  assert.match(lib, /STORE_BUILD = \(Constants\.expoConfig\?\.extra as \{ storeBuild\?: boolean \} \| undefined\)\?\.storeBuild === true;/);
  assert.match(lib, /PREPAID_BALANCE_IN_APP = !STORE_BUILD && process\.env\.EXPO_PUBLIC_PREPAID_BALANCE === "true"/);
  assert.doesNotMatch(lib, /Platform\.OS/, "the rule is the same on both platforms");
  assert.match(screen, /\{PREPAID_BALANCE_IN_APP \? <WalletBalanceCard \/> : null\}/);
  assert.doesNotMatch(read("apps/mobile/eas.json"), /EXPO_PUBLIC_PREPAID_BALANCE/);
});
