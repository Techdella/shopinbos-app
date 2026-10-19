-- Website leads: forms filled on shopinbos.com (newsletter, WhatsApp tips, guide downloads, tool results, contact).
--
--   * "WebsiteLead": one row per form sent. The WordPress site posts each lead to /api/public/website-leads, signed
--     with WEBSITE_LEADS_SECRET (HMAC-SHA256 of "<timestamp>.<body>"). "externalId" is the website's id for the
--     lead, so a retried post never makes a second row. Admins see and work them at /admin/leads.
--
-- Additive only (one new table), safe to run more than once. RLS is on with no policies: only the app's server
-- connection (which bypasses RLS) reads or writes it, never the Supabase anon/authenticated keys.
-- Run BEFORE deploying the code that uses it. (Before it runs, the endpoint answers 503 and the website keeps
-- the leads queued and retries every hour.)

CREATE TABLE IF NOT EXISTS "WebsiteLead" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "message" TEXT,
  "source" TEXT NOT NULL DEFAULT '',
  "pageUrl" TEXT,
  "consent" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'new',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebsiteLead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WebsiteLead_externalId_key" ON "WebsiteLead"("externalId");
CREATE INDEX IF NOT EXISTS "WebsiteLead_status_createdAt_idx" ON "WebsiteLead"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "WebsiteLead_kind_createdAt_idx" ON "WebsiteLead"("kind", "createdAt");
CREATE INDEX IF NOT EXISTS "WebsiteLead_email_idx" ON "WebsiteLead"("email");
CREATE INDEX IF NOT EXISTS "WebsiteLead_phone_idx" ON "WebsiteLead"("phone");

ALTER TABLE "WebsiteLead" ENABLE ROW LEVEL SECURITY;
