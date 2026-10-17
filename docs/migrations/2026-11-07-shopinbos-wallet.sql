-- Shopinbos Wallet: each business's KYC, settlement bank and Paystack subaccount, so customer payments are split
-- at checkout and settled by Paystack straight to the business's own bank (src/lib/wallet). Shopinbos never
-- holds or pays out anyone's money.
--
--   * "Wallet": one per user (seller, supplier, delivery partner). KYC by BVN or NIN through Korapay Identity (last
--     4 digits and a keyed hash only, never the number), the settlement bank, the Paystack subaccount code, and
--     the Korapay Split Payments recipient for the same bank.
--   * "WalletEntry": the statement: each business's share of each paid order, unique per share.
--   * "RetailOrder"."paymentSplit": the split Paystack was told to make for the order.
--
-- Additive only, safe to run more than once. RLS is on with no policies: only the app's server connection (which
-- bypasses RLS) reads or writes these tables, never the Supabase anon/authenticated keys.
-- Run BEFORE deploying the code that uses it.

ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "paymentSplit" JSONB;

CREATE TABLE IF NOT EXISTS "Wallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "kycStatus" TEXT NOT NULL DEFAULT 'none',
  "kycIdType" TEXT,
  "kycIdLast4" TEXT,
  "kycIdHash" TEXT,
  "kycFirstName" TEXT,
  "kycLastName" TEXT,
  "kycMiddleName" TEXT,
  "kycDateOfBirth" TEXT,
  "kycReference" TEXT,
  "kycVerifiedAt" TIMESTAMP(3),
  "kycAttempts" INTEGER NOT NULL DEFAULT 0,
  "kycAttemptDay" TEXT,
  "bankCode" TEXT,
  "bankName" TEXT,
  "accountNumber" TEXT,
  "accountName" TEXT,
  "nameCheck" TEXT,
  "subaccountCode" TEXT,
  "subaccountStatus" TEXT NOT NULL DEFAULT 'none',
  "subaccountError" TEXT,
  "korapaySplitAccount" TEXT,
  "frozenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Wallet_userId_key" ON "Wallet"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Wallet_subaccountCode_key" ON "Wallet"("subaccountCode");
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "korapaySplitAccount" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Wallet_korapaySplitAccount_key" ON "Wallet"("korapaySplitAccount");
CREATE INDEX IF NOT EXISTS "Wallet_status_idx" ON "Wallet"("status");
CREATE INDEX IF NOT EXISTS "Wallet_subaccountStatus_idx" ON "Wallet"("subaccountStatus");
CREATE INDEX IF NOT EXISTS "Wallet_kycIdHash_idx" ON "Wallet"("kycIdHash");

CREATE TABLE IF NOT EXISTS "WalletEntry" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amountKobo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'paid',
  "description" TEXT NOT NULL,
  "orderId" TEXT,
  "supplierId" TEXT,
  "paystackReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "WalletEntry_reference_key" ON "WalletEntry"("reference");
CREATE INDEX IF NOT EXISTS "WalletEntry_walletId_createdAt_idx" ON "WalletEntry"("walletId", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletEntry_orderId_idx" ON "WalletEntry"("orderId");

ALTER TABLE "Wallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WalletEntry" ENABLE ROW LEVEL SECURITY;
