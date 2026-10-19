// What each business is checked on before card payments can go to a bank account in someone else's name: sellers
// nothing (no ID check anywhere), suppliers their business registration (CAC or BN), delivery partners the owner's ID.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

test("one rule for every wallet: sellers none, suppliers CAC or BN, delivery partners ID", () => {
  const wallet = read("src/lib/wallet/wallet.server.ts");
  assert.match(wallet, /return role === "seller" \? "none" : role === "supplier" \? "business" : "id";/);
  // The team's approval and the Korapay split account both go through the same check, never a bare ID check.
  assert.equal((wallet.match(/await walletCheckBlock\(wallet\)/g) ?? []).length, 2);
  assert.doesNotMatch(wallet, /kycStatus !== "verified" \|\| !wallet\.bankCode/);
  assert.match(wallet, /if \(walletCheckKind\(user\.role\) !== "id"\) return \{ ok: false/, "sellers and suppliers can't start an ID check");
  // A supplier's registration counts once the CAC document is approved (registry or team) or the supplier is verified.
  assert.match(wallet, /cac\?\.status === "approved" \|\| supplier\.verificationStatus === "verified"/);
});

test("sellers are never asked for an ID: onboarding, the top bar, Start here, the wallet and the phone app", () => {
  assert.doesNotMatch(read("src/components/onboarding/seller/SellerOnboarding.tsx"), /VerifyIdCard|"verify"/);
  assert.equal(exists("src/components/shell/VerifyYouBar.tsx"), false);
  assert.doesNotMatch(read("src/components/shell/AppFrame.tsx"), /VerifyYouBar/);
  assert.doesNotMatch(read("src/app/api/app/shell-counts/route.ts"), /idCheck/);
  assert.doesNotMatch(read("shared/onboarding.ts"), /key: "id"/);
  assert.doesNotMatch(read("src/lib/onboarding-status.ts"), /idCheck/);
  assert.equal(exists("apps/mobile/src/components/VerifyYouCard.tsx"), false);
  assert.match(read("src/components/wallet/WalletPanel.tsx"), /view\.check\.kind === "business" \?[\s\S]*view\.check\.kind === "id" \?/);
  assert.match(read("apps/mobile/src/app/wallet.tsx"), /check\.kind === "business" \?[\s\S]*check\.kind === "id" \?/);
});

test("suppliers verify their CAC or BN registration, not the owner's NIN", () => {
  assert.doesNotMatch(read("src/components/onboarding/SupplierOnboarding.tsx"), /VerifyIdCard/);
  assert.doesNotMatch(read("src/app/supplier/verification/page.tsx"), /WalletIdHint/);
  assert.match(read("src/app/supplier/verification/page.tsx"), /CacInstantCheck/);
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    for (const status of ["approved", "pending", "rejected", "missing"]) {
      assert.match(read(`shared/i18n/messages/wallet/${locale}.ts`), new RegExp(`"setup\\.business\\.${status}"`), `${locale} web ${status}`);
      assert.match(read(`shared/i18n/messages/m_money/${locale}.ts`), new RegExp(`"w\\.business\\.${status}"`), `${locale} phone ${status}`);
    }
  }
});
