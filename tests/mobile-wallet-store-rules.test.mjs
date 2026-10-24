// The phone's Wallet card follows the app-store payment rules (Apple 3.1.1, Google Play payments): the balance pays
// for Shopinbos services, so the app never takes a top-up. "Top up" emails the website steps, like AI credits;
// withdrawing to the person's own bank stays in the app.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the phone's wallet card never starts a payment, shows no top-up account and uses translated copy", () => {
  const card = read("apps/mobile/src/components/WalletBalanceCard.tsx");
  const lib = read("apps/mobile/src/lib/wallet.ts");
  assert.doesNotMatch(lib, /wallet\/topup"/);
  assert.doesNotMatch(card, /topUpWallet|topUpAccount|openBrowserAsync|Clipboard/);
  assert.match(card, /emailWalletTopUp\(\)/);
  assert.match(card, /withdrawFromWallet\(/);
  assert.doesNotMatch(card, />[A-Z][a-z]+ [a-z]+[^<{]*</, "no hard-coded English text");
});

test("the wallet top-up email points each role at its own web wallet and is rate-limited", () => {
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

test("the prepaid balance is off in store builds unless EXPO_PUBLIC_PREPAID_BALANCE=true (Play: digital wallets need an organization account)", () => {
  const lib = read("apps/mobile/src/lib/wallet.ts");
  const screen = read("apps/mobile/src/app/wallet.tsx");
  assert.match(lib, /PREPAID_BALANCE_IN_APP = process\.env\.EXPO_PUBLIC_PREPAID_BALANCE === "true"/);
  assert.match(screen, /\{PREPAID_BALANCE_IN_APP \? <WalletBalanceCard \/> : null\}/);
  assert.doesNotMatch(read("apps/mobile/eas.json"), /EXPO_PUBLIC_PREPAID_BALANCE/);
});
