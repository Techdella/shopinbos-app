import "server-only";

import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { lagosDayKey } from "./range";
import { addHash, createSketch, deserializeSketch, serializeSketch, type HllSketch } from "./hll";

// Unique visitors (StoreVisitorSketch, docs/migrations/2026-11-04-store-visitor-sketches.sql). The storefront beacon
// sends a random token the browser keeps for this store (rotated every 90 days, never a cookie, never sent
// anywhere else) once per Lagos day. Here it becomes HMAC(server secret, store id + token): stable across days so
// sketches merge, useless to anyone without the secret, and different for every store. The hash only sets one
// register of today's sketch and is dropped; the token and the hash are never stored or logged.

/** The token format the beacon sends: 128 random bits as hex. */
export const VISITOR_TOKEN = /^[0-9a-f]{32}$/;

function secret() {
  const env = process.env;
  return env.TRAFFIC_VISITOR_SECRET || env.CRON_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.JWT_SECRET || "";
}

/** The 64-bit hash a token adds to a store's sketch, or null when no secret is configured. */
export function visitorHash(storeId: string, token: string): Uint8Array | null {
  const key = secret();
  if (!key || !VISITOR_TOKEN.test(token)) return null;
  return new Uint8Array(createHmac("sha256", `shopinbos-traffic-visitors:${key}`).update(`${storeId}\u0000${token}`).digest().subarray(0, 8));
}

/**
 * Adds one visitor to today's sketch. Best effort, like recordTraffic: a missing table (migration not applied
 * yet) or a missing secret never breaks the storefront. The row is locked while it is read and written, so two
 * beacons at once both land.
 */
export async function recordVisitor(storeId: string, token: string, now = new Date()) {
  const hash = visitorHash(storeId, token);
  if (!hash) return;
  const day = lagosDayKey(now);
  try {
    await db.$transaction(async (tx) => {
      const empty = Buffer.from(serializeSketch(createSketch()));
      await tx.$executeRaw`
        INSERT INTO "StoreVisitorSketch" ("id", "storeId", "day", "sketch", "updatedAt")
        VALUES (gen_random_uuid()::text, ${storeId}, ${day}, ${empty}, NOW())
        ON CONFLICT ("storeId", "day") DO NOTHING
      `;
      const rows = await tx.$queryRaw<Array<{ sketch: Uint8Array }>>`
        SELECT "sketch" FROM "StoreVisitorSketch" WHERE "storeId" = ${storeId} AND "day" = ${day} FOR UPDATE
      `;
      const sketch = deserializeSketch(rows[0]?.sketch ? new Uint8Array(rows[0].sketch) : null) ?? createSketch();
      if (!addHash(sketch, hash)) return;
      await tx.$executeRaw`
        UPDATE "StoreVisitorSketch" SET "sketch" = ${Buffer.from(serializeSketch(sketch))}, "updatedAt" = NOW()
        WHERE "storeId" = ${storeId} AND "day" = ${day}
      `;
    });
  } catch (error) {
    console.error("[traffic] could not record a visitor", error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error);
  }
}

/** The store's daily sketches from `fromDay` to `toDay` (inclusive), by day; empty until the table exists. */
export async function loadVisitorSketches(storeId: string, fromDay: string, toDay: string): Promise<Map<string, HllSketch>> {
  const out = new Map<string, HllSketch>();
  const rows = await db.storeVisitorSketch
    .findMany({ where: { storeId, day: { gte: fromDay, lte: toDay } }, select: { day: true, sketch: true }, take: 800 })
    .catch((error) => {
      console.error("[traffic] visitor sketches unavailable", error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error);
      return [] as Array<{ day: string; sketch: Uint8Array }>;
    });
  for (const row of rows) {
    const sketch = deserializeSketch(new Uint8Array(row.sketch));
    if (sketch) out.set(row.day, sketch);
  }
  return out;
}
