-- Admin data access log (NDPA 2023 accountability): who looked at a person's contact details, or changed their
-- account, why and when (src/lib/admin/data-access.server.ts).
CREATE TABLE IF NOT EXISTS "AdminDataAccess" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "adminId" TEXT NOT NULL,
  "subjectUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AdminDataAccess_subjectUserId_createdAt_idx" ON "AdminDataAccess"("subjectUserId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AdminDataAccess_adminId_createdAt_idx" ON "AdminDataAccess"("adminId", "createdAt" DESC);
ALTER TABLE "AdminDataAccess" ENABLE ROW LEVEL SECURITY;
