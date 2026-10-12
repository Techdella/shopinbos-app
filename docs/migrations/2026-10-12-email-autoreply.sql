-- Email builder, auto-replies and the Peggy chatbot (2026-10-12). Additive only.
--
-- Email templates need no change: the preview line (preheader) and the visual builder's blocks are stored
-- inside EmailTemplate."bodyHtml" as HTML comments.
--
-- One new table for the inbox automation settings. Until it exists the app falls back to the old away
-- message (InboxSettings) and the Auto-replies / Chatbot pages say the migration is needed.

CREATE TABLE IF NOT EXISTS "InboxAutomation" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "autoReply" JSONB NOT NULL DEFAULT '{}',
  "chatbot" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboxAutomation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InboxAutomation_storeId_key" ON "InboxAutomation"("storeId");

-- The app reaches this table through Prisma (service connection); no client-side Supabase access.
ALTER TABLE "InboxAutomation" ENABLE ROW LEVEL SECURITY;
