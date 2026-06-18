import { db } from "../src/lib/db/client";

async function migrate() {
  console.log("Creating Conversation table...");
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Conversation" (
      "id" TEXT PRIMARY KEY,
      "participant1Id" TEXT NOT NULL REFERENCES "User"("id"),
      "participant2Id" TEXT NOT NULL REFERENCES "User"("id"),
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "Conversation_participant1Id_participant2Id_key" UNIQUE ("participant1Id", "participant2Id")
    );
    CREATE INDEX IF NOT EXISTS "Conversation_participant1Id_idx" ON "Conversation"("participant1Id");
    CREATE INDEX IF NOT EXISTS "Conversation_participant2Id_idx" ON "Conversation"("participant2Id");
  `);

  console.log("Creating Message table...");
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Message" (
      "id" TEXT PRIMARY KEY,
      "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id"),
      "senderId" TEXT NOT NULL REFERENCES "User"("id"),
      "text" TEXT NOT NULL,
      "read" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId");
    CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
  `);

  console.log("Migration complete!");
}

migrate()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  });
