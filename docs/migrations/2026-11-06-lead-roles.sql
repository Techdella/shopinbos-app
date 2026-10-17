-- Lead roles and dated automation steps.
--
--   * "WebsiteLead"."role": who the lead wants to be on Shopinbos: 'seller' | 'supplier' | 'delivery'. The website's
--     waitlist asks ("I want to sell online / I'm a supplier / I'm a delivery company"); every other form is a seller.
--     Campaigns and automations pick their audience by role (sellers, suppliers and delivery partners get their own
--     launch sequences).
--   * Automation steps may now be sent on a date ("at") instead of after a wait, and skipped once stale
--     ("skipAfter"). Both live in the steps JSON, so no column is needed for them.
--
-- Additive only, safe to run more than once. Needs 2026-11-05-lead-growth.sql first. Run BEFORE deploying.

ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'seller';
CREATE INDEX IF NOT EXISTS "WebsiteLead_role_idx" ON "WebsiteLead"("role");

UPDATE "WebsiteLead"
SET "role" = CASE "payload"->>'as' WHEN 'supplier' THEN 'supplier' WHEN 'delivery' THEN 'delivery' ELSE 'seller' END
WHERE "role" IS DISTINCT FROM CASE "payload"->>'as' WHEN 'supplier' THEN 'supplier' WHEN 'delivery' THEN 'delivery' ELSE 'seller' END;
