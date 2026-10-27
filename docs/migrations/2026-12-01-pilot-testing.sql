-- Pilot testing (Admin › Leads › Pilot testing): invite waitlist leads to test the app, collect their replies
-- (email, city, devices) on a personal link until a deadline, then pick the testers and tell everyone the outcome.
-- Additive only: two new tables. Safe to run more than once.

CREATE TABLE IF NOT EXISTS "PilotProgram" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "closesAt" TIMESTAMP(3) NOT NULL,
  "roles" TEXT[] NOT NULL DEFAULT ARRAY['seller', 'supplier', 'delivery']::TEXT[],
  "targets" JSONB NOT NULL DEFAULT '{}',
  "includeNoConsent" BOOLEAN NOT NULL DEFAULT false,
  "textChannel" TEXT NOT NULL DEFAULT 'sms',
  "invitedAt" TIMESTAMP(3),
  "remindedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "PilotApplicant" (
  "id" TEXT PRIMARY KEY,
  "programId" TEXT NOT NULL REFERENCES "PilotProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "leadId" TEXT REFERENCES "WebsiteLead"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'invited',
  "name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "businessName" TEXT,
  "city" TEXT,
  "businessType" TEXT,
  "devices" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "availability" TEXT,
  "note" TEXT,
  "adminNote" TEXT,
  "inviteChannel" TEXT,
  "inviteError" TEXT,
  "invitedAt" TIMESTAMP(3),
  "remindedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "notifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "PilotApplicant_programId_leadId_key" ON "PilotApplicant"("programId", "leadId");
CREATE INDEX IF NOT EXISTS "PilotApplicant_programId_status_idx" ON "PilotApplicant"("programId", "status");

-- Server-only tables: no browser access through the Supabase API.
ALTER TABLE "PilotProgram" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PilotApplicant" ENABLE ROW LEVEL SECURITY;
