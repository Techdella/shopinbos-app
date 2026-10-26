-- Wallet account numbers split to the business's own Paystack subaccount (src/lib/wallet/balance.server.ts).
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "topUpSplitTo" TEXT;
