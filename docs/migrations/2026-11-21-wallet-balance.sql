-- Prepaid wallet (src/lib/wallet/balance.server.ts): a balance businesses top up and spend on Shopinbos services,
-- or withdraw to their bank. Sales still settle straight to the bank (Paystack splits).
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "balanceKobo" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "topUpCustomerCode" TEXT;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "topUpAccountNumber" TEXT;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "topUpAccountName" TEXT;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "topUpBankName" TEXT;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "topUpStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "topUpError" TEXT;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "transferRecipient" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Wallet_topUpCustomerCode_key" ON "Wallet"("topUpCustomerCode");
-- A balance can never go below zero, whatever the code does.
DO $$ BEGIN
  ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_balance_not_negative" CHECK ("balanceKobo" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "WalletTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "walletId" TEXT NOT NULL REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,
  "amountKobo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'done',
  "reference" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "WalletTransaction_reference_key" ON "WalletTransaction"("reference");
CREATE INDEX IF NOT EXISTS "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt" DESC);
