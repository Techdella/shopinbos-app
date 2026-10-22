-- Contracts between businesses. Run AFTER 2026-11-11-dropship-agreements.sql, BEFORE deploying the code that uses it.
--
--   * "Contract": a signed document between two businesses (shared/contracts.ts, src/lib/contracts/contracts.server.ts):
--     the Dropship agreement (shop and supplier, one per SupplierAgreement request) and the Delivery service
--     agreement (shop or supplier and a delivery partner, one per DeliveryConnection). The shop / business (party A)
--     signs first, which freezes "body" and its SHA-256 "bodyHash"; the supplier / delivery partner (party B) signs
--     the same copy or declines it. status: awaiting | signed | declined | ended.
--     disputeStatus: none | open | closed. The admin team can only open a contract while a dispute is open.
--     Party user ids are SET NULL when an account is deleted: the names and signatures stay as the legal record.
--   * "ContractEvent": its history (signed, declined, ended, dispute opened / closed, and every admin opening with
--     the reason), shown to both sides.
--
-- Additive only, safe to run more than once. RLS is on with no policies: only the app's server connection (which
-- bypasses RLS) reads or writes them. Relationships that already exist keep working; the shop can sign a written
-- copy from Contracts.

CREATE TABLE IF NOT EXISTS "Contract" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" JSONB NOT NULL,
  "bodyHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'awaiting',
  "supplierAgreementId" TEXT,
  "deliveryConnectionId" TEXT,
  "partyAUserId" TEXT,
  "partyARole" TEXT NOT NULL,
  "partyAName" TEXT NOT NULL,
  "partyASignedName" TEXT NOT NULL,
  "partyASignedAt" TIMESTAMP(3) NOT NULL,
  "partyASignerId" TEXT,
  "partyAIp" TEXT,
  "partyAUserAgent" TEXT,
  "partyBUserId" TEXT,
  "partyBRole" TEXT NOT NULL,
  "partyBName" TEXT NOT NULL,
  "partyBSignedName" TEXT,
  "partyBSignedAt" TIMESTAMP(3),
  "partyBSignerId" TEXT,
  "partyBIp" TEXT,
  "partyBUserAgent" TEXT,
  "declinedAt" TIMESTAMP(3),
  "declineNote" TEXT,
  "endedAt" TIMESTAMP(3),
  "disputeStatus" TEXT NOT NULL DEFAULT 'none',
  "disputeOpenedAt" TIMESTAMP(3),
  "disputeOpenedBy" TEXT,
  "disputeReason" TEXT,
  "disputeClosedAt" TIMESTAMP(3),
  "disputeClosedNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Contract_partyAUserId_createdAt_idx" ON "Contract"("partyAUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "Contract_partyBUserId_createdAt_idx" ON "Contract"("partyBUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "Contract_supplierAgreementId_idx" ON "Contract"("supplierAgreementId");
CREATE INDEX IF NOT EXISTS "Contract_deliveryConnectionId_idx" ON "Contract"("deliveryConnectionId");
CREATE INDEX IF NOT EXISTS "Contract_disputeStatus_updatedAt_idx" ON "Contract"("disputeStatus", "updatedAt");

DO $$ BEGIN
  ALTER TABLE "Contract" ADD CONSTRAINT "Contract_partyAUserId_fkey"
    FOREIGN KEY ("partyAUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Contract" ADD CONSTRAINT "Contract_partyBUserId_fkey"
    FOREIGN KEY ("partyBUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContractEvent" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorSide" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorName" TEXT,
  "note" TEXT,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContractEvent_contractId_createdAt_idx" ON "ContractEvent"("contractId", "createdAt");
CREATE INDEX IF NOT EXISTS "ContractEvent_actorUserId_action_createdAt_idx" ON "ContractEvent"("actorUserId", "action", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ContractEvent" ADD CONSTRAINT "ContractEvent_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Contract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractEvent" ENABLE ROW LEVEL SECURITY;
