-- Riders talk in the app, and customers rate their rider.
--
--   * "RiderMessage": a rider's chat with their delivery company ("company") or with the shop on one of their jobs
--     ("shop", bookingId set). Riders have no account (their Riders app link is the sign-in), so the rider side is
--     fromRider = true and the other side names the user who wrote (company staff or the shop's owner).
--   * "RiderReview":  one rating (1-5, an optional comment) per delivered job, from the customer's review link
--     (/rate-rider/<signed code>), shown to the rider and their company.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it.

CREATE TABLE IF NOT EXISTS "RiderMessage" (
  "id" TEXT PRIMARY KEY,
  "riderId" TEXT NOT NULL,
  "logisticsPartnerId" TEXT NOT NULL,
  "bookingId" TEXT,
  "audience" TEXT NOT NULL,
  "fromRider" BOOLEAN NOT NULL,
  "senderUserId" TEXT,
  "body" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "RiderMessage_riderId_audience_createdAt_idx" ON "RiderMessage" ("riderId", "audience", "createdAt");
CREATE INDEX IF NOT EXISTS "RiderMessage_bookingId_idx" ON "RiderMessage" ("bookingId");
CREATE INDEX IF NOT EXISTS "RiderMessage_logisticsPartnerId_createdAt_idx" ON "RiderMessage" ("logisticsPartnerId", "createdAt");

CREATE TABLE IF NOT EXISTS "RiderReview" (
  "id" TEXT PRIMARY KEY,
  "riderId" TEXT NOT NULL,
  "logisticsPartnerId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "RiderReview_bookingId_key" ON "RiderReview" ("bookingId");
CREATE INDEX IF NOT EXISTS "RiderReview_riderId_createdAt_idx" ON "RiderReview" ("riderId", "createdAt");
