-- Member stories for the weekly tips, shared with explicit consent (src/lib/member-messaging/stories.server.ts).
CREATE TABLE IF NOT EXISTS "MemberStory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "city" TEXT,
  "result" TEXT,
  "story" TEXT NOT NULL,
  "videoProjectId" TEXT,
  "videoUrl" TEXT,
  "posterUrl" TEXT,
  "language" TEXT NOT NULL DEFAULT 'en',
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "consentVersion" TEXT NOT NULL,
  "consentText" TEXT NOT NULL,
  "consentAt" TIMESTAMP(3) NOT NULL,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "withdrawnAt" TIMESTAMP(3),
  "timesShown" INTEGER NOT NULL DEFAULT 0,
  "lastShownAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "MemberStory_userId_key" ON "MemberStory"("userId");
CREATE INDEX IF NOT EXISTS "MemberStory_status_role_idx" ON "MemberStory"("status", "role");
ALTER TABLE "MemberStory" ENABLE ROW LEVEL SECURITY;
