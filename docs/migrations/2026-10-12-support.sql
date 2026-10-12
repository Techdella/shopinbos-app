-- Live support: tickets from the signed-out "Stuck?" form, in-app chat with the support team, emailed replies,
-- and the admin support desk (/admin/support). Additive only. Safe to run more than once.
-- Before this runs the app still works: the "Stuck?" form emails SUPPORT_INBOX instead of opening a ticket,
-- the in-app chat offers Peggy plus email, and /admin/support says the update is needed.

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" TEXT NOT NULL,
  "number" SERIAL NOT NULL,
  "userId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "portal" TEXT NOT NULL DEFAULT 'public',
  "topic" TEXT NOT NULL DEFAULT 'other',
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "source" TEXT NOT NULL DEFAULT 'app',
  "assigneeId" TEXT,
  "path" TEXT,
  "firstResponseDueAt" TIMESTAMP(3),
  "firstRespondedAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUserMessageAt" TIMESTAMP(3),
  "lastAgentMessageAt" TIMESTAMP(3),
  "userReadAt" TIMESTAMP(3),
  "agentReadAt" TIMESTAMP(3),
  "solvedAt" TIMESTAMP(3),
  "rating" INTEGER,
  "ratingComment" TEXT,
  "ratedAt" TIMESTAMP(3),
  "meta" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicket_number_key" ON "SupportTicket"("number");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_lastMessageAt_idx" ON "SupportTicket"("status", "lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS "SupportTicket_userId_lastMessageAt_idx" ON "SupportTicket"("userId", "lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS "SupportTicket_assigneeId_status_idx" ON "SupportTicket"("assigneeId", "status");
CREATE INDEX IF NOT EXISTS "SupportTicket_email_idx" ON "SupportTicket"("email");
CREATE INDEX IF NOT EXISTS "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

-- Ticket numbers read SB-1001, SB-1002, … Only moves the sequence forward on a fresh table.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "SupportTicket") THEN
    PERFORM setval(pg_get_serial_sequence('"SupportTicket"', 'number'), 1000, true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SupportMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorType" TEXT NOT NULL,
  "authorId" TEXT,
  "authorName" TEXT,
  "body" TEXT NOT NULL,
  "internal" BOOLEAN NOT NULL DEFAULT false,
  "attachments" JSONB NOT NULL DEFAULT '[]',
  "channel" TEXT NOT NULL DEFAULT 'app',
  "externalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupportMessage_externalId_key" ON "SupportMessage"("externalId");
CREATE INDEX IF NOT EXISTS "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "SupportMacro" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "topic" TEXT,
  "status" TEXT,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMacro_pkey" PRIMARY KEY ("id")
);

-- The app talks to Postgres through Prisma (table owner); nothing reads these tables through the Supabase API.
ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportMacro" ENABLE ROW LEVEL SECURITY;
