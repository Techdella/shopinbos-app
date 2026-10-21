-- An earlier draft of 2026-11-16-plan-extras.sql made tables and columns the logistics marketplace already covers
-- (LogisticsRateCard private cards, LogisticsPickupPoint, DeliveryConnection, DeliveryConnection.partnerPod). They
-- were never used; this removes them. Safe to re-run.
DROP TABLE IF EXISTS "PrivateRateCard";
DROP TABLE IF EXISTS "SupplierLogisticsConnection";
ALTER TABLE "LogisticsPartner" DROP COLUMN IF EXISTS "acceptsCod";
ALTER TABLE "LogisticsPickupPoint" DROP COLUMN IF EXISTS "city";
