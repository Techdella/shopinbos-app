-- All-in-one inbox (agent E). Additive only.

CREATE TABLE IF NOT EXISTS "InboxChannel" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'disconnected',
  "externalId" TEXT,
  "displayName" TEXT,
  "credentials" TEXT,
  "webhookSecret" TEXT,
  "settings" JSONB NOT NULL DEFAULT '{}',
  "lastError" TEXT,
  "connectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboxChannel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InboxChannel_storeId_channel_key" ON "InboxChannel"("storeId", "channel");
CREATE INDEX IF NOT EXISTS "InboxChannel_channel_externalId_idx" ON "InboxChannel"("channel", "externalId");
CREATE INDEX IF NOT EXISTS "InboxChannel_webhookSecret_idx" ON "InboxChannel"("webhookSecret");

CREATE TABLE IF NOT EXISTS "InboxConversation" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "externalThreadId" TEXT NOT NULL,
  "subject" TEXT,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "contactHandle" TEXT,
  "visitorId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "snoozedUntil" TIMESTAMP(3),
  "assigneeEmail" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessagePreview" TEXT,
  "lastInboundAt" TIMESTAMP(3),
  "autoRepliedAt" TIMESTAMP(3),
  "visitorSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboxConversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InboxConversation_storeId_channel_externalThreadId_key" ON "InboxConversation"("storeId", "channel", "externalThreadId");
CREATE INDEX IF NOT EXISTS "InboxConversation_storeId_status_lastMessageAt_idx" ON "InboxConversation"("storeId", "status", "lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS "InboxConversation_storeId_contactEmail_idx" ON "InboxConversation"("storeId", "contactEmail");
CREATE INDEX IF NOT EXISTS "InboxConversation_storeId_contactPhone_idx" ON "InboxConversation"("storeId", "contactPhone");

CREATE TABLE IF NOT EXISTS "InboxMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'text',
  "body" TEXT NOT NULL,
  "bodyHtml" TEXT,
  "attachments" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'received',
  "error" TEXT,
  "externalId" TEXT,
  "authorName" TEXT,
  "meta" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InboxMessage_conversationId_createdAt_idx" ON "InboxMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "InboxMessage_externalId_idx" ON "InboxMessage"("externalId");
DO $$ BEGIN
  ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "InboxCannedReply" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboxCannedReply_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InboxCannedReply_storeId_idx" ON "InboxCannedReply"("storeId");

CREATE TABLE IF NOT EXISTS "InboxSettings" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
  "autoReplyMode" TEXT NOT NULL DEFAULT 'message',
  "awayMessage" TEXT,
  "forwardCallsTo" TEXT,
  "sellerLastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboxSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InboxSettings_storeId_key" ON "InboxSettings"("storeId");

-- The app reaches these tables through Prisma (service connection); no client-side Supabase access.
ALTER TABLE "InboxChannel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboxConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboxMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboxCannedReply" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboxSettings" ENABLE ROW LEVEL SECURITY;
