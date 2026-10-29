-- Dropshipper friction, round 2. Additive only: two new columns, nothing changed or removed. Safe to run more
-- than once. Run BEFORE deploying this code.
--
-- Supplier.walletAskedAt: the first time a shop tried to dropship a supplier with no Shopinbos Wallet. They can still
-- be listed for 14 days (a warning), then not until the wallet is ready (src/lib/marketplace/agreements.server.ts).
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "walletAskedAt" TIMESTAMP(3);

-- Store.handlingDays: days the store takes to send its own stock (0-5, default 1); with each delivery zone's days it
-- gives customers an "Arrives …" date at checkout (shared/cart-checkout.ts ownArrival).
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "handlingDays" INTEGER NOT NULL DEFAULT 1;
