-- Notify my followers (pilot feature "notify_followers"; shared/follower-blasts.ts, src/lib/followers/*.server.ts).
-- A shop tells its followers about a new drop, a pre-order or a live, at most 3 times in any 7 days.
--
--   * "ShopFollower": a shopper ("Shopper".id, keyed by phone) following one store. Until the customer app (Shopinbos
--                     Plug) lets people follow a shop, everyone who has bought from a shop follows it with source
--                     "order" (written when an order is recorded, src/lib/shoppers.server.ts, and by
--                     scripts/backfill-followers.mjs). source: order | link | qr | plug. unfollowedAt is set when they
--                     stop following; the row is kept, so a later order doesn't make them follow again. whatsappOptIn: they asked for the shop's news on WhatsApp ("Get news
--                     from <shop> on WhatsApp" on their order page); default false, since marketing on WhatsApp needs
--                     an opt-in. whatsappOptInAt is when they said yes.
--   * "FollowerBlast": one "Notify my followers" message: kind drop | preorder | live, the words, an optional product
--                     and the link, the channels it went out on (whatsapp, email, push), how many followers it was for
--                     and how many messages went out or failed. status queued | sending | sent | failed. Queued,
--                     sending and sent blasts count toward the 3-a-week cap; failed ones don't.
-- Each message to each follower is a "CustomerMessage" row (event "follower_blast", refId "<blastId>:<shopperId>"),
-- so the existing unique (storeId, event, refId, channel) means one message per follower per channel per blast, and
-- WhatsApp delivery receipts update it like order messages.
--
-- Supabase turns on row level security for new tables; the app reads and writes them through Prisma's service
-- connection, so no policies are needed.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it (until then the feature stays
-- off and recording an order skips the follower row without failing).

CREATE TABLE IF NOT EXISTS "ShopFollower" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "shopperId" TEXT NOT NULL REFERENCES "Shopper" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "source" TEXT NOT NULL DEFAULT 'order',
  "followedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unfollowedAt" TIMESTAMP(3),
  "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
  "whatsappOptInAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShopFollower_storeId_shopperId_key" ON "ShopFollower" ("storeId", "shopperId");
CREATE INDEX IF NOT EXISTS "ShopFollower_storeId_unfollowedAt_idx" ON "ShopFollower" ("storeId", "unfollowedAt");
CREATE INDEX IF NOT EXISTS "ShopFollower_shopperId_idx" ON "ShopFollower" ("shopperId");

CREATE TABLE IF NOT EXISTS "FollowerBlast" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "productId" TEXT,
  "link" TEXT NOT NULL,
  "channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "audienceCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "error" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "FollowerBlast_storeId_createdAt_idx" ON "FollowerBlast" ("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "FollowerBlast_status_updatedAt_idx" ON "FollowerBlast" ("status", "updatedAt");

ALTER TABLE "ShopFollower" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FollowerBlast" ENABLE ROW LEVEL SECURITY;
