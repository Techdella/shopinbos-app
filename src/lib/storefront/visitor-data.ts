import "server-only";
import { db } from "@/lib/db/client";

export async function ensureStorefrontVisitorTables() {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StoreVisitor" (
      id TEXT PRIMARY KEY,
      "storeId" TEXT NOT NULL,
      "visitorKey" TEXT NOT NULL,
      email TEXT,
      name TEXT,
      phone TEXT,
      "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "StoreVisitor_storeId_visitorKey_key" ON "StoreVisitor" ("storeId", "visitorKey")`);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreVisitor_storeId_email_idx" ON "StoreVisitor" ("storeId", email)`);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StoreWishlistItem" (
      id TEXT PRIMARY KEY,
      "storeId" TEXT NOT NULL,
      "visitorId" TEXT NOT NULL,
      "productId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "StoreWishlistItem_visitorId_productId_key" ON "StoreWishlistItem" ("visitorId", "productId")`);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreWishlistItem_storeId_idx" ON "StoreWishlistItem" ("storeId")`);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StoreFormSubmission" (
      id TEXT PRIMARY KEY,
      "storeId" TEXT NOT NULL,
      "visitorId" TEXT,
      type TEXT NOT NULL DEFAULT 'contact',
      name TEXT,
      email TEXT,
      phone TEXT,
      message TEXT,
      payload JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'new',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreFormSubmission_storeId_createdAt_idx" ON "StoreFormSubmission" ("storeId", "createdAt" DESC)`);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AbandonedCartEvent" (
      id TEXT PRIMARY KEY,
      "storeId" TEXT NOT NULL,
      "visitorId" TEXT,
      email TEXT,
      name TEXT,
      items JSONB NOT NULL DEFAULT '[]',
      subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'NGN',
      status TEXT NOT NULL DEFAULT 'triggered',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AbandonedCartEvent_storeId_createdAt_idx" ON "AbandonedCartEvent" ("storeId", "createdAt" DESC)`);
}

export async function upsertStoreVisitor(input: {
  storeId: string;
  visitorKey: string;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
}) {
  await ensureStorefrontVisitorTables();
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `
      INSERT INTO "StoreVisitor" (id, "storeId", "visitorKey", email, name, phone, "lastSeenAt", "updatedAt")
      VALUES (gen_random_uuid()::text, $1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NOW(), NOW())
      ON CONFLICT ("storeId", "visitorKey")
      DO UPDATE SET
        email = COALESCE(NULLIF(EXCLUDED.email, ''), "StoreVisitor".email),
        name = COALESCE(NULLIF(EXCLUDED.name, ''), "StoreVisitor".name),
        phone = COALESCE(NULLIF(EXCLUDED.phone, ''), "StoreVisitor".phone),
        "lastSeenAt" = NOW(),
        "updatedAt" = NOW()
      RETURNING id
    `,
    input.storeId,
    input.visitorKey,
    input.email ?? "",
    input.name ?? "",
    input.phone ?? "",
  );
  return rows[0]?.id ?? null;
}
