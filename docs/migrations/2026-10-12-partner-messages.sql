-- Partner messages (seller ↔ supplier ↔ delivery partner): attachments, linked product/order/booking cards,
-- "seen" times and the unread-email marker live in a side table so existing Message queries are untouched.
-- Additive only. Safe to run more than once. The app works without it (no files or cards, no seen time).

CREATE TABLE IF NOT EXISTS "MessageDetail" (
  "messageId" TEXT NOT NULL,
  "attachments" JSONB NOT NULL DEFAULT '[]',
  "context" JSONB,
  "readAt" TIMESTAMP(3),
  "emailedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageDetail_pkey" PRIMARY KEY ("messageId")
);
CREATE INDEX IF NOT EXISTS "MessageDetail_emailedAt_idx" ON "MessageDetail"("emailedAt");
DO $$ BEGIN
  ALTER TABLE "MessageDetail" ADD CONSTRAINT "MessageDetail_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Unread counts and the unread-email sweep filter on these.
CREATE INDEX IF NOT EXISTS "Message_conversationId_read_idx" ON "Message"("conversationId", "read");
CREATE INDEX IF NOT EXISTS "Message_read_createdAt_idx" ON "Message"("read", "createdAt");
CREATE INDEX IF NOT EXISTS "Conversation_updatedAt_idx" ON "Conversation"("updatedAt" DESC);

-- The app talks to Postgres through Prisma (table owner); nothing reads this table through the Supabase API.
ALTER TABLE "MessageDetail" ENABLE ROW LEVEL SECURITY;
