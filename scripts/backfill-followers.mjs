#!/usr/bin/env node
// One-off: makes everyone who has bought from a shop a follower of it ("ShopFollower", source "order";
// docs/migrations/2026-12-14-shop-followers.sql), from the "ShopperStore" records (run scripts/backfill-shoppers.mjs
// first). New orders do this as they're recorded (src/lib/shoppers.server.ts → addOrderFollower).
//
// Safe to run again: existing follower rows are never changed (not even one they unfollowed, nor their WhatsApp
// choice); only missing ones are added. Nobody gets any message from this.
//
//   DATABASE_URL=… node scripts/backfill-followers.mjs            # dry run: prints what it would add
//   DATABASE_URL=… node scripts/backfill-followers.mjs --apply    # writes
//
// Optional: --batch <n> records read per page (default 1000), --store <id> to do one store.

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const BATCH = Math.max(100, Math.min(5000, Number(arg("--batch")) || 1000));
const ONLY_STORE = arg("--store");

const db = new PrismaClient();

async function main() {
  let cursor = null;
  let read = 0;
  let missing = 0;
  let added = 0;
  const stores = new Map();
  for (;;) {
    const links = await db.shopperStore.findMany({
      where: ONLY_STORE ? { storeId: ONLY_STORE } : {},
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, storeId: true, shopperId: true, firstOrderAt: true },
    });
    if (!links.length) break;
    cursor = links[links.length - 1].id;
    read += links.length;

    const existing = await db.shopFollower.findMany({
      where: { OR: links.map((link) => ({ storeId: link.storeId, shopperId: link.shopperId })) },
      select: { storeId: true, shopperId: true },
    });
    const have = new Set(existing.map((row) => `${row.storeId}:${row.shopperId}`));
    const rows = links
      .filter((link) => !have.has(`${link.storeId}:${link.shopperId}`))
      // They've followed since their first order there.
      .map((link) => ({ storeId: link.storeId, shopperId: link.shopperId, source: "order", followedAt: link.firstOrderAt }));
    missing += rows.length;
    for (const row of rows) stores.set(row.storeId, (stores.get(row.storeId) ?? 0) + 1);
    if (APPLY && rows.length) added += (await db.shopFollower.createMany({ data: rows, skipDuplicates: true })).count;
    console.log(`read ${read} shopper-store records, ${missing} followers missing so far`);
  }

  console.log(`${read} shopper-store records, ${missing} followers to add across ${stores.size} stores${APPLY ? `; added ${added}` : " (dry run: add --apply to write)"}`);
  if (!APPLY) {
    const top = [...stores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [storeId, count] of top) console.log(`  store ${storeId}: ${count}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
