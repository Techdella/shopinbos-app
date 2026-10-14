-- Suppliers answer new orders in time, and book a rider for a set pickup time (build spec 7.2 and 8A,
-- "Simple supplier, delivery and rider apps").
--
--   * "SupplierOrder" / "WholesaleOrder": "acceptBy" (deadline to accept: 4 h for orders shops sold, 24 h for bulk
--     orders; env SUPPLIER_ACCEPT_HOURS_DROPSHIP / SUPPLIER_ACCEPT_HOURS_WHOLESALE, or per supplier below),
--     "acceptReminderAt" (the 1-hour-left reminder went out), "expiredAt" (ran out of time; dropship status
--     'expired', bulk orders 'cancelled'). SupplierOrder also gets "packedAt" ("I've packed it") and
--     "stockReleasedAt" (its lines' supplier stock went back once, when it expired).
--   * "Supplier": "acceptHoursDropship" / "acceptHoursWholesale" (admin override, hours) and "missedOrders".
--   * "DeliveryBooking": "pickupWindowStart" / "pickupWindowEnd" ("Pick up 12–4pm today" for partners and riders).
--   * "SupplierPickup" (new): the rider booking for one supplier order, linked to its delivery job, or waiting
--     for the admin team ("finding_rider", "needsAdmin") when no delivery company covers the area.
--
-- Additive only. Safe to run more than once. RLS on for the new table with no policies: only the server
-- (Prisma, service role) reads it. Run BEFORE deploying the code that uses it (Prisma selects every column).

ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "acceptBy" TIMESTAMP(3);
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "acceptReminderAt" TIMESTAMP(3);
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "expiredAt" TIMESTAMP(3);
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "packedAt" TIMESTAMP(3);
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "stockReleasedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "SupplierOrder_status_acceptBy_idx" ON "SupplierOrder"("status", "acceptBy");

ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "acceptBy" TIMESTAMP(3);
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "acceptReminderAt" TIMESTAMP(3);
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "expiredAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "WholesaleOrder_status_acceptBy_idx" ON "WholesaleOrder"("status", "acceptBy");

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "acceptHoursDropship" INTEGER;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "acceptHoursWholesale" INTEGER;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "missedOrders" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "pickupWindowStart" TIMESTAMP(3);
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "pickupWindowEnd" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "SupplierPickup" (
    "id" TEXT NOT NULL,
    "orderKind" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "pickupAddress" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "deliveryBookingId" TEXT,
    "logisticsPartnerId" TEXT,
    "needsAdmin" BOOLEAN NOT NULL DEFAULT false,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPickup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPickup_orderKind_orderId_key" ON "SupplierPickup"("orderKind", "orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPickup_deliveryBookingId_key" ON "SupplierPickup"("deliveryBookingId");
CREATE INDEX IF NOT EXISTS "SupplierPickup_supplierId_idx" ON "SupplierPickup"("supplierId");
CREATE INDEX IF NOT EXISTS "SupplierPickup_needsAdmin_status_idx" ON "SupplierPickup"("needsAdmin", "status");

ALTER TABLE "SupplierPickup" ENABLE ROW LEVEL SECURITY;

-- Orders already waiting when this ships get a deadline counted from now (not from when they came in), so
-- nothing expires the moment the cron starts. Only rows without one.
UPDATE "SupplierOrder" SET "acceptBy" = CURRENT_TIMESTAMP + interval '4 hours'
  WHERE "status" = 'pending' AND "acceptBy" IS NULL;
UPDATE "WholesaleOrder" SET "acceptBy" = CURRENT_TIMESTAMP + interval '24 hours'
  WHERE "status" = 'pending' AND "acceptBy" IS NULL;

-- New orders the supplier doesn't accept in time: /api/cron/supplier-acceptance marks them expired, gives their
-- stock back, tells the shop and sends the "1 hour left" reminders. Call it from pg_cron every 5 minutes like the
-- other jobs (reuses the "cron_secret" Vault secret = CRON_SECRET in Vercel). Run once the app is deployed with
-- the route (kept commented out so it is never run by accident):
--
-- select cron.schedule(
--   'supplier-acceptance',
--   '*/5 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://shopinbos-app.vercel.app/api/cron/supplier-acceptance',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 60000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'supplier-acceptance');
--
-- To stop it:
--   select cron.unschedule('supplier-acceptance');
