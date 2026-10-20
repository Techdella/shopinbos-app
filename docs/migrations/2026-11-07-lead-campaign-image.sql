-- Lead campaigns can carry a banner image: shown under the heading of an email, and as the header of a WhatsApp
-- template that has an image header. Automation steps keep theirs in the steps JSON.
-- Additive only, safe to run more than once. Needs 2026-11-05-lead-growth.sql. Run BEFORE deploying.

ALTER TABLE "LeadCampaign" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
