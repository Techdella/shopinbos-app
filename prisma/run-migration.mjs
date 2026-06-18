import pg from "pg";
import fs from "fs";

const envLocal = fs.readFileSync(".env.local", "utf-8");
const envFile = fs.readFileSync(".env", "utf-8");
const combined = envLocal + "\n" + envFile;

const urlMatch = combined.match(/^DATABASE_URL=(.+)$/m);
const directMatch = combined.match(/^DIRECT_URL=(.+)$/m);
const connectionString = (urlMatch?.[1] ?? directMatch?.[1] ?? "").trim();

if (!connectionString) {
  console.error("No DATABASE_URL or DIRECT_URL found in .env or .env.local");
  process.exit(1);
}

console.log("Connecting...");
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("Connected. Creating tables...");

    await client.query(`CREATE TABLE IF NOT EXISTS "Conversation" (
      "id" TEXT PRIMARY KEY,
      "participant1Id" TEXT NOT NULL,
      "participant2Id" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "Conversation_participant1Id_fkey" FOREIGN KEY ("participant1Id") REFERENCES "User"("id"),
      CONSTRAINT "Conversation_participant2Id_fkey" FOREIGN KEY ("participant2Id") REFERENCES "User"("id"),
      CONSTRAINT "Conversation_participant1Id_participant2Id_key" UNIQUE ("participant1Id", "participant2Id")
    )`);
    console.log("Conversation table created");

    await client.query(`CREATE INDEX IF NOT EXISTS "Conversation_participant1Id_idx" ON "Conversation"("participant1Id")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "Conversation_participant2Id_idx" ON "Conversation"("participant2Id")`);

    await client.query(`CREATE TABLE IF NOT EXISTS "Message" (
      "id" TEXT PRIMARY KEY,
      "conversationId" TEXT NOT NULL,
      "senderId" TEXT NOT NULL,
      "text" TEXT NOT NULL,
      "read" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id"),
      CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id")
    )`);
    console.log("Message table created");

    await client.query(`CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt")`);

    console.log("Migration complete!");
  } catch (e) {
    console.error("Migration error:", e instanceof Error ? e.message : e);
    console.error("Detail:", e instanceof Error ? e.stack : "");
  } finally {
    client.release();
    await pool.end();
  }
}

run();
