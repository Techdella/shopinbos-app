// What each business is checked on before card payments can go to a bank account in someone else's name: sellers
// nothing, suppliers and delivery partners their business registration (CAC or BN). Nobody is asked for an ID.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

test("one rule for every wallet: sellers none, suppliers and delivery partners CAC or BN", () => {
  const wallet = read("src/lib/wallet/wallet.server.ts");
  assert.match(wallet, /return role === "seller" \? "none" : "business";/);
  // The team's approval goes through the same check, never a bare ID check (Korapay split accounts are gone:
  // splits are Paystack-only and automatic).
  assert.equal((wallet.match(/await walletCheckBlock\(wallet\)/g) ?? []).length, 1);
  assert.doesNotMatch(wallet, /kycStatus !== "verified" \|\| !wallet\.bankCode/);
  assert.doesNotMatch(wallet, /verifyWalletIdentity|verifyYouverifyIdentity|verifyKorapayIdentity/, "no ID check is left to start");
  // A registration counts once the CAC document is approved (registry or team) or the business is verified.
  assert.match(wallet, /cac\?\.status === "approved" \|\| business\.verificationStatus === "verified"/);
});

test("sellers are never asked for an ID: onboarding, the top bar, Start here, the wallet and the phone app", () => {
  for (const file of ["SellerRexBuild.tsx", "basics.tsx", "products.tsx", "design.tsx", "pages.tsx", "finish.tsx"]) assert.doesNotMatch(read(`src/components/onboarding/seller/${file}`), /VerifyIdCard|"verify"/, file);
  assert.equal(exists("src/components/shell/VerifyYouBar.tsx"), false);
  assert.doesNotMatch(read("src/components/shell/AppFrame.tsx"), /VerifyYouBar/);
  assert.doesNotMatch(read("src/app/api/app/shell-counts/route.ts"), /idCheck/);
  assert.doesNotMatch(read("shared/onboarding.ts"), /key: "id"/);
  assert.doesNotMatch(read("src/lib/onboarding-status.ts"), /idCheck/);
  assert.equal(exists("apps/mobile/src/components/VerifyYouCard.tsx"), false);
  assert.doesNotMatch(read("src/components/wallet/WalletPanel.tsx"), /KycForm/);
  assert.doesNotMatch(read("apps/mobile/src/app/wallet.tsx"), /KycForm|verifyWalletId/);
  assert.equal(exists("src/app/api/mobile/wallet/kyc/route.ts"), false);
  assert.equal(exists("src/components/verification/VerifyIdCard.tsx"), false);
});

test("suppliers and delivery partners verify their CAC or BN registration, not the owner's NIN", () => {
  for (const path of ["src/components/onboarding/SupplierOnboarding.tsx", "src/app/supplier/verification/page.tsx", "src/app/logistics/verification/page.tsx"]) {
    assert.doesNotMatch(read(path), /VerifyIdCard|WalletIdHint/, path);
  }
  assert.match(read("src/app/supplier/verification/page.tsx"), /CacInstantCheck/);
  // Delivery partners verify their own ID in the sign-up flow (shared/partner-tiers.ts), not the wallet's ID card;
  // CAC is screen 2, looked up through the same instant check ("Is this your company?").
  assert.match(read("src/components/logistics/verification/QuestionScreens.tsx"), /\/api\/logistics\/verification\/cac/);
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    for (const status of ["approved", "pending", "rejected", "missing"]) {
      assert.match(read(`shared/i18n/messages/wallet/${locale}.ts`), new RegExp(`"setup\\.business\\.${status}"`), `${locale} web ${status}`);
      assert.match(read(`shared/i18n/messages/m_money/${locale}.ts`), new RegExp(`"w\\.business\\.${status}"`), `${locale} phone ${status}`);
    }
  }
});
