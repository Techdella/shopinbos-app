#!/usr/bin/env node
// One-off: fills "Shopper" and "ShopperStore" (docs/migrations/2026-12-13-shoppers.sql) from past orders that have a
// buyer phone number, with the same rules as the live path (shared/shoppers.ts, src/lib/shoppers.server.ts).
//
// Safe to run again, and after live recording has started: each shopper's details and each store's counts are worked
// out from all of that number's orders and SET (never incremented), so nothing is double counted. Orders cancelled
// before payment could start are left out, like the live path; every other order counts, as it does live.
//
//   DATABASE_URL=… node scripts/backfill-shoppers.mjs            # dry run: prints what it would write
//   DATABASE_URL=… node scripts/backfill-shoppers.mjs --apply    # writes
//
// Optional: --batch <n> orders read per page (default 1000), --store <id> to do one store's customers.

import { PrismaClient } from "@prisma/client";

const shoppers = await import("../shared/shoppers.ts");

const APPLY = process.argv.includes("--apply");
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const BATCH = Math.max(100, Math.min(5000, Number(arg("--batch")) || 1000));
const ONLY_STORE = arg("--store");
// The paymentIssue checkout writes (cancelUnstartedOrder) when a payment never started (checkout cancels straight away).
const NEVER_STARTED = /could not start/i;

const db = new PrismaClient();

async function main() {
  const stores = new Map((await db.store.findMany({ select: { id: true, currency: true } })).map((store) => [store.id, store.currency]));

  // phone → { facts: [], stores: Map(storeId → { first, last, lastOrderId, count, total }) }
  const byPhone = new Map();
  let cursor = null;
  let read = 0;
  let skipped = 0;
  for (;;) {
    const orders = await db.retailOrder.findMany({
      where: { buyerPhone: { not: null }, ...(ONLY_STORE ? { storeId: ONLY_STORE } : {}) },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, storeId: true, buyerPhone: true, buyerName: true, buyerEmail: true, deliveryAddress: true, total: true, createdAt: true, status: true, paymentIssue: true },
    });
    if (!orders.length) break;
    cursor = orders[orders.length - 1].id;
    read += orders.length;
    for (const order of orders) {
      if (order.status === "cancelled" && NEVER_STARTED.test(order.paymentIssue ?? "")) { skipped += 1; continue; }
      const facts = shoppers.shopperFactsFromOrder(order, stores.get(order.storeId));
      if (!facts) { skipped += 1; continue; }
      const entry = byPhone.get(facts.phone) ?? { facts: [], stores: new Map() };
      entry.facts.push(facts);
      const at = entry.stores.get(order.storeId);
      if (!at) entry.stores.set(order.storeId, { first: facts.at, last: facts.at, lastOrderId: order.id, count: 1, total: facts.total });
      else {
        if (facts.at < at.first) at.first = facts.at;
        if (facts.at >= at.last) { at.last = facts.at; at.lastOrderId = order.id; }
        at.count += 1;
        at.total += facts.total;
      }
      byPhone.set(facts.phone, entry);
    }
    console.log(`read ${read} orders, ${byPhone.size} phone numbers so far`);
  }

  let links = 0;
  for (const entry of byPhone.values()) links += entry.stores.size;
  console.log(`${read} orders with a phone, ${skipped} skipped (no usable number, or cancelled before payment started)`);
  console.log(`${byPhone.size} shoppers, ${links} shopper-store records${APPLY ? "" : " (dry run: add --apply to write)"}`);
  if (!APPLY) {
    let shown = 0;
    for (const [phone, entry] of byPhone) {
      if (shown++ >= 5) break;
      const details = shoppers.shopperFromOrders(entry.facts);
      console.log(`  ${phone.slice(0, -4)}****  ${details?.name ?? "(no name)"}  ${details?.area ?? ""}  stores: ${entry.stores.size}`);
    }
    return;
  }

  let written = 0;
  const phones = [...byPhone.keys()];
  for (let start = 0; start < phones.length; start += 100) {
    const slice = phones.slice(start, start + 100);
    await Promise.all(slice.map(async (phone) => {
      const entry = byPhone.get(phone);
      const details = shoppers.shopperFromOrders(entry.facts);
      // An existing record may have newer details from live orders: merge the backfilled ones in under it.
      const existing = await db.shopper.findUnique({ where: { phone } });
      const merged = existing ? entry.facts.reduce((acc, item) => shoppers.mergeShopper(acc, item), existing) : details;
      const shopper = existing
        ? await db.shopper.update({ where: { id: existing.id }, data: { name: merged.name, email: merged.email, area: merged.area, state: merged.state, firstSeenAt: merged.firstSeenAt, lastSeenAt: merged.lastSeenAt } })
        : await db.shopper.create({ data: { phone, ...merged } });
      for (const [storeId, at] of entry.stores) {
        const counts = { firstOrderAt: at.first, lastOrderAt: at.last, lastOrderId: at.lastOrderId, orderCount: at.count, totalSpent: Math.round(at.total * 100) / 100 };
        await db.shopperStore.upsert({
          where: { shopperId_storeId: { shopperId: shopper.id, storeId } },
          create: { shopperId: shopper.id, storeId, ...counts },
          update: counts,
        });
      }
    }));
    written += slice.length;
    console.log(`wrote ${written}/${phones.length} shoppers`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
