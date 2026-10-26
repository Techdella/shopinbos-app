-- Wallet account numbers in the verified business name or the NIN-verified owner's name
-- (src/lib/wallet/balance.server.ts, src/lib/wallet/identity.server.ts).
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "topUpNameKind" TEXT;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "topUpOldCustomerCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "verifiedBusinessName" TEXT;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "verifiedBusinessNumber" TEXT;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "verifiedBusinessAt" TIMESTAMP(3);
