-- Meta Deauthorize and Data Deletion callbacks (/api/webhooks/meta/deauthorize, /api/webhooks/meta/data-deletion).
--
--   * "MetaUserLink": which Facebook person (app-scoped user ID) connected which store, and through what
--     (WhatsApp Embedded Signup, Messenger / Instagram / WhatsApp tokens issued to our app, catalog, ads). Meta's
--     callbacks name the person only by that ID.
--   * "MetaDataDeletionRequest": each deletion request under its confirmation code, for the status page
--     /meta-data-deletion?code=…. Keeps a SHA-256 of the user ID, not the ID.
--
-- Additive only, safe to run more than once. Run BEFORE deploying. Then run scripts/backfill-meta-user-links.ts once
-- to link the connections made before this change.

CREATE TABLE IF NOT EXISTS "MetaUserLink" (
  "id" TEXT NOT NULL,
  "metaUserId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaUserLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MetaUserLink_metaUserId_storeId_source_key" ON "MetaUserLink"("metaUserId", "storeId", "source");
CREATE INDEX IF NOT EXISTS "MetaUserLink_storeId_idx" ON "MetaUserLink"("storeId");

CREATE TABLE IF NOT EXISTS "MetaDataDeletionRequest" (
  "id" TEXT NOT NULL,
  "confirmationCode" TEXT NOT NULL,
  "metaUserHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'received',
  "storesAffected" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB NOT NULL DEFAULT '{}',
  "error" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "MetaDataDeletionRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MetaDataDeletionRequest_confirmationCode_key" ON "MetaDataDeletionRequest"("confirmationCode");
CREATE INDEX IF NOT EXISTS "MetaDataDeletionRequest_metaUserHash_idx" ON "MetaDataDeletionRequest"("metaUserHash");

-- Server-only tables: no policies, so the anon and authenticated roles can't read them through the Supabase API.
ALTER TABLE "MetaUserLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MetaDataDeletionRequest" ENABLE ROW LEVEL SECURITY;
