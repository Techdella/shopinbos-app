-- Money owed between businesses (src/lib/money-owed), and suppliers' return policies.
--
-- Shopinbos never holds anyone's money. When an order between businesses goes wrong (a supplier paid at checkout
-- who didn't send it, goods that came wrong or damaged, a parcel lost after pickup, a chargeback Paystack took from
-- Shopinbos), the business at fault owes the other one:
--
--   * "BusinessDebt": one row per debt. sourceKey is unique (notsent:<supplierOrderId>, claim:<target>:<id>,
--     admin:<id>, overpaid:<reference>), so automatic debts and claims are recorded once. creditorUserId null:
--     owed to Shopinbos. status: claimed | disputed | open | paid | rejected | waived. dueAt: 3 days after it
--     becomes owed; after that the checkout split of the debtor's later sales pays it off.
--   * "BusinessDebtPayment": every payment towards one (paystack in the app, deduction from a sale, confirmed by the
--     business owed). reference is unique, so the popup, the webhook and replays apply a payment once. Deductions
--     are "planned" at checkout (holding that part for 2 hours) and "applied" when the order is paid.
--   * "Supplier".returnPolicy: what the supplier takes back, shown to sellers before they list a product.
--
-- Additive only, safe to run more than once. RLS is on with no policies for the new tables: only the app's server
-- connection (which bypasses RLS) reads or writes them. Run BEFORE deploying the code that uses it.

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "returnPolicy" TEXT;

CREATE TABLE IF NOT EXISTS "BusinessDebt" (
  "id" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "debtorUserId" TEXT NOT NULL,
  "creditorUserId" TEXT,
  "reason" TEXT NOT NULL,
  "amountKobo" INTEGER NOT NULL,
  "paidKobo" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'open',
  "details" TEXT,
  "response" TEXT,
  "decisionNote" TEXT,
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "retailOrderId" TEXT,
  "supplierOrderId" TEXT,
  "wholesaleOrderId" TEXT,
  "bookingId" TEXT,
  "dueAt" TIMESTAMP(3),
  "remindedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessDebt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessDebt_sourceKey_key" ON "BusinessDebt"("sourceKey");
CREATE INDEX IF NOT EXISTS "BusinessDebt_debtorUserId_status_idx" ON "BusinessDebt"("debtorUserId", "status");
CREATE INDEX IF NOT EXISTS "BusinessDebt_creditorUserId_status_idx" ON "BusinessDebt"("creditorUserId", "status");
CREATE INDEX IF NOT EXISTS "BusinessDebt_status_dueAt_idx" ON "BusinessDebt"("status", "dueAt");

CREATE TABLE IF NOT EXISTS "BusinessDebtPayment" (
  "id" TEXT NOT NULL,
  "debtId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "amountKobo" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "retailOrderId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'applied',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessDebtPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessDebtPayment_reference_key" ON "BusinessDebtPayment"("reference");
CREATE INDEX IF NOT EXISTS "BusinessDebtPayment_debtId_status_idx" ON "BusinessDebtPayment"("debtId", "status");
CREATE INDEX IF NOT EXISTS "BusinessDebtPayment_retailOrderId_idx" ON "BusinessDebtPayment"("retailOrderId");

DO $$ BEGIN
  ALTER TABLE "BusinessDebt" ADD CONSTRAINT "BusinessDebt_debtorUserId_fkey"
    FOREIGN KEY ("debtorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "BusinessDebt" ADD CONSTRAINT "BusinessDebt_creditorUserId_fkey"
    FOREIGN KEY ("creditorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "BusinessDebtPayment" ADD CONSTRAINT "BusinessDebtPayment_debtId_fkey"
    FOREIGN KEY ("debtId") REFERENCES "BusinessDebt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "BusinessDebt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessDebtPayment" ENABLE ROW LEVEL SECURITY;

-- /api/cron/money-owed every hour: records not-sent dropship debts a status change missed, and reminds each
-- business once a day while what it owes is due within a day or overdue. Reuses the "cron_secret" Vault secret
-- (= CRON_SECRET in Vercel). Kept commented out so it is never scheduled by accident; run it once the app is
-- deployed with the route:
--
-- select cron.schedule(
--   'money-owed',
--   '7 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://app.shopinbos.com/api/cron/money-owed',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 60000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'money-owed');
--
-- To stop it:
--   select cron.unschedule('money-owed');
